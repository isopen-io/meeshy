/**
 * **LES ROOMS PERSONNELLES QU'UNE DIFFUSION DOIT TAIRE** (#20236).
 *
 * #20216 a fermé les diffusions qui portent le CONTENU d'un commentaire : un
 * compte qu'un blocage sépare du commentateur ne les reçoit plus. Restaient
 * quatre événements qui ne portent aucun contenu et qui disent pourtant
 * quelque chose — `comment:liked`, `comment:unliked`,
 * `comment:reaction-added`, `comment:reaction-removed` annoncent une ACTIVITÉ :
 * « le commentaire d'untel reçoit des cœurs », « untel vient de réagir ». Ils
 * partaient vers `ROOMS.post(postId)` sans exclusion.
 *
 * ─── DEUX SUJETS, PAS UN ─────────────────────────────────────────────────
 *
 * Une diffusion de contenu n'a qu'un sujet : celui qui a ÉCRIT. Une diffusion
 * d'activité en a DEUX, et taire un seul des deux ne tait rien — l'ACTEUR (qui
 * like, qui réagit) et l'AUTEUR du commentaire sont tous deux nommés par
 * l'événement, le premier dans la charge (`userId`), le second parce que c'est
 * SON commentaire dont le compteur bouge.
 *
 * ─── `keep` : SEUL L'ACTEUR S'EXEMPTE ────────────────────────────────────
 *
 * Un sujet ne s'exclut pas de son PROPRE événement — mais ce privilège est
 * celui de l'ÉMETTEUR, pas de « tout sujet ». Exempter les deux rouvrait
 * exactement la fuite que ce module ferme, et sur un chemin VIVANT : **retirer
 * sa réaction est permis même après un blocage** (décision écrite,
 * `separatedCommentAuthors.ts`), donc `DELETE …/like` et
 * `comment:reaction-remove` n'ont PAS la porte `commentAuthorSeparatedFrom`.
 * A, que B a bloqué, y retire sa réaction au commentaire de B — et B se voyait
 * annoncer l'activité de A. `keep` nomme donc l'acteur, et lui seul (audit
 * adversarial du lot).
 *
 * ─── UNE LECTURE POUR N SUJETS ───────────────────────────────────────────
 *
 * `getBlockRelatedUserIds` répond pour UN sujet en deux lectures ; l'appeler
 * par sujet les multiplie. Ici les deux sens se lisent pour TOUS les sujets à
 * la fois (`hasSome` d'un côté, `id: { in }` de l'autre) : **deux lectures,
 * quel que soit le nombre de sujets**.
 *
 * ─── LE CACHE EST PARTAGÉ, ET IL S'INVALIDE ──────────────────────────────
 *
 * Le même couple de sujets revient : la traduction d'un commentaire diffuse
 * une fois PAR LANGUE CIBLE, chaque résultat arrivant séparément du pipeline —
 * il n'y a aucune boucle où passer le résultat. D'où un cache, clé par TUPLE
 * de sujets trié, PARTAGÉ par tous les résolveurs du processus.
 *
 * **Un TTL seul ne suffisait pas, et c'est mesuré** : ce cache sert aussi les
 * sept diffusions de CONTENU (`commentEmitter`), donc une fenêtre d'expiration
 * rouvrait #20216 pendant toute sa durée — le TEXTE et les MÉDIAS d'un
 * commentaire livrés à qui vient de bloquer. La fraîcheur ne tient donc pas au
 * TTL mais à l'INVALIDATION : `blockedUserIds` n'a que DEUX écrivains dans le
 * dépôt (`routes/directory/blocks.ts`, la pose et le retrait, mesuré), et tous
 * deux appellent {@link invalidateSeparationAround}. Le TTL reste comme second
 * filet, jamais comme garantie.
 *
 * **Ce cache sert une AUDIENCE, jamais une AUTORISATION.** La décision de
 * laisser quelqu'un commenter, traduire, liker ou réagir se lit toujours à
 * frais neufs (`commentAuthorSeparatedFrom` → `isBlockedWithAny`).
 *
 * ─── FERMÉ ───────────────────────────────────────────────────────────────
 *
 * Une lecture qui échoue rend `null`, et l'appelant N'ÉMET RIEN — sur AUCUNE
 * de ses adresses : on ne diffuse pas une activité sans savoir à qui la taire.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'separatedRooms' });

/** Second filet derrière l'invalidation, jamais la garantie de fraîcheur. */
export const DEFAULT_TTL_MS = 5_000;

