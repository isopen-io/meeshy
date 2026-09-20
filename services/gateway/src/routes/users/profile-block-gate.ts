import type { FastifyRequest } from 'fastify';

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { hasBlocked } from '../../utils/blocking';

type ProfileAuthContext =
  | { isAuthenticated?: boolean; registeredUser?: { id?: string } | null }
  | undefined;

/**
 * LE LECTEUR INSCRIT D'UNE ROUTE DE PROFIL — un site unique (#7184).
 *
 * La lecture était privée à `routes/directory/person.ts`, et le module voisin
 * `presence-gate.ts` en tient une AUTRE (`viewerFromAuthContext`, qui lit
 * `authContext.userId`, où l'anonyme vaut la chaîne `'anonymous'`). Deux
 * notions de « qui regarde » sur une même route est exactement l'écart par
 * lequel une garde se pose sur un viewer et une autre sur un second.
 *
 * Celle-ci est la STRICTE : un identifiant n'existe que si la requête est
 * authentifiée ET porte un compte inscrit. Un anonyme n'a bloqué personne et
 * n'est bloqué par personne — il ne coûte aucune requête.
 */
export function profileViewerId(request: FastifyRequest): string | undefined {
  const acteur = (request as FastifyRequest & { authContext?: ProfileAuthContext }).authContext;
  return acteur?.isAuthenticated ? acteur.registeredUser?.id : undefined;
}

/**
 * **LA CIBLE A-T-ELLE BLOQUÉ LE LECTEUR ?** — la moitié manquante du blocage
 * sur les routes de profil (#7184).
 *
 * ## La garde est ASYMÉTRIQUE, et c'est délibéré
 *
 * Elle ne reprend PAS `blockedIdsAroundViewer`
 * (`services/ContactDirectoryService.ts:194`), qui confond les deux directions
 * à dessein pour la recherche d'annuaire — « la symétrie n'est pas une
 * politesse, c'est la protection », y écrit-on, et c'est juste LÀ-BAS : laisser
 * quelqu'un que j'ai bloqué me retrouver dans une recherche serait un défaut.
 *
 * Ici les deux sens veulent des réponses CONTRAIRES :
 *
 * - **la cible m'a bloqué** ⇒ son profil ne m'est plus servi ;
 * - **je l'ai bloquée** ⇒ son profil m'est servi, et les deux clients le
 *   RÉDUISENT eux-mêmes (`ProfileBlockedCard`, `UserProfileSheet.swift:165-177`
 *   — identité, « Débloquer », ni publications ni statistiques). C'est de cette
 *   page qu'on débloque : la refuser enfermerait le lecteur dans son propre
 *   blocage, sans chemin de retour.
 *
 * Le second sens voyage déjà, par le champ `blockedByViewer` (#7125). Celui-ci
 * ne voyage pas : il REFUSE.
 *
 * ## Pourquoi elle ne peut pas vivre dans `relationAvec`
 *
 * `relationAvec` n'est appelé que sur `expand=relation` (`person.ts:307`). Une
 * garde posée là serait LEVABLE par l'appelant — il lui suffirait d'omettre le
 * paramètre. C'est mot pour mot le piège que le module voisin dénonce pour la
 * présence : « poser la question seulement sur `expand` ferait de l'omission du
 * paramètre une garde, c'est-à-dire une garde qu'un appelant peut lever ».
 *
 * D'où sa place : dans `servirProfilPublic`, juste après le chargement de la
 * ligne, donc sur les TROIS routes qui le partagent
 * (`/directory/people/:handle`, `/u/:username`, `/users/:id`) et quel que soit
 * l'`expand` demandé.
 *
 * ## Le sens de la panne
 *
 * `hasBlocked` fait une requête POSITIVE (`{ has: viewerId }`), servie par
 * `@@index([blockedUserIds])` : un champ ABSENT ne bloque personne, donc il ne
 * figure pas dans la réponse. Le piège MongoDB que `contactLookupScope`
 * documente longuement — un `NOT` qui inverse l'absence en refus, écartant les
 * 206 comptes sur 246 qui n'ont jamais écrit la colonne (#6452) — n'est pas
 * rencontré ici, et ne doit pas l'être : cette garde refuse un profil, donc une
 * erreur dans ce sens-là rendrait l'application inutilisable plutôt que
 * perméable.
 */
export async function targetHasBlockedViewer(
  prisma: PrismaClient,
  request: FastifyRequest,
  targetId: string
): Promise<boolean> {
  const viewerId = profileViewerId(request);
  if (!viewerId || viewerId === targetId) return false;
  return hasBlocked(prisma, targetId, viewerId);
}
