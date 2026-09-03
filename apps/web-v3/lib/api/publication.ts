import { resolvePrismTranslation } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

import { urlDePiece } from './fil';
import { genreDeMime, type GenreDePiece } from './formes';
import { chaine, instant, nombre, objet } from './lecture';
import { baseDeLaPasserelle, DELAI_DE_REPONSE_MS } from './passerelle';

/**
 * CE QU'UNE PUBLICATION EST, LUE PAR LA V3 — la story d'abord (issue #4895),
 * les commentaires et le post ensuite, au même endroit et par les mêmes
 * primitives.
 *
 * LA DESCENTE N'EST PAS RÉÉCRITE ICI, exactement comme dans `lib/api/fil.ts` :
 * `resolvePrismTranslation` (`@meeshy/shared`) est le site UNIQUE de la règle
 * (`CLAUDE.md` § « La descente elle-même est UNE fonction »). Ce module n'adapte
 * qu'une FORME — la carte des traductions d'un `Post` est un
 * `Record<code, { text }>` (`packages/shared/prisma/schema.prisma:3130-3141`)
 * là où celle d'un `Message` est un TABLEAU `{ language, content }[]` —, et
 * l'adaptateur des tableaux (`buildTranslationRecord`) ne sait pas lire une
 * carte. Aucun ordre, aucune normalisation, aucune règle de rang n'est recopié.
 *
 * LES DEUX PORTES DE LA PASSERELLE, ET CE QU'ELLES EXIGENT :
 *
 *   • `GET /api/v1/posts/:postId` — `preValidation: [requiredAuth]`
 *     (`services/gateway/src/routes/posts/core.ts:460-461`) : la story n'est
 *     servie qu'à un compte. La v3 s'y CONFORME (décision du porteur,
 *     2026-09-02) : le visiteur sans session reçoit une invitation, et rien
 *     du contenu ne part avant sa connexion. Ouvrir la route est une décision
 *     produit, pas un travail de la v3 ;
 *   • `GET /api/v1/social/posts?scope=stories` — le VOISINAGE, c'est-à-dire les
 *     stories visibles du lecteur (`routes/posts/feed.ts:740`, `optionalAuth`
 *     avec refus 401 sur ce scope : « les neuf scopes restants exigent un
 *     compte enregistré »). C'est la SEULE porte qui rend des stories : le
 *     scope `author` (`PostFeedService.getUserPosts`) filtre
 *     `type: { in: [POST, REEL] }` et n'en rend jamais aucune.
 *
 * ET CE QU'ELLES NE JUGENT PAS. `getPostById` ne filtre PAS l'expiration : le
 * balayeur (`ExpiredStoriesCleanupService`) ne pose `deletedAt` qu'après la
 * fenêtre d'archive de l'auteur, et `PostFeedService.getStories` dit noir sur
 * blanc que « le client garde donc bien son propre filtre d'expiry ; entre
 * l'échéance et le masquage, il est le SEUL à filtrer ». La v3 filtre donc, et
 * son refus est le MÊME que celui d'une story absente (§ 5.1 : jamais de 403,
 * il confirmerait l'existence).
 */

export type Recuperateur = (url: string, options: RequestInit) => Promise<Response>;

export type MediaDeStory = {
  readonly url: string;
  readonly genre: GenreDePiece;
  readonly alt: string | null;
  readonly largeur: number | null;
  readonly hauteur: number | null;
};

export type Story = {
  readonly id: string;
  readonly auteur: string;
  readonly auteurId: string | null;
  readonly publieeA: string | null;
  readonly expireA: string | null;
  /** Le texte SERVI — celui que le Prisme a élu, ou l'original quand il n'élit rien. */
  readonly texte: string;
  readonly texteOriginal: string;
  /** La langue SERVIE quand ce n'est pas l'originale — `null` sinon (§ Prisme, règle 1). */
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  /**
   * Les langues dans lesquelles cette story se LIT : celle d'origine et celles
   * dont la traduction porte un texte. C'est ce que la puce du Prisme offre —
   * jamais une liste de langues supportées, qui promettrait des textes absents.
   */
  readonly languesOffertes: readonly string[];
  readonly medias: readonly MediaDeStory[];
  readonly aimee: boolean;
};

