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
 * SON commentaire dont le compteur bouge. Le lecteur qui a bloqué l'un des
 * deux apprend son activité dès que l'autre est resté dans l'audience.
 *
 * ─── UNE LECTURE POUR N SUJETS, ET UN CACHE COURT ────────────────────────
 *
 * `getBlockRelatedUserIds` répond pour UN sujet en deux lectures ; l'appeler
 * par sujet les multiplie. Ici les deux sens se lisent pour TOUS les sujets à
 * la fois (`hasSome` d'un côté, `id: { in }` de l'autre) : **deux lectures,
 * quel que soit le nombre de sujets**.
 *
 * Et le même couple de sujets revient : la traduction d'un commentaire diffuse
 * une fois PAR LANGUE CIBLE, chaque résultat arrivant séparément du pipeline —
 * il n'y a aucune boucle où passer le résultat. D'où un cache de
 * `DEFAULT_TTL_MS` millisecondes, clé par TUPLE de sujets trié.
 *
 * **Ce cache sert une AUDIENCE, jamais une AUTORISATION.** La décision de
 * laisser quelqu'un commenter, traduire, liker ou réagir se lit toujours à
 * frais neufs (`commentAuthorSeparatedFrom` → `isBlockedWithAny`) : un blocage
 * tout juste posé refuse l'action à l'instant même. Ce que la fenêtre peut
 * coûter est au pire UN événement d'activité livré à qui vient de bloquer,
 * pendant que la liste REST, elle, se tait déjà. L'inverse — relire les
 * blocages à chaque langue d'un même commentaire — est un coût certain pour
 * une fraîcheur que personne n'observe.
 *
 * ─── FERMÉ ───────────────────────────────────────────────────────────────
 *
 * Une lecture qui échoue rend `null`, et l'appelant N'ÉMET RIEN : on ne
 * diffuse pas une activité sans savoir à qui la taire. C'est la règle que
 * `commentEmitter` portait déjà pour le contenu.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS } from '@meeshy/shared/types/socketio-events';

import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'separatedRooms' });

/** Assez court pour qu'une fenêtre ne se remarque pas, assez long pour couvrir les langues d'un même commentaire. */
export const DEFAULT_TTL_MS = 5_000;

/** Un cache qui grandit avec le trafic est une fuite : au plafond, il repart à vide. */
const MAX_ENTRIES = 512;

type Entry = { readonly expiresAt: number; readonly ids: readonly string[] };

export type SeparatedRoomsResolver = {
  /**
   * Les rooms `user:<id>` à EXCLURE d'une diffusion qui nomme ces sujets, ou
   * `null` quand la séparation n'a pas pu être lue — l'appelant se tait alors.
   * Un tableau VIDE veut dire « personne à taire », ce qui n'est pas `null`.
   */
  roomsAround(subjects: readonly (string | null | undefined)[]): Promise<readonly string[] | null>;
};

const normalize = (subjects: readonly (string | null | undefined)[]): string[] =>
  [...new Set(subjects.filter((id): id is string => typeof id === 'string' && id.length > 0))].sort();

export function createSeparatedRoomsResolver(deps: {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly ttlMs?: number;
  readonly now?: () => number;
}): SeparatedRoomsResolver {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? Date.now;
  const cache = new Map<string, Entry>();

  /** Les DEUX sens, pour TOUS les sujets, en deux lectures — jamais deux par sujet. */
  const read = async (subjects: string[]): Promise<readonly string[]> => {
    const [blockers, rows] = await Promise.all([
      deps.prisma.user.findMany({ where: { blockedUserIds: { hasSome: subjects } }, select: { id: true } }),
      deps.prisma.user.findMany({ where: { id: { in: subjects } }, select: { blockedUserIds: true } }),
    ]);
    const related = new Set<string>();
    for (const row of blockers) related.add(row.id);
    for (const row of rows) for (const id of (row.blockedUserIds ?? []) as string[]) related.add(id);
    /* Un sujet ne s'exclut pas de son propre événement — défensif : la porte de
       l'action a déjà refusé le cas où les deux sujets se séparent, mais un
       blocage posé ENTRE la porte et la diffusion ne doit pas faire taire
       l'événement chez celui qui vient de l'émettre. */
    for (const subject of subjects) related.delete(subject);
    return [...related];
  };

  return {
    async roomsAround(subjects) {
      const ids = normalize(subjects);
      if (ids.length === 0) return [];
      const key = ids.join('\u0000');
      const at = now();
      const cached = cache.get(key);
      if (cached !== undefined && cached.expiresAt > at) return cached.ids.map((id) => ROOMS.user(id));
      try {
        const related = await read(ids);
        if (cache.size >= MAX_ENTRIES) cache.clear();
        cache.set(key, { expiresAt: at + ttlMs, ids: related });
        return related.map((id) => ROOMS.user(id));
      } catch (error) {
        logger.error('diffusion — lecture des blocages impossible, émission abandonnée', { subjects: ids.length, error });
        return null;
      }
    },
  };
}
