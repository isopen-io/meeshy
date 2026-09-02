/**
 * Les appels de la passerelle que `/l/:token` fait — et le SEUL endroit à
 * changer le jour où `GET /l/{token}` unifié sera monté (conception § 5.1).
 *
 * Deux régimes de dégradation y sont déclarés, comme le § 5.2 l'exige, plutôt
 * qu'improvisés dans la route :
 *
 *   • **Régime 1 (renommage pur)** — les trois chemins vivent en constantes.
 *     La bascule vers `/l/{token}`, `/social/*` ou `/links/:key` est un diff
 *     d'une ligne, ici, et l'appelant ne bouge pas.
 *   • **Régime 2 (fusion de routes)** — la forme rendue est déjà la forme
 *     CIBLE : `resoudreLien` rend une résolution, pas la charge de la
 *     passerelle. Le jour où `resolve` et le clic ne font plus qu'un appel,
 *     ces deux fonctions fusionnent sans que la route l'apprenne.
 *
 * Ce que ce module ne fait JAMAIS, et pourquoi :
 *
 *   • **Il ne jette pas.** Une passerelle injoignable est un fait de réseau,
 *     pas un refus (§ 7, « Erreur réseau ≠ 401 ») : `resoudreLien` le DIT en
 *     rendant `indisponible`, une valeur distincte de `clos`. Confondre les
 *     deux ferait afficher « ce lien a expiré » sur une coupure de tunnel —
 *     un mensonge que le lecteur ne peut pas contredire.
 *   • **Il ne distingue pas l'inconnu du fermé.** Un 404 et un lien désactivé
 *     rendent le même `clos`. C'est le patron `resolveConsumptionTarget`
 *     (§ 5.1) : un état distinct pour « ce jeton n'existe pas » est un oracle
 *     d'énumération offert à qui balaie l'espace des jetons.
 *   • **Il ne relaie pas ce qu'il lit.** `apercuDuLien` PROJETTE deux champs.
 *     La charge de `GET /anonymous/link/:identifier` sert l'identité complète
 *     du créateur (§ 5.1, ⚠️ fuite) ; filtrer chez le consommateur ne
 *     corrigerait rien — ici, la projection se fait AVANT que quoi que ce soit
 *     n'entre dans le HTML.
 *   • **Il n'attend pas indéfiniment.** Le § 8.3 vise 600 ms du TTFB à la 302 :
 *     une passerelle lente ne peut pas tenir un lecteur en otage, donc la
 *     lecture est bornée et l'expiration se lit comme une indisponibilité.
 */

import { apercuServi } from './invite';
import { baseDeLaPasserelle } from './passerelle';

const PREFIXE = '/api/v1';

const CHEMIN_RESOLUTION = (jeton: string): string =>
  `${PREFIXE}/tracking-links/${encodeURIComponent(jeton)}/resolve`;

const CHEMIN_CLIC = (jeton: string): string =>
  `${PREFIXE}/tracking-links/${encodeURIComponent(jeton)}/click`;

const CHEMIN_APERCU = (identifiant: string): string =>
  `${PREFIXE}/anonymous/link/${encodeURIComponent(identifiant)}`;

/** Le délai au-delà duquel une passerelle muette devient une indisponibilité. */
const DELAI_MS = 2500;

/** Ce que la route injecte pour être testable sans réseau. */
export type Recuperateur = (url: string, options?: RequestInit) => Promise<Response>;

/**
 * Les types de cible que la v3 sait ouvrir, plus `INCONNU` — parce que la
 * passerelle sert une chaîne libre et qu'un type qu'on ne connaît pas doit se
 * NOMMER plutôt que de se faire passer pour un autre.
 */
export type TypeDeCible =
  | 'POST'
  | 'REEL'
  | 'STORY'
  | 'STATUS'
  | 'CONVERSATION'
  | 'PROFILE'
  | 'EXTERNAL'
  | 'INCONNU';

export type CibleDuLien = {
  readonly genre: 'tracking' | 'conversation';
  readonly typeDeCible: TypeDeCible;
  readonly idDeCible: string | null;
  readonly urlOriginale: string | null;
};

