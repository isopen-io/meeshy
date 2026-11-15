/**
 * La politique d'envoi de la passerelle (#11266) : les plafonds par type et
 * le quota journalier de `@meeshy/shared/types/upload-limits` (décision du
 * porteur, #11249 point 6), que l'environnement peut remplacer — et les deux
 * refus typés qu'elle rend, communs au TUS et au multipart.
 *
 * Variables (octets, entiers > 0 ; toute autre valeur est ignorée) :
 * `UPLOAD_CEILING_{IMAGE,AUDIO,VIDEO,DOCUMENT}_BYTES`,
 * `UPLOAD_DAILY_QUOTA_{REGISTERED,ANONYMOUS}_BYTES`. Un anonyme suit toujours
 * les plafonds divisés par `ANONYMOUS_UPLOAD_DIVISOR`.
 */
import type { AttachmentType } from '@meeshy/shared/types/attachment';
import {
  DAILY_UPLOAD_QUOTA_BYTES,
  UPLOAD_REFUSAL_CODES,
  UPLOAD_SIZE_CEILINGS,
  uploadSizeLimit,
  type DailyUploadQuotas,
  type UploadSizeCeilings,
  type UploaderRole,
} from '@meeshy/shared/types/upload-limits';
import type { UploadQuotaVerdict } from './upload-quota.js';

export type UploadLimitPolicy = {
  readonly ceilings: UploadSizeCeilings;
  readonly quotas: DailyUploadQuotas;
};

export type UploadRefusal = {
  readonly status: 413 | 429;
  readonly code: (typeof UPLOAD_REFUSAL_CODES)[keyof typeof UPLOAD_REFUSAL_CODES];
  readonly message: string;
  readonly limitBytes?: number;
  readonly retryAfterSeconds?: number;
};

type Env = Readonly<Record<string, string | undefined>>;

function positiveBytes(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function uploadLimitPolicyFromEnv(env: Env = process.env): UploadLimitPolicy {
  return {
    ceilings: {
      image: positiveBytes(env.UPLOAD_CEILING_IMAGE_BYTES, UPLOAD_SIZE_CEILINGS.image),
      audio: positiveBytes(env.UPLOAD_CEILING_AUDIO_BYTES, UPLOAD_SIZE_CEILINGS.audio),
      video: positiveBytes(env.UPLOAD_CEILING_VIDEO_BYTES, UPLOAD_SIZE_CEILINGS.video),
      document: positiveBytes(env.UPLOAD_CEILING_DOCUMENT_BYTES, UPLOAD_SIZE_CEILINGS.document),
    },
    quotas: {
      registered: positiveBytes(env.UPLOAD_DAILY_QUOTA_REGISTERED_BYTES, DAILY_UPLOAD_QUOTA_BYTES.registered),
      anonymous: positiveBytes(env.UPLOAD_DAILY_QUOTA_ANONYMOUS_BYTES, DAILY_UPLOAD_QUOTA_BYTES.anonymous),
    },
  };
}

/** Le plus grand fichier qu'un rôle quelconque peut envoyer — ce que TUS annonce (`Tus-Max-Size`). */
export function largestUploadCeiling(policy: UploadLimitPolicy): number {
  return Math.max(...Object.values(policy.ceilings));
}

const MIB = 1024 * 1024;

function humanSize(bytes: number): string {
  return bytes >= 1024 * MIB ? `${(bytes / (1024 * MIB)).toFixed(1)} GB` : `${Math.floor(bytes / MIB)} MB`;
}

export function uploadSizeRefusal(params: {
  readonly policy: UploadLimitPolicy;
  readonly type: AttachmentType;
  readonly role: UploaderRole;
  readonly size: number;
}): UploadRefusal | null {
  const limitBytes = uploadSizeLimit({ type: params.type, role: params.role, ceilings: params.policy.ceilings });
  if (params.size <= limitBytes) return null;
  return {
    status: 413,
    code: UPLOAD_REFUSAL_CODES.FILE_TOO_LARGE,
    message: `File too large. Max size for ${params.type}: ${humanSize(limitBytes)}`,
    limitBytes,
  };
}

export function dailyQuotaRefusal(verdict: UploadQuotaVerdict): UploadRefusal | null {
  if (!('quotaBytes' in verdict)) return null;
  return {
    status: 429,
    code: UPLOAD_REFUSAL_CODES.DAILY_QUOTA_EXCEEDED,
    message: `Daily upload quota exceeded (${humanSize(verdict.quotaBytes)} per day)`,
    retryAfterSeconds: verdict.retryAfterSeconds,
  };
}

/**
 * Le refus tel que `@tus/server` le renvoie : l'enveloppe d'erreur de l'API.
 * `@tus/server` n'écrit que `status_code` et `body` d'une erreur levée (aucun
 * en-tête) : le délai d'un quota voyage donc dans le corps.
 */
export function tusUploadRefusal(refusal: UploadRefusal): { readonly status_code: number; readonly body: string } {
  const envelope = {
    success: false,
    error: refusal.message,
    message: refusal.message,
    code: refusal.code,
    ...(refusal.retryAfterSeconds !== undefined ? { retryAfterSeconds: refusal.retryAfterSeconds } : {}),
  };
  return { status_code: refusal.status, body: `${JSON.stringify(envelope)}\n` };
}

export function uploaderRole(isAnonymous: boolean): UploaderRole {
  return isAnonymous ? 'anonymous' : 'registered';
}