export type Voisine = {
  readonly id: string;
  readonly auteurId: string | null;
  readonly publieeA: string | null;
};

export type Segment = { readonly id: string; readonly courant: boolean };

export type Voisinage = {
  /** Les stories de CET auteur, de la plus ancienne à la plus récente — les barres du haut. */
  readonly segments: readonly Segment[];
  readonly rang: number;
  readonly precedente: string | null;
  readonly suivante: string | null;
};

const CHEMIN_DES_POSTS = '/api/v1/posts';
/** Le plafond de `SocialPostsQuerySchema` sur ce scope (`validatePagination`, `maxLimit: 50`). */
const CHEMIN_DES_STORIES = '/api/v1/social/posts?scope=stories&limit=50';

const DELAI_MS = DELAI_DE_REPONSE_MS;

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

/**
 * La carte `code → texte` d'un post, dépouillée de la forme que Prisma sert.
 * Une entrée sans texte n'existe pas : la servir ferait une langue OFFERTE qui
 * rend une story vide.
 */
const traductions = (brut: unknown): Readonly<Record<string, string>> => {
  const carte = objet(brut);
  if (carte === null) return {};
  return Object.entries(carte).reduce<Record<string, string>>((acc, [code, entree]) => {
    const texte = chaine(objet(entree)?.text);
    if (texte !== null) acc[code] = texte;
    return acc;
  }, {});
};

const media = (brut: unknown, origine: string): MediaDeStory | null => {
  const piece = objet(brut);
  const servie = chaine(piece?.fileUrl);
  if (piece === null || servie === null) return null;
  return {
    url: urlDePiece(servie, origine),
    genre: genreDeMime(chaine(piece.mimeType)),
    alt: chaine(piece.alt) ?? chaine(piece.caption),
    largeur: nombre(piece.width),
    hauteur: nombre(piece.height),
  };
};

/**
 * LA LANGUE SERVIE, et les DEUX façons de la choisir.
 *
 * Sans demande explicite, le Prisme ORDONNÉ du lecteur décide (§ 5.4 : jamais
 * le rang 1 seul). Avec `?lang=xx` — la « variante de partage délibéré » du
 * § 5.4, et l'EFFET que le critère de fin demande à la puce de traduction —,
 * la demande l'emporte : c'est un geste, pas une préférence. Une langue
 * demandée que rien ne traduit retombe sur le Prisme plutôt que de refuser :
 * une adresse tapée à la main ne casse pas une lecture.
 */
const servie = ({
  carte,
  langueOriginale,
  langues,
  langueDemandee,
}: {
  readonly carte: Readonly<Record<string, string>>;
  readonly langueOriginale: string | null;
  readonly langues: readonly string[];
  readonly langueDemandee: string | null;
}): { readonly language: string; readonly text: string } | null => {
  const descente = (preferredLanguages: readonly string[]): { readonly language: string; readonly text: string } | null =>
    resolvePrismTranslation({ translations: carte, originalLanguage: langueOriginale, preferredLanguages });

  if (langueDemandee === null) return descente(langues);

  const demandee = descente([langueDemandee]);
  if (demandee !== null) return demandee;
  // Le résolveur rend `null` dans DEUX cas qu'il ne distingue pas : la langue
  // demandée est celle d'ORIGINE (l'original est ce qu'il faut servir), ou
  // rien ne la porte (une adresse tapée à la main, qui ne doit pas casser une
  // lecture — le Prisme reprend la main). La canonicalisation est celle du
  // résolveur lui-même, jamais une comparaison de chaînes réécrite.
  const memeQueLOrigine =
    langueOriginale !== null && normalizeLanguageForDedup(langueDemandee) === normalizeLanguageForDedup(langueOriginale);
  return memeQueLOrigine ? null : descente(langues);
};

/**
 * LA STORY, LUE. Rend `null` pour TOUT ce qui ne se sert pas — pas une story,
 * supprimée, échue —, et l'appelant en fait la MÊME réponse qu'une story
 * absente : distinguer révélerait l'existence du contenu (§ 5.1).
 */
