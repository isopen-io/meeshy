import { baseDeLaPasserelle } from './links';

/**
 * LES DEUX APPELS D'AUTHENTIFICATION QUE LA V3 PASSE À LA PASSERELLE.
 *
 * Ils vivent ici, à côté de `links.ts`, parce qu'ils partagent la seule chose
 * qui compte : `baseDeLaPasserelle()`, lue à CHAQUE appel et jamais au
 * chargement du module — `next build` évalue les modules serveur, et une base
 * figée à la construction serait celle de l'image, pas celle du déploiement.
 *
 * CE QUE LE SERVEUR REND, ET RIEN DE PLUS. Le contrat est celui de
 * `services/gateway/src/routes/auth/login.ts`, servi par `sendSuccess()` :
 * `{ success, data: { user, token, sessionToken?, expiresIn? } }`. Le second
 * facteur a sa propre forme (`data.requires2FA`), et c'est une ISSUE distincte
 * — pas une erreur : l'identifiant et le mot de passe étaient bons.
 *
 * `utilisateur` reste OPAQUE. La v3 n'en lit que `id` et `role`, pour le cookie
 * de session ; tout le reste est recopié tel quel dans `meeshy_user_data`, que
 * l'application legacy relit en entier. En typer les champs ici en ferait une
 * jumelle du modèle `User`, qui divergerait au premier champ ajouté — et la
 * divergence se verrait chez l'utilisateur, sous la forme d'un profil amputé.
 */

export type Session = {
  readonly jeton: string;
  readonly jetonDeSession: string | null;
  readonly utilisateur: Readonly<Record<string, unknown>>;
};

/**
 * Ce que l'écran de vérification du legacy (`/auth/verify-2fa`) LIT dans
 * `sessionStorage`. Trois valeurs, pas une : ce sont ses clés
 * `SESSION_STORAGE_KEYS.TWO_FACTOR_*`, et les servir toutes est ce qui rend le
 * parcours complet plutôt qu'annoncé.
 */
export type DeuxiemeFacteur = {
  readonly jetonTemporaire: string;
  readonly identifiantUtilisateur: string;
  readonly pseudonyme: string;
};

export type Issue =
  | { readonly genre: 'session'; readonly session: Session }
  | { readonly genre: 'deuxieme-facteur'; readonly etape: DeuxiemeFacteur }
  | { readonly genre: 'refus'; readonly message: string };

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

const DELAI_MS = 8000;

const CHEMIN_CONNEXION = '/api/v1/auth/login';
const CHEMIN_INSCRIPTION = '/api/v1/auth/register';

/**
 * Le seul message qu'un refus rend, quelle que soit sa cause.
 *
 * La passerelle distingue « utilisateur inconnu » de « mot de passe faux » ;
 * les REPORTER distinguerait pour un attaquant qui balaie des identifiants.
 * Une page de connexion dit toujours la même chose, et c'est la seule
 * formulation qui ne renseigne personne.
 */
const REFUS = 'Identifiant ou mot de passe incorrect.';

const INDISPONIBLE =
  'Le service d’authentification n’a pas répondu. Réessayez dans un instant.';

const objet = (valeur: unknown): Readonly<Record<string, unknown>> | null =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur)
    ? (valeur as Readonly<Record<string, unknown>>)
    : null;

const chaine = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur !== '' ? valeur : null;

/**
 * Le message d'un refus d'INSCRIPTION, lui, est rendu au lecteur.
 *
 * C'est la différence de fond avec la connexion : « ce pseudo est pris »,
 * « cet e-mail est invalide », « ce mot de passe est trop court » ne
 * renseignent personne sur un compte EXISTANT — ils décrivent la saisie qu'on
 * vient de faire. Les taire obligerait à deviner ce qui cloche, sur un
 * formulaire de cinq champs.
 */
const messageDuServeur = (corps: Readonly<Record<string, unknown>> | null): string | null => {
  const erreur = objet(corps?.error);
  return chaine(erreur?.message) ?? chaine(corps?.message);
};

const lis = async (reponse: Response): Promise<Readonly<Record<string, unknown>> | null> => {
  try {
    return objet(await reponse.json());
  } catch {
    return null;
  }
};

const poste = async (
  url: string,
  charge: Readonly<Record<string, unknown>>,
  recuperer: Recuperateur | undefined,
): Promise<Response> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(charge),
    // Une réponse d'authentification ne se met JAMAIS en cache — ni par Next,
    // ni par un intermédiaire. Elle porte un jeton porteur.
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  });

