/**
 * **LES ROOMS PERSONNELLES QU'UNE DIFFUSION DOIT TAIRE** (#20236) — et, depuis
 * #20711, **DE QUOI chaque lecteur est séparé** (`pairsAround`), parce qu'une
 * charge peut porter le contenu d'un tiers sans que le lecteur perde le reste.
 * Les deux questions partagent LA MÊME lecture et LE MÊME cache.
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

/** Un cache qui grandit avec le trafic est une fuite : au plafond, il repart à vide. */
const MAX_ENTRIES = 512;

/**
 * `pairs` porte la relation PAR LECTEUR — « de quels sujets ce compte est-il
 * séparé ? ». `ids` (les lecteurs à taire, tous sujets confondus) s'en DÉRIVE
 * au lieu d'être stocké à côté : deux champs qui disent la même chose sous deux
 * formes divergent, et celui qui divergerait ici est une garde.
 */
type Entry = {
  readonly expiresAt: number;
  readonly subjects: readonly string[];
  readonly pairs: ReadonlyMap<string, readonly string[]>;
};

/** PARTAGÉ par tout le processus : une seule chose à invalider quand un blocage bouge. */
const cache = new Map<string, Entry>();

/** Par lecteur, les sujets dont un blocage le sépare — dans un sens ou l'autre. */
export type SeparationPairs = ReadonlyMap<string, readonly string[]>;

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

  /**
   * **LA MÊME LECTURE, RENDUE PAR LECTEUR** (#20711) — « de quels sujets ce
   * compte-là est-il séparé ? », et non « qui faut-il taire ? ».
   *
   * `roomsAround` suffit quand la réponse est une EXCLUSION : le lecteur séparé
   * ne reçoit rien. Elle ne suffit pas quand le sujet n'est qu'un COMPAGNON de
   * la charge — la source republiée, l'aperçu des commentaires : le lecteur a
   * droit au post, et seul le compagnon se tait. Il faut alors savoir LEQUEL,
   * sans quoi un lecteur séparé d'UN commentateur perdrait l'aperçu entier.
   *
   * Même coût, et c'est le point : **deux lectures, quel que soit le nombre de
   * sujets** — le sens « qui a bloqué un sujet » projette en plus la colonne
   * `blockedUserIds` qu'il filtrait déjà, et le sens inverse la projetait déjà.
   *
   * `null` ⇒ la séparation n'a pas pu être lue, et l'appelant se tait (voir
   * § FERMÉ). Une carte VIDE veut dire « personne n'est séparé », ce qui n'est
   * pas `null`.
   */
  pairsAround(
    subjects: readonly (string | null | undefined)[],
    options?: { readonly cached?: boolean },
  ): Promise<SeparationPairs | null>;
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
}

export function createSeparatedRoomsResolver(deps: {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly ttlMs?: number;
  readonly now?: () => number;
}): SeparatedRoomsResolver {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? Date.now;

  /**
   * Les DEUX sens, pour TOUS les sujets, en deux lectures — jamais deux par
   * sujet. Rendu PAR LECTEUR : `roomsAround` n'a plus qu'à en prendre les clés,
   * et `pairsAround` la carte entière. Une seule lecture pour deux questions,
   * donc une seule chose à garder juste.
   */
  const read = async (subjects: string[]): Promise<SeparationPairs> => {
    const wanted = new Set(subjects);
    const [blockers, rows] = await Promise.all([
      deps.prisma.user.findMany({
        where: { blockedUserIds: { hasSome: subjects } },
        select: { id: true, blockedUserIds: true },
      }),
      deps.prisma.user.findMany({ where: { id: { in: subjects } }, select: { id: true, blockedUserIds: true } }),
    ]);
    const pairs = new Map<string, Set<string>>();
    const link = (reader: string, subject: string) => {
      const held = pairs.get(reader) ?? new Set<string>();
      held.add(subject);
      pairs.set(reader, held);
    };
    /* Sens « ce compte a bloqué un sujet » : les sujets qu'il a bloqués sont
       l'INTERSECTION de sa liste avec ceux qu'on interroge — sa liste entière
       nommerait des comptes dont cette diffusion ne parle pas.

       **Le `where` PROUVE déjà la relation ; la colonne n'en donne que le
       détail.** `hasSome` garantit que cette ligne a bloqué AU MOINS un sujet,
       quoi que la projection rende. Une intersection vide est donc le signe
       d'une colonne manquante, jamais d'une absence de blocage : on retombe
       alors sur TOUS les sujets interrogés — fail-closed, et `roomsAround`
       (qui ne lit que les CLÉS) rend la même réponse dans les deux cas. */
    for (const row of blockers) {
      const held = ((row.blockedUserIds ?? []) as string[]).filter((id) => wanted.has(id));
      for (const id of held.length > 0 ? held : subjects) link(row.id, id);
    }
    /* Sens « un sujet a bloqué ce compte » : le sujet est la LIGNE, le lecteur
       est dans sa liste. */
    for (const row of rows) {
      for (const id of (row.blockedUserIds ?? []) as string[]) link(id, row.id);
    }
    return new Map([...pairs].map(([reader, held]) => [reader, [...held]]));
  };

  /**
   * La lecture, le cache et sa fermeture — partagés par les DEUX questions.
   * `cached: false` : un ensemble de sujets qui CHANGE à chaque événement a des
   * clés à usage unique : le cacher ne rend jamais un hit, et au plafond son
   * `cache.clear()` évince les entrées des appelants STABLES, dont les sept
   * diffusions de CONTENU pour lesquelles ce cache a été écrit (#20337, audit
   * adversarial). Mesuré : trois réactions sur le même commentaire rendaient
   * six lectures et aucun hit.
   */
  const resolve = async (ids: string[], useCache: boolean): Promise<SeparationPairs | null> => {
    const key = ids.join('\u0000');
    const at = now();
    if (useCache) {
      const cached = cache.get(key);
      if (cached !== undefined && cached.expiresAt > at) return cached.pairs;
    }
    try {
      const pairs = await read(ids);
      if (useCache) {
        if (cache.size >= MAX_ENTRIES) cache.clear();
        cache.set(key, { expiresAt: at + ttlMs, subjects: ids, pairs });
      }
      return pairs;
    } catch (error) {
      logger.error('diffusion — lecture des blocages impossible, émission abandonnée', { subjects: ids.length, error });
      return null;
    }
  };

  return {
    async roomsAround(subjects, options) {
      const ids = normalize(subjects);
      if (ids.length === 0) return [];
      const pairs = await resolve(ids, options?.cached !== false);
      if (pairs === null) return null;
      return [...pairs.keys()].filter((id) => id !== options?.keep).map((id) => ROOMS.user(id));
    },

    async pairsAround(subjects, options) {
      const ids = normalize(subjects);
      if (ids.length === 0) return new Map();
      return resolve(ids, options?.cached !== false);
    },
  };
}
