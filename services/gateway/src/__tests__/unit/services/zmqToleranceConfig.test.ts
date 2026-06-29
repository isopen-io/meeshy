/**
 * zmqToleranceConfig unit tests
 *
 * All functions are pure — no side effects or mocking needed.
 *
 * @jest-environment node
 */

import {
  parseBoundedInt,
  readZmqToleranceConfig,
  ZMQ_TOLERANCE_DEFAULTS,
} from '../../../services/zmq-translation/zmqToleranceConfig';

describe('parseBoundedInt', () => {
  it('returns fallback when raw is undefined', () => {
    expect(parseBoundedInt(undefined, 42, 0)).toBe(42);
  });

  it('returns fallback when raw is empty string', () => {
    expect(parseBoundedInt('', 42, 0)).toBe(42);
  });

  it('returns fallback when raw is whitespace only', () => {
    expect(parseBoundedInt('   ', 42, 0)).toBe(42);
  });

  it('returns fallback when raw is non-numeric', () => {
    expect(parseBoundedInt('abc', 42, 0)).toBe(42);
  });

  it('returns fallback when raw is a float', () => {
    expect(parseBoundedInt('3.14', 42, 0)).toBe(42);
  });

  it('returns fallback when parsed value is below min', () => {
    expect(parseBoundedInt('0', 42, 1)).toBe(42);
  });

  it('returns fallback when parsed value is negative and min is 0', () => {
    expect(parseBoundedInt('-1', 10, 0)).toBe(10);
  });

  it('returns parsed value when valid and at minimum', () => {
    expect(parseBoundedInt('0', 42, 0)).toBe(0);
  });

  it('returns parsed value when valid and above minimum', () => {
    expect(parseBoundedInt('100', 42, 1)).toBe(100);
  });

  it('handles whitespace-padded valid integer', () => {
    expect(parseBoundedInt('  5  ', 42, 0)).toBe(5);
  });

  it('returns fallback when raw is Infinity', () => {
    expect(parseBoundedInt('Infinity', 42, 0)).toBe(42);
  });

  it('returns fallback when raw is NaN string', () => {
    expect(parseBoundedInt('NaN', 42, 0)).toBe(42);
  });
});

describe('readZmqToleranceConfig', () => {
  it('returns all defaults when env is empty', () => {
    const config = readZmqToleranceConfig({});
    expect(config).toEqual(ZMQ_TOLERANCE_DEFAULTS);
  });

  it('uses ZMQ_REQUEST_TIMEOUT_MS from env', () => {
    const config = readZmqToleranceConfig({ ZMQ_REQUEST_TIMEOUT_MS: '5000' });
    expect(config.requestTimeoutMs).toBe(5000);
  });

  it('falls back to default requestTimeoutMs for invalid env value', () => {
    const config = readZmqToleranceConfig({ ZMQ_REQUEST_TIMEOUT_MS: '0' });
    expect(config.requestTimeoutMs).toBe(ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs);
  });

  it('uses ZMQ_MAX_RETRIES from env', () => {
    const config = readZmqToleranceConfig({ ZMQ_MAX_RETRIES: '2' });
    expect(config.maxRetries).toBe(2);
  });

  it('allows ZMQ_MAX_RETRIES to be 0 (min is 0)', () => {
    const config = readZmqToleranceConfig({ ZMQ_MAX_RETRIES: '0' });
    expect(config.maxRetries).toBe(0);
  });

  it('uses ZMQ_VOICE_TRANSLATE_DEADMAN_MS from env', () => {
    const config = readZmqToleranceConfig({ ZMQ_VOICE_TRANSLATE_DEADMAN_MS: '60000' });
    expect(config.voiceTranslateDeadmanMs).toBe(60000);
  });

  it('uses CB_FAILURE_THRESHOLD from env', () => {
    const config = readZmqToleranceConfig({ CB_FAILURE_THRESHOLD: '3' });
    expect(config.cbFailureThreshold).toBe(3);
  });

  it('falls back to default cbFailureThreshold for value below min (1)', () => {
    const config = readZmqToleranceConfig({ CB_FAILURE_THRESHOLD: '0' });
    expect(config.cbFailureThreshold).toBe(ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold);
  });

  it('uses CB_COOLDOWN_MS from env', () => {
    const config = readZmqToleranceConfig({ CB_COOLDOWN_MS: '60000' });
    expect(config.cbCooldownMs).toBe(60000);
  });

  it('allows CB_COOLDOWN_MS to be 0 (min is 0)', () => {
    const config = readZmqToleranceConfig({ CB_COOLDOWN_MS: '0' });
    expect(config.cbCooldownMs).toBe(0);
  });

  it('uses all env vars together', () => {
    const config = readZmqToleranceConfig({
      ZMQ_REQUEST_TIMEOUT_MS: '10000',
      ZMQ_MAX_RETRIES: '3',
      ZMQ_VOICE_TRANSLATE_DEADMAN_MS: '300000',
      CB_FAILURE_THRESHOLD: '5',
      CB_COOLDOWN_MS: '15000',
    });
    expect(config).toEqual({
      requestTimeoutMs: 10000,
      maxRetries: 3,
      voiceTranslateDeadmanMs: 300000,
      cbFailureThreshold: 5,
      cbCooldownMs: 15000,
    });
  });

  it('ignores unrelated env keys', () => {
    const config = readZmqToleranceConfig({ UNRELATED_KEY: 'foo' });
    expect(config).toEqual(ZMQ_TOLERANCE_DEFAULTS);
  });
});
