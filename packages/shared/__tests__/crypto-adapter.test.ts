/**
 * Tests for Crypto Adapter Utilities
 */
import { describe, it, expect } from 'vitest';
import {
  uint8ArrayToBase64,
  base64ToUint8Array,
  stringToUint8Array,
  uint8ArrayToString,
} from '../encryption/crypto-adapter';

describe('uint8ArrayToBase64', () => {
  it('should convert empty array to empty string', () => {
    expect(uint8ArrayToBase64(new Uint8Array([]))).toBe('');
  });

  it('should convert simple bytes to base64', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(uint8ArrayToBase64(bytes)).toBe('SGVsbG8=');
  });

  it('should handle binary data', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const base64 = uint8ArrayToBase64(bytes);
    expect(base64).toBe('AAEC//79');
  });

  it('should handle single byte', () => {
    const bytes = new Uint8Array([65]); // 'A'
    expect(uint8ArrayToBase64(bytes)).toBe('QQ==');
  });

  it('should handle all zeros', () => {
    const bytes = new Uint8Array([0, 0, 0, 0]);
    expect(uint8ArrayToBase64(bytes)).toBe('AAAAAA==');
  });
});

describe('base64ToUint8Array', () => {
  it('should convert empty string to empty array', () => {
    const result = base64ToUint8Array('');
    expect(result).toEqual(new Uint8Array([]));
  });

  it('should convert base64 to bytes', () => {
    const result = base64ToUint8Array('SGVsbG8=');
    expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('should handle binary data', () => {
    const result = base64ToUint8Array('AAEC//79');
    expect(result).toEqual(new Uint8Array([0, 1, 2, 255, 254, 253]));
  });

  it('should be inverse of uint8ArrayToBase64', () => {
    const original = new Uint8Array([1, 2, 3, 100, 200, 255]);
    const base64 = uint8ArrayToBase64(original);
    const result = base64ToUint8Array(base64);
    expect(result).toEqual(original);
  });

  it('should handle base64 without padding', () => {
    // "A" in base64 with padding is "QQ=="
    const result = base64ToUint8Array('QQ==');
    expect(result).toEqual(new Uint8Array([65]));
  });
});

describe('stringToUint8Array', () => {
  it('should convert empty string to empty array', () => {
    const result = stringToUint8Array('');
    expect(result).toEqual(new Uint8Array([]));
  });

  it('should convert ASCII string', () => {
    const result = stringToUint8Array('Hello');
    expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('should convert Unicode string', () => {
    const result = stringToUint8Array('Héllo');
    // 'é' is encoded as 2 bytes in UTF-8: 195, 169
    expect(result.length).toBe(6);
    expect(result[0]).toBe(72); // H
    expect(result[1]).toBe(195); // first byte of é
    expect(result[2]).toBe(169); // second byte of é
  });

  it('should handle emojis', () => {
    const result = stringToUint8Array('👋');
    // Emoji is 4 bytes in UTF-8
    expect(result.length).toBe(4);
  });

  it('should handle special characters', () => {
    const result = stringToUint8Array('Café résumé');
    expect(result.length).toBeGreaterThan('Cafe resume'.length);
  });
});

describe('uint8ArrayToString', () => {
  it('should convert empty array to empty string', () => {
    expect(uint8ArrayToString(new Uint8Array([]))).toBe('');
  });

  it('should convert ASCII bytes to string', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]);
    expect(uint8ArrayToString(bytes)).toBe('Hello');
  });

  it('should handle Unicode bytes', () => {
    // 'é' in UTF-8
    const bytes = new Uint8Array([72, 195, 169, 108, 108, 111]);
    expect(uint8ArrayToString(bytes)).toBe('Héllo');
  });

  it('should be inverse of stringToUint8Array', () => {
    const original = 'Hello World! Café 👋';
    const bytes = stringToUint8Array(original);
    const result = uint8ArrayToString(bytes);
    expect(result).toBe(original);
  });
});

describe('roundtrip conversions', () => {
  it('should roundtrip string through base64', () => {
    const original = 'Test message with Unicode: é à ü';
    const bytes = stringToUint8Array(original);
    const base64 = uint8ArrayToBase64(bytes);
    const decodedBytes = base64ToUint8Array(base64);
    const result = uint8ArrayToString(decodedBytes);
    expect(result).toBe(original);
  });

  it('should roundtrip binary data', () => {
    const original = new Uint8Array([0, 127, 128, 255, 1, 254]);
    const base64 = uint8ArrayToBase64(original);
    const result = base64ToUint8Array(base64);
    expect(result).toEqual(original);
  });
});
