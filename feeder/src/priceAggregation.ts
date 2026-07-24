import BigNumber from 'bignumber.js'

export interface Price {
  denom: string
  price: string
}

const MAX_SOURCE_AGE_MS = 60_000
const MAX_FUTURE_SKEW_MS = 30_000
const MAX_RELATIVE_DEVIATION = new BigNumber('0.02')
const DENOM_PATTERN = /^[A-Z][A-Z0-9]{1,15}$/

function median(values: BigNumber[]): BigNumber {
  const sorted = [...values].sort((a, b) => a.comparedTo(b) || 0)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle]
  }
  return sorted[middle - 1].plus(sorted[middle]).dividedBy(2)
}

function parsePayload(payload: unknown, now: number): Price[] | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }
  const candidate = payload as { created_at?: unknown; prices?: unknown }
  if (typeof candidate.created_at !== 'string' || !Array.isArray(candidate.prices)) {
    return undefined
  }
  const createdAt = new Date(candidate.created_at).getTime()
  if (!Number.isFinite(createdAt) || now - createdAt > MAX_SOURCE_AGE_MS || createdAt - now > MAX_FUTURE_SKEW_MS) {
    return undefined
  }

  const seen = new Set<string>()
  const prices: Price[] = []
  for (const entry of candidate.prices) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const price = entry as { denom?: unknown; price?: unknown }
    if (
      typeof price.denom !== 'string' ||
      !DENOM_PATTERN.test(price.denom) ||
      typeof price.price !== 'string'
    ) {
      continue
    }
    if (seen.has(price.denom)) {
      return undefined
    }
    const amount = new BigNumber(price.price)
    if (!amount.isFinite() || !amount.isGreaterThan(0)) {
      continue
    }
    seen.add(price.denom)
    prices.push({ denom: price.denom, price: amount.toFixed() })
  }
  return prices.length ? prices : undefined
}

// aggregatePriceResponses requires a majority of all configured endpoints,
// not merely a majority of the endpoints that happened to answer. A remote
// endpoint can therefore cause a missed vote, but cannot win by responding
// faster or by supplying a lone outlier.
export function aggregatePriceResponses(payloads: unknown[], configuredSourceCount: number, now = Date.now()): Price[] {
  if (configuredSourceCount < 1) {
    return []
  }
  const quorum = configuredSourceCount === 1 ? 1 : Math.floor(configuredSourceCount / 2) + 1
  const validPayloads = payloads
    .map((payload) => parsePayload(payload, now))
    .filter((prices): prices is Price[] => prices !== undefined)

  const byDenom = new Map<string, BigNumber[]>()
  for (const prices of validPayloads) {
    for (const price of prices) {
      const values = byDenom.get(price.denom) || []
      values.push(new BigNumber(price.price))
      byDenom.set(price.denom, values)
    }
  }

  const result: Price[] = []
  for (const [denom, values] of byDenom.entries()) {
    if (values.length < quorum) {
      continue
    }
    const initialMedian = median(values)
    const inliers = values.filter((value) =>
      value.minus(initialMedian).abs().dividedBy(initialMedian).isLessThanOrEqualTo(MAX_RELATIVE_DEVIATION)
    )
    if (inliers.length < quorum) {
      continue
    }
    result.push({ denom, price: median(inliers).toFixed() })
  }

  return result.sort((a, b) => a.denom.localeCompare(b.denom))
}