/**
 * Ce que la passerelle DIT d'un lien fermé — et pourquoi ce variant porte enfin
 * une charge.
 *
 * `GET /tracking-links/:token/resolve` est la SEULE porte qui réponde aux deux
 * familles de jetons : `TrackingLinkService.resolveTarget` sert d'abord un
 * `TrackingLink` (story, réel, post, humeur, lien externe — c'est-à-dire tout le
 * § P0), puis retombe sur un `ConversationShareLink` (invitation). Son schéma
 * PUBLIC expose `isActive` ET `expiresAt` pour les deux
 * (`routes/tracking-links/creation.ts`).
 *
 * Ce variant les jetait. La conséquence n'était pas une donnée manquante mais un
 * écran MUET : l'écran clos relisait la cause sur
 * `GET /anonymous/link/:identifier`, qui ne connaît QUE le modèle
 * `ConversationShareLink` et rend 404 sur un jeton de tracking — donc « Ce lien
 * n'a pas pu être ouvert · Indéterminé » pour tout le contenu du rôle premier,
 * exactement la page que l'issue #4496 remplace. La donnée était déjà en main,
 * gratuite, et abandonnée une ligne avant d'être servie.
 */
export type Cloture = {
  readonly etat: 'clos';
  /** Le modèle qui porte le jeton, quand la passerelle le nomme — `null` sur un 404. */
  readonly genre: CibleDuLien['genre'] | null;
  /** L'échéance déclarée, en millisecondes — `null` quand aucune n'est fixée. */
  readonly echeance: number | null;
};

export type Resolution =
  | { readonly etat: 'servable'; readonly cible: CibleDuLien }
  | Cloture
  | { readonly etat: 'indisponible'; readonly raison: string };

/** Ce que le SERVEUR sait d'un clic. Le reste (écran, fuseau, empreinte) part plus tard, en `sendBeacon`. */
export type Clic = {
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly browser?: string;
  readonly os?: string;
  readonly device?: string;
  readonly language?: string;
  readonly languages?: string;
  readonly referrer?: string;
  readonly socialSource?: string;
  readonly utmClickSource?: string;
  readonly utmClickMedium?: string;
  readonly utmClickCampaign?: string;
  readonly utmClickTerm?: string;
  readonly utmClickContent?: string;
};

export type ApercuDeLien = {
  readonly nom: string;
  readonly description: string | null;
};

/**
 * POURQUOI un lien ne s'ouvre plus — et depuis QUELLE porte cette raison
 * descend.
 *
 * La cause n'est jamais inventée : elle est lue sur ce que la passerelle DIT.
 * Mais elle ne se lit pas au même endroit selon la famille du jeton, et c'est
 * tout le sujet.
 *
 * DEUX FAMILLES, UNE SEULE PORTE QUI RÉPOND AUX DEUX
 *
 * Un jeton `/l/:token` est soit un `TrackingLink` — story, réel, post, humeur,
 * lien externe, c'est-à-dire TOUT le contenu que le § P0 nomme —, soit un
 * `ConversationShareLink` (invitation). Ce sont deux MODÈLES disjoints
 * (`schema.prisma`), et `GET /anonymous/link/:identifier` n'en connaît qu'un :
 * il cherche par `linkId` `mshy_*` ou par `resolveShareLinkId`, puis rend 404
 * (`routes/anonymous.ts`). Lui demander la cause d'un lien de story, c'était
 * obtenir un 404 — donc `indeterminee` — pour la classe de liens que l'issue
 * #4496 sert en premier.
 *
 * `GET /tracking-links/:token/resolve` répond aux DEUX (`resolveTarget` sert le
 * `TrackingLink` d'abord, l'invitation ensuite) et expose publiquement
 * `isActive` et `expiresAt`. C'est donc de LUI que la cause descend, et de
 * l'aperçu seulement ce que lui seul sait :
 *
 *   • échéance passée ⇒ `expiration` — vrai des deux familles ;
 *   • fermé sans échéance échue ⇒ `desactivation` — vrai des deux familles ;
 *   • `LINK_MAX_USES` / `CONVERSATION_CLOSED` ⇒ `epuisement` /
 *     `conversation-terminee` — que seule la porte d'aperçu nomme, donc
 *     interrogée pour la seule famille où elle sait répondre.
 *
 * CE QUI RESTE SANS NOM, ET LA DIFFÉRENCE ENTRE LES DEUX FAÇONS DE NE RIEN DIRE
 *
 *   • `indeterminee` — la passerelle dit le lien CLOS mais ne nomme pas
 *     pourquoi (jeton inconnu, refus non répertorié). Le lien est fini.
 *   • `verification-impossible` — la passerelle ne dit RIEN de tel : elle est
 *     muette, ou elle sert encore ce lien. § 7, « erreur réseau ≠ refus » : on
 *     ne peut alors affirmer aucune fermeture, et c'est la SEULE situation où
 *     réessayer le lien mène ailleurs qu'à cet écran.
 */