/** Un cache qui grandit avec le trafic est une fuite : au plafond, il ÉVINCE. */
const MAX_ENTRIES = 512;

type Entry = { readonly expiresAt: number; readonly subjects: readonly string[]; readonly ids: readonly string[] };

/** PARTAGÉ par tout le processus : une seule chose à invalider quand un blocage bouge. */
const cache = new Map<string, Entry>();

/** Ce que la production a à dire de son propre remplissage — lu par {@link separationCacheStats}. */
let evictions = 0;
let lastPressureLogAt = 0;

/** Une entrée par seconde de pression, pas une par éviction : au plafond, elles se comptent par rafales. */
const PRESSURE_LOG_INTERVAL_MS = 60_000;

/**
 * **AU PLAFOND, ON ÉVINCE — JAMAIS UN `clear()`** (#20415, constat 2).
 *
 * Ce cache était vidé EN ENTIER à la 512e entrée : les 511 autres partaient
 * avec elle, dont les clés STABLES des sept diffusions de CONTENU pour
 * lesquelles il a été écrit (#20216). Un seul appelant à clés volatiles
 * suffisait à l'éviscérer en boucle — #20337 a retiré celui qu'on connaissait
 * (`cached: false`), mais le mécanisme restait, et le prochain n'aurait eu
 * aucun site où rougir.
 *
 * ─── L'ORDRE D'ÉVICTION : LES PÉRIMÉES, PUIS LES PLUS ANCIENNES ───────────
 *
 * 1. Les entrées **périmées** d'abord : elles ne serviront plus personne, donc
 *    les retirer ne coûte rien à personne. Un balayage complet ne se paie qu'AU
 *    plafond, jamais sur le chemin de lecture.
 * 2. Puis les plus **ANCIENNEMENT ÉCRITES**, dans l'ordre d'insertion que `Map`
 *    garantit.
 *
 * **Et ce n'est pas une LRU, délibérément** : un hit ne PROLONGE pas l'entrée
 * (ce serait une fenêtre d'expiration glissante, donc #20216 rouvert tant qu'un
 * couple reste chaud). Toutes les entrées portant le même TTL, l'ordre
 * d'insertion EST l'ordre d'expiration : la plus anciennement écrite est celle
 * dont il reste le moins de vie, donc celle dont l'éviction perd le moins — ce
 * qu'une LRU par récence ne garantit pas, et qui coûterait un `delete`+`set` sur
 * le chemin de lecture.
 */
const evictForInsert = (at: number): void => {
  if (cache.size < MAX_ENTRIES) return;
  for (const [key, entry] of cache) if (entry.expiresAt <= at) cache.delete(key);
  while (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done === true) return;
    cache.delete(oldest.value);
    evictions += 1;
  }
  if (evictions > 0 && at - lastPressureLogAt >= PRESSURE_LOG_INTERVAL_MS) {
    lastPressureLogAt = at;
    logger.warn('diffusion — le cache des séparations est au plafond, éviction de la plus ancienne', {
      size: cache.size,
      max: MAX_ENTRIES,
      evictions,
    });
  }
};

/**
 * Le remplissage, tel que la production peut le dire — `evictions` à zéro veut
 * dire que le plafond n'a jamais été atteint depuis le démarrage, ce qu'aucune
 * lecture de `size` instantanée ne prouve.
 */
export function separationCacheStats(): { readonly size: number; readonly max: number; readonly evictions: number } {
  return { size: cache.size, max: MAX_ENTRIES, evictions };
}

