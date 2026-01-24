// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

// Add TextEncoder/TextDecoder for crypto operations
global.TextEncoder = TextEncoder
global.TextDecoder = TextDecoder

// Mock crypto.subtle for secure-storage tests
const mockKey = { type: 'secret', algorithm: { name: 'AES-GCM' } }
const mockCrypto = {
  subtle: {
    importKey: jest.fn().mockResolvedValue(mockKey),
    deriveKey: jest.fn().mockResolvedValue(mockKey),
    encrypt: jest.fn().mockImplementation(async (algorithm, key, data) => {
      // Simple mock: just return the data with a prefix for IV
      const iv = new Uint8Array(12)
      const dataArray = new Uint8Array(data)
      const result = new Uint8Array(iv.length + dataArray.length)
      result.set(iv)
      result.set(dataArray, iv.length)
      return result.buffer
    }),
    decrypt: jest.fn().mockImplementation(async (algorithm, key, data) => {
      // Simple mock: strip the IV prefix and return data
      const dataArray = new Uint8Array(data)
      return dataArray.slice(12).buffer
    }),
    digest: jest.fn().mockResolvedValue(new ArrayBuffer(32)),
  },
  getRandomValues: jest.fn((arr) => {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256)
    }
    return arr
  }),
}

Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true,
})

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    pathname: '/',
    query: {},
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock styled-jsx
jest.mock('styled-jsx/style', () => ({
  __esModule: true,
  default: function MockStyle({ children }) {
    return null
  },
}))

// Suppress console errors and warnings during tests to reduce verbosity
const originalError = console.error
const originalWarn = console.warn
const originalLog = console.log

beforeAll(() => {
  // Filter out noise from console.error
  console.error = (...args) => {
    const message = typeof args[0] === 'string' ? args[0] : ''

    // Suppress common test warnings and expected errors
    if (
      message.includes('Warning: ReactDOM.render') ||
      message.includes('Not implemented: HTMLFormElement.prototype.submit') ||
      message.includes('inside a test was not wrapped in act') ||
      message.includes('Test notification error') ||
      message.includes('SW not ready') ||
      message.includes('Test error') ||
      message.includes('multiple elements with the text') ||
      message.includes('Unable to find an element')
    ) {
      return
    }
    originalError.call(console, ...args)
  }

  // Suppress console.warn entirely in tests
  console.warn = () => {}

  // Suppress console.log entirely in tests
  console.log = () => {}
})

afterAll(() => {
  console.error = originalError
  console.warn = originalWarn
  console.log = originalLog
})