export type CauseDeCloture =
  | 'expiration'
  | 'desactivation'
  | 'epuisement'
  | 'conversation-terminee'
  | 'verification-impossible'
  | 'indeterminee';

/** L'ordre est celui de l'écran : les quatre refus nommés, puis les deux absences de refus. */
export const CAUSES_DE_CLOTURE: readonly CauseDeCloture[] = [
  'expiration',
  'desactivation',
  'epuisement',
  'conversation-terminee',
  'verification-impossible',
  'indeterminee',
];

const TYPES: readonly TypeDeCible[] = [
  'POST',
  'REEL',
  'STORY',
  'STATUS',
  'CONVERSATION',
  'PROFILE',
  'EXTERNAL',
];

const texte = (valeur: unknown): string | null =>
  typeof valeur === 'string' && valeur.trim() !== '' ? valeur : null;

const champ = (objet: object, nom: string): unknown =>
  Object.getOwnPropertyDescriptor(objet, nom)?.value;

const objet = (valeur: unknown): object | null =>
  typeof valeur === 'object' && valeur !== null ? valeur : null;

const typeDeCible = (valeur: unknown): TypeDeCible => {
  const nom = texte(valeur)?.toUpperCase();
  return TYPES.find((connu) => connu === nom) ?? 'INCONNU';
};

/** Une date ISO servie par la passerelle, ou `null` — jamais un `NaN` qui se compare faux en silence. */
const instant = (valeur: unknown): number | null => {
  const brut = texte(valeur);
  if (brut === null) return null;
  const ms = Date.parse(brut);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Un jeton que la passerelle ne trouve pas — et le seul cas qui ne NOMME rien.
 *
 * Ce n'est pas une pudeur : c'est le patron `resolveConsumptionTarget` (§ 5.1).
 * Dire « expiré » d'un jeton inconnu répondrait « celui-là existait » à qui
 * balaie l'espace des jetons.
 */
const INTROUVABLE: Cloture = { etat: 'clos', genre: null, echeance: null };

/**
 * Les deux origines de la passerelle vivent dans `lib/api/passerelle.ts` —
 * le site le plus bas de la pile, que `lib/api/invite.ts` lit aussi. Elles
 * sont ré-exportées ici pour que les importateurs de ce module n'aient rien à
 * apprendre.
 */
export { baseDeLaPasserelle, baseDeLaPasserellePublique } from './passerelle';

const lis = async (reponse: Response): Promise<object | null> => {
  try {
    return objet(await reponse.json());
  } catch {
    return null;
  }
};

const recupere = async (
  url: string,
  options: RequestInit,
  recuperer: Recuperateur | undefined,
): Promise<Response> =>
  (recuperer ?? ((u, o) => fetch(u, o)))(url, {
    ...options,
    // L'état d'un lien change sans prévenir — désactivé par son auteur, épuisé,
    // expiré. Next met en cache les `fetch` de serveur par défaut selon la
    // route ; l'écrire ici rend la règle indépendante de la configuration de
    // rendu, et un lien fermé ne peut pas continuer d'ouvrir.
    cache: 'no-store',
    signal: AbortSignal.timeout(DELAI_MS),
  });

export const resoudreLien = async ({
  token,
  base,
  recuperer,
}: {
  readonly token: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Resolution> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_RESOLUTION(token)}`;

  const reponse = await recupere(url, { headers: { accept: 'application/json' } }, recuperer).catch(
    (erreur: unknown) => (erreur instanceof Error ? erreur : new Error(String(erreur))),
  );

  if (reponse instanceof Error) return { etat: 'indisponible', raison: reponse.message };
  if (reponse.status === 404 || reponse.status === 410) return INTROUVABLE;
  if (!reponse.ok) return { etat: 'indisponible', raison: `HTTP ${reponse.status}` };

  const corps = await lis(reponse);
  const donnee = corps === null ? null : objet(champ(corps, 'data'));
  if (donnee === null) return { etat: 'indisponible', raison: 'réponse illisible' };

  const genre = champ(donnee, 'kind') === 'conversation' ? 'conversation' : 'tracking';

  if (champ(donnee, 'isActive') !== true) {
    return { etat: 'clos', genre, echeance: instant(champ(donnee, 'expiresAt')) };
  }

  return {
    etat: 'servable',
    cible: {
      genre,
      typeDeCible: typeDeCible(champ(donnee, 'targetType')),
      idDeCible: texte(champ(donnee, 'targetId')),
      urlOriginale: texte(champ(donnee, 'originalUrl')),
    },
  };
};

/**
 * Le clic. Il part APRÈS la réponse (`after()` dans la route), donc personne ne
 * l'attend et rien ne dépend de lui : il avale ses pannes, et son verdict n'est
 * rendu que pour être testable.
 */
export const enregistreClic = async ({
  token,
  clic,
  base,
  recuperer,
}: {
  readonly token: string;
  readonly clic: Clic;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<boolean> => {
  const corps = Object.fromEntries(
    Object.entries(clic).filter(([, valeur]) => texte(valeur) !== null),
  );

  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_CLIC(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(corps),
    },
    recuperer,
  ).catch(() => null);

  return reponse !== null && reponse.ok;
};

/**
 * L'aperçu d'un lien de conversation — DEUX champs, projetés ici.
 *
 * Il n'est demandé que pour composer l'aperçu servi à un ROBOT : un humain est
 * redirigé sans que rien de plus ne soit lu, donc son chemin garde son unique
 * appel amont.
 */
export const apercuDuLien = async ({
  identifiant,
  base,
  recuperer,
}: {
  readonly identifiant: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ApercuDeLien | null> => {
  const reponse = await recupere(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_APERCU(identifiant)}`,
    { headers: { accept: 'application/json' } },
    recuperer,
  ).catch(() => null);

  if (reponse === null || !reponse.ok) return null;

  // UN seul lecteur de la charge de `GET /anonymous/link/:identifier` dans la
  // v3 : celui de la porte de l'invité. Ici on n'en garde que ce qu'une carte
  // d'aperçu montre — le nom et la description —, et un aperçu qui ne porte
  // pas encore de `linkId` (version plus ancienne, réponse tronquée) sert
  // quand même son nom : une carte n'a pas besoin de nommer une place.
  const servi = apercuServi(champ((await lis(reponse)) ?? {}, 'data'));
  return servi === null ? null : { nom: servi.nom, description: servi.description };
};

