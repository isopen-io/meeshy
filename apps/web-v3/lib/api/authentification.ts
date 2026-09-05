import { baseDeLaPasserelle } from './links';
import { DELAI_DE_REPONSE_MS } from './passerelle';

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

/** Une SORTIE proposée par un refus — « Connectez-vous » sous un e-mail pris. */
export type Lien = {
  readonly libelle: string;
  readonly href: string;
};

/**
 * UN REFUS SAIT DÉSORMAIS DE QUOI IL PARLE.
 *
 * `champ` porte le nom du champ V3 (`courriel`, `telephone`, `motDePasse`,
 * `nomAffiche`) — jamais celui de la passerelle : c'est ce nom-là que la vue
 * connaît, et le traduire ici plutôt que dans la vue garde UNE table de
 * correspondance au lieu d'une par écran. `null` quand la passerelle ne nomme
 * rien : la vue rend alors l'alerte globale, et ne DEVINE pas un champ —
 * désigner le mauvais est pire que n'en désigner aucun.
 *
 * `recours` est la SUITE que le refus propose. Un seul refus en a une
 * aujourd'hui — un e-mail déjà pris veut dire « vous avez déjà un compte » —,
 * et elle voyage en donnée plutôt qu'en règle de vue : la vue ne saurait pas
 * qu'un refus sur `courriel` n'appelle « Connectez-vous » que lorsqu'il dit
 * « déjà pris », et pas lorsqu'il dit « adresse invalide ».
 */
export type Refus = {
  readonly message: string;
  readonly champ: string | null;
  readonly recours: Lien | null;
};

export type Issue =
  | { readonly genre: 'session'; readonly session: Session }
  | { readonly genre: 'deuxieme-facteur'; readonly etape: DeuxiemeFacteur }
  | ({ readonly genre: 'refus' } & Refus);

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
 * vient de faire. Les taire obligerait à deviner ce qui cloche.
 *
 * DEUX FORMES D'ENVELOPPE. `sendError` de la passerelle pose le texte humain à
 * la RACINE (`message`), et `error` y est une CHAÎNE (« Validation Error ») ;
 * d'autres routes rendent `error` en objet portant son `message`. Lire les deux
 * n'est pas de la superstition : c'est le prix d'un `objet()` qui rend `null`
 * sur une chaîne, donc d'une lecture qui ne se trompe jamais de forme.
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
 * lecteur reçoit une phrase unique, et aucun champ n'est désigné — l'écran n'a
 * pas à dire lequel des deux est faux. `relayer` est celle de l'INSCRIPTION :
 * « ce pseudo est pris » décrit la saisie qu'on vient de faire, pas un compte
 * existant, et le champ qu'elle décrit se nomme.
 */
type Politique = (corps: Readonly<Record<string, unknown>> | null) => Refus;

const taire =
  (message: string): Politique =>
  () => ({ message, champ: null, recours: null });

/**
 * LE NOM DU CHAMP, D'UN VOCABULAIRE À L'AUTRE — LE SEUL SITE.
 *
 * La passerelle nomme ses champs (`email`, `phoneNumber`, `displayName`) ;
 * l'écran nomme les siens (`courriel`, `telephone`, `nomAffiche`). Le refus
 * arrive avec le premier vocabulaire et doit se poser sous le second. Écrire
 * cette traduction dans la vue la ferait recommencer à chaque écran, et
 * `username` — un champ que l'écran NE DEMANDE PLUS — n'aurait nulle part où
 * atterrir : il se pose sur `nomAffiche`, dont la passerelle le DÉRIVE.
 *
 * `phoneCountryCode` retombe aussi sur `telephone` : le lecteur a choisi un
 * pays dans le sélecteur COLLÉ au numéro, et rien d'autre sur l'écran ne
 * pourrait porter ce refus.
 */
const CHAMP_PAR_NOM: Readonly<Record<string, string>> = {
  displayName: 'nomAffiche',
  username: 'nomAffiche',
  email: 'courriel',
  phoneNumber: 'telephone',
  phoneCountryCode: 'telephone',
  password: 'motDePasse',
};