export type SeparatedRoomsResolver = {
  /**
   * Les rooms `user:<id>` à EXCLURE d'une diffusion qui nomme ces sujets, ou
   * `null` quand la séparation n'a pas pu être lue — l'appelant se tait alors
   * sur TOUTES ses adresses. Un tableau VIDE veut dire « personne à taire »,
   * ce qui n'est pas `null`.
   *
   * `keep` : l'ACTEUR, le seul sujet qui ne s'exclut pas de son propre
   * événement. Absent, aucun sujet n'est exempté.
   */
  roomsAround(
    subjects: readonly (string | null | undefined)[],
    options?: { readonly keep?: string | null; readonly cached?: boolean },
  ): Promise<readonly string[] | null>;
};

const normalize = (subjects: readonly (string | null | undefined)[]): string[] =>
  [...new Set(subjects.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();

/**
 * Le blocage entre ces comptes vient de changer : toute réponse qui les nomme
 * est périmée. Appelée par les DEUX écrivains de `blockedUserIds`.
 */
export function invalidateSeparationAround(userIds: readonly (string | null | undefined)[]): void {
  const touched = new Set(normalize(userIds));
  if (touched.size === 0) return;
  for (const [key, entry] of cache) {
    if (entry.subjects.some((id) => touched.has(id))) cache.delete(key);
  }
}

/** Les témoins repartent d'un cache vide — la production, elle, n'a jamais à le vider. */
export function resetSeparationCacheForTests(): void {
  cache.clear();
  evictions = 0;
  lastPressureLogAt = 0;
}

export function createSeparatedRoomsResolver(deps: {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly ttlMs?: number;
  readonly now?: () => number;
}): SeparatedRoomsResolver {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? Date.now;

  /** Les DEUX sens, pour TOUS les sujets, en deux lectures — jamais deux par sujet. */
  const read = async (subjects: string[]): Promise<readonly string[]> => {
    const [blockers, rows] = await Promise.all([
      deps.prisma.user.findMany({ where: { blockedUserIds: { hasSome: subjects } }, select: { id: true } }),
      deps.prisma.user.findMany({ where: { id: { in: subjects } }, select: { blockedUserIds: true } }),
    ]);
    const related = new Set<string>();
    for (const row of blockers) related.add(row.id);
    for (const row of rows) for (const id of (row.blockedUserIds ?? []) as string[]) related.add(id);
    return [...related];
  };

  return {
    async roomsAround(subjects, options) {
      const ids = normalize(subjects);
      if (ids.length === 0) return [];
      const key = ids.join('\u0000');
      const at = now();
      const served = (related: readonly string[]): readonly string[] =>
        related.filter((id) => id !== options?.keep).map((id) => ROOMS.user(id));
      /* `cached: false` — un ensemble de sujets qui CHANGE à chaque événement a
         des clés à usage unique : le cacher ne rend jamais un hit, et il pousse
         les entrées des appelants STABLES vers la sortie, dont les sept
         diffusions de CONTENU pour lesquelles ce cache a été écrit (#20337,
         audit adversarial). Mesuré : trois réactions sur le même commentaire
         rendaient six lectures et aucun hit. La pression coûte désormais UNE
         entrée par insertion et non les 512 (#20415) — raison d'évincer plutôt
         que de vider, jamais raison de revenir sur ce `cached: false`. */
      const useCache = options?.cached !== false;
      if (useCache) {
        const cached = cache.get(key);
        if (cached !== undefined && cached.expiresAt > at) return served(cached.ids);
      }
      try {
        const related = await read(ids);
        if (useCache) {
          evictForInsert(at);
          cache.set(key, { expiresAt: at + ttlMs, subjects: ids, ids: related });
        }
        return served(related);
      } catch (error) {
        logger.error('diffusion — lecture des blocages impossible, émission abandonnée', { subjects: ids.length, error });
        return null;
      }
    },
  };
}