export const storyLue = ({
  brut,
  langues,
  langueDemandee,
  maintenant,
  origine,
}: {
  readonly brut: Readonly<Record<string, unknown>>;
  readonly langues: readonly string[];
  readonly langueDemandee: string | null;
  readonly maintenant: number;
  readonly origine: string;
}): Story | null => {
  const id = chaine(brut.id);
  if (id === null || chaine(brut.type) !== 'STORY') return null;
  if (instant(brut.deletedAt) !== null) return null;

  const expireA = instant(brut.expiresAt);
  if (expireA !== null && Date.parse(expireA) <= maintenant) return null;

  const auteur = objet(brut.author);
  const carte = traductions(brut.translations);
  const langueOriginale = chaine(brut.originalLanguage);
  const texteOriginal = chaine(brut.content) ?? '';
  const elue = servie({ carte, langueOriginale, langues, langueDemandee });

  return {
    id,
    auteur: chaine(auteur?.displayName) ?? chaine(auteur?.username) ?? 'Quelqu’un',
    auteurId: chaine(brut.authorId) ?? chaine(auteur?.id),
    publieeA: instant(brut.createdAt),
    expireA,
    texte: elue?.text ?? texteOriginal,
    texteOriginal,
    langueServie: elue?.language ?? null,
    langueOriginale,
    languesOffertes: [...new Set([...(langueOriginale === null ? [] : [langueOriginale]), ...Object.keys(carte)])],
    medias: Array.isArray(brut.media)
      ? brut.media.map((piece) => media(piece, origine)).filter((piece): piece is MediaDeStory => piece !== null)
      : [],
    aimee: brut.isLikedByMe === true,
  };
};

export type ChargeDeStory =
  | { readonly genre: 'charge'; readonly brut: Readonly<Record<string, unknown>> }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

/**
 * La charge BRUTE, sans prisme : les langues du lecteur viennent de
 * `/auth/me`, et attendre ce nom pour DEMANDER la story ferait payer deux
 * allers-retours à un écran qui n'en a qu'un à dépenser. La porte lance les
 * trois appels ensemble et résout après.
 */
export const chargeDeLaStory = async ({
  id,
  jeton,
  base,
  recuperer,
}: {
  readonly id: string;
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<ChargeDeStory> => {
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_DES_POSTS}/${encodeURIComponent(id)}`, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (reponse.status === 403 || reponse.status === 404) return { genre: 'introuvable' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  const brut = objet(enveloppe?.data);
  if (enveloppe?.success !== true || brut === null) return { genre: 'panne' };

  return { genre: 'charge', brut };
};

/**
 * LES STORIES VISIBLES DU LECTEUR — le voisinage dont les segments et les taps
 * sont faits. Un refus n'est PAS une panne de l'écran : la story se lit seule,
 * sans barre et sans tap (charte règle 7 — un contrôle qui ne mène nulle part
 * n'est pas rendu).
 */
export const storiesVisibles = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<readonly Voisine[]> => {
  const reponse = await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_DES_STORIES}`, jeton, recuperer);
  if (reponse === null || !reponse.ok) return [];

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return [];

  return enveloppe.data
    .map((brut) => objet(brut))
    .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
    .map((brut) => ({
      id: chaine(brut.id) ?? '',
      auteurId: chaine(brut.authorId) ?? chaine(objet(brut.author)?.id),
      publieeA: instant(brut.createdAt),
    }))
    .filter((voisine) => voisine.id !== '');
};

const auMillieme = (iso: string | null): number => (iso === null ? 0 : Date.parse(iso));

/**
 * LE VOISINAGE — pure, donc opposable sans réseau. Les stories du MÊME auteur,
 * de la plus ancienne à la plus récente : c'est l'ordre dans lequel on les
 * regarde, et celui que les barres du haut dessinent.
 *
 * Quand le voisinage ne porte PAS la story ouverte — elle est publique et son
 * auteur n'est ni contact ni ami, donc le fil de stories du lecteur ne la
 * contient pas —, il n'y a qu'un segment et aucun tap. On ne fabrique pas une
 * file dont on ne sait rien.
 */
