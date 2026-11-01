import { describe, expect, it } from 'vitest';
import {
  ANONYMOUS_UPLOAD_DIVISOR,
  DAILY_UPLOAD_QUOTA_BYTES,
  MAX_UPLOAD_SIZE_CEILING,
  UPLOAD_REFUSAL_CODES,
  UPLOAD_SIZE_CEILINGS,
  dailyUploadQuota,
  uploadLimitsFor,
  uploadSizeFamilyOf,
  uploadSizeLimit,
} from '../../types/upload-limits.js';
import { UPLOAD_LIMITS, getSizeLimit } from '../../types/attachment.js';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

describe('plafonds d’envoi par type — décision du porteur du 2026-11-01 (#11249 point 6)', () => {
  it('image 100 Mo, audio 500 Mo, vidéo 4 Go, document 500 Mo', () => {
    expect(UPLOAD_SIZE_CEILINGS).toEqual({ image: 100 * MIB, audio: 500 * MIB, video: 4 * GIB, document: 500 * MIB });
  });

  it('le plus grand plafond reste celui de la vidéo : un ancien client à 4 Go n’est pas refusé par le protocole', () => {
    expect(MAX_UPLOAD_SIZE_CEILING).toBe(4 * GIB);
  });

  it('un texte et un fichier de code suivent le plafond du document', () => {
    expect(uploadSizeFamilyOf('text')).toBe('document');
    expect(uploadSizeFamilyOf('code')).toBe('document');
    expect(uploadSizeFamilyOf('document')).toBe('document');
    expect(uploadSizeFamilyOf('video')).toBe('video');
  });
});

describe('uploadSizeLimit — la limite dépend du rôle', () => {
  it.each([
    ['image', 100 * MIB],
    ['audio', 500 * MIB],
    ['video', 4 * GIB],
    ['document', 500 * MIB],
    ['text', 500 * MIB],
    ['code', 500 * MIB],
  ] as const)('un inscrit envoie un %s jusqu’à son plafond', (type, expected) => {
    expect(uploadSizeLimit({ type, role: 'registered' })).toBe(expected);
  });

  it('un anonyme a les plafonds divisés par 10', () => {
    expect(ANONYMOUS_UPLOAD_DIVISOR).toBe(10);
    expect(uploadSizeLimit({ type: 'image', role: 'anonymous' })).toBe(Math.floor((100 * MIB) / 10));
    expect(uploadSizeLimit({ type: 'video', role: 'anonymous' })).toBe(Math.floor((4 * GIB) / 10));
    expect(uploadSizeLimit({ type: 'audio', role: 'anonymous' })).toBe(Math.floor((500 * MIB) / 10));
  });

  it('des plafonds configurés remplacent ceux par défaut, et l’anonyme suit la même division', () => {
    const ceilings = { ...UPLOAD_SIZE_CEILINGS, image: 200 * MIB };
    expect(uploadSizeLimit({ type: 'image', role: 'registered', ceilings })).toBe(200 * MIB);
    expect(uploadSizeLimit({ type: 'image', role: 'anonymous', ceilings })).toBe(20 * MIB);
  });
});

describe('quota journalier', () => {
  it('un inscrit a un quota journalier, l’anonyme dix fois moins', () => {
    expect(dailyUploadQuota({ role: 'registered' })).toBe(DAILY_UPLOAD_QUOTA_BYTES.registered);
    expect(dailyUploadQuota({ role: 'anonymous' })).toBe(DAILY_UPLOAD_QUOTA_BYTES.anonymous);
    expect(DAILY_UPLOAD_QUOTA_BYTES.anonymous).toBe(DAILY_UPLOAD_QUOTA_BYTES.registered / ANONYMOUS_UPLOAD_DIVISOR);
  });

  it('le quota d’un inscrit laisse passer au moins plusieurs vidéos au plafond', () => {
    expect(DAILY_UPLOAD_QUOTA_BYTES.registered).toBeGreaterThanOrEqual(4 * UPLOAD_SIZE_CEILINGS.video);
  });

  it('un quota configuré remplace celui par défaut', () => {
    expect(dailyUploadQuota({ role: 'registered', quotas: { registered: 1 * GIB, anonymous: 1 } })).toBe(1 * GIB);
  });
});

describe('ce que les clients lisent pour refuser avant d’envoyer', () => {
  it('uploadLimitsFor rend les plafonds par famille et le quota du rôle', () => {
    expect(uploadLimitsFor('anonymous')).toEqual({
      image: 10 * MIB,
      audio: 50 * MIB,
      video: Math.floor((4 * GIB) / 10),
      document: 50 * MIB,
      dailyQuotaBytes: DAILY_UPLOAD_QUOTA_BYTES.anonymous,
    });
  });

  it('les codes de refus sont stables', () => {
    expect(UPLOAD_REFUSAL_CODES).toEqual({
      FILE_TOO_LARGE: 'FILE_TOO_LARGE',
      DAILY_QUOTA_EXCEEDED: 'UPLOAD_DAILY_QUOTA_EXCEEDED',
    });
  });
});

describe('UPLOAD_LIMITS et getSizeLimit restent compatibles et lisent la même source', () => {
  it('UPLOAD_LIMITS projette les plafonds d’un inscrit', () => {
    expect(UPLOAD_LIMITS).toEqual({
      IMAGE: 100 * MIB,
      DOCUMENT: 500 * MIB,
      AUDIO: 500 * MIB,
      VIDEO: 4 * GIB,
      TEXT: 500 * MIB,
      CODE: 500 * MIB,
    });
  });

  it('getSizeLimit sans rôle rend la limite d’un inscrit, avec rôle celle du rôle', () => {
    expect(getSizeLimit('image')).toBe(100 * MIB);
    expect(getSizeLimit('image', 'anonymous')).toBe(10 * MIB);
  });
});
