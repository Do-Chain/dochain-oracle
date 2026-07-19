import * as crypto from 'crypto'
import * as promptly from 'promptly'
import * as http from 'http'
import * as https from 'https'
import axios from 'axios'
import * as bech32 from 'bech32'
import { encodeSecp256k1Pubkey } from '@cosmjs/amino'
import { fromBase64, toBase64 } from '@cosmjs/encoding'
import {
  DirectSecp256k1Wallet,
  EncodeObject,
  GeneratedType,
  Registry,
  encodePubkey,
  makeAuthInfoBytes,
  makeSignDoc,
} from '@cosmjs/proto-signing'
import { defaultRegistryTypes } from '@cosmjs/stargate'
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx'
import * as ks from './keystore'
import * as packageInfo from '../package.json'
import * as logger from './logger'
import {
  MsgAggregateDoRatePrevote,
  MsgAggregateDoRatePrevoteProto,
  MsgAggregateDoRatePrevoteTypeUrl,
  MsgAggregateDoRateVote,
  MsgAggregateDoRateVoteProto,
  MsgAggregateDoRateVoteTypeUrl,
  aggregateVoteHash,
} from './doOracleMsgs'
import { aggregatePriceResponses, Price } from './priceAggregation'

const ax = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 10000,
  headers: { post: { 'Content-Type': 'application/json' } },
})

const registry = new Registry([
  ...defaultRegistryTypes,
  [MsgAggregateDoRatePrevoteTypeUrl, MsgAggregateDoRatePrevoteProto as GeneratedType],
  [MsgAggregateDoRateVoteTypeUrl, MsgAggregateDoRateVoteProto as GeneratedType],
])

interface LCDClient {
  lcdUrl: string
  chainID: string
}

interface AccountState {
  accountNumber: number
  sequence: number
}

async function initKey(keyPath: string, name: string, password?: string): Promise<ks.PlainEntity> {
  return ks.load(keyPath, name, password || (await promptly.password('Enter a passphrase:', { replace: '*' })))
}

function convertBech32Prefix(addr: string, prefix: string): string {
  const decoded = bech32.decode(addr)
  return bech32.encode(prefix, decoded.words)
}

interface OracleParameters {
  oracleVotePeriod: number
  oracleWhitelist: string[]
  currentVotePeriod: number
  indexInVotePeriod: number
  nextBlockHeight: number
}

function getLCDBase(client: LCDClient): string {
  return client.lcdUrl.replace(/\/+$/, '')
}

async function getLatestBlockHeight(client: LCDClient): Promise<number> {
  const lcdBase = getLCDBase(client)
  const latestBlockRes = await ax.get(`${lcdBase}/cosmos/base/tendermint/v1beta1/blocks/latest`)
  return parseInt(latestBlockRes.data.block.header.height, 10)
}

async function loadOracleParams(client: LCDClient): Promise<OracleParameters> {
  const lcdBase = getLCDBase(client)

  const oracleParamsRes = await ax.get(`${lcdBase}/do/oracle/v1beta1/params`)
  const oracleParams = oracleParamsRes.data.params

  const oracleVotePeriod = parseInt(oracleParams.vote_period, 10)
  const oracleWhitelist: string[] = oracleParams.whitelist.map((e: any) => e.name)
  const blockHeight = await getLatestBlockHeight(client)

  const nextBlockHeight = blockHeight + 1
  const currentVotePeriod = Math.floor(blockHeight / oracleVotePeriod)
  const indexInVotePeriod = nextBlockHeight % oracleVotePeriod

  return {
    oracleVotePeriod,
    oracleWhitelist,
    currentVotePeriod,
    indexInVotePeriod,
    nextBlockHeight,
  }
}

async function getPrices(sources: string[]): Promise<Price[]> {
  try {
    const responses = await Promise.all(sources.map((s) => ax.get(s).catch(() => null)))
    const payloads: unknown[] = []
    for (const response of responses) {
      if (response?.data) {
        payloads.push(response.data)
      }
    }
    if (!payloads.length) {
      logger.error('getPrices: all sources failed')
      return []
    }

    const prices = aggregatePriceResponses(payloads, sources.length)
    if (!prices.length) {
      logger.error('getPrices: sources did not reach a fresh price quorum')
      return []
    }
    return prices
  } catch (err: any) {
    logger.error('getPrices: all sources failed', err?.message || err)
    return []
  }
}

