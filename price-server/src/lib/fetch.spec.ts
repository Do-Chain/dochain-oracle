import { toQueryString } from './fetch'

describe('toQueryString', () => {
  test('URL-encodes keys and values', () => {
    expect(
      toQueryString({
        'api key': 'a+b&c',
        from: 'USD',
        to: 'BTC/USD,ETH/USD',
      }),
    ).toBe('api%20key=a%2Bb%26c&from=USD&to=BTC%2FUSD%2CETH%2FUSD')
  })

  test('omits nullish values', () => {
    expect(toQueryString({ from: 'USD', missing: undefined, empty: null })).toBe('from=USD')
  })
})
