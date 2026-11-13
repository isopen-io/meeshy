/**
 * LE CONSENTEMENT À L'INTEROPÉRABILITÉ (#17120, chantier #17007) — un
 * utilisateur Meeshy n'ouvre une conversation avec un ami WhatsApp qu'après
 * avoir lu ce qui part chez Meta et y avoir consenti, sous la version EN
 * VIGUEUR de cette information (`EXTERNAL_INTEROP_NOTICE_VERSION`).
 *
 * - La date est celle du SERVEUR ; le client ne fournit que sa décision et la
 *   version qu'il a montrée. Une version périmée est refusée par l'appelant.
 * - Retirer le consentement efface la date, la version, ET les adresses d'amis
 *   que le compte gardait (`eraseExternalPeerHandlesOpenedBy`) : sans
 *   consentement, le numéro d'un ami n'a plus d'usage, il n'attend pas son
 *   échéance. Les conversations restent (elles suivent leur propre cycle).
 * - Une seule colonne par réseau ; seul `whatsapp` existe (`externalNetworkSchema`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  EXTERNAL_INTEROP_DISCLOSURES,
  EXTERNAL_INTEROP_NOTICE_VERSION,
  isInteropConsentCurrent,
  type ExternalInteropConsentStatus,
} from '@meeshy/shared/types/external-interop-compliance';
import type { ExternalNetwork } from '../external-peer/external-peer-contract';
import { eraseExternalPeerHandlesOpenedBy } from './erase-external-peers';

export type InteropConsentDeps = {
  readonly prisma: Pick<PrismaClient, 'user' | 'externalConversationPeer'>;
  readonly now: () => Date;
  readonly retentionDays: number;
};

type ConsentColumns = {
  readonly whatsappInteropConsentAt?: Date | null;
  readonly whatsappInteropNoticeVersion?: string | null;
};

const CONSENT_SELECT = { whatsappInteropConsentAt: true, whatsappInteropNoticeVersion: true } as const;

const statusOf = (deps: InteropConsentDeps, network: ExternalNetwork, row: ConsentColumns): ExternalInteropConsentStatus => {
  const grantedAt = row.whatsappInteropConsentAt ?? null;
  const noticeVersion = row.whatsappInteropNoticeVersion ?? null;
  return {
    network,
    noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION,
    disclosures: [...EXTERNAL_INTEROP_DISCLOSURES],
    retentionDays: deps.retentionDays,
    consent: grantedAt && noticeVersion ? { grantedAt: grantedAt.toISOString(), noticeVersion } : null,
    current: isInteropConsentCurrent({ grantedAt, noticeVersion }),
  };
};

/** L'état du consentement d'un compte ; `null` si le compte n'existe pas. */
export async function readInteropConsent(
  deps: InteropConsentDeps,
  params: { readonly userId: string; readonly network: ExternalNetwork },
): Promise<ExternalInteropConsentStatus | null> {
  const row = await deps.prisma.user.findUnique({ where: { id: params.userId }, select: CONSENT_SELECT });
  return row ? statusOf(deps, params.network, row) : null;
}

/** Accorde (date du serveur, version en vigueur) ou retire le consentement ; rend l'état qui en résulte. */
export async function recordInteropConsent(
  deps: InteropConsentDeps,
  params: { readonly userId: string; readonly network: ExternalNetwork; readonly granted: boolean },
): Promise<ExternalInteropConsentStatus> {
  const data = params.granted
    ? { whatsappInteropConsentAt: deps.now(), whatsappInteropNoticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION }
    : { whatsappInteropConsentAt: null, whatsappInteropNoticeVersion: null };
  const row = await deps.prisma.user.update({ where: { id: params.userId }, data, select: CONSENT_SELECT });
  if (!params.granted) await eraseExternalPeerHandlesOpenedBy(deps.prisma, params.userId);
  return statusOf(deps, params.network, row);
}
