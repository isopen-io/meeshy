/**
 * Plafonds d'envoi d'un fichier et quota journalier — source de vérité UNIQUE
 * (#11266), lue par la passerelle (TUS et multipart) et exposée aux clients
 * pour refuser avant d'envoyer.
 *
 * Plafonds décidés par le porteur le 2026-11-01 (#11249, point 6, variante
 * « généreuse ») : image 100 Mo, audio 500 Mo, vidéo 4 Go, document 500 Mo ;
 * un anonyme a ces plafonds divisés par 10. Un texte et un fichier de code
 * suivent le document. La vidéo garde les 4 Go d'avant : aucun ancien client
 * n'est refusé par le protocole TUS lui-même (`Tus-Max-Size`).
 *
 * Le quota journalier n'a pas été chiffré par le porteur : sa valeur par
 * défaut laisse passer cinq vidéos au plafond par jour, la passerelle la rend
 * configurable (`UPLOAD_DAILY_QUOTA_*_BYTES`).
 */
import type { AttachmentType } from './attachment.js';

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;

export type UploadSizeFamily = 'image' | 'audio' | 'video' | 'document';

export type UploaderRole = 'registered' | 'anonymous';

export type UploadSizeCeilings = Readonly<Record<UploadSizeFamily, number>>;

export type DailyUploadQuotas = Readonly<Record<UploaderRole, number>>;

export const UPLOAD_SIZE_CEILINGS: UploadSizeCeilings = {
  image: 100 * MIB,
  audio: 500 * MIB,
  video: 4 * GIB,
  document: 500 * MIB,
};

export const ANONYMOUS_UPLOAD_DIVISOR = 10;

export const MAX_UPLOAD_SIZE_CEILING = Math.max(...Object.values(UPLOAD_SIZE_CEILINGS));

export const DAILY_UPLOAD_QUOTA_BYTES: DailyUploadQuotas = {
  registered: 20 * GIB,
  anonymous: 2 * GIB,
};

/** Codes stables des refus d'envoi, que les clients localisent. */
export const UPLOAD_REFUSAL_CODES = {
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  DAILY_QUOTA_EXCEEDED: 'UPLOAD_DAILY_QUOTA_EXCEEDED',
} as const;

export type UploadRefusalCode = (typeof UPLOAD_REFUSAL_CODES)[keyof typeof UPLOAD_REFUSAL_CODES];

const FAMILY_OF_TYPE: Readonly<Record<AttachmentType, UploadSizeFamily>> = {
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  text: 'document',
  code: 'document',
};

export function uploadSizeFamilyOf(type: AttachmentType): UploadSizeFamily {
  return FAMILY_OF_TYPE[type] ?? 'document';
}

function scaledForRole(bytes: number, role: UploaderRole): number {
  return role === 'anonymous' ? Math.floor(bytes / ANONYMOUS_UPLOAD_DIVISOR) : bytes;
}

export function uploadSizeLimit(params: {
  readonly type: AttachmentType;
  readonly role: UploaderRole;
  readonly ceilings?: UploadSizeCeilings;
}): number {
  const ceilings = params.ceilings ?? UPLOAD_SIZE_CEILINGS;
  return scaledForRole(ceilings[uploadSizeFamilyOf(params.type)], params.role);
}

export function dailyUploadQuota(params: { readonly role: UploaderRole; readonly quotas?: DailyUploadQuotas }): number {
  return (params.quotas ?? DAILY_UPLOAD_QUOTA_BYTES)[params.role];
}

export type RoleUploadLimits = Readonly<Record<UploadSizeFamily, number>> & { readonly dailyQuotaBytes: number };

/** Ce qu'un client lit pour refuser avant d'envoyer, pour le rôle de l'appelant. */
export function uploadLimitsFor(role: UploaderRole): RoleUploadLimits {
  return {
    image: scaledForRole(UPLOAD_SIZE_CEILINGS.image, role),
    audio: scaledForRole(UPLOAD_SIZE_CEILINGS.audio, role),
    video: scaledForRole(UPLOAD_SIZE_CEILINGS.video, role),
    document: scaledForRole(UPLOAD_SIZE_CEILINGS.document, role),
    dailyQuotaBytes: dailyUploadQuota({ role }),
  };
}
