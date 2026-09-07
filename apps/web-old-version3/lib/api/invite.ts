import { cleDeLien, type CleDeLien } from './guest-session';
import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * LA PORTE DE L'INVITÉ — ce que `/chat/:lien` demande à la passerelle, et le
 * SEUL endroit à changer le jour où `/links/:key/members` remplace ses deux
 * adaptateurs historiques (conception § 5.1, § 12.3).
 *
 * Trois appels, trois routes RÉELLES, lues dans le code :
 *
 *   • l'APERÇU — `GET /api/v1/anonymous/link/:identifier`
 *     (`services/gateway/src/routes/anonymous.ts:442`, aucune authentification) :
 *     200 avec `linkId`, `name`, `description`, les quatre exigences du lien
 *     (`requireAccount`, `requireNickname`, `requireEmail`, `requireBirthday`,
 *     `:672-675`), `allowedLanguages`, la conversation et — depuis #4522 —
 *     les quatre droits que le lien OUVRE (`allowAnonymousMessages`,
 *     `allowAnonymousFiles`, `allowAnonymousImages`, `allowViewHistory`,
 *     `:691-694`) : ce que la modale de jonction peut annoncer par son
 *     VERDICT (#4830), et non plus seulement par son nom ; 404 quand le lien
 *     n'existe pas (`:592`, `:597`) ; 410 `LINK_INACTIVE` / `LINK_EXPIRED` /
 *     `LINK_MAX_USES` quand il est clos (`:603-613`). La charge sert l'identité
 *     COMPLÈTE du créateur (§ 5.1, ⚠️ fuite) : elle est PROJETÉE ici, avant
 *     d'entrer dans le HTML, et ne transporte rien de lui. `apercuServi` est
 *     l'UNIQUE lecteur de cette charge dans la v3 — la carte d'aperçu de
 *     `/l/:token` (`lib/api/links.ts`) en est une projection ;
 *   • la JONCTION — `POST /api/v1/links/:key/members`, la porte CANONIQUE
 *     (`routes/conversations/link-admission.ts:688`, `preValidation:
 *     [optionalAuth]` :738) : `nickname`, `email`, `birthday` (ISO date-time,
 *     `z.iso.datetime()` :578) et `language` sans créance pour un visiteur
 *     (201, `sessionToken` + `entry.rights`), `Authorization: Bearer` pour un
 *     membre (200/201, `entry.outcome` = `new` | `rejoin` | `already-member`).
 *     Les refus, tels que la porte les ÉMET — et aucun autre :
 *       400 — un champ que le lien exige manque (`performLinkJoin`,
 *             `:428-436`, `sendBadRequest(message)` : le code EST la phrase,
 *             `utils/response.ts:118-124`) ou un corps que Zod refuse
 *             (`:766`, « Données invalides ») ;
 *       403 `LANGUAGE_NOT_ALLOWED` (`:631`), `REGION_NOT_ALLOWED`,
 *             `ACCOUNT_REQUIRED`, `BANNED` (`services/conversations/
 *             linkAdmission.ts:112-118`, :200-233) ;
 *       404 `Lien de conversation introuvable` (`:626`) ;
 *       409 `USERNAME_TAKEN_IN_CONVERSATION` avec `suggestedNickname` à la
 *             RACINE (`:635-638`, étalé par `sendError`, `response.ts:83`) ;
 *       409 `LINK_EXHAUSTED` — `maxUses`, `maxConcurrentUsers` ou
 *             `maxUniqueSessions` atteints (`linkAdmission.ts:183-197`) : les
 *             410 `LINK_MAX_USES` / 429 `MAX_CONCURRENT_USERS` des adaptateurs
 *             historiques ont FUSIONNÉ ici (`routes/anonymous.ts:238-239`) ;
 *       410 `LINK_EXPIRED` (inactif OU échu, `linkAdmission.ts:169-175`),
 *             `CONVERSATION_CLOSED` (`:180`) ;
 *       500.
 *   • la RECONNAISSANCE d'une place — `GET /api/v1/links/:identifier?limit=1`
 *     (`routes/links/retrieval.ts:40`, `authOptional`, jeton en
 *     `X-Session-Token`) : 200 avec `link.linkId` — la clé CANONIQUE — dès que
 *     la session appartient à ce lien (`hasAccess = anonymousParticipant
 *     .shareLinkId === shareLink.id`, `:196-197`), que le lien soit ouvert,
 *     clos, échu ou plein : cette porte ne regarde pas son état pour qui y
 *     tient une place. Elle sert le jour où l'APERÇU refuse (410 sans
 *     `linkId`) : le cookie de la place est nommé par la clé, et c'est ELLE
 *     qui la rend. 403 pour une session d'un autre lien ou sans session sur
 *     un lien clos (`canPreview`), 410 `GUEST_ACCESS_REVOKED` pour une place
 *     révoquée (`middleware/auth.ts:561`, `:758-764`), 404 pour un lien
 *     inconnu — aucun de ces refus n'est une place ;
 *   • le BATTEMENT — `PATCH /api/v1/guest-sessions/me` (`routes/conversations/
 *     link-admission.ts:776`, jeton en `X-Session-Token`, JAMAIS dans le corps) :
 *     200 avec les droits RELUS et la conversation, 401 quand la place n'existe
 *     plus (`isActive:false`, § 6.1), 410 `LINK_DEACTIVATED` / `LINK_EXPIRED` /
 *     `CONVERSATION_CLOSED`. C'est la preuve de présence d'un BAIL (§ 6.4),
 *     jamais un renouvellement de jeton — le jeton n'a aucun TTL. Son alias
 *     historique `POST /anonymous/refresh` est DÉPRÉCIÉ par la passerelle
 *     (`routes/anonymous.ts:341`, `depreciee({ depuis: '2026-08-30' })`) et
 *     mourra au Sunset : la v3 se conforme à la passerelle telle qu'elle est,
 *     et un battement bâti sur un alias condamné est une non-conformité, pas un
 *     renommage à faire plus tard.
 *
 * Ce que ce module ne fait JAMAIS : il ne jette pas (une passerelle muette est
 * une PANNE, pas un refus — § 7), et il ne rejoint jamais de lui-même (§ 6.3
 * état F : un 401 se peint, il ne se contourne pas).
 */

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

