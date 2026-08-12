/**
 * TDD — Configuration de tolérance ZMQ surchargeable par variables d'environnement.
 *
 * But : permettre d'ajuster timeouts/retries/circuit-breaker en prod sans
 * redéployer de code, pour que les traductions aboutissent même quand le
 * translator est lent — sans tempête de retries.
 */
import { describe, it, expect } from '@jest/globals';
import {
  parseBoundedInt,
  readZmqToleranceConfig,
  ZMQ_TOLERANCE_DEFAULTS,
} from '../zmqToleranceConfig';

describe('parseBoundedInt', () => {
  it('retourne le défaut quand la variable est absente', () => {
    expect(parseBoundedInt(undefined, 30_000, 1)).toBe(30_000);
  });

  it('retourne le défaut quand la variable est vide', () => {
    expect(parseBoundedInt('   ', 30_000, 1)).toBe(30_000);
  });

  it('parse un entier valide', () => {
    expect(parseBoundedInt('60000', 30_000, 1)).toBe(60_000);
  });

  it('rejette les valeurs non numériques → défaut', () => {
    expect(parseBoundedInt('abc', 5, 1)).toBe(5);
  });

  it('rejette les flottants → défaut', () => {
    expect(parseBoundedInt('1.5', 5, 1)).toBe(5);
  });

  it('rejette les valeurs sous le minimum → défaut', () => {
    expect(parseBoundedInt('-3', 5, 1)).toBe(5);
    expect(parseBoundedInt('0', 5, 1)).toBe(5);
  });

  it('autorise le minimum (ex: 0 retries)', () => {
    expect(parseBoundedInt('0', 4, 0)).toBe(0);
  });
});

describe('readZmqToleranceConfig', () => {
  it('utilise tous les défauts sans variables d\'environnement', () => {
    expect(readZmqToleranceConfig({})).toEqual(ZMQ_TOLERANCE_DEFAULTS);
  });

  it('surcharge timeout et retries depuis l\'environnement', () => {
    const cfg = readZmqToleranceConfig({
      ZMQ_REQUEST_TIMEOUT_MS: '60000',
      ZMQ_MAX_RETRIES: '6',
    });
    expect(cfg.requestTimeoutMs).toBe(60_000);
    expect(cfg.maxRetries).toBe(6);
    // les autres restent aux défauts
    expect(cfg.cbFailureThreshold).toBe(ZMQ_TOLERANCE_DEFAULTS.cbFailureThreshold);
  });

  it('autorise maxRetries=0 (aucun retry)', () => {
    expect(readZmqToleranceConfig({ ZMQ_MAX_RETRIES: '0' }).maxRetries).toBe(0);
  });

  it('ignore une surcharge invalide et garde le défaut', () => {
    const cfg = readZmqToleranceConfig({ ZMQ_REQUEST_TIMEOUT_MS: 'oops' });
    expect(cfg.requestTimeoutMs).toBe(ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs);
  });

  it('a des défauts tolérants (retries ≥ 4, timeout ≥ 30s)', () => {
    expect(ZMQ_TOLERANCE_DEFAULTS.maxRetries).toBeGreaterThanOrEqual(4);
    expect(ZMQ_TOLERANCE_DEFAULTS.requestTimeoutMs).toBeGreaterThanOrEqual(30_000);
  });
});
