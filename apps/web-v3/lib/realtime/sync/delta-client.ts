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
  /**
   * Les CONVERSATIONS ajoutées et modifiées — la collection que `/chats`
   * demande (`routes/sync/conversations.ts`, `syncConversationSelect`). Elle
   * porte `lastMessageAt`, `title` et `memberCount`, jamais le contenu du
   * dernier message ni le compte de non-lus : la liste s'en sert pour le RANG,
   * et rien de plus. Vide pour un appel qui ne l'a pas demandée.
   */
  readonly conversations: readonly Readonly<Record<string, unknown>>[];
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
  collections = ['messages'],
  fields,
}: {
  readonly base: string;
  /** Le dernier `checkpoint` reçu, ou l'instant du dernier message peint au premier tour. */
  readonly depuis: string;
  /**
   * L'ObjectId d'UNE conversation (`syncQuerySchema.scope`, `routes/sync/
   * index.ts:85`) — ABSENT pour la LISTE, qui demande tout ce que le lecteur
   * voit. Le paramètre est facultatif côté passerelle ; l'exiger ici aurait
   * obligé `/chats` à en inventer un.
   */
  readonly scope?: string;
  readonly seq?: number;
  /** `messages` pour le fil, `conversations` pour la liste — le vocabulaire de `SYNC_FIELD_VOCABULARY`. */
  readonly collections?: readonly string[];
  /**
   * Les champs demandés, forme `collection.champ` (#4173, #5088) — la REQUÊTE
   * Prisma rétrécit côté passerelle, pas seulement la réponse. Absent ⇒ le
   * défaut du serveur, la ligne entière : nommer ses champs est le geste de
   * l'appelant qui SAIT ce qu'il lit.
   */
  readonly fields?: readonly string[];
}): string =>
  `${base}/api/v1/sync?since=${encodeURIComponent(depuis)}&collections=${encodeURIComponent(collections.join(','))}` +
  (scope === undefined ? '' : `&scope=${encodeURIComponent(scope)}`) +
  (seq === undefined ? '' : `&seq=${seq}`) +
  (fields === undefined || fields.length === 0 ? '' : `&fields=${encodeURIComponent(fields.join(','))}`);

/**
 * CE QU'UN APPEL DE `/sync` REND, en TROIS formes — parce que trois choses
 * différentes doivent arriver ensuite.
 *
 * `inchange` est le **304** : la fenêtre n'a pas bougé, le corps est VIDE, et
 * l'appelant ne doit RIEN repeindre — ni avancer son checkpoint, ni toucher son
 * curseur. C'était jusqu'ici un `!reponse.ok` fondu dans les pannes réseau, donc
 * indistinguable d'un silence : aucun témoin ne pouvait dire lequel des deux
 * venait d'arriver, et le critère de fin qui demande « 304 quasi-vide au retour
 * de focus » n'avait rien à interroger.
 *
 * `muet` couvre le reste — réseau tombé, refus, corps illisible : l'écran garde
 * ce qu'il a, et le prochain retour redemandera.
 */
export type IssueDeSync =
  | { readonly genre: 'inchange' }
  | { readonly genre: 'muet' }
  | { readonly genre: 'delta'; readonly delta: Delta; readonly validateur: string | null };

/**
 * L'APPEL LUI-MÊME, UNE SEULE FOIS POUR LES DEUX SURFACES (§ 7).
 *
 * Le fil et la liste demandaient chacun leur `/sync`, et les deux boucles ont
 * divergé exactement là où ça se paie : la liste n'annonçait PAS son `seq`,
 * donc la passerelle ne pouvait JAMAIS lui signaler de trou —
 * `hasGap = seq !== undefined && seq < checkpointSeq - GAP_THRESHOLD`
 * (`routes/sync/index.ts:360`) — et le bandeau « des messages manquent » de
 * `/chats` était une branche MORTE. Une règle de protocole tenue par un seul
 * des deux appelants n'est pas tenue.
 *
 * Le `if-none-match` n'est posé que si l'appelant DÉTIENT un validateur. Il n'en
 * détient un aujourd'hui que hors navigateur : la passerelle n'expose pas
 * `ETag` par CORS (`server.ts:404-410`, sans `exposedHeaders`), donc
 * `reponse.headers.get('etag')` rend `null` depuis une autre origine. Le
 * mécanisme est JUSTE et il jouera le jour où l'en-tête sera exposé (issue
 * gateway compagnon) ; il est mesuré ici, pas supposé.
 */
export const demandeLeDelta = async ({
  base,
  depuis,
  scope,
  seq,
  collections,
  fields,
  validateur,
  entetes,
  recuperer = fetch,
}: {
  readonly base: string;
  readonly depuis: string;
  readonly scope?: string;
  /** Le dernier curseur GLOBAL connu — omis tant que le lecteur n'en a jamais vu. */
  readonly seq?: number | null;
  readonly collections?: readonly string[];
  /** Voir `urlDeSync` — les champs que l'appelant lit, et donc les seuls qu'il demande. */
  readonly fields?: readonly string[];
  /** Le dernier `ETag` LU — `null` quand il n'a pas pu l'être. */
  readonly validateur?: string | null;
  /** La créance, telle que la surface la porte (`Bearer`, ou la session de l'invité). */
  readonly entetes: Readonly<Record<string, string>>;
  readonly recuperer?: (url: string, options: RequestInit) => Promise<Response>;
}): Promise<IssueDeSync> => {
  const url = urlDeSync({
    base,
    depuis,
    ...(scope === undefined ? {} : { scope }),
    ...(seq === undefined || seq === null ? {} : { seq }),
    ...(collections === undefined ? {} : { collections }),
    ...(fields === undefined ? {} : { fields }),
  });
  const reponse = await recuperer(url, {
    headers: {
      accept: 'application/json',
      ...entetes,
      ...(validateur === undefined || validateur === null ? {} : { 'if-none-match': validateur }),
    },
    cache: 'no-store',
  }).catch(() => null);

  if (reponse === null) return { genre: 'muet' };
  if (reponse.status === 304) return { genre: 'inchange' };
  if (!reponse.ok) return { genre: 'muet' };

  const delta = litLeDelta(await reponse.json().catch(() => null));
  if (delta === null) return { genre: 'muet' };
  return { genre: 'delta', delta, validateur: reponse.headers.get('etag') };
};

export const litLeDelta = (corps: unknown): Delta | null => {
  const enveloppe = objet(corps);
  const donnee = objet(enveloppe?.data);
  if (enveloppe?.success !== true || donnee === null) return null;

  const checkpoint = typeof donnee.checkpoint === 'string' ? donnee.checkpoint : null;
  if (checkpoint === null) return null;

  const collections = objet(donnee.collections);
  const messages = objet(collections?.messages);
  const conversations = objet(collections?.conversations);

  return {
    checkpoint,
    checkpointSeq: typeof donnee.checkpointSeq === 'number' && Number.isFinite(donnee.checkpointSeq) ? donnee.checkpointSeq : null,
    messages: [...objets(messages?.added), ...objets(messages?.modified)],
    conversations: [...objets(conversations?.added), ...objets(conversations?.modified)],
    supprimes: objets(messages?.deleted)
      .map((tombe) => tombe.id)
      .filter((id): id is string => typeof id === 'string'),
    hasGap: donnee.hasGap === true,
    hasMore: donnee.hasMore === true,
  };
};
