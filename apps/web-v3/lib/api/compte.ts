import { baseDeLaPasserelle } from './links';

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
 * SUR CES DEUX ROUTES, UN 403 VEUT AUSSI DIRE « RECONNECTE-TOI ». La sémantique
 * de manuel — 401 « le jeton ne vaut plus », 403 « il vaut, mais pas pour ceci »
 * — ne décrit PAS cette passerelle. `middleware/auth.ts:886` rend
 * `403 PERMISSION_DENIED` avec le message « Authentication required » dès qu'il
 * n'y a pas d'authentification valide, et c'est le cas nominal d'une session
 * expirée sur `/auth/me`, qui n'exige aucune permission particulière.
 *
 * Traiter ce 403 en panne enferme le lecteur : il lit « le service ne répond
 * pas » alors qu'il doit simplement se reconnecter, et rien sur l'écran ne l'y
 * mène. Le témoin `it.each([401, 403])` de `__tests__/connecte.test.ts` dit
 * exactement cela, et il a raison.
 *
 * LA CRAINTE DE LA BOUCLE EST RÉELLE, mais elle vise un AUTRE 403 :
 * `auth.ts:873` rend le même code pour « Insufficient permissions » — un lecteur
 * authentifié à qui il manque un droit. Renvoyer celui-là au login bouclerait.
 * Les deux sont indiscernables par le client : `PERMISSION_DENIED` désigne les
 * deux. C'est un défaut de la passerelle, pas de cet appelant, et il est nommé
 * dans une issue à part.
 *
 * L'arbitrage tient à la ROUTE, pas au statut : `/auth/me` et `/conversations`
 * ne demandent aucun droit particulier, donc leur 403 ne peut pas être un refus
 * de permission — il ne reste que « pas authentifié ».
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

const DELAI_MS = 6000;

const CHEMIN_CONVERSATIONS = '/api/v1/conversations';
const CHEMIN_MOI = '/api/v1/auth/me';

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

const conversation = (brut: Readonly<Record<string, unknown>>): Conversation | null => {
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
  if (reponse.status === 401 || reponse.status === 403) return { genre: 'session-expiree' };

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
  if (reponse.status === 401 || reponse.status === 403) return { genre: 'session-expiree' };

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
