import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { registerParticipantReadRoutes } from './participants-reads';
import { registerParticipantWriteRoutes } from './participants-writes';
import { registerParticipantRemovalRoute } from './participant-removal';
import { registerParticipantRoleRoute } from './participant-role';
import { registerLinkAdmissionRoutes } from './link-admission';

/**
 * Enregistre les routes de gestion des participants
 */
export function registerParticipantsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  // Les deux GET (listing + fiche) et le PATCH/POST vivent désormais CHACUN
  // dans son fichier — `participants-reads.ts` et `participants-writes.ts`
  // (#4284, 2026-08-30) — pour la même raison que les trois extractions
  // ci-dessous : ce module pesait 1408 lignes, au-dessus du budget de
  // 800-1100. Pur déplacement : mêmes routes, même ordre d'enregistrement.
  registerParticipantReadRoutes(fastify, prisma, optionalAuth);
  registerParticipantWriteRoutes(fastify, prisma, requiredAuth);

  // Retirer quelqu'un, et changer son rang, vivent désormais CHACUN dans son
  // fichier — `participant-removal.ts` et `participant-role.ts`. Ce module en
  // pesait 1830, très au-dessus du budget de 800-1100, et les deux gardes que
  // l'issue #4176 leur ajoute (comparaison de rang, résolution de clé partagée)
  // devaient être ÉCRITES : la directive dit qu'on extrait avant d'ajouter.
  //
  // Ils s'enregistrent sur la MÊME instance Fastify, depuis ce point d'entrée
  // unique : `route-registration.ts` n'a rien à savoir de la découpe, et
  // l'ordre de déclaration des routes est inchangé.
  registerParticipantRemovalRoute(fastify, prisma, requiredAuth);
  registerParticipantRoleRoute(fastify, prisma, requiredAuth);

  // `POST /links/:key/members`, `PATCH|DELETE /guest-sessions/me` — porte
  // d'admission UNIQUE d'un lien de partage (#4167). Même raison de
  // découpage que les deux lignes ci-dessus : ce module est déjà hors budget
  // (1386 lignes), on extrait avant d'ajouter.
  registerLinkAdmissionRoutes(fastify, prisma, optionalAuth, requiredAuth);
}
