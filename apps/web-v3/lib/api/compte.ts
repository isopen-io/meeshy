import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * CE QUE LA ZONE CONNECTÉE DEMANDE À LA PASSERELLE, au nom du lecteur.
 *
 * Le jeton vient du cookie que la remise a posé (`app/session.ts`) et repart en
 * `Authorization: Bearer` — la passerelle ne connaît que cette forme. Rien n'est
 * mis en cache : une liste de conversations change à chaque message, et un
 * document servi depuis un cache montrerait un compteur de non-lus périmé, ce
 * qui est pire qu'un compteur absent.
 *
 * TROIS ISSUES, ET LA DEUXIÈME N'EST PAS UNE PANNE. Un 401 veut dire « ce jeton
 * ne vaut plus » — c'est le cas NOMINAL d'une session expirée, et l'écran doit y
 * répondre en renvoyant se connecter, pas en affichant une erreur. Les
 * confondre ferait lire « une erreur est survenue » à qui doit simplement se
 * reconnecter.
 *
 * LES DEUX ROUTES RÉPONDENT DÉSORMAIS PAREIL À UNE SESSION MORTE — **401, et
 * rien d'autre** — et cet appelant n'a donc plus qu'une seule ligne de refus.
 * C'est MESURÉ sur les deux handlers, pas déduit d'une sémantique de manuel.
 *
 * Le motif écrit ici avant #4760 était FAUX. Il invoquait
 * `middleware/auth.ts:886`, « qui rend `403 PERMISSION_DENIED` avec le message
 * Authentication required ». Cette ligne est `requireEmailVerification` : une
 * garde que **zéro route du gateway ne monte** (mesuré). Elle ne décrivait ni
 * `/auth/me` ni `/conversations`, et #4760 lui a de toute façon fait rendre 401.
 *
 *   - **`/auth/me` ⇒ 401, jamais 403** (#4760). Sa garde est
 *     `createUnifiedAuthMiddleware(…, { requireAuth: true, allowAnonymous:
 *     true })` (`routes/auth/magic-link.ts`), dont la branche 403
 *     (`REGISTERED_USER_REQUIRED`) est inatteignable sous `allowAnonymous:
 *     true` ; et son handler `handleGetMe` (`routes/me/get-me.ts:313`) refuse
 *     par `sendUnauthorized`. Le 403 y était une branche MORTE : retiré.
 *
 *   - **`/conversations` ⇒ 401 depuis #4789.** Sa garde `optionalAuth`
 *     (`requireAuth: false, allowAnonymous: true`) ne refuse rien ; c'est le
 *     handler qui tranche, et il servait `sendForbidden(… 'Authentication
 *     required to access conversations')` — le même défaut que #4760, un refus
 *     d'IDENTITÉ servi au statut d'un refus de DROIT, sur un site que #4760
 *     n'avait pas touché. Il rend maintenant `401 UNAUTHORIZED`
 *     (`routes/conversations/core-list.ts`), et la ligne `status === 403` qui
 *     vivait ici POUR ce défaut est partie avec lui.
 *
 * **Le 403 ne se remet pas « au cas où ».** Il n'a plus aucun émetteur sur ces
 * deux routes — `GET /conversations` ne le déclare même plus à son schéma de
 * réponse — et le remettre ferait lire « session expirée » à un refus de DROIT
 * qu'une route voisine pourrait servir un jour. Le témoin de
 * `__tests__/connecte.test.ts` fixe les deux moitiés : `/conversations` en 401
 * renvoie se connecter, `/auth/me` en 403 ne le fait pas.
 *
 * Suivi hors de ce dépôt-ci : `AuthExpiryInterceptor`
 * (`apps/android/core/network/…/AuthExpiryInterceptor.kt:43`) garde 403 dans ses
 * `EXPIRY_CODES` **en citant cette phrase exacte** comme justification. Son
 * comportement reste juste (401 y figure déjà) ; c'est sa raison écrite qui est
 * périmée.
 */

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

export type Conversation = {
  readonly id: string;
  readonly identifiant: string | null;
  readonly titre: string;
  readonly genre: string;
  readonly membres: number;
  readonly nonLus: number;
  readonly dernierMessageA: string | null;
};

export type Fil =
  | { readonly genre: 'liste'; readonly conversations: readonly Conversation[]; readonly total: number }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const DELAI_MS = DELAI_DE_REPONSE_MS;

const CHEMIN_CONVERSATIONS = '/api/v1/conversations';
const CHEMIN_MOI = '/api/v1/auth/me';

/**
 * `GET /links` — les liens de partage du lecteur connecté
 * (`services/gateway/src/routes/links/user.ts:314`, `onRequest: [authRequired]`
 * posé avec `requireAuth: true, allowAnonymous: false` : donc un porteur, jamais
 * une session invitée).
 *
 * `?expand=conversation` n'est pas une commodité : SANS lui, la charge ne porte
 * ni `conversationId` ni `conversation` (`user.ts:571-581` — l'extension est le
 * seul site qui les pose), et une carte de lien ne pourrait alors mener nulle
 * part. Un contrôle qui ne mène nulle part n'est pas rendu (charte règle 7) :
 * demander l'extension est ce qui lui donne son effet.
 *
 * `limit=3` parce que le tableau de bord RÉCAPITULE : la cible `home.png` en
 * dessine une, la page des liens n'existe pas encore dans la v3, et rapatrier
 * cinquante liens pour en peindre trois se paierait sur une 3G rurale.
 */
const CHEMIN_LIENS = '/api/v1/links?limit=3&expand=conversation';

/**
 * L'inventaire de `/links` : la page ENTIÈRE du lecteur, ses agrégats avec.
 *
 * `?include=summary` ÉVITE un second aller-retour — il absorbe
 * `GET /links/stats`, que la passerelle déclare déprécié en le nommant
 * (`user.ts:649`). Sur une 3G rurale, un appel économisé vaut mieux qu'un
 * chiffre calculé deux fois.
 *
 * `?expand=conversation` pour la même raison que le tableau de bord : SANS lui
 * la charge ne porte ni `conversationId` ni `conversation` (`user.ts:571-581`),
 * et une carte de lien ne mènerait nulle part.
 */
const CHEMIN_CARNET_DE_LIENS = '/api/v1/links?expand=conversation&include=summary&limit=';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const entier = (valeur: unknown): number => (typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0);

/**
 * LE NOM AFFICHÉ D'UNE CONVERSATION. `title` quand il existe ; sinon les noms
 * des participants, qui est ce qu'un fil direct porte.
 *
 * Ce n'est PAS la reprise d'une règle du dépôt : aucun site ne la porte
 * aujourd'hui — vérifié, `getConversationDisplayName` n'existe nulle part. Le
 * jour où le legacy en déclare une, celle-ci disparaît au profit de la sienne
 * plutôt que de devenir sa jumelle.
 */
const SANS_TITRE = 'Conversation';

const nomAffiche = (brut: Readonly<Record<string, unknown>>): string => {
  const titre = chaine(brut.title);
  if (titre !== null) return titre;

  const participants = Array.isArray(brut.participants) ? brut.participants : [];
  const noms = participants
    .map((p) => chaine(objet(p)?.displayName))
    .filter((nom): nom is string => nom !== null);

  return noms.length === 0 ? SANS_TITRE : noms.slice(0, 3).join(', ');
};

/**
 * EXPORTÉE pour la RECHERCHE, qui lit la même forme.
 *
 * `GET /conversations/search` sert `conversationMinimalSchema`, exactement ce
 * que `GET /conversations` sert — mêmes clés, `participants` compris, dont
 * `nomAffiche` a besoin pour nommer un fil direct sans titre. Écrire une
 * seconde projection dans le module de recherche en ferait une jumelle, qui
 * divergerait au premier champ ajouté : c'est le motif que le dépôt paie
 * cycle après cycle (§ « Cette entité a-t-elle une JUMELLE ? »).
 */
export const conversation = (brut: Readonly<Record<string, unknown>>): Conversation | null => {
  const id = chaine(brut.id);
  if (id === null) return null;

  return {
    id,
    identifiant: chaine(brut.identifier),
    titre: nomAffiche(brut),
    genre: chaine(brut.type) ?? 'direct',
    membres: entier(brut.memberCount),
    nonLus: entier(brut.unreadCount),
    dernierMessageA: chaine(brut.lastMessageAt),
  };
};

/**
 * UN LIEN DE PARTAGE, PROJETÉ — quatre champs, pris dans la charge que la
 * passerelle sert. Ce qui n'est pas ici n'est pas relayé : `creator` porte
 * l'identité complète de qui a créé le lien, et la projection se fait AVANT que
 * quoi que ce soit n'entre dans le HTML (même règle que `apercuDuLien`).
 */
export type LienDePartage = {
  readonly identifiant: string;
  readonly nom: string;
  /**
   * `currentUses` — et il compte des ADMISSIONS, jamais des VUES.
   *
   * Son unique producteur est `claimLinkUse`
   * (`services/gateway/src/routes/conversations/link-admission.ts:192`), appelé
   * sur le chemin d'admission et borné par `maxUses` : il s'incrémente quand
   * quelqu'un ENTRE, pas quand quelqu'un regarde. Aucun compteur de vues
   * n'existe sur un lien de partage — `clickCount` vit sur `AffiliateToken`,
   * un autre modèle.
   *
   * D'où le libellé de l'écran : « N ont rejoint », jamais « N vues ». Écrire
   * « vues » au-dessus de ce nombre serait plus faux que de ne rien écrire :
   * un chiffre plausible sous le mauvais nom ne se signale jamais.
   */
  readonly utilisations: number;
  /** L'identifiant de la conversation qu'il ouvre, `null` si la passerelle ne l'a pas étendu. */
  readonly conversation: string | null;
  /** `isActive` — un lien fermé n'ouvre plus rien, et l'écran le DIT au lieu de le cacher. */
  readonly actif: boolean;
  /** `maxUses` — la capacité, quand le lien en déclare une. */
  readonly capacite: number | null;
  /** `expiresAt` — l'échéance, quand le lien en porte une. */
  readonly expireA: string | null;
};

export type LiensDuLecteur =
  | { readonly genre: 'liste'; readonly liens: readonly LienDePartage[] }
  | { readonly genre: 'indisponible' };

/**
 * LE CARNET DE LIENS DE L'ÉCRAN `/links` — la MÊME route que le tableau de
 * bord, une autre question.
 *
 * Le tableau de bord RÉCAPITULE : trois liens actifs, et rien d'autre. Cet
 * écran INVENTORIE : tous les liens, actifs ET fermés, avec le compte que la
 * passerelle mesure elle-même. Deux projections d'un seul appel — écrire un
 * second module ferait une jumelle de `lienDePartage`, qui divergerait sur le
 * premier champ ajouté.
 *
 * `activeLinks` VIENT DU SERVEUR, jamais d'un `filter().length` sur la page.
 * `?include=summary` rend des agrégats RÉELS (`user.ts:430`, « aucun champ non
 * mesurable ») portant sur TOUT le carnet ; les compter sur la page servie
 * donnerait un total plafonné par `limit`, qui se contredirait dès la page
 * suivante. C'est la faute exacte du compteur de non-lues (leçon 476), et elle
 * se paie ici en « 2 liens actifs » sous une liste qui en montre trente.
 */
export type Carnet =
  | {
      readonly genre: 'liste';
      readonly liens: readonly LienDePartage[];
      /** `meta.summary.activeLinks` — SERVI, jamais recompté sur la page. */
      readonly actifs: number;
      readonly total: number;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

export type Lecteur = {
  readonly id: string | null;
  readonly prenom: string | null;
  readonly nomAffiche: string | null;
  readonly pseudonyme: string | null;
  /**
   * LES TROIS RANGS DU PRISME, servis tels que la passerelle les donne. Ils ne
   * sont ni normalisés ni repliés ici : `resolveUserLanguagesOrdered`
   * (`@meeshy/shared`) est le site unique qui en fait un ordre, et lui refaire
   * ce travail en amont produirait deux vérités sur la même question.
   */
  readonly systemLanguage: string | null;
  readonly regionalLanguage: string | null;
  readonly customDestinationLanguage: string | null;
};

const lienDePartage = (brut: Readonly<Record<string, unknown>>): LienDePartage | null => {
  const identifiant = chaine(brut.identifier);
  if (identifiant === null) return null;

  return {
    identifiant,
    nom: chaine(brut.name) ?? chaine(brut.conversationTitle) ?? identifiant,
    utilisations: entier(brut.currentUses),
    conversation: chaine(objet(brut.conversation)?.id),
    // ABSENT ⇒ ACTIF, et c'est la lecture juste : `isActive` est déclaré
    // `type: 'boolean'` non nullable par le schéma de la route
    // (`routes/links/user.ts:349`), donc toujours servi. Traiter une absence
    // comme « fermé » ferait disparaître des liens vivants au premier champ
    // que le serveur cesserait d'envoyer ; la traiter comme « ouvert » les
    // laisse visibles, et l'écran dit la vérité qu'il a.
    actif: brut.isActive !== false,
    capacite: typeof brut.maxUses === 'number' && Number.isFinite(brut.maxUses) ? brut.maxUses : null,
    expireA: chaine(brut.expiresAt),
  };
};

export type Identite =
  | { readonly genre: 'lecteur'; readonly lecteur: Lecteur }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const demande = async (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${jeton}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

/**
 * QUI LIT. Le prénom vient de la passerelle et non du cookie : `meeshy_session`
 * ne porte qu'un rôle et un identifiant, et il n'est ni signé ni vérifié — un
 * nom qu'on y lirait serait un nom que n'importe qui peut écrire.
 */
export const moi = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Identite> => {
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_MOI}`, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true) return { genre: 'panne' };

  // La passerelle sert le profil à la racine de `data` sur `/auth/me`, et sous
  // `data.user` ailleurs. Les deux formes sont acceptées : le contrat de la
  // route est celui qui compte, et lui seul est mesuré.
  const brut = objet(objet(enveloppe.data)?.user) ?? objet(enveloppe.data);
  if (brut === null) return { genre: 'panne' };

  return {
    genre: 'lecteur',
    lecteur: {
      id: chaine(brut.id),
      prenom: chaine(brut.firstName),
      nomAffiche: chaine(brut.displayName),
      pseudonyme: chaine(brut.username),
      systemLanguage: chaine(brut.systemLanguage),
      regionalLanguage: chaine(brut.regionalLanguage),
      customDestinationLanguage: chaine(brut.customDestinationLanguage),
    },
  };
};

export const conversations = async ({
  jeton,
  limite = 20,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Fil> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_CONVERSATIONS}?limit=${limite}`;

  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const corps = await reponse.json().catch(() => null);
  const enveloppe = objet(corps);
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return { genre: 'panne' };

  const liste = enveloppe.data
    .map((brut) => objet(brut))
    .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
    .map(conversation)
    .filter((c): c is Conversation => c !== null);

  return {
    genre: 'liste',
    conversations: liste,
    total: entier(objet(enveloppe.pagination)?.total) || liste.length,
  };
};

/**
 * LES LIENS DU LECTEUR, ET LE SEUL ÉTAT D'ÉCHEC QU'ILS CONNAISSENT.
 *
 * Ils ne rendent JAMAIS `session-expiree`, et ce n'est pas un oubli : la porte
 * décide de renvoyer se connecter d'après `/auth/me` et `/conversations`, les
 * deux appels qui font l'écran. Si `GET /links` refusait un jeton que ces deux-là
 * viennent d'accepter, ce serait un fait sur la ROUTE des liens, jamais sur la
 * session — et le lecteur serait éjecté d'un tableau de bord parfaitement
 * servable. Un seul état d'échec, donc : « indisponible », et la section se tait.
 *
 * UN LIEN INACTIF N'EST PAS SERVI. `isActive` dit qu'il n'ouvre plus rien ; le
 * peindre sur le tableau de bord dirait au lecteur qu'il peut encore le
 * partager.
 */
export const liensDuLecteur = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<LiensDuLecteur> => {
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_LIENS}`, jeton, recuperer);

  if (reponse === null || !reponse.ok) return { genre: 'indisponible' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return { genre: 'indisponible' };

  return {
    genre: 'liste',
    liens: enveloppe.data
      .map((brut) => objet(brut))
      .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
      .filter((brut) => brut.isActive !== false)
      .map(lienDePartage)
      .filter((lien): lien is LienDePartage => lien !== null),
  };
};


/**
 * TOUS LES LIENS DU LECTEUR, fermés compris.
 *
 * TROIS ISSUES, et pas les deux de `liensDuLecteur`. La différence n'est pas
 * une hésitation : sur le tableau de bord, les liens sont une SECTION parmi
 * d'autres, et un refus de leur route ne doit pas éjecter un lecteur dont
 * `/auth/me` et `/conversations` viennent d'être acceptés. Ici les liens SONT
 * l'écran : un 401 n'a plus rien à dégrader, il renvoie se connecter.
 *
 * ET LES LIENS FERMÉS RESTENT. `liensDuLecteur` les écarte, parce qu'un lien
 * mort peint sur le tableau de bord dirait au lecteur qu'il peut encore le
 * partager. Cet écran-ci est l'endroit où il apprend qu'il ne le peut plus —
 * les cacher ferait disparaître un lien qu'il vient de révoquer, ce qui se lit
 * comme une perte, pas comme une fermeture.
 */
export const carnetDeLiens = async ({
  jeton,
  limite = 50,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Carnet> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_CARNET_DE_LIENS}${limite}`;
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return { genre: 'panne' };

  const liens = enveloppe.data
    .map((brut) => objet(brut))
    .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
    .map(lienDePartage)
    .filter((lien): lien is LienDePartage => lien !== null);

  // Le résumé vit sous `meta.summary` (`user.ts:613` — `meta.summary = summary`),
  // pas à la racine : les non-lues des notifications sont à la racine, ces
  // agrégats-ci ne le sont pas, et supposer une règle commune aux deux routes
  // rendrait `undefined`, donc ZÉRO — « 0 lien actif » sous une liste qui en
  // montre deux.
  const resume = objet(objet(enveloppe.meta)?.summary);

  return {
    genre: 'liste',
    liens,
    actifs: entier(resume?.activeLinks),
    total: entier(resume?.totalLinks),
  };
};
