import { aggregatePriceResponses } from './priceAggregation'

const now = Date.parse('2026-07-19T12:00:00Z')
const payload = (price: string, createdAt = '2026-07-19T11:59:45Z') => ({
  created_at: createdAt,
  prices: [{ denom: 'DO', price }],
})

describe('aggregatePriceResponses', () => {
  test('uses the agreeing median and ignores a fast malicious outlier', () => {
    expect(aggregatePriceResponses([payload('1000'), payload('1.00'), payload('1.01')], 3, now)).toEqual([
      { denom: 'DO', price: '1.005' },
    ])
  })

  test('fails closed when two configured sources disagree', () => {
    expect(aggregatePriceResponses([payload('1'), payload('2')], 2, now)).toEqual([])
  })

  test('counts failed or stale configured sources against quorum', () => {
    expect(aggregatePriceResponses([payload('1'), payload('1', '2026-07-19T11:00:00Z')], 3, now)).toEqual([])
  })

  test('supports single source only after startup explicitly allows it', () => {
    expect(aggregatePriceResponses([payload('1.25')], 1, now)).toEqual([{ denom: 'DO', price: '1.25' }])
  })

  test('ignores invalid optional symbols without discarding valid oracle prices', () => {
    expect(
      aggregatePriceResponses(
        [
          {
            created_at: '2026-07-19T11:59:45Z',
            prices: [
              { denom: '1INCH', price: '0.1' },
              { denom: 'DO', price: '1.25' },
              { denom: 'DODX', price: '4375000000' },
            ],
          },
        ],
        1,
        now
      )
    ).toEqual([
      { denom: 'DO', price: '1.25' },
      { denom: 'DODX', price: '4375000000' },
    ])
  })

  test('rejects duplicate denoms, invalid numbers, and future timestamps', () => {
    const duplicate = payload('1')
    duplicate.prices.push({ denom: 'DO', price: '1' })
    expect(aggregatePriceResponses([duplicate], 1, now)).toEqual([])
    expect(aggregatePriceResponses([payload('NaN')], 1, now)).toEqual([])
    expect(aggregatePriceResponses([payload('1', '2026-07-19T12:01:00Z')], 1, now)).toEqual([])
  })
})