const PREFIXE = '/api/v1';
const CHEMIN_APERCU = (identifiant: string): string => `${PREFIXE}/anonymous/link/${encodeURIComponent(identifiant)}`;
const CHEMIN_JONCTION = (cle: string): string => `${PREFIXE}/links/${encodeURIComponent(cle)}/members`;
const CHEMIN_BATTEMENT = `${PREFIXE}/guest-sessions/me`;
export const METHODE_DU_BATTEMENT = 'PATCH';
/** `limit=1` : cette lecture ne veut que la clé du lien, jamais la page de messages que la route sert avec (`validatePagination`, plancher 1). */
const CHEMIN_RECONNAISSANCE = (identifiant: string): string => `${PREFIXE}/links/${encodeURIComponent(identifiant)}?limit=1`;

const DELAI_MS = DELAI_DE_REPONSE_MS;

/** Les droits qu'un invité voit ANNONCÉS — ceux que les DEUX portes servent (jonction et battement). */
export type Droits = {
  readonly canSendMessages: boolean;
  readonly canSendFiles: boolean;
  readonly canSendImages: boolean;
  readonly canViewHistory: boolean;
};

/**
 * Ce que l'aperçu SERT et que la modale montre : le nom de la place, ses
 * exigences, ses langues, son effectif. Rien du créateur.
 */
export type ApercuDeJonction = {
  readonly lien: CleDeLien;
  readonly nom: string;
  readonly description: string | null;
  readonly conversationId: string | null;
  readonly requireNickname: boolean;
  readonly requireAccount: boolean;
  /** Le lien exige un courriel (`requireEmail`) — la porte refuse 400 sans lui (`link-admission.ts:428`). */
  readonly requireEmail: boolean;
  /** Le lien exige une date de naissance (`requireBirthday`) — 400 sans elle (`:431`). */
  readonly requireBirthday: boolean;
  readonly languesAutorisees: readonly string[];
  readonly participants: number | null;
  /** Les quatre droits que CE lien ouvre — servis par l'aperçu depuis #4522, projetés par la MÊME `droitsDe` que la jonction et le battement (#4830). */
  readonly droits: Droits;
};

