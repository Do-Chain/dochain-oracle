import * as FormData from 'form-data'
import { Agent as HttpAgent } from 'http'
import { Agent as HttpsAgent } from 'https'
import nodeFetch, { RequestInit, Response } from 'node-fetch'
export * from 'node-fetch'

interface TimeoutRequestInit extends RequestInit {
  timeout?: number
}

const defaultTimeoutMs = parseTimeout(process.env.PRICE_SERVER_FETCH_TIMEOUT_MS, 10000)

const httpAgent = new HttpAgent({
  keepAlive: true,
})

const httpsAgent = new HttpsAgent({
  keepAlive: true,
})

const options = {
  agent: function (_parsedURL) {
    if (_parsedURL.protocol == 'http:') {
      return httpAgent
    } else {
      return httpsAgent
    }
  },
}

export default function fetch(url: string, init?: TimeoutRequestInit): Promise<Response> {
  const { timeout, signal, ...fetchInit } = init || {}
  const timeoutMs = parseTimeout(timeout, defaultTimeoutMs)

  if (!timeoutMs) {
    return nodeFetch(url, { ...fetchInit, ...options, signal })
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  return nodeFetch(url, { ...fetchInit, ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  )
}

export function toFormData(object: Record<string, unknown>): FormData {
  const formData = new FormData()
  for (const key of Object.keys(object)) {
    formData.append(key, object[key])
  }
  return formData
}

export function toQueryString(object: Record<string, unknown>): string {
  return Object.entries(object)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

function parseTimeout(value: unknown, fallback: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}
