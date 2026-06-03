import { Counter, Meter } from '@opentelemetry/api'
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus'
import { MeterProvider } from '@opentelemetry/sdk-metrics'
import * as config from 'config'

let meterProvider = new MeterProvider()

export async function setupMetricsServer() {
  if (!config.metricsPort) return

  const exporter = new PrometheusExporter({
    preventServerStart: true,
    port: config.metricsPort,
  })

  meterProvider = new MeterProvider({
    readers: [exporter],
  })

  await exporter.startServer()
}

export let meter: Meter
let requestCount: Counter
const quoterAlive = new Map()

function setupMetrics() {
  if (meter) return

  meter = meterProvider.getMeter('dochain-oracle-feeder')

  requestCount = meter.createCounter('requests', {
    description: 'Count all incoming requests',
  })

  meter
    .createObservableGauge('dochain_oracle_up', {
      description: '1 if price-server quoter is up, or 0 if failed',
    })
    .addCallback((observerResult) => {
      for (const [name, isAlive] of quoterAlive) {
        observerResult.observe(isAlive ? 1 : 0, { oracle_source: name })
      }
    })
}

export const countAllRequests = () => {
  setupMetrics()

  return (req, res, next) => {
    requestCount.add(1, { route: req.path })
    next()
  }
}

export function setQuoterAlive(name: string, isAlive: boolean) {
  setupMetrics()
  quoterAlive.set(name, isAlive)
}