export type IssueDApercu =
  | { readonly genre: 'apercu'; readonly apercu: ApercuDeJonction }
  | { readonly genre: 'clos'; readonly code: string }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'panne' };

export type Refus = {
  readonly genre: 'refus';
  readonly statut: number;
  readonly code: string;
  readonly message: string | null;
  /** Le pseudo LIBRE que la passerelle propose sur un 409 — pré-rempli, jamais suggéré en prose. */
  readonly suggestion: string | null;
};

export type IssueDeJonction =
  | {
      readonly genre: 'invite';
      readonly jeton: string;
      readonly participantId: string;
      readonly conversationId: string | null;
      readonly droits: Droits;
    }
  | {
      readonly genre: 'membre';
      readonly conversationId: string | null;
      readonly issue: 'new' | 'rejoin' | 'already-member';
    }
  | Refus
  | { readonly genre: 'panne' };

export type IssueDeBattement =
  | {
      readonly genre: 'valide';
      readonly participant: { readonly id: string; readonly pseudo: string; readonly langue: string | null };
      readonly droits: Droits;
      readonly conversation: { readonly id: string | null; readonly titre: string | null };
    }
  | { readonly genre: 'invalide' }
  | { readonly genre: 'clos'; readonly code: string }
  | { readonly genre: 'panne' };

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;

const nombre = (valeur: unknown): number | null =>
  typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : null;

const chaines = (valeur: unknown): readonly string[] =>
  (Array.isArray(valeur) ? valeur : []).map(chaine).filter((v): v is string => v !== null);

const demande = (
  url: string,
  options: RequestInit,
  recuperer: Recuperateur | undefined,
  delaiMs: number,
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    ...options,
    headers: { accept: 'application/json', ...options.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(delaiMs),
  }).catch(() => null);

const enveloppeDe = async (reponse: Response): Promise<Readonly<Record<string, unknown>> | null> =>
  objet(await reponse.json().catch(() => null));

/** `sendError` pose le code dans `error` (une chaîne) et le message à côté ; `code` reste son champ d'appoint. */
const codeDe = (enveloppe: Readonly<Record<string, unknown>> | null): string | null =>
  chaine(enveloppe?.error) ?? chaine(objet(enveloppe?.error)?.code) ?? chaine(enveloppe?.code);

const messageDe = (enveloppe: Readonly<Record<string, unknown>> | null): string | null =>
  chaine(enveloppe?.message) ?? chaine(objet(enveloppe?.error)?.message);

export const droitsDe = (brut: Readonly<Record<string, unknown>> | null, historique: unknown): Droits => ({
  canSendMessages: brut?.canSendMessages === true,
  canSendFiles: brut?.canSendFiles === true,
  canSendImages: brut?.canSendImages === true,
  canViewHistory: historique === true || brut?.canViewHistory === true,
});

/**
 * L'aperçu tel que la charge le porte, `linkId` compris quand il y est — une
 * réponse traversée par le réseau n'est pas un fait de type, et une carte
 * d'aperçu (`/l/:token`) sert le nom d'un lien dont la clé manque. La MODALE,
 * elle, exige la clé : c'est elle qui nomme la place (§ 6.3.E).
 */
export type ApercuServi = Omit<ApercuDeJonction, 'lien'> & { readonly lien: CleDeLien | null };

/** L'UNIQUE lecteur de `data` de `GET /anonymous/link/:identifier` (`routes/anonymous.ts:663-692`). */
export const apercuServi = (data: unknown): ApercuServi | null => {
  const donnee = objet(data);
  if (donnee === null) return null;

  const conversation = objet(donnee.conversation);
  const nom = chaine(donnee.name) ?? chaine(conversation?.title);
  if (nom === null) return null;

  return {
    lien: cleDeLien(donnee),
    nom,
    description: chaine(donnee.description) ?? chaine(conversation?.description),
    conversationId: chaine(conversation?.id),
    requireNickname: donnee.requireNickname === true,
    requireAccount: donnee.requireAccount === true,
    requireEmail: donnee.requireEmail === true,
    requireBirthday: donnee.requireBirthday === true,
    languesAutorisees: chaines(donnee.allowedLanguages),
    participants: nombre(objet(donnee.stats)?.totalParticipants),
    droits: droitsDe(
      {
        canSendMessages: donnee.allowAnonymousMessages,
        canSendFiles: donnee.allowAnonymousFiles,
        canSendImages: donnee.allowAnonymousImages,
      },
      donnee.allowViewHistory,
    ),
  };
};

