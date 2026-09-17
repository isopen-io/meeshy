import type { DataSource } from './config';
import { VIEWER_ID as FIXTURE_VIEWER_ID } from './fixtures-base';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE MON HUMEUR** (#6150) — `POST /api/v1/posts`, `type: 'STATUS'`.
 *
 * ## DEUX ADRESSES VOISINES, DEUX VERBES — et les confondre rend un 404
 *
 * La LECTURE des humeurs est `GET /api/v1/social/posts?scope=statuses`
 * (`loadStatusMoods`, `stories.ts`). L'ÉCRITURE est `POST /api/v1/posts` :
 * `postRoutes` est monté sous `API_PREFIX` seul
 * (`services/gateway/src/route-registration.ts:288`) et `core.ts:370` y
 * déclare `fastify.post('/posts', …)`. Le préfixe `social/` n'appartient
 * qu'aux routes de FIL. Contrat relu avant d'écrire, comme le demande la règle
 * du dépôt sur les formes de requête.
 *
 * ## CE QUE LE SERVEUR ACCEPTE, ET CE QU'IL EXIGE
 *
 * `CreatePostSchema` (`routes/posts/types.ts:235-256`) : `type` dans
 * `['POST','REEL','STORY','STATUS']`, `moodEmoji: z.string().max(10)`. Et
 * `hasAnyContent` (`:342-349`) exige qu'au moins un champ porte quelque chose
 * — son commentaire nomme le défaut qu'il ferme : « `POST /posts
 * { type: 'STORY' }` creait un objet » vide. L'emoji suffit à le satisfaire ;
 * le mot est FACULTATIF, et un mot vide ne part pas — publier une chaîne vide
 * à côté de l'emoji ferait rendre au fil une ligne blanche.
 *
 * La route exige une session vérifiée (`requiredAuth`,
 * `requireEmailVerification`) et consomme le budget d'écriture partagé
 * (`sharedWriteRateLimit`) : un refus est donc un verdict à MONTRER, jamais à
 * avaler — c'est ce que l'écran fait de `ApiResult`.
 */
export type StatusDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
};

/** La borne du serveur, recopiée là où la SAISIE se borne — un champ plus
 * permissif que la route fabrique un refus que l'utilisateur ne comprend pas
 * (`moodEmoji: z.string().max(10)`). */
export const MOOD_EMOJI_MAX_LENGTH = 10;

/** Le mot qui accompagne l'humeur. Le serveur en accepte 5000 (`content`) ;
 * une humeur n'est pas un post — la borne de SAISIE est celle du produit, plus
 * étroite que celle de la route, et c'est le sens de l'écart. */
export const MOOD_NOTE_MAX_LENGTH = 80;

export type PublishedStatus = { readonly id: string };

/**
 * **LES HUMEURS POSÉES EN FIXTURES** — le pendant de `storyViewedStore` pour
 * les statuts, et il existe pour la MÊME raison : sans lui, poser une humeur
 * hors réseau n'a aucun effet OBSERVABLE, parce que `loadStatusMoods` reservit
 * le corpus littéral d'origine à la première invalidation. L'humeur
 * apparaissait puis DISPARAISSAIT — pire qu'un écran mort, et aucun gate
 * navigateur ne pouvait prouver le parcours complet.
 *
 * Il ne vit que le temps de l'onglet (jamais `localStorage`) : les fixtures
 * sont un corpus de démonstration, pas un serveur.
 */
const posted: { readonly moodEmoji: string; readonly authorId: string }[] = [];

export function recordFixtureMood(entry: { readonly moodEmoji: string; readonly authorId: string }): void {
  posted.unshift(entry);
}

/** Les humeurs posées dans cet onglet, la plus récente d'abord — même ordre que
 * le corpus servi (`createdAt desc`), pour que la loi de lecture du rail
 * (`selfRailEntry`, première ligne de l'auteur) rende le même verdict ici. */
export function fixtureMoods(): readonly { readonly moodEmoji: string; readonly authorId: string }[] {
  return posted;
}

export async function publishStatusMood(
  params: StatusDeps & {
    readonly moodEmoji: string;
    readonly note?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<PublishedStatus>> {
  const note = params.note?.trim() ?? '';
  const body = {
    type: 'STATUS' as const,
    moodEmoji: params.moodEmoji,
    ...(note === '' ? {} : { content: note }),
  };

  if (__FIXTURES__ && params.source === 'fixtures') {
    recordFixtureMood({ moodEmoji: params.moodEmoji, authorId: FIXTURE_VIEWER_ID });
    return { ok: true, data: { id: `st-local-${params.moodEmoji}` } };
  }

  return params.transport.request<PublishedStatus>({
    method: 'POST',
    path: '/api/v1/posts',
    body,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
