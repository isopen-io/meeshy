import {
  buildTranslationRecord,
  resolvePrismTranslation,
  resolveUserLanguagesOrdered,
} from '@meeshy/shared/utils/conversation-helpers';

import { baseDeLaPasserelle } from './links';

/**
 * LE FIL D'UNE CONVERSATION — et la seule surface de la v3 où le PRISME
 * s'applique.
 *
 * LA DESCENTE N'EST PAS RÉÉCRITE ICI. `resolvePrismTranslation` est le site
 * unique de la règle (`CLAUDE.md` § « La descente elle-même est UNE fonction »),
 * et son histoire est celle de trois familles divergentes nées de trois
 * réécritures. Ce module n'adapte qu'une FORME — la passerelle sert un TABLEAU
 * `{ language, content }[]`, le résolveur attend une carte — et l'adaptateur
 * lui-même est partagé (`buildTranslationRecord`, remonté dans
 * `@meeshy/shared`). Ni l'ordre, ni la règle « la langue d'origine concourt à
 * son RANG », ni la normalisation ne sont recopiés.
 *
 * `resolveUserLanguagesOrdered` ne porte PAS le repli `'fr'` — il rend une liste
 * vide quand rien n'est configuré. On l'ajoute, comme le fait `apps/web`, pour
 * rester en phase avec `resolveUserLanguage` (rang 5) et avec le repli
 * `["fr"]` d'Android.
 */

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

export type Message = {
  readonly id: string;
  readonly auteur: string;
  readonly deMoi: boolean;
  readonly texte: string;
  /** La langue SERVIE quand ce n'est pas l'originale — `null` sinon. */
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  readonly ecritA: string | null;
  /** Un contenu que la protection interdit d'afficher : le texte est absent. */
  readonly protege: boolean;
};

export type Fil = {
  readonly titre: string;
  readonly membres: number;
  readonly messages: readonly Message[];
};

export type Issue =
  | { readonly genre: 'fil'; readonly fil: Fil }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

const DELAI_MS = 6000;
const REPLI_DE_LANGUE = 'fr';

/**
 * Un message que la protection retient. Le texte n'est PAS servi — c'est la
 * leçon des cycles 124 et 125 du § Prisme : une garde qui DÉCLARE une
 * restriction sans la faire respecter laisse partir ce qu'elle prétend retenir.
 * La v3 ne sait pas encore consommer une vue unique ; tant qu'elle ne sait pas,
 * elle n'en montre rien.
 */
const PLACEHOLDER_PROTEGE = 'Message protégé — ouvrez-le depuis l’application.';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

const demande = (
  url: string,
  jeton: string,
  recuperer: Recuperateur | undefined,
  options: RequestInit = {},
): Promise<Response | null> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    ...options,
    headers: { accept: 'application/json', authorization: `Bearer ${jeton}`, ...options.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  }).catch(() => null);

export type Prisme = {
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
};

export const languesDuLecteur = (lecteur: Prisme, localeAppareil?: string): readonly string[] => {
  const ordonnees = resolveUserLanguagesOrdered(lecteur, { deviceLocale: localeAppareil });
  return ordonnees.length === 0 ? [REPLI_DE_LANGUE] : ordonnees;
};

/**
 * La protection se lit sur le MESSAGE, et les trois champs sont indépendants :
 * un message peut être à vue unique sans être flouté, et expirer sans être ni
 * l'un ni l'autre.
 */
const estProtege = (brut: Readonly<Record<string, unknown>>): boolean =>
  brut.isViewOnce === true || brut.isBlurred === true || chaine(brut.expiresAt) !== null;

export const message = (
  brut: Readonly<Record<string, unknown>>,
  moi: string | null,
  langues: readonly string[],
): Message | null => {
  const id = chaine(brut.id);
  if (id === null) return null;

  const expediteur = objet(brut.sender);
  const langueOriginale = chaine(brut.originalLanguage);
  const protege = estProtege(brut);

  const servie = protege
    ? null
    : resolvePrismTranslation({
        translations: buildTranslationRecord(brut.translations),
        originalLanguage: langueOriginale,
        preferredLanguages: langues,
      });

  return {
    id,
    auteur: chaine(expediteur?.displayName) ?? chaine(expediteur?.username) ?? 'Quelqu’un',
    deMoi: moi !== null && chaine(brut.senderId) === moi,
    texte: protege ? PLACEHOLDER_PROTEGE : (servie?.text ?? chaine(brut.content) ?? ''),
    langueServie: servie?.language ?? null,
    langueOriginale,
    ecritA: chaine(brut.createdAt),
    protege,
  };
};