export const apercuDeJonction = async ({
  identifiant,
  base,
  recuperer,
  delaiMs = DELAI_MS,
}: {
  readonly identifiant: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
  readonly delaiMs?: number;
}): Promise<IssueDApercu> => {
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_APERCU(identifiant)}`, {}, recuperer, delaiMs);
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 404) return { genre: 'introuvable' };

  const enveloppe = await enveloppeDe(reponse);
  if (reponse.status === 410) return { genre: 'clos', code: codeDe(enveloppe) ?? 'LINK_INACTIVE' };
  if (!reponse.ok) return { genre: 'panne' };

  const servi = apercuServi(enveloppe?.data);
  if (servi === null || servi.lien === null) return { genre: 'panne' };

  return { genre: 'apercu', apercu: { ...servi, lien: servi.lien } };
};

/**
 * Une date de naissance saisie dans un `<input type="date">` voyage en
 * `AAAA-MM-JJ` ; la porte exige un `z.iso.datetime()` (`link-admission.ts:578`)
 * et refuse 400 « Données invalides » tout le reste. La conversion vit ICI,
 * avec l'appel qu'elle sert — jamais dans un gabarit. Une saisie qui n'est pas
 * une date part telle quelle : c'est à la passerelle de la refuser, avec sa
 * phrase.
 */
const naissanceServie = (saisie: string): string => {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(saisie.trim());
  return date === null ? saisie : `${date[1]}-${date[2]}-${date[3]}T00:00:00.000Z`;
};

/**
 * L'ADRESSE DU VISITEUR VOYAGE AVEC LA JONCTION. La porte applique
 * `allowedIpRanges` à `request.ip` (`admitLinkEntry`, `linkAdmission.ts:
 * 200-204`, résolu sous `trustProxy`, `config/trust-proxy.ts`). Le legacy la
 * poste depuis le NAVIGATEUR : l'adresse est celle du visiteur. La v3 la
 * poste depuis son SERVEUR : sans cet en-tête, tout visiteur se présenterait
 * sous l'adresse du conteneur — un lien réservé à un réseau refuserait tout
 * le monde, ou admettrait tout le monde. `X-Forwarded-For` est ce que Traefik
 * écrit déjà devant la passerelle ; la v3 relaie ce qu'elle a reçu.
 */
export const rejoins = async ({
  cle,
  pseudo,
  courriel,
  naissance,
  langue,
  jeton,
  ipDuVisiteur,
  base,
  recuperer,
}: {
  readonly cle: string;
  readonly pseudo?: string;
  readonly courriel?: string;
  /** `AAAA-MM-JJ`, tel qu'un champ de date le poste. */
  readonly naissance?: string;
  readonly langue: string;
  /** Le jeton de COMPTE d'un membre — la porte canonique en fait un `already-member` ou un `new`. */
  readonly jeton?: string;
  /** L'adresse du VISITEUR, relayée à la porte qui juge `allowedIpRanges`. */
  readonly ipDuVisiteur?: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeJonction> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_JONCTION(cle)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(jeton === undefined ? {} : { authorization: `Bearer ${jeton}` }),
        ...(ipDuVisiteur === undefined ? {} : { 'x-forwarded-for': ipDuVisiteur }),
      },
      body: JSON.stringify({
        ...(pseudo === undefined ? {} : { nickname: pseudo }),
        ...(courriel === undefined ? {} : { email: courriel }),
        ...(naissance === undefined ? {} : { birthday: naissanceServie(naissance) }),
        language: langue,
      }),
    },
    recuperer,
    DELAI_MS,
  );
  if (reponse === null) return { genre: 'panne' };

  const enveloppe = await enveloppeDe(reponse);
  if (reponse.status >= 500) return { genre: 'panne' };

  if (!reponse.ok) {
    return {
      genre: 'refus',
      statut: reponse.status,
      code: codeDe(enveloppe) ?? (reponse.status === 400 ? 'VALIDATION' : 'REFUS'),
      message: messageDe(enveloppe),
      suggestion:
        chaine(enveloppe?.suggestedNickname) ?? chaine(objet(enveloppe?.details)?.suggestedNickname),
    };
  }

  const donnee = objet(enveloppe?.data);
  const entree = objet(donnee?.entry);
  if (donnee === null) return { genre: 'panne' };

  const sessionToken = chaine(donnee.sessionToken);
  const participantId = chaine(donnee.participantId);
  const conversationId = chaine(donnee.conversationId);

  if (sessionToken !== null && participantId !== null) {
    return {
      genre: 'invite',
      jeton: sessionToken,
      participantId,
      conversationId,
      droits: droitsDe(objet(entree?.rights), entree?.canViewHistory),
    };
  }

  const issue = chaine(entree?.outcome);
  return {
    genre: 'membre',
    conversationId,
    issue: issue === 'rejoin' || issue === 'already-member' ? issue : 'new',
  };
};

export const rafraichis = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeBattement> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_BATTEMENT}`,
    { method: METHODE_DU_BATTEMENT, headers: entetesDuBattement(jeton) },
    recuperer,
    DELAI_MS,
  );
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'invalide' };

  const enveloppe = await enveloppeDe(reponse);
  if (reponse.status === 410) return { genre: 'clos', code: codeDe(enveloppe) ?? 'LINK_DEACTIVATED' };
  if (!reponse.ok) return { genre: 'panne' };

  const donnee = objet(enveloppe?.data);
  const participant = objet(donnee?.participant);
  const conversation = objet(donnee?.conversation);
  const id = chaine(participant?.id);
  if (participant === null || id === null) return { genre: 'panne' };

  return {
    genre: 'valide',
    participant: {
      id,
      pseudo: chaine(participant.displayName) ?? chaine(participant.username) ?? 'Invité',
      langue: chaine(participant.language),
    },
    droits: droitsDe(participant, conversation?.allowViewHistory),
    conversation: { id: chaine(conversation?.id), titre: chaine(conversation?.title) },
  };
};

