import type { ConversationsDeps } from './conversations';
import type { ApiResult } from './http';

/**
 * LE PORT DE LA RECHERCHE DE CONTACTS (#5652, bloc D) — `GET
 * /api/v1/directory/people?q=<≥2>&limit=20`
 * (`services/gateway/src/routes/directory/people.ts:88-105`,
 * `fastify.authenticate`), § 3.4 de la spécification.
 *
 * **POURQUOI `/directory/people` ET PAS `/users/search`** (revue #5652). La
 * seconde EXISTE, mais son propre doc-comment la déclare ALIAS en sursis :
 * « elle reste montée le temps que les douze sites iOS et les trois sites web
 * migrent, et jusqu'à extinction des versions installées »
 * (`routes/users/preferences.ts:454-468`). Écrire un client NEUF dessus, c'est
 * inscrire la v3.1 sur la liste des appelants qui retardent son retrait —
 * pour une route dont la réponse est strictement PLUS PAUVRE : son schéma ne
 * déclare PAS `avatar`, donc `fast-json-stringify` le RETIRE, et ce port le
 * déclarait sans jamais pouvoir le recevoir. La route cible le sert, et
 * pagine par CURSEUR au lieu d'un `offset` + `count()` complet.
 *
 * `q` sous deux caractères rend 400 (`minLength: 2`) — l'appelant ne
 * l'interroge pas sous ce seuil (`conversation-new.tsx`, `MIN_QUERY_LENGTH`) ;
 * ce port ne redouble pas la garde, il transmet ce qu'on lui donne.
 *
 * `?expand=presence` N'EST PAS demandé : la présence d'un inconnu ne part que
 * sur demande explicite et sous la loi de visibilité (amis acceptés,
 * `CLAUDE.md` § Visibilité de la présence) — un écran de création de
 * conversation n'en a aucun usage, et ne doit donc pas la réclamer.
 */

export type UserSearchResult = {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

const FIXTURE_RESULTS: readonly UserSearchResult[] = [
  { id: 'u-amina', username: 'amina.diallo', displayName: 'Amina Diallo' },
  { id: 'u-kwame', username: 'kwame.mensah', displayName: 'Kwame Mensah' },
];

export function searchUsers(deps: ConversationsDeps, query: string): Promise<ApiResult<readonly UserSearchResult[]>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const q = query.trim().toLowerCase();
    const data = q.length < 2 ? [] : FIXTURE_RESULTS.filter((u) => (u.displayName ?? u.username).toLowerCase().includes(q));
    return Promise.resolve({ ok: true, data });
  }
  return deps.transport.request<readonly UserSearchResult[]>({
    method: 'GET',
    path: `/api/v1/directory/people?q=${encodeURIComponent(query)}&limit=20`,
  });
}
