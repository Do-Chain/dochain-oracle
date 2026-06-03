import * as http from 'http'
import * as polka from 'polka'
import * as send from '@polka/send-type'
import * as bluebird from 'bluebird'
import * as config from 'config'
import * as logger from 'lib/logger'
import PricesProvider from './provider/PricesProvider'
import { countAllRequests } from 'lib/metrics'
import { getBaseCurrency } from 'lib/currency'

bluebird.config({ longStackTraces: true })

function configuredFixedPrices(): Array<{ denom: string; price: string }> {
  const fixedPrices = (config as any).fixedPrices || {}

  return Object.keys(fixedPrices)
    .map((denom) => ({
      denom,
      price: String(fixedPrices[denom]),
    }))
    .filter((price) => /^[A-Z0-9]+$/.test(price.denom) && /^\d+(\.\d+)?$/.test(price.price))
}

export async function createServer(): Promise<http.Server> {
  const app = polka({})
  const host = (config as any).host || '127.0.0.1'

  app.use(countAllRequests())

  app.get('/health', (req, res) => {
    res.end('OK')
  })

  app.get('/latest', (_, res) => {
    const cryptoPrices = PricesProvider.getCryptoPrices()
    const fiatPrices = PricesProvider.getFiatPrices()

    const prices = [
      ...Object.keys(cryptoPrices).map((symbol) => ({
        denom: getBaseCurrency(symbol),
        price: cryptoPrices[symbol],
      })),
      ...Object.keys(fiatPrices).map((symbol) => ({
        denom: getBaseCurrency(symbol),
        price: fiatPrices[symbol].toFixed(8),
      })),
    ]

    const validPrices = prices.filter((p) => p && p.denom !== 'undefined')
    const fixedPrices = configuredFixedPrices()
    const fixedDenoms = new Set(fixedPrices.map((p) => p.denom))

    send(res, 200, {
      created_at: new Date().toISOString(),
      prices: [...validPrices.filter((p) => !fixedDenoms.has(p.denom)), ...fixedPrices],
    })
  })

  const server = http.createServer(app.handler)

  server.listen(config.port, host, () => {
    logger.info(`price server is listening on ${host}:${config.port}`)
  })

  return server
}