/**
 * Une place RECONNUE par la passerelle : la clé canonique du lien, son nom, sa
 * conversation — et son OCCUPANT quand la charge le nomme (`currentUser`,
 * `retrieval.ts:248-262` : `id` = `Participant.id`, `username` = le pseudo de
 * la session ; `displayName` y est absent). C'est la seule porte qui nomme
 * l'invité quand le battement REFUSE (410, état G) : sans elle, un fil relu
 * après la fermeture du lien ne saurait ni quelles lignes sont les siennes,
 * ni comment le saluer.
 */
export type Place = {
  readonly lien: CleDeLien;
  readonly nom: string | null;
  readonly conversationId: string | null;
  readonly participant: { readonly id: string; readonly pseudo: string } | null;
};

const occupantDe = (currentUser: unknown): Place['participant'] => {
  const brut = objet(currentUser);
  const id = chaine(brut?.id);
  const pseudo = chaine(brut?.displayName) ?? chaine(brut?.username);
  return id === null || pseudo === null ? null : { id, pseudo };
};

export type IssueDeReconnaissance =
  | { readonly genre: 'place'; readonly place: Place }
  | { readonly genre: 'etrangere' }
  | { readonly genre: 'panne' };

/**
 * « Ce jeton tient-il une place sur CE lien ? » — posée à la passerelle, qui
 * seule sait répondre, et qui répond par la clé canonique (`link.linkId`) ;
 * `cleDeLien` la reçoit d'une charge SERVIE, comme pour l'aperçu et la
 * jonction. Tout ce qui n'est pas un 200 est « pas une place » : 403 (session
 * d'un autre lien, ou aucune sur un lien clos), 410 (place révoquée), 404.
 */
