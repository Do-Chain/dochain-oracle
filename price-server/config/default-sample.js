module.exports = {
  port: 8532,
  metricsPort: 8533,
  fixedPrices: {},
  // Used only when the live DO quote is temporarily unavailable.
  fallbackPrices: {
    DO: '0.000000000945374284',
  },
  // DODX is not market-priced. It follows the Do burn ratchet:
  // DODX/USD = DO/USD * current DO-per-DODX ratchet tier.
  derivedPrices: {
    DODX: {
      sourceDenom: 'DO',
      multiplier: '3500000000',
    },
  },
  sentry: '',
  reporter: false,
  slack: {
    channel: '',
    url: '',
  },
  cryptoProvider: {
    adjustTvwap: { symbols: [] },
    fallbackPriority: ['coinGecko'],
    coinGecko: {
      interval: 6 * 1000,
      symbols: ['DO/USD'],
    },
  },
  fiatProvider: {
    fallbackPriority: [],
  },
  sdrBasket: {},
}