/**
 * LE CODE DE REFUS, QUAND IL DIT PLUS QUE LE CHAMP.
 *
 * Redondante avec `CHAMP_PAR_NOM` sur le contrat d'aujourd'hui — la passerelle
 * envoie `field` avec chacun de ces codes. Elle n'est pas décorative pour
 * autant : `field` est un champ de service qu'un refactor peut laisser tomber
 * sans que rien ne casse, et le jour où il tombe, un refus SANS champ
 * remonterait en alerte globale — une régression muette. Le code, lui, est ce
 * que la route promet.
 */
const CHAMP_PAR_CODE: Readonly<Record<string, string>> = {
  EMAIL_TAKEN: 'courriel',
  USERNAME_TAKEN: 'nomAffiche',
  PHONE_INVALID: 'telephone',
};

const RECOURS_DE_CONNEXION: Lien = { libelle: 'Connectez-vous', href: '/login' };

/**
 * `body/password` → `password`. Les chemins d'une violation sont ceux du
 * validateur (`/email`, `body/phoneNumber`) : seul le dernier segment nomme un
 * champ, et le préfixe dit de quelle partie de la requête il vient.
 *
 * DEUX CLÉS, PARCE QUE LA PASSERELLE REFUSE À DEUX ENDROITS. Le gestionnaire
 * de `/auth/register` rend ses violations en `violations[].path` ; mais le
 * corps d'une requête est d'abord jugé par le SCHÉMA, avant que le
 * gestionnaire ne s'exécute, et ce refus-là remonte du gestionnaire d'erreurs
 * de Fastify sous la forme `details[].field`
 * (`services/gateway/src/utils/schema-validation-error.ts`). C'est le plus
 * FRÉQUENT des deux — un mot de passe trop court n'atteint jamais le
 * gestionnaire —, et le lire dans le même site est ce qui évite qu'un refus de
 * schéma retombe en alerte globale pendant qu'un refus de service se pose
 * proprement sous son champ.
 */
const champDeLaViolation = (violation: unknown): string | undefined => {
  const declaree = objet(violation);
  const chemin = chaine(declaree?.path) ?? chaine(declaree?.field);
  if (chemin === null) return undefined;
  return CHAMP_PAR_NOM[chemin.split('/').filter((segment) => segment !== '').at(-1) ?? ''];
};

const listeDeViolations = (corps: Readonly<Record<string, unknown>> | null): readonly unknown[] => [
  ...(Array.isArray(corps?.violations) ? corps.violations : []),
  ...(Array.isArray(corps?.details) ? corps.details : []),
];

const champEnDefaut = (corps: Readonly<Record<string, unknown>> | null): string | null => {
  const parLeNom = CHAMP_PAR_NOM[chaine(corps?.field) ?? ''];
  if (parLeNom !== undefined) return parLeNom;

  const parLeCode = CHAMP_PAR_CODE[chaine(corps?.code) ?? ''];
  if (parLeCode !== undefined) return parLeCode;

  return listeDeViolations(corps)
    .map(champDeLaViolation)
    .find((champ) => champ !== undefined) ?? null;
};

/**
 * UN NUMÉRO DÉJÀ RATTACHÉ N'EST PAS UNE ERREUR — la passerelle rend 200,
 * `success: true`, et ne crée AUCUN compte. Le lire comme un succès ouvrirait
 * une session qui n'existe pas ; le lire comme une panne cacherait la seule
 * chose que le lecteur doit apprendre : le champ qui bloque, et le fait qu'il
 * peut continuer SANS lui.
 *
 * La sortie est dans la phrase plutôt qu'en `recours` : « ou connectez-vous »
 * s'y lit d'un trait, et un lien répétant le mot juste à côté ferait deux fois
 * la même offre.
 */
const CONFLIT_DE_NUMERO =
  'Ce numéro est déjà rattaché à un compte. Laissez-le vide pour continuer, ou connectez-vous.';

const relayer =
  (defaut: string): Politique =>
  (corps) => {
    if (objet(corps?.data)?.phoneOwnershipConflict === true) {
      return { message: CONFLIT_DE_NUMERO, champ: 'telephone', recours: null };
    }
    return {
      message: messageDuServeur(corps) ?? defaut,
      champ: champEnDefaut(corps),
      recours: chaine(corps?.code) === 'EMAIL_TAKEN' ? RECOURS_DE_CONNEXION : null,
    };
  };

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

  return { genre: 'refus', ...refus(corps) };
};

