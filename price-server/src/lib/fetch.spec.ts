import * as http from 'http'
import { AddressInfo } from 'net'
import fetch, { toQueryString } from './fetch'

describe('fetch', () => {
  test('aborts requests after the configured timeout', async () => {
    const server = http.createServer()

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))

    try {
      const { port } = server.address() as AddressInfo

      await expect(fetch(`http://127.0.0.1:${port}`, { timeout: 50 })).rejects.toThrow(
        /aborted/i,
      )
    } finally {
      server.close()
    }
  })
})

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