function preparePrices(prices: Price[], oracleWhitelist: string[]): Price[] {
  const doPrice = prices.find((p) => p.denom === 'DO')

  if (!doPrice) {
    throw new Error('cannot find DO price')
  }

  const newPrices = prices
    .map((price) => {
      const whitelistDenom = `u${price.denom.toLowerCase()}`

      if (oracleWhitelist.indexOf(whitelistDenom) === -1) {
        return undefined
      }

      return {
        denom: price.denom,
        price: price.price,
      }
    })
    .filter(Boolean) as Price[]

  const missingDenoms = oracleWhitelist.filter(
    (denom) => !newPrices.some((price) => denom === `u${price.denom.toLowerCase()}`)
  )
  if (missingDenoms.length) {
    throw new Error(`price-source quorum missing: ${missingDenoms.join(', ')}`)
  }

  return newPrices.sort((a, b) => a.denom.localeCompare(b.denom))
}

function buildVoteMsgs(prices: Price[], valAddrs: string[], voterAddr: string): MsgAggregateDoRateVote[] {
  const exchangeRates = prices.map(({ denom, price }) => `${price}u${denom.toLowerCase()}`).join(',')

  return valAddrs.map((valAddr) => {
    const salt = crypto.randomBytes(16).toString('hex')
    return new MsgAggregateDoRateVote(salt, exchangeRates, voterAddr, valAddr)
  })
}

let previousVoteMsgs: MsgAggregateDoRateVote[] = []
let previousVotePeriod = 0

interface VoteArgs {
  lcdUrl: string[]
  prefix: string
  chainID: string
  validators: string[]
  dataSourceUrl: string[]
  password: string
  keyPath: string
  keyName: string
}

export async function processVote(
  client: LCDClient,
  wallet: DirectSecp256k1Wallet,
  args: VoteArgs,
  valAddrs: string[],
  voterAddr: string
): Promise<void> {
  logger.info('[VOTE] Requesting on chain data')

  const { oracleVotePeriod, oracleWhitelist, currentVotePeriod, indexInVotePeriod, nextBlockHeight } =
    await loadOracleParams(client)

  if ((previousVotePeriod && currentVotePeriod === previousVotePeriod) || oracleVotePeriod - indexInVotePeriod < 2) {
    return
  }

  if (previousVotePeriod && currentVotePeriod - previousVotePeriod !== 1) {
    throw new Error('Failed to Reveal Exchange Rates; reset to prevote')
  }

  logger.info(`[VOTE] Requesting prices from price server ${args.dataSourceUrl.join(',')}`)

  const _prices = await getPrices(args.dataSourceUrl)
  const prices = preparePrices(_prices, oracleWhitelist)
  const voteMsgs = buildVoteMsgs(prices, valAddrs, voterAddr)

  const isPrevoteOnlyTx = previousVoteMsgs.length === 0

  const prevoteMsgs: MsgAggregateDoRatePrevote[] = voteMsgs.map((vm) => {
    const hash = aggregateVoteHash(vm.exchangeRates, vm.salt, vm.validator)
    return new MsgAggregateDoRatePrevote(hash, vm.feeder, vm.validator)
  })

  const msgs: EncodeObject[] = [
    ...previousVoteMsgs.map((msg) => msg.toEncodeObject()),
    ...prevoteMsgs.map((msg) => msg.toEncodeObject()),
  ]
  logger.info(
    `[${isPrevoteOnlyTx ? 'PREVOTE' : 'VOTE'}] msg: ${JSON.stringify([...previousVoteMsgs, ...prevoteMsgs])}\n`
  )

  const gasDenom = getFeeDenom(args)
  const gasPrice = getGasPrice()
  const gasLimit = (1 + msgs.length) * 100_000
  const feeAmount = Math.ceil(gasLimit * gasPrice)

  const txhash = await signAndBroadcast(
    client,
    wallet,
    voterAddr,
    msgs,
    feeAmount,
    gasDenom,
    gasLimit,
    `${packageInfo.name}@${packageInfo.version}`
  )

  logger.info(`[VOTE] Broadcast success ${txhash}`)

  const height = await validateTx(
    client,
    nextBlockHeight,
    txhash,
    isPrevoteOnlyTx ? oracleVotePeriod * 2 : oracleVotePeriod - indexInVotePeriod
  )

  previousVotePeriod = Math.floor(height / oracleVotePeriod)
  previousVoteMsgs = voteMsgs
}