const appelle = async (
  chemin: string,
  charge: Readonly<Record<string, unknown>>,
  refus: Politique,
  parametres: { readonly base?: string; readonly recuperer?: Recuperateur },
): Promise<Issue> => {
  const url = `${parametres.base ?? baseDeLaPasserelle()}${chemin}`;

  const reponse = await poste(url, charge, parametres.recuperer).catch(() => null);
  if (reponse === null) return { genre: 'refus', message: INDISPONIBLE, champ: null, recours: null };

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
 * L'INSCRIPTION — CINQ RÉPONSES, ET RIEN QUE CE QUE LA PASSERELLE NE PEUT PAS
 * SAVOIR.
 *
 * `username`, `firstName` et `lastName` NE PARTENT PLUS. La passerelle les
 * DÉRIVE du nom affiché, et les envoyer ferait de ce fichier le second site de
 * cette dérivation — le premier à diverger, et celui dont l'écart se verrait
 * chez l'utilisateur sous la forme d'un pseudo qui n'est pas celui qu'on lui
 * annonce ailleurs. Ce que la passerelle sait faire, elle le fait seule.
 *
 * `systemLanguage` PART, lui, et c'est neuf : l'écran DEMANDE la langue de
 * lecture (pré-remplie depuis `Accept-Language`, rang 4 du Prisme). La laisser
 * au défaut du schéma servirait « fr » à un lecteur qui vient de choisir
 * « Yorùbá » dans une pastille qu'on lui a montrée. `regionalLanguage` ne part
 * pas : l'écran n'en demande qu'UNE, et en inventer une seconde en douce
 * serait décider pour le lecteur.
 *
 * LE NUMÉRO PART TEL QU'IL A ÉTÉ SAISI — « 0801 234 5678 » —, accompagné du
 * pays choisi. Le normaliser ici en E.164 demanderait la même bibliothèque que
 * la passerelle, donc DEUX normalisations pour un seul numéro, dont la seconde
 * serait la seule à décider. Le vide n'envoie RIEN plutôt qu'une chaîne vide :
 * un champ absent est une réponse (« je n'en donne pas »), un champ vide est
 * une valeur à valider.
 */
export const inscription = (parametres: {
  readonly nomAffiche: string;
  readonly courriel: string;
  readonly motDePasse: string;
  readonly telephone: string;
  readonly pays: string;
  readonly langue: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Issue> =>
  appelle(
    CHEMIN_INSCRIPTION,
    {
      displayName: parametres.nomAffiche,
      email: parametres.courriel,
      password: parametres.motDePasse,
      ...(parametres.telephone === ''
        ? {}
        : { phoneNumber: parametres.telephone, phoneCountryCode: parametres.pays }),
      systemLanguage: parametres.langue,
    },
    relayer('La création du compte a échoué.'),
    parametres,
  );

/**
 * LA DÉCONNEXION (#5095) — `POST /api/v1/auth/logout`
 * (`services/gateway/src/routes/auth/login.ts:350`), en `fastify.authenticate`
 * : un `Authorization: Bearer` est requis, `x-session-token` optionnel (posé
 * seulement quand le formulaire le porte — il invalide LA session ET coupe le
 * socket de CET appareil, #4213).
 *
 * BEST-EFFORT, DÉLIBÉRÉMENT : le résultat n'est jamais lu. `app/deconnexion/route.ts`
 * appelle cette fonction dans un `try/catch` qui l'avale — une panne, un 401
 * ou un délai dépassé ne retiennent jamais la sortie (même raisonnement que le
 * gateway lui-même sur `updateOnlineStatus`, `login.ts:384-391` : une
 * déconnexion qui échoue est pire qu'un socket laissé ouvert).
 */
export const deconnexion = ({
  jeton,
  jetonDeSession,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly jetonDeSession?: string | null;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Response> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(`${base ?? baseDeLaPasserelle()}/api/v1/auth/logout`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${jeton}`,
      ...(jetonDeSession ? { 'x-session-token': jetonDeSession } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_DE_REPONSE_MS),
  });
