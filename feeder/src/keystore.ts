import * as fs from 'fs'
import * as crypto from 'crypto'
import * as dotenv from 'dotenv'
import {
  Bip39,
  EnglishMnemonic,
  Slip10,
  Slip10Curve,
  stringToPath,
} from '@cosmjs/crypto'
import { DirectSecp256k1Wallet } from '@cosmjs/proto-signing'

dotenv.config()

interface Entity {
  name: string
  address: string
  ciphertext: string
}

export interface PlainEntity {
  privateKey: string
}

const kdfIterations = 310000
const saltSize = 16
const ivSize = 12
const authTagSize = 16

const ivSalt = process.env.ORACLE_FEEDER_IV_SALT || 'myHashedIV'
const resizedIV = Buffer.allocUnsafe(16)
const iv = crypto.createHash('sha256').update(ivSalt).digest()

iv.copy(resizedIV)

function encrypt(plainText: string, password: string): string {
  const salt = crypto.randomBytes(saltSize)
  const iv = crypto.randomBytes(ivSize)
  const key = crypto.pbkdf2Sync(password, salt, kdfIterations, 32, 'sha256')
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: authTagSize })
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    'v2',
    'pbkdf2-sha256',
    String(kdfIterations),
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

async function derivePrivateKey(mnemonic: string, coinType: string): Promise<Uint8Array> {
  const coinTypeNumber = Number(coinType)

  if (!Number.isSafeInteger(coinTypeNumber) || coinTypeNumber < 0) {
    throw new Error('Invalid coin type')
  }

  const seed = await Bip39.mnemonicToSeed(new EnglishMnemonic(mnemonic))
  const hdPath = stringToPath(`m/44'/${coinTypeNumber}'/0'/0/0`)
  return Slip10.derivePath(Slip10Curve.Secp256k1, seed, hdPath).privkey
}

function decrypt(encryptedText: string, password: string): string {
  if (encryptedText.startsWith('v2:')) {
    return decryptV2(encryptedText, password)
  }

  if (process.env.ORACLE_ALLOW_LEGACY_KEYSTORE !== 'true') {
    throw new Error('Legacy oracle keystore ciphertext is disabled')
  }

  return decryptLegacy(encryptedText, password)
}

function decryptV2(encryptedText: string, password: string): string {
  const parts = encryptedText.split(':')
  if (parts.length !== 7 || parts[1] !== 'pbkdf2-sha256') {
    throw new Error('Unsupported keystore ciphertext')
  }

  const iterations = Number(parts[2])
  if (!Number.isSafeInteger(iterations) || iterations < kdfIterations) {
    throw new Error('Weak keystore KDF parameters')
  }

  const salt = Buffer.from(parts[3], 'base64')
  const iv = Buffer.from(parts[4], 'base64')
  const authTag = Buffer.from(parts[5], 'base64')
  const ciphertext = Buffer.from(parts[6], 'base64')
  const key = crypto.pbkdf2Sync(password, salt, iterations, 32, 'sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv, { authTagLength: authTagSize })
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}

function decryptLegacy(encryptedText: string, password: string): string {
  const key = crypto.createHash('sha256').update(password).digest()
  const decipher = crypto.createDecipheriv('aes256', key, resizedIV)
  const msg: string[] = []

  msg.push(decipher.update(encryptedText, 'hex', 'binary'))
  msg.push(decipher.final('binary'))

  return msg.join('')
}

function loadEntities(path: string): Entity[] {
  try {
    return JSON.parse(fs.readFileSync(path, 'utf8') || '[]')
  } catch (e: any) {
    console.error('loadKeys', e.message)
    return []
  }
}

export async function save(
  filePath: string,
  name: string,
  password: string,
  mnemonic: string,
  coinType: string,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '', { mode: 0o600 })
  }

  const keys = loadEntities(filePath)

  if (keys.find((key) => key.name === name)) {
    throw new Error('Key already exists by that name')
  }

  const accPrefix = process.env.ORACLE_FEEDER_ADDR_PREFIX || 'do'
  const privateKey = await derivePrivateKey(mnemonic, coinType)
  const wallet = await DirectSecp256k1Wallet.fromKey(privateKey, accPrefix)
  const [account] = await wallet.getAccounts()

  const ciphertext = encrypt(
    JSON.stringify({
      privateKey: Buffer.from(privateKey).toString('hex'),
    }),
    password,
  )

  keys.push({
    name,
    address: account.address,
    ciphertext,
  })

  fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), { mode: 0o600 })
}

export function load(
  filePath: string,
  name: string,
  password: string,
): PlainEntity {
  const keys = loadEntities(filePath)
  const key = keys.find((key) => key.name === name)

  if (!key) {
    throw new Error('Cannot load key by that name')
  }

  try {
    const plainText = decrypt(key.ciphertext, password)
    return JSON.parse(plainText)
  } catch (err) {
    throw new Error('Incorrect password')
  }
}