async function signAndBroadcast(
  client: LCDClient,
  wallet: DirectSecp256k1Wallet,
  voterAddr: string,
  msgs: EncodeObject[],
  feeAmount: number,
  gasDenom: string,
  gasLimit: number,
  memo: string
): Promise<string> {
  const lcdBase = getLCDBase(client)
  const accountState = await loadAccountState(lcdBase, voterAddr)
  const [account] = await wallet.getAccounts()
  const txBodyBytes = registry.encodeTxBody({ messages: msgs, memo })
  const authInfoBytes = makeAuthInfoBytes(
    [
      {
        pubkey: encodePubkey(encodeSecp256k1Pubkey(account.pubkey)),
        sequence: accountState.sequence,
      },
    ],
    [{ denom: gasDenom, amount: String(feeAmount) }],
    gasLimit,
    undefined,
    undefined
  )
  const signDoc = makeSignDoc(txBodyBytes, authInfoBytes, client.chainID, accountState.accountNumber)
  const { signed, signature } = await wallet.signDirect(voterAddr, signDoc)
  const txRaw = TxRaw.fromPartial({
    bodyBytes: signed.bodyBytes,
    authInfoBytes: signed.authInfoBytes,
    signatures: [fromBase64(signature.signature)],
  })
  const txBytes = TxRaw.encode(txRaw).finish()
  const broadcastRes = await ax.post(`${lcdBase}/cosmos/tx/v1beta1/txs`, {
    tx_bytes: toBase64(txBytes),
    mode: 'BROADCAST_MODE_SYNC',
  })
  const txResponse = broadcastRes.data?.tx_response

  if (!txResponse) {
    throw new Error('[VOTE] broadcast response did not include tx_response')
  }

  const code = Number(txResponse.code || 0)
  if (code !== 0) {
    throw new Error(`[VOTE] broadcast rejected: code: ${code}, raw_log: ${txResponse.raw_log || ''}`)
  }

  if (!txResponse.txhash) {
    throw new Error('[VOTE] broadcast response did not include txhash')
  }

  return txResponse.txhash
}

async function loadAccountState(lcdBase: string, address: string): Promise<AccountState> {
  const res = await ax.get(`${lcdBase}/cosmos/auth/v1beta1/accounts/${address}`)
  const account = res.data?.account
  const accountNumber = findStringNumber(account, 'account_number')
  const sequence = findStringNumber(account, 'sequence')

  if (accountNumber === undefined || sequence === undefined) {
    throw new Error(`Unable to load account number/sequence for ${address}`)
  }

  return {
    accountNumber,
    sequence,
  }
}