/**
 * Deux vocabulaires pour un même état, mesurés dans la passerelle :
 * `LINK_INACTIVE` (aperçu) et `LINK_DEACTIVATED` (refresh) ; `LINK_MAX_USES`
 * (aperçu) et `LINK_EXHAUSTED` (admission). L'écran n'en connaît qu'UN — c'est
 * ici, au point d'entrée, que la traduction se fait, jamais dans la copie.
 */
const CAUSE_PAR_CODE: Readonly<Record<string, CauseDeCloture>> = {
  LINK_EXPIRED: 'expiration',
  LINK_INACTIVE: 'desactivation',
  LINK_DEACTIVATED: 'desactivation',
  LINK_MAX_USES: 'epuisement',
  LINK_EXHAUSTED: 'epuisement',
  CONVERSATION_CLOSED: 'conversation-terminee',
};

/** `sendError` pose le code dans `error` ; `code` reste son champ d'appoint. */
const codeDeRefus = (corps: object): string | null =>
  texte(champ(corps, 'error')) ?? texte(champ(corps, 'code'));

/**
 * Le refus NOMMÉ, quand une porte le nomme — `null` partout ailleurs.
 *
 * Elle n'est interrogée que pour un lien de CONVERSATION : c'est la seule
 * famille dont elle connaisse le modèle, et la seule qui apporte
 * `LINK_MAX_USES` et `CONVERSATION_CLOSED`.
 */
const refusNomme = async (parametres: {
  readonly token: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<CauseDeCloture | null> => {
  const reponse = await recupere(
    `${parametres.base ?? baseDeLaPasserelle()}${CHEMIN_APERCU(parametres.token)}`,
    { headers: { accept: 'application/json' } },
    parametres.recuperer,
  ).catch(() => null);

  if (reponse === null || reponse.status !== 410) return null;

  const corps = await lis(reponse);
  const code = corps === null ? null : codeDeRefus(corps);

  return (code === null ? undefined : CAUSE_PAR_CODE[code]) ?? null;
};

/** Ce que la résolution seule dit d'un lien fermé — vrai des DEUX familles. */
const causeParEcheance = ({ genre, echeance }: Cloture): CauseDeCloture => {
  if (echeance !== null && echeance <= Date.now()) return 'expiration';
  return genre === null ? 'indeterminee' : 'desactivation';
};

export const causeDeCloture = async ({
  token,
  base,
  recuperer,
}: {
  readonly token: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<CauseDeCloture> => {
  const resolution = await resoudreLien({ token, base, recuperer });

  if (resolution.etat !== 'clos') return 'verification-impossible';
  if (resolution.genre !== 'conversation') return causeParEcheance(resolution);

  return (await refusNomme({ token, base, recuperer })) ?? causeParEcheance(resolution);
};
