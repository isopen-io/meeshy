/**
 * #11266 — la politique d'envoi de la passerelle : les plafonds et le quota
 * de `@meeshy/shared/types/upload-limits`, configurables par l'environnement,
 * et des refus typés (413 `FILE_TOO_LARGE`, 429 `UPLOAD_DAILY_QUOTA_EXCEEDED`).
 */
import { UPLOAD_REFUSAL_CODES, UPLOAD_SIZE_CEILINGS, DAILY_UPLOAD_QUOTA_BYTES } from '@meeshy/shared/types/upload-limits';
import {
  dailyQuotaRefusal,
  tusUploadRefusal,
  uploadLimitPolicyFromEnv,
  uploadSizeRefusal,
} from '../upload-admission';

const MIB = 1024 * 1024;

describe('uploadLimitPolicyFromEnv', () => {
  it('sans configuration, rend la décision du porteur et le quota par défaut', () => {
    expect(uploadLimitPolicyFromEnv({})).toEqual({ ceilings: UPLOAD_SIZE_CEILINGS, quotas: DAILY_UPLOAD_QUOTA_BYTES });
  });

  it('chaque plafond et chaque quota se configure en octets', () => {
    const policy = uploadLimitPolicyFromEnv({
      UPLOAD_CEILING_IMAGE_BYTES: String(200 * MIB),
      UPLOAD_DAILY_QUOTA_REGISTERED_BYTES: '1000',
      UPLOAD_DAILY_QUOTA_ANONYMOUS_BYTES: '100',
    });
    expect(policy.ceilings).toEqual({ ...UPLOAD_SIZE_CEILINGS, image: 200 * MIB });
    expect(policy.quotas).toEqual({ registered: 1000, anonymous: 100 });
  });

  it('une valeur illisible, nulle ou négative est ignorée', () => {
    const policy = uploadLimitPolicyFromEnv({
      UPLOAD_CEILING_VIDEO_BYTES: 'beaucoup',
      UPLOAD_CEILING_AUDIO_BYTES: '-5',
      UPLOAD_DAILY_QUOTA_REGISTERED_BYTES: '0',
    });
    expect(policy).toEqual({ ceilings: UPLOAD_SIZE_CEILINGS, quotas: DAILY_UPLOAD_QUOTA_BYTES });
  });
});

describe('uploadSizeRefusal', () => {
  const policy = uploadLimitPolicyFromEnv({});

  it('laisse passer un fichier au plafond de son rôle', () => {
    expect(uploadSizeRefusal({ policy, type: 'image', role: 'registered', size: 100 * MIB })).toBeNull();
    expect(uploadSizeRefusal({ policy, type: 'image', role: 'anonymous', size: 10 * MIB })).toBeNull();
  });

  it('refuse en 413 typé ce qui dépasse, en nommant la limite', () => {
    const refusal = uploadSizeRefusal({ policy, type: 'image', role: 'anonymous', size: 10 * MIB + 1 });
    expect(refusal).toMatchObject({ status: 413, code: UPLOAD_REFUSAL_CODES.FILE_TOO_LARGE, limitBytes: 10 * MIB });
    expect(refusal?.message).toContain('10 MB');
  });
});

describe('dailyQuotaRefusal', () => {
  it('un quota dépassé est un 429 typé qui porte son délai', () => {
    const refusal = dailyQuotaRefusal({ allowed: false, usedBytes: 5, quotaBytes: 10, retryAfterSeconds: 3600 });
    expect(refusal).toMatchObject({ status: 429, code: UPLOAD_REFUSAL_CODES.DAILY_QUOTA_EXCEEDED, retryAfterSeconds: 3600 });
  });

  it('rien à refuser quand le quota admet', () => {
    expect(dailyQuotaRefusal({ allowed: true })).toBeNull();
  });
});

describe('tusUploadRefusal', () => {
  it('rend l’enveloppe d’erreur de l’API, délai compris (tus n’écrit aucun en-tête d’erreur)', () => {
    const tus = tusUploadRefusal({
      status: 429,
      code: UPLOAD_REFUSAL_CODES.DAILY_QUOTA_EXCEEDED,
      message: 'Daily upload quota exceeded',
      retryAfterSeconds: 60,
    });
    expect(tus.status_code).toBe(429);
    expect(JSON.parse(tus.body)).toEqual({
      success: false,
      error: 'Daily upload quota exceeded',
      message: 'Daily upload quota exceeded',
      code: 'UPLOAD_DAILY_QUOTA_EXCEEDED',
      retryAfterSeconds: 60,
    });
  });
});
