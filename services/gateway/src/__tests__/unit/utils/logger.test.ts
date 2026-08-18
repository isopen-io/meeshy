/**
 * Unit tests for utils/logger.
 * Covers: logger (info, error, warn, debug), logError and logWarn
 * with real-logger, null-logger, Error instance, non-Error, and
 * the internal catch-all fallback.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { logger, logError, logWarn } from '../../../utils/logger';

// ─── logger singleton ─────────────────────────────────────────────────────────

describe('logger', () => {
  let logSpy;
  let errorSpy;
  let warnSpy;
  let debugSpy;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    debugSpy.mockRestore();
  });

  it('info writes to console.log', () => {
    logger.info('hello info');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('hello info');
  });

  it('error writes to console.error', () => {
    logger.error('something went wrong');
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('something went wrong');
  });

  it('warn writes to console.warn', () => {
    logger.warn('caution');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('caution');
  });

  it('debug does not write when NODE_ENV is not development', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    delete process.env.DEBUG;
    logger.debug('should be silent');
    expect(debugSpy).not.toHaveBeenCalled();
    process.env.NODE_ENV = prev;
  });

  it('debug writes to console.debug in development mode', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    logger.debug('dev trace');
    expect(debugSpy).toHaveBeenCalledTimes(1);
    process.env.NODE_ENV = prev;
  });

  it('formats extra args as JSON when they are objects', () => {
    logger.info('msg', { foo: 'bar' });
    const call = logSpy.mock.calls[0][0];
    expect(call).toContain('{"foo":"bar"}');
  });
});

// ─── logError ─────────────────────────────────────────────────────────────────

describe('logError', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('calls logger.error with the message when an Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', new Error('bad'));
    expect(mockLogger.error).toHaveBeenCalledWith('oops');
  });

  it('calls logger.error with the error message when an Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', new Error('bad'));
    expect(mockLogger.error).toHaveBeenCalledWith('bad');
  });

  it('calls logger.error with String(error) when a non-Error is passed', () => {
    const mockLogger = { error: jest.fn() };
    logError(mockLogger, 'oops', 'string-error');
    expect(mockLogger.error).toHaveBeenCalledWith('string-error');
  });

  it('falls back to console.error when the logger has no error method', () => {
    logError(null, 'msg', 'err');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('falls back to console.error when the logger.error throws', () => {
    const brokenLogger = {
      error: jest.fn().mockImplementation(() => { throw new Error('logger broken'); }),
    };
    logError(brokenLogger, 'msg', 'err');
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ─── logWarn ──────────────────────────────────────────────────────────────────

describe('logWarn', () => {
  let warnSpy;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('calls logger.warn with the message when an Error is passed', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'attention', new Error('minor'));
    expect(mockLogger.warn).toHaveBeenCalledWith('attention');
  });

  it('calls logger.warn with the error message when an Error is passed', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'attention', new Error('minor'));
    expect(mockLogger.warn).toHaveBeenCalledWith('minor');
  });

  it('calls logger.warn with String(error) for non-Error input', () => {
    const mockLogger = { warn: jest.fn() };
    logWarn(mockLogger, 'heads-up', 42);
    expect(mockLogger.warn).toHaveBeenCalledWith('42');
  });

  it('falls back to console.warn when the logger is null', () => {
    logWarn(null, 'msg', 'w');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('falls back to console.warn when the logger.warn throws', () => {
    const brokenLogger = {
      warn: jest.fn().mockImplementation(() => { throw new Error('broken'); }),
    };
    logWarn(brokenLogger, 'msg', 'w');
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ─── Visibilité en production ────────────────────────────────────────────────
//
// `server.ts` construit Fastify avec `logger: false` — `fastify.log` est donc le
// no-op d'`abstract-logging` : ses méthodes existent, ne rejettent pas, et
// n'écrivent rien. Or 164 des 172 appels à `logError` lui passent précisément
// `fastify.log`, et 2 autres `request.log`, qui est le même objet.
//
// Conséquence mesurée le 2026-08-18 : un 500 reproductible sur
// `POST /anonymous/join/:linkId` n'a laissé AUCUNE ligne structurée dans les
// logs de production. Seul le `prisma:error` brut du client, écrit par Prisma
// lui-même, a fuité — et il ne nomme ni la route, ni l'appelant.
//
// Un logger d'erreurs qui n'écrit rien est pire qu'aucun logger : le code se lit
// comme s'il traçait.

describe('logError — la ligne SORT, quel que soit le logger reçu', () => {
  let errorSpy;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  /** Réplique fidèle de `fastify.log` sous `logger: false`. */
  const noopFastifyLog = () => ({
    error: function noop() {},
    warn: function noop() {},
    info: function noop() {},
    debug: function noop() {},
  });

  it('écrit malgré un logger muet — le cas de 166 appels sur 172', () => {
    logError(noopFastifyLog(), 'Anonymous join error', new Error('duplicate key'));

    expect(errorSpy).toHaveBeenCalled();
  });

  it('nomme le contexte ET la cause', () => {
    logError(noopFastifyLog(), 'Anonymous join error', new Error('duplicate key'));

    const printed = errorSpy.mock.calls.flat().join(' ');
    expect(printed).toContain('Anonymous join error');
    expect(printed).toContain('duplicate key');
  });

  it('écrit aussi sans aucun logger', () => {
    logError(null, 'boom', new Error('bad'));

    expect(errorSpy).toHaveBeenCalled();
  });

  // Six appels du dépôt utilisent la signature à DEUX arguments
  // (`logError('Error fetching categories', error, { source })`). Le message
  // humain y arrivait en position `logger`, et l'erreur en position `message` :
  // la ligne sortait, mais amputée de ce qu'elle voulait dire.
  it('rattrape la signature à deux arguments plutôt que de la mutiler', () => {
    logError('Error fetching categories', new Error('mongo down'));

    const printed = errorSpy.mock.calls.flat().join(' ');
    expect(printed).toContain('Error fetching categories');
    expect(printed).toContain('mongo down');
  });

  it('continue de servir un vrai logger quand on lui en donne un', () => {
    const realLogger = { error: jest.fn() };

    logError(realLogger, 'oops', new Error('bad'));

    expect(realLogger.error).toHaveBeenCalledWith('oops');
  });
});
