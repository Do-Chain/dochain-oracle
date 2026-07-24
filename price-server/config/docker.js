const splitEnv = (name, fallback = []) => (process.env[name] ? process.env[name].split(',').filter(Boolean) : fallback)
const parseIntEnv = (name, fallback) => {
  const parsed = parseInt(process.env[name] || '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}
const FIAT_SYMBOLS = splitEnv('FIAT_SYMBOLS')
const CRYPTO_FALLBACK_PRIORITY = splitEnv('CRYPTO_PROVIDER_FALLBACK_PRIORITY')
const COINGECKO_SYMBOLS = splitEnv('CRYPTO_PROVIDER_COINGECKO_SYMBOLS')
const fixedPrices = () => {
  if (process.env.ORACLE_ALLOW_FIXED_PRICES !== 'true') {
    return {}
  }

  const reason = process.env.ORACLE_FIXED_PRICE_BREAKGLASS_REASON || ''
  if (reason.trim().length < 12) {
    throw new Error('ORACLE_FIXED_PRICE_BREAKGLASS_REASON is required when fixed prices are enabled')
  }

  const expiresAt = Date.parse(process.env.ORACLE_FIXED_PRICE_EXPIRES_AT || '')
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    throw new Error('ORACLE_FIXED_PRICE_EXPIRES_AT must be a future ISO timestamp when fixed prices are enabled')
  }

  console.error(`Fixed oracle prices enabled until ${new Date(expiresAt).toISOString()}: ${reason}`)

  if (process.env.ORACLE_FIXED_PRICES) {
    return JSON.parse(process.env.ORACLE_FIXED_PRICES)
  }

  return {
    ...(process.env.DO_PRICE ? { DO: process.env.DO_PRICE } : {}),
    ...(process.env.DODX_PRICE ? { DODX: process.env.DODX_PRICE } : {}),
  }
}

const derivedPrices = () => {
  if (process.env.DODX_PRICE) {
    return {}
  }

  // DODX is not market-priced. It follows the Do burn ratchet:
  // DODX/USD = DO/USD * current DO-per-DODX ratchet tier.
  return {
    DODX: {
      sourceDenom: 'DO',
      multiplier: process.env.DODX_DO_RATIO || '3500000000',
    },
  }
}

if (COINGECKO_SYMBOLS.length && !CRYPTO_FALLBACK_PRIORITY.includes('coinGecko')) {
  CRYPTO_FALLBACK_PRIORITY.push('coinGecko')
}

module.exports = {
  port: parseInt(process.env.PORT) || 8532,
  host: process.env.HOST || '127.0.0.1',
  metricsPort: parseInt(process.env.METRICS_PORT) || 0,
  report: process.env.REPORT === 'true',
  fixedPrices: fixedPrices(),
  derivedPrices: derivedPrices(),
  sentry: process.env.SENTRY || '', // sentry dsn (https://sentry.io/ - error reporting service)
  slack: {
    // for incident alarm (e.g. exchange shutdown)
    channel: process.env.SLACK_CHANNEL || '',
    url: process.env.SLACK_URL || '',
  },
  cryptoProvider: {
    fallbackPriority: CRYPTO_FALLBACK_PRIORITY,
    minValidSources: parseInt(process.env.CRYPTO_PROVIDER_MIN_VALID_SOURCES || '1', 10),
    adjustTvwap: {
      symbols: splitEnv('CRYPTO_PROVIDER_ADJUST_TVWAP_SYMBOLS'),
    },
    coinGecko: COINGECKO_SYMBOLS.length && {
      symbols: COINGECKO_SYMBOLS,
      interval: parseIntEnv('CRYPTO_PROVIDER_COINGECKO_INTERVAL', 60 * 1000),
      timeout: parseIntEnv('CRYPTO_PROVIDER_COINGECKO_TIMEOUT', 10000),
    },
    upbit: process.env.CRYPTO_PROVIDER_UPBIT_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_UPBIT_SYMBOLS.split(',') || [],
    },
    bithumb: process.env.CRYPTO_PROVIDER_BITHUMB_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_BITHUMB_SYMBOLS.split(',') || [],
    },
    binance: process.env.CRYPTO_PROVIDER_BINANCE_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_BINANCE_SYMBOLS.split(',') || [],
    },
    huobi: process.env.CRYPTO_PROVIDER_HUOBI_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_HUOBI_SYMBOLS.split(',') || [],
    },
    bitfinex: process.env.CRYPTO_PROVIDER_BITFINEX_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_BITFINEX_SYMBOLS.split(',') || [],
    },
    kraken: process.env.CRYPTO_PROVIDER_KRAKEN_SYMBOLS && {
      symbols: process.env.CRYPTO_PROVIDER_KRAKEN_SYMBOLS.split(',') || [],
    },
  },
  fiatProvider: {
    fallbackPriority: splitEnv('FIAT_PROVIDER_FALLBACK_PRIORITY'),
    minValidSources: parseInt(process.env.FIAT_PROVIDER_MIN_VALID_SOURCES || '1', 10),
    currencylayer: process.env.FIAT_PROVIDER_CURRENCY_LAYER_INTERVAL && {
      symbols: FIAT_SYMBOLS,
      interval: parseInt(process.env.FIAT_PROVIDER_CURRENCY_LAYER_INTERVAL) || 60 * 1000,
      timeout: parseInt(process.env.FIAT_PROVIDER_CURRENCY_LAYER_TIMEOUT) || 5000,
      // https://currencylayer.com/product
      // recommend: business subscription(60second Updates): $79.99/month
      apiKey: process.env.FIAT_PROVIDER_CURRENCY_LAYER_API_KEY || '', // necessary
    },
    fixer: process.env.FIAT_PROVIDER_FIXER_INTERVAL && {
      symbols: FIAT_SYMBOLS,
      interval: parseInt(process.env.FIAT_PROVIDER_FIXER_INTERVAL) || 60 * 1000,
      timeout: parseInt(process.env.FIAT_PROVIDER_FIXER_TIMEOUT) || 5000,
      // https://fixer.io/product
      // recommend: professional plus(60second Updates): $80/month
      apiKey: process.env.FIAT_PROVIDER_FIXER_API_KEY || '', // necessary
    },
    alphavantage: process.env.FIAT_PROVIDER_ALPHA_VANTAGE_INTERVAL && {
      symbols: FIAT_SYMBOLS.filter((symbol) => !symbol.includes('MNT')),
      interval: parseInt(process.env.FIAT_PROVIDER_ALPHA_VANTAGE_INTERVAL) || 60 * 1000,
      timeout: parseInt(process.env.FIAT_PROVIDER_ALPHA_VANTAGE_TIMEOUT) || 5000,
      // https://www.alphavantage.co/premium/
      // recommend: 120 API request per minute: $49.99/month
      apiKey: process.env.FIAT_PROVIDER_ALPHA_VANTAGE_API_KEY || '', // necessary
    },
  },
  sdrBasket: process.env.SDR_BASKET
    ? JSON.parse(process.env.SDR_BASKET)
    : {
        // to calculate SDR value if not available from fiat providers
        USD: '0.57813',
        EUR: '0.37379',
        JPY: '13.452',
        CNY: '1.0993',
        GBP: '0.080870',
      },
}