function findStringNumber(value: any, key: string): number | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  if (value[key] !== undefined) {
    const parsed = Number(value[key])
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed
    }
  }

  for (const child of Object.values(value)) {
    const found = findStringNumber(child, key)
    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

async function validateTx(
  client: LCDClient,
  nextBlockHeight: number,
  txhash: string,
  timeoutHeight: number
): Promise<number> {
  let inclusionHeight = 0

  const maxBlockHeight = nextBlockHeight + timeoutHeight
  let lastCheckHeight = nextBlockHeight - 1
  const lcdBase = getLCDBase(client)

  while (!inclusionHeight && lastCheckHeight < maxBlockHeight) {
    await new Promise((resolve) => setTimeout(resolve, 1500))

    const latestBlockHeight = await getLatestBlockHeight(client)

    if (latestBlockHeight <= lastCheckHeight) {
      continue
    }

    lastCheckHeight = latestBlockHeight

    try {
      const res = await ax.get(`${lcdBase}/cosmos/tx/v1beta1/txs/${txhash}`)
      const txResponse = res?.data?.tx_response

      if (!txResponse) {
        continue
      }

      const height = parseInt(txResponse.height, 10) || latestBlockHeight
      const code = Number(txResponse.code || 0)
      const rawLog = txResponse.raw_log || ''

      if (code !== 0) {
        throw new Error(`[VOTE]: transaction failed tx: code: ${code}, raw_log: ${rawLog}`)
      }

      inclusionHeight = height
      break
    } catch (err: any) {
      const status = err?.response?.status

      if (status === 404) {
        continue
      }

      if (err?.isAxiosError && !err?.response) {
        logger.error('tx query network error', err.message)
        continue
      }

      if (err instanceof Error) {
        throw err
      }

      throw new Error(String(err))
    }
  }

  if (!inclusionHeight) {
    throw new Error(`[VOTE] tx confirmation timeout for ${txhash} by height ${lastCheckHeight}`)
  }

  logger.info(`[VOTE] Included at height: ${inclusionHeight}`)
  return inclusionHeight
}

function getAccPrefix(args: VoteArgs): string {
  return args.prefix || process.env.ORACLE_FEEDER_ADDR_PREFIX || 'do'
}

function getValoperPrefix(args: VoteArgs): string {
  return process.env.ORACLE_FEEDER_VALOPER_PREFIX || `${getAccPrefix(args)}valoper`
}

function getFeeDenom(args: VoteArgs): string {
  return process.env.ORACLE_FEEDER_GAS_DENOM || `u${getAccPrefix(args)}`
}

function getGasPrice(): number {
  const gasPrice = Number(process.env.ORACLE_FEEDER_GAS_PRICE ?? '0')
  return Number.isFinite(gasPrice) && gasPrice >= 0 ? gasPrice : 0
}

function normalizeValidatorAddresses(args: VoteArgs, voterAddr: string): string[] {
  const valoperPrefix = getValoperPrefix(args)
  const configuredValidators = args.validators && args.validators.length ? args.validators : [voterAddr]

  return configuredValidators.map((addr) => convertBech32Prefix(addr, valoperPrefix))
}

function buildLCDClient(args: VoteArgs, lcdIndex: number): LCDClient {
  return {
    lcdUrl: args.lcdUrl[lcdIndex],
    chainID: args.chainID,
  }
}

export async function vote(args: VoteArgs): Promise<void> {
  const plainEntity = await initKey(args.keyPath, args.keyName, args.password)
  const accPrefix = getAccPrefix(args)
  const wallet = await DirectSecp256k1Wallet.fromKey(Buffer.from(plainEntity.privateKey, 'hex'), accPrefix)
  const [account] = await wallet.getAccounts()
  const voterAddr = account.address
  const valAddrs = normalizeValidatorAddresses(args, voterAddr)

  const lcdRotate = {
    client: buildLCDClient(args, 0),
    current: 0,
    max: args.lcdUrl.length - 1,
  }

  while (true) {
    const startTime = Date.now()

    await processVote(lcdRotate.client, wallet, args, valAddrs, voterAddr).catch((err: any) => {
      if (err.isAxiosError && err.response) {
        logger.error(err.message, err.response.data)
      } else {
        logger.error(err)
      }

      if (err.isAxiosError) {
        logger.info('vote: lcd client unavailable, rotating to next lcd client.')
        rotateLCD(args, lcdRotate)
      }

      resetPrevote()
    })

    await new Promise((resolve) => setTimeout(resolve, Math.max(500, 500 - (Date.now() - startTime))))
  }
}

function rotateLCD(args: VoteArgs, lcdRotate: { client: LCDClient; current: number; max: number }) {
  if (++lcdRotate.current > lcdRotate.max) {
    lcdRotate.current = 0
  }

  lcdRotate.client = buildLCDClient(args, lcdRotate.current)

  logger.info(`Switched to LCD address ${lcdRotate.current}(${args.lcdUrl[lcdRotate.current]})`)
}

function resetPrevote() {
  previousVotePeriod = 0
  previousVoteMsgs = []
}
