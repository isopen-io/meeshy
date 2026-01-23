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

// Suppress console errors during tests (optional)
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
        args[0].includes('Not implemented: HTMLFormElement.prototype.submit') ||
        args[0].includes('An update to') && args[0].includes('inside a test was not wrapped in act'))
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})