export const reconnais = async ({
  identifiant,
  jeton,
  base,
  recuperer,
}: {
  readonly identifiant: string;
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDeReconnaissance> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_RECONNAISSANCE(identifiant)}`,
    { headers: entetesDuBattement(jeton) },
    recuperer,
    DELAI_MS,
  );
  if (reponse === null) return { genre: 'panne' };
  if (reponse.status >= 500) return { genre: 'panne' };
  if (!reponse.ok) return { genre: 'etrangere' };

  const donnee = objet((await enveloppeDe(reponse))?.data);
  const lien = objet(donnee?.link);
  const conversation = objet(donnee?.conversation);
  const cle = lien === null ? null : cleDeLien(lien);
  if (cle === null) return { genre: 'panne' };

  return {
    genre: 'place',
    place: {
      lien: cle,
      nom: chaine(lien?.name) ?? chaine(conversation?.title),
      conversationId: chaine(conversation?.id),
      participant: occupantDe(donnee?.currentUser),
    },
  };
};

export type PlaceDetenue =
  | { readonly genre: 'place'; readonly place: Place; readonly jeton: string }
  | { readonly genre: 'aucune' }
  | { readonly genre: 'panne' };

/**
 * La PREMIÈRE place que l'un des jetons présentés tient sur ce lien — les
 * jetons sont présentés l'un après l'autre (il y en a un, presque toujours),
 * et la passerelle est seule juge de l'appartenance. Une passerelle muette
 * est une panne, jamais « aucune place ».
 */
export const placeDetenue = async ({
  identifiant,
  jetons,
  base,
  recuperer,
}: {
  readonly identifiant: string;
  readonly jetons: readonly string[];
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<PlaceDetenue> => {
  const [jeton, ...reste] = jetons;
  if (jeton === undefined) return { genre: 'aucune' };
  const issue = await reconnais({ identifiant, jeton, ...(base === undefined ? {} : { base }), ...(recuperer === undefined ? {} : { recuperer }) });
  if (issue.genre === 'panne') return { genre: 'panne' };
  if (issue.genre === 'place') return { genre: 'place', place: issue.place, jeton };
  return placeDetenue({ identifiant, jetons: reste, ...(base === undefined ? {} : { base }), ...(recuperer === undefined ? {} : { recuperer }) });
};

/** Le chemin du battement, tel que l'instrument de cycle de vie le compte. */
export const CHEMIN_DU_BATTEMENT = CHEMIN_BATTEMENT;

/** Le jeton voyage dans `X-Session-Token` — la forme que `link-admission.ts:829` lit, et qu'aucun corps ne porte. */
export const entetesDuBattement = (jeton: string): Readonly<Record<string, string>> => ({ 'x-session-token': jeton });

/**
 * POURQUOI le composeur est fermé — une phrase par cause NOMMÉE par la
 * passerelle (`routes/anonymous.ts:353-362`, `link-admission.ts`), et une pour
 * le droit retiré. « Cette conversation est terminée » est un état DISTINCT
 * du lien fermé (§ 6.3 état G) : un lecteur doit savoir s'il peut revenir par
 * un autre lien. Servie au montage par `/chat/:lien` et, sur un 410 de
 * battement, par le module de participation — la même table pour les deux.
 *
 * La LISTE parle un troisième vocabulaire pour les mêmes faits : `GET
 * /conversations/:id/messages` ferme la lecture d'un invité par 403
 * `SHARE_LINK_EXPIRED` (lien échu) et `SHARE_LINK_MAX_USES` (`currentUses >=
 * maxUses` — le DERNIER admis compris, `messages-list.ts:270-278`, gagé par
 * `messages-routes.test.ts:854-885`). Mêmes phrases, mêmes faits.
 */
export const RAISONS_DE_FERMETURE: Readonly<Record<string, string>> = {
  LINK_DEACTIVATED: 'Ce lien a été fermé par son auteur.',
  LINK_INACTIVE: 'Ce lien a été fermé par son auteur.',
  LINK_EXPIRED: 'Ce lien a expiré.',
  SHARE_LINK_EXPIRED: 'Ce lien a expiré.',
  LINK_EXHAUSTED: 'Ce lien a atteint son nombre d’entrées.',
  LINK_MAX_USES: 'Ce lien a atteint son nombre d’entrées.',
  SHARE_LINK_MAX_USES: 'Ce lien a atteint son nombre d’entrées.',
  CONVERSATION_CLOSED: 'Cette conversation est terminée.',
  DROIT_RETIRE: 'L’hôte n’autorise pas les invités à écrire ici.',
  SESSION_EXPIREE: 'Votre session a expiré : reconnectez-vous pour écrire.',
};

export const raisonDeFermeture = (code: string): string =>
  RAISONS_DE_FERMETURE[code] ?? 'Vous ne pouvez plus écrire dans cette conversation.';
