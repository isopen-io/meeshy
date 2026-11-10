/**
 * LA CONSERVATION DU NUMÉRO DE L'AMI (#17120, chantier #17007) — exception
 * bornée à #9225 : le numéro E.164 d'un ami WhatsApp n'est gardé que pour une
 * conversation que l'utilisateur a ouverte lui-même, et seulement pendant une
 * durée.
 *
 * - La durée vient d'UNE configuration, `EXTERNAL_PEER_HANDLE_RETENTION_DAYS`
 *   (jours entiers). Absente ou illisible : la valeur provisoire partagée
 *   (`EXTERNAL_PEER_HANDLE_RETENTION_DAYS`, 90 j). Au-delà de la borne dure
 *   (`EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS`, 365 j) : la borne. La durée
 *   définitive et sa base légale restent au juriste (#16999).
 * - L'index TTL sur `purgeAfter` efface une adresse échue ; il n'existe que si
 *   la migration nommée a tourné. `purgeExpiredExternalPeers` est le FILET,
 *   armé par le gestionnaire des tâches de fond : sans lui, un index oublié
 *   garderait les numéros sans fin.
 *
 * Ce module ne journalise rien : une erreur de base peut recopier un numéro.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  EXTERNAL_PEER_HANDLE_RETENTION_DAYS,
  EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS,
} from '@meeshy/shared/types/external-conversation';

export const EXTERNAL_PEER_RETENTION_ENV = 'EXTERNAL_PEER_HANDLE_RETENTION_DAYS' as const;

const DAY_MS = 24 * 60 * 60 * 1000;

const WHOLE_DAYS = /^[0-9]+$/;

/** La durée de conservation configurée, en jours entiers, jamais nulle ni au-delà de la borne dure. */
export function externalPeerRetentionDays(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env[EXTERNAL_PEER_RETENTION_ENV]?.trim() ?? '';
  if (!WHOLE_DAYS.test(raw)) return EXTERNAL_PEER_HANDLE_RETENTION_DAYS;
  const days = Number(raw);
  if (days < 1) return EXTERNAL_PEER_HANDLE_RETENTION_DAYS;
  return Math.min(days, EXTERNAL_PEER_HANDLE_RETENTION_MAX_DAYS);
}

/** L'échéance de conservation d'une adresse ouverte (ou rouverte) à `at`. */
export function retentionDeadline(at: Date, days: number): Date {
  return new Date(at.getTime() + days * DAY_MS);
}

/** Efface les adresses dont l'échéance est passée ; rend leur nombre. */
export async function purgeExpiredExternalPeers(
  prisma: Pick<PrismaClient, 'externalConversationPeer'>,
  now: Date,
): Promise<number> {
  const { count } = await prisma.externalConversationPeer.deleteMany({ where: { purgeAfter: { lte: now } } });
  return count;
}
