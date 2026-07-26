module.exports = {
  port: 8532,
  metricsPort: 8533,
  fixedPrices: {},
  fallbackPrices: {},
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