export const voisinage = ({ story, visibles }: { readonly story: Story; readonly visibles: readonly Voisine[] }): Voisinage => {
  const memeAuteur = visibles
    .filter((voisine) => voisine.auteurId !== null && voisine.auteurId === story.auteurId)
    .slice()
    .sort((a, b) => auMillieme(a.publieeA) - auMillieme(b.publieeA));

  const rang = memeAuteur.findIndex((voisine) => voisine.id === story.id);
  if (rang === -1) {
    return { segments: [{ id: story.id, courant: true }], rang: 0, precedente: null, suivante: null };
  }

  return {
    segments: memeAuteur.map((voisine, index) => ({ id: voisine.id, courant: index === rang })),
    rang,
    precedente: memeAuteur[rang - 1]?.id ?? null,
    suivante: memeAuteur[rang + 1]?.id ?? null,
  };
};

/** Ce qu'une soumission de la story produit : le refus porte SA phrase et son statut. */
export type IssueDuGeste =
  | { readonly genre: 'fait' }
  | { readonly genre: 'refus'; readonly message: string; readonly statut: number };

const refusDe = async (reponse: Response | null): Promise<IssueDuGeste> => {
  if (reponse === null) return { genre: 'refus', message: 'Le service ne répond pas.', statut: 503 };
  if (reponse.ok) return { genre: 'fait' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  return {
    genre: 'refus',
    message: chaine(enveloppe?.error) ?? chaine(enveloppe?.message) ?? 'Le service a refusé.',
    statut: reponse.status,
  };
};

/**
 * RÉPONDRE À UNE STORY, c'est la COMMENTER — `POST /posts/:postId/comments`
 * (`routes/posts/comments.ts:164`, `requiredAuth`), la seule porte qu'expose la
 * passerelle pour cette parole. Le corps est celui de `CreateCommentSchema`
 * (`routes/posts/types.ts:403-423`), qui refuse un contenu vide.
 */
export const reponds = async ({
  id,
  jeton,
  texte,
  base,
  recuperer,
}: {
  readonly id: string;
  readonly jeton: string;
  readonly texte: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDuGeste> =>
  refusDe(
    await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_DES_POSTS}/${encodeURIComponent(id)}/comments`, jeton, recuperer, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: texte }),
    }),
  );

/**
 * AIMER — DEUX routes, jamais une bascule : `POST /posts/:postId/like` pose,
 * `DELETE` retire (`routes/posts/interactions.ts:79` et `:237`, toutes deux
 * `requiredAuth`). C'est le document qui sait lequel des deux gestes le bouton
 * porte, puisque la passerelle lui a servi `isLikedByMe`.
 */
export const aime = async ({
  id,
  jeton,
  pose,
  base,
  recuperer,
}: {
  readonly id: string;
  readonly jeton: string;
  readonly pose: boolean;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<IssueDuGeste> =>
  refusDe(
    await demande(`${base ?? baseDeLaPasserelle()}${CHEMIN_DES_POSTS}/${encodeURIComponent(id)}/like`, jeton, recuperer, {
      method: pose ? 'POST' : 'DELETE',
    }),
  );


/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES COMMENTAIRES (#4896) — au même endroit et par les mêmes primitives, comme
 * l'en-tête de ce module l'annonce depuis le lot `story`.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * UN SEUL LECTEUR POUR LES TROIS SOURCES. La cible dessine trois puces — Post,
 * Réel, Story — et le critère de fin exige qu'un MÊME lecteur les rende. C'est
 * `publicationLue` : `storyLue` refuse tout ce qui n'est pas `type === 'STORY'`
 * parce que l'écran d'une story a ses propres règles d'expiration ; celui-ci
 * accepte les trois, et porte le `genre` pour que la vue le DISE.
 *
 * `STATUS` n'en fait pas partie : c'est une humeur d'une heure, sans fil de
 * commentaires dans la cible. L'admettre ferait un écran qui s'ouvre sur un
 * contenu déjà mort la plupart du temps.
 *
 * LA TROISIÈME PORTE, ET SA GARDE :
 *
 *   • `GET /api/v1/posts/:postId/comments` — `preValidation: [requiredAuth]`
 *     (`services/gateway/src/routes/posts/comments.ts:61-62`). Même régime que
 *     le post lui-même : la v3 s'y CONFORME, décision du porteur du
 *     2026-09-02, et le visiteur sans session reçoit une invitation.
 *
 * ET CE QUE CETTE PORTE JUGE DÉJÀ, que le web n'a pas à rejouer : « le fil
 * hérite de l'audience du post — lire les commentaires d'un post qu'on n'a pas
 * le droit de voir, c'est en lire le contenu ». Son refus est un `404` et non
 * un `403`, « distinguer révélerait l'existence du post ». Un repost simple
 * renvoie le fil de sa RACINE ; une citation garde le sien.
 *
 * LA CARTE DES TRADUCTIONS D'UN COMMENTAIRE A LA MÊME FORME QUE CELLE D'UN
 * POST — `Record<code, { text }>` (`schema.prisma:3523`, « même format et
 * pipeline que Post.translations et Message.translations ») — et c'est ce qui
 * rend `traductions()` réemployable tel quel. Le piège qu'il ferme mérite d'être
 * dit : `resolvePrismTranslation` teste `typeof text !== 'string'` et IGNORE
 * l'entrée. Lui passer la carte brute ne lève donc pas — elle rendrait `null`
 * pour toutes les langues, et l'ORIGINAL partirait à tout le monde sans qu'une
 * seule erreur le signale. Un Prisme mort qui ressemble à « aucune traduction
 * disponible ».
 */

/** Les trois sources que l'écran des commentaires sait ouvrir. */
export type GenreDePublication = 'POST' | 'REEL' | 'STORY';

const GENRES: readonly GenreDePublication[] = ['POST', 'REEL', 'STORY'];

const genreDePublication = (brut: unknown): GenreDePublication | null => {
  const valeur = chaine(brut);
  return GENRES.find((genre) => genre === valeur) ?? null;
};

export type Publication = {
  readonly id: string;
  readonly genre: GenreDePublication;
  readonly titre: string | null;
  readonly auteur: string;
  readonly texte: string;
  readonly texteOriginal: string;
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  readonly publieeA: string | null;
};

/**
 * UNE PUBLICATION, LUE — et sa langue élue par la MÊME descente que la story.
 *
 * `texte` porte ce qui doit être AFFICHÉ, `texteOriginal` ce qui a été écrit,
 * et `langueServie` dit dans quelle langue le premier est — c'est elle qui
 * pose le `lang=` sur le nœud, sans quoi un lecteur d'écran prononcerait un
 * texte français avec une voix anglaise.
 */
export const publicationLue = ({
  brut,
  langues,
  langueDemandee,
}: {
  readonly brut: Readonly<Record<string, unknown>>;
  readonly langues: readonly string[];
  readonly langueDemandee: string | null;
}): Publication | null => {
  const id = chaine(brut.id);
  const genre = genreDePublication(brut.type);
  if (id === null || genre === null) return null;
  if (instant(brut.deletedAt) !== null) return null;

  const carte = traductions(brut.translations);
  const langueOriginale = chaine(brut.originalLanguage);
  const texteOriginal = chaine(brut.content) ?? '';
  const elue = servie({ carte, langueOriginale, langues, langueDemandee });
  const auteur = objet(brut.author);

  return {
    id,
    genre,
    titre: chaine(brut.title),
    auteur: chaine(auteur?.displayName) ?? chaine(auteur?.username) ?? 'Quelqu’un',
    texte: elue?.text ?? texteOriginal,
    texteOriginal,
    langueServie: elue?.language ?? null,
    langueOriginale,
    publieeA: instant(brut.createdAt),
  };
};

export type Commentaire = {
  readonly id: string;
  readonly auteur: string;
  readonly auteurId: string | null;
  readonly texte: string;
  readonly texteOriginal: string;
  readonly langueServie: string | null;
  readonly langueOriginale: string | null;
  readonly publieA: string | null;
  readonly aimes: number;
  readonly reponses: number;
  /** Vrai quand le lecteur en est l'auteur — la cible y ajoute « Modifier · Supprimer ». */
  readonly aMoi: boolean;
};

/**
 * UN COMMENTAIRE. La descente est celle du post, sans une ligne réécrite : même
 * carte, même `servie()`, même ordre.
 *
 * `?lang=` NE S'APPLIQUE PAS aux commentaires, et c'est délibéré. La demande de
 * langue est le geste d'un lecteur sur UN contenu — la puce de traduction du
 * post —, pas un réglage global ; l'étendre au fil imposerait à trente
 * commentaires la langue choisie pour un seul, et masquerait ceux qu'elle ne
 * traduit pas. Chaque commentaire descend donc le Prisme du lecteur, seul.
 */
const commentaire = (
  brut: Readonly<Record<string, unknown>>,
  langues: readonly string[],
  moiId: string | null,
): Commentaire | null => {
  const id = chaine(brut.id);
  if (id === null) return null;

  const carte = traductions(brut.translations);
  const langueOriginale = chaine(brut.originalLanguage);
  const texteOriginal = chaine(brut.content) ?? '';
  const elue = servie({ carte, langueOriginale, langues, langueDemandee: null });
  const auteur = objet(brut.author);
  const auteurId = chaine(auteur?.id) ?? chaine(brut.authorId);

  return {
    id,
    auteur: chaine(auteur?.displayName) ?? chaine(auteur?.username) ?? 'Quelqu’un',
    auteurId,
    texte: elue?.text ?? texteOriginal,
    texteOriginal,
    langueServie: elue?.language ?? null,
    langueOriginale,
    publieA: instant(brut.createdAt),
    aimes: nombre(brut.likeCount) ?? 0,
    reponses: nombre(brut.replyCount) ?? 0,
    // `moiId` ABSENT ⇒ jamais « à moi ». Un écran qui offrirait « Supprimer »
    // sur le commentaire d'un autre serait un contrôle que la passerelle
    // refuserait — et qui aurait d'abord fait croire au lecteur qu'il le peut.
    aMoi: moiId !== null && auteurId !== null && auteurId === moiId,
  };
};

export type Fil =
  | {
      readonly genre: 'fil';
      readonly commentaires: readonly Commentaire[];
      /** `hasMore` — servi, jamais déduit d'un décompte de page. */
      readonly encore: boolean;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'introuvable' }
  | { readonly genre: 'panne' };

/**
 * LE FIL D'UNE PUBLICATION.
 *
 * `limit` est passé explicitement : la route valide sa querystring par Zod et
 * REFUSE une requête malformée plutôt que de la remplacer par des défauts
 * (#4339) — ne rien passer laisserait son schéma décider seul de la page. La
 * valeur est une décision de coût, comme partout ailleurs dans la v3.
 *
 * UN `404` N'EST PAS UNE PANNE. C'est le refus que la passerelle sert quand le
 * lecteur n'a pas le droit de voir le post — délibérément indiscernable d'un
 * post absent. L'écran le rend comme tel : introuvable, sans jamais laisser
 * entendre qu'il existe ailleurs.
 */
export const filDeLaPublication = async ({
  id,
  jeton,
  langues,
  moiId,
  limite = 30,
  base,
  recuperer,
}: {
  readonly id: string;
  readonly jeton: string;
  readonly langues: readonly string[];
  readonly moiId: string | null;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Fil> => {
  const url = `${base ?? baseDeLaPasserelle()}${CHEMIN_DES_POSTS}/${encodeURIComponent(id)}/comments?limit=${limite}`;
  const reponse = await demande(url, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (reponse.status === 403 || reponse.status === 404) return { genre: 'introuvable' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return { genre: 'panne' };

  return {
    genre: 'fil',
    commentaires: enveloppe.data
      .map((ligne) => objet(ligne))
      .filter((ligne): ligne is Readonly<Record<string, unknown>> => ligne !== null)
      .map((ligne) => commentaire(ligne, langues, moiId))
      .filter((c): c is Commentaire => c !== null),
    encore: objet(enveloppe.pagination)?.hasMore === true,
  };
};