export const fil = async ({
  cle,
  jeton,
  moi,
  langues,
  limite = 40,
  base,
  recuperer,
}: {
  readonly cle: string;
  readonly jeton: string;
  readonly moi: string | null;
  readonly langues: readonly string[];
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> => {
  const racine = `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(cle)}`;

  const [detail, liste] = await Promise.all([
    demande(racine, jeton, recuperer),
    demande(`${racine}/messages?limit=${limite}`, jeton, recuperer),
  ]);

  if (detail === null || liste === null) return { genre: 'panne' };

  // 401 ET 403 NE DISENT PAS LA MÊME CHOSE, et les confondre fabrique une
  // BOUCLE. Mesuré contre la passerelle de staging : une conversation dont on
  // n'est pas membre rend `403 — Access denied: you are not a member of this
  // conversation or it no longer exists`. Traiter ce refus en session expirée
  // renvoyait vers `/login`, où le lecteur se reconnectait pour être renvoyé au
  // même fil, refusé de la même façon — indéfiniment, avec ses identifiants
  // ressaisis à chaque tour.
  //
  //   401 → le JETON ne vaut plus. C'est une affaire de session : on renvoie
  //         se connecter.
  //   403 → le jeton vaut, mais pas pour CECI. Se reconnecter n'y changerait
  //         rien. Et la réponse est « introuvable » plutôt qu'« interdit » :
  //         dire « ce fil existe, mais pas pour vous » répond à qui balaie des
  //         identifiants — c'est le patron `resolveConsumptionTarget` du § 5.1,
  //         déjà appliqué aux jetons de lien.
  if (detail.status === 401 || liste.status === 401) return { genre: 'session-expiree' };
  if ([detail.status, liste.status].some((statut) => statut === 403 || statut === 404)) {
    return { genre: 'introuvable' };
  }

  const enveloppeDetail = objet(await detail.json().catch(() => null));
  const enveloppeListe = objet(await liste.json().catch(() => null));
  const conversation = objet(enveloppeDetail?.data);
  if (enveloppeDetail?.success !== true || conversation === null) return { genre: 'panne' };
  if (enveloppeListe?.success !== true || !Array.isArray(enveloppeListe.data)) {
    return { genre: 'panne' };
  }

  const messages = enveloppeListe.data
    .map((brut) => objet(brut))
    .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
    .map((brut) => message(brut, moi, langues))
    .filter((m): m is Message => m !== null);

  return {
    genre: 'fil',
    fil: {
      titre: chaine(conversation.title) ?? chaine(conversation.identifier) ?? 'Conversation',
      membres: typeof conversation.memberCount === 'number' ? conversation.memberCount : 0,
      // La passerelle sert du plus RÉCENT au plus ancien ; un fil se lit dans
      // l'autre sens.
      messages: [...messages].reverse(),
    },
  };
};

export type Envoi = { readonly genre: 'envoye' } | { readonly genre: 'refus'; readonly message: string };

const REFUS_ENVOI = 'Le message n’a pas pu être envoyé. Réessayez.';

export const envoie = async ({
  cle,
  jeton,
  texte,
  base,
  recuperer,
}: {
  readonly cle: string;
  readonly jeton: string;
  readonly texte: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Envoi> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}/api/v1/conversations/${encodeURIComponent(cle)}/messages`,
    jeton,
    recuperer,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: texte }),
    },
  );

  if (reponse === null) return { genre: 'refus', message: REFUS_ENVOI };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success === true) return { genre: 'envoye' };

  return { genre: 'refus', message: chaine(objet(enveloppe?.error)?.message) ?? REFUS_ENVOI };
};
