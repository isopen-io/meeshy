/**
 * `GET /api/v1/sync`, tel que `services/gateway/src/routes/sync/index.ts:194`
 * le sert — et pas un second moteur (conception § 2, § 5.1).
 *
 * Ce que la route ATTEND (`syncQuerySchema`, `:74-84`) : `since` (ISO 8601 avec
 * décalage), `collections` (liste séparée par des virgules), `seq?`, `limit?`,
 * `scope?` (l'ObjectId d'UNE conversation), `cursor?`. Elle exige une créance —
 * `requiredAuth` avec `allowAnonymous: true` (`:157-161`) : la session d'un
 * invité y vaut autant que le jeton d'un membre.
 *
 * Ce qu'elle REND (`syncResponseSchema`, `:130-155`) : `checkpoint` (le
 * watermark à renvoyer en `since` au tour suivant), `checkpointSeq`,
 * `collections.messages.{added, modified, deleted, truncated, nextCursor}`,
 * `hasMore`, `nextCursor`, `hasGap` et `gapAction`. Le checkpoint n'AVANCE que
 * quand la fenêtre est couverte (`:315-321`) — un client qui le renverrait tel
 * quel sur une réponse tronquée relirait, jamais ne sauterait.
 *
 * `hasGap` N'EXISTE QUE SI LE CLIENT ANNONCE `seq` (`:279` : `seq !== undefined
 * && seq < checkpointSeq - GAP_THRESHOLD`). Le `seq` d'un lecteur est le
 * dernier `_seq` qu'il a vu — le `checkpointSeq` du delta précédent, ou le
 * `_seq` qu'un événement porté par `emitWithSeq` lui a apporté. Un client qui ne
 * le renvoie pas ne peut JAMAIS se voir signaler un trou ; c'est pourquoi ce
 * module le RETIENT et le RENVOIE. Et pour une session INVITÉE, `checkpointSeq`
 * vaut toujours 0 (`:276-278` : « `UserEventSeq` est INDEXÉE par `User.id`, et
 * un `Participant.id` n'y désigne rien ») : la passerelle ne sait pas mesurer de
 * trou pour un invité, et aucun bouchon fidèle n'en fabriquera un.
 *
 * Ce module ne fait QUE composer l'adresse et lire la charge : il ne sait ni
 * QUAND appeler (le cycle de vie le dit) ni QUOI peindre (le fil le sait).
 */

export type Delta = {
  readonly checkpoint: string;
  /** Le curseur GLOBAL du compte, à renvoyer en `seq` au tour suivant — `null` quand la passerelle ne le sert pas. */
  readonly checkpointSeq: number | null;
  /** Les messages ajoutés ET modifiés depuis `since`, dans l'ordre servi. */
  readonly messages: readonly Readonly<Record<string, unknown>>[];
  readonly supprimes: readonly string[];
  readonly hasGap: boolean;
  readonly hasMore: boolean;
};

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const objets = (valeur: unknown): readonly Readonly<Record<string, unknown>>[] =>
  (Array.isArray(valeur) ? valeur : [])
    .map((entree) => objet(entree))
    .filter((entree): entree is Readonly<Record<string, unknown>> => entree !== null);

export const urlDeSync = ({
  base,
  depuis,
  scope,
  seq,
}: {
  readonly base: string;
  /** Le dernier `checkpoint` reçu, ou l'instant du dernier message peint au premier tour. */
  readonly depuis: string;
  readonly scope: string;
  readonly seq?: number;
}): string =>
  `${base}/api/v1/sync?since=${encodeURIComponent(depuis)}&collections=messages&scope=${encodeURIComponent(scope)}` +
  (seq === undefined ? '' : `&seq=${seq}`);

export const litLeDelta = (corps: unknown): Delta | null => {
  const enveloppe = objet(corps);
  const donnee = objet(enveloppe?.data);
  if (enveloppe?.success !== true || donnee === null) return null;

  const checkpoint = typeof donnee.checkpoint === 'string' ? donnee.checkpoint : null;
  if (checkpoint === null) return null;

  const messages = objet(objet(donnee.collections)?.messages);

  return {
    checkpoint,
    checkpointSeq: typeof donnee.checkpointSeq === 'number' && Number.isFinite(donnee.checkpointSeq) ? donnee.checkpointSeq : null,
    messages: [...objets(messages?.added), ...objets(messages?.modified)],
    supprimes: objets(messages?.deleted)
      .map((tombe) => tombe.id)
      .filter((id): id is string => typeof id === 'string'),
    hasGap: donnee.hasGap === true,
    hasMore: donnee.hasMore === true,
  };
};