/**
 * COMMENT UN REFUS SE DIT — et c'est un CHOIX PAR ROUTE, jamais un défaut.
 *
 * Il l'a d'abord été. `issueDeLaReponse` préférait le message du serveur et ne
 * retombait sur le nôtre qu'à défaut : la connexion relayait donc « Identifiants
 * invalides » — mesuré contre la passerelle de staging —, c'est-à-dire
 * exactement ce que le commentaire de `REFUS` disait ne jamais faire. Le témoin
 * ne l'attrapait pas : sa réponse simulée ne portait AUCUN message, donc les
 * deux politiques y rendaient le même verdict.
 *
 * `taire` est la politique de la CONNEXION : quoi que le serveur dise, le
 * lecteur reçoit une phrase unique. `relayer` est celle de l'INSCRIPTION : « ce
 * pseudo est pris » décrit la saisie qu'on vient de faire, pas un compte
 * existant.
 */
type Politique = (corps: Readonly<Record<string, unknown>> | null) => string;

const taire =
  (message: string): Politique =>
  () =>
    message;

const relayer =
  (defaut: string): Politique =>
  (corps) =>
    messageDuServeur(corps) ?? defaut;

const issueDeLaReponse = (
  corps: Readonly<Record<string, unknown>> | null,
  refus: Politique,
): Issue => {
  const donnees = objet(corps?.data);

  if (corps?.success === true && donnees?.requires2FA === true) {
    const utilisateurEnAttente = objet(donnees?.user);
    return {
      genre: 'deuxieme-facteur',
      etape: {
        // Les mêmes replis que `login-form.tsx` — le legacy écrit `''` plutôt
        // que d'omettre la clé, et son écran distingue « absente » de « vide ».
        jetonTemporaire: chaine(donnees?.twoFactorToken) ?? '',
        identifiantUtilisateur: chaine(utilisateurEnAttente?.id) ?? '',
        pseudonyme: chaine(utilisateurEnAttente?.username) ?? '',
      },
    };
  }

  const jeton = chaine(donnees?.token);
  const utilisateur = objet(donnees?.user);

  if (corps?.success === true && jeton !== null && utilisateur !== null) {
    return {
      genre: 'session',
      session: {
        jeton,
        jetonDeSession: chaine(donnees?.sessionToken),
        utilisateur,
      },
    };
  }

  return { genre: 'refus', message: refus(corps) };
};

const appelle = async (
  chemin: string,
  charge: Readonly<Record<string, unknown>>,
  refus: Politique,
  parametres: { readonly base?: string; readonly recuperer?: Recuperateur },
): Promise<Issue> => {
  const url = `${parametres.base ?? baseDeLaPasserelle()}${chemin}`;

  const reponse = await poste(url, charge, parametres.recuperer).catch(() => null);
  if (reponse === null) return { genre: 'refus', message: INDISPONIBLE };

  return issueDeLaReponse(await lis(reponse), refus);
};

export const connexion = (parametres: {
  readonly identifiant: string;
  readonly motDePasse: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> =>
  appelle(
    CHEMIN_CONNEXION,
    { username: parametres.identifiant, password: parametres.motDePasse },
    taire(REFUS),
    parametres,
  );

/**
 * L'INSCRIPTION. `systemLanguage` et `regionalLanguage` sont posés, et ne sont
 * pas demandés : le schéma de la passerelle leur donne déjà `'fr'` par défaut,
 * et la v3 ne sert aujourd'hui qu'en français (`DOCUMENT_LANGUAGE`). Les
 * envoyer explicitement ferait de ce fichier le SECOND site de ce défaut ; les
 * omettre laisse la passerelle décider, ce qu'elle sait faire.
 *
 * `phoneNumber` et `phoneCountryCode` sont facultatifs au schéma et ne sont pas
 * demandés non plus : un champ de plus sur le chemin nominal se paie chez
 * l'utilisateur (dimension 7), et le numéro se renseigne aux réglages.
 */
export const inscription = (parametres: {
  readonly prenom: string;
  readonly nom: string;
  readonly identifiant: string;
  readonly courriel: string;
  readonly motDePasse: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> =>
  appelle(
    CHEMIN_INSCRIPTION,
    {
      firstName: parametres.prenom,
      lastName: parametres.nom,
      username: parametres.identifiant,
      email: parametres.courriel,
      password: parametres.motDePasse,
    },
    relayer('La création du compte a échoué.'),
    parametres,
  );
