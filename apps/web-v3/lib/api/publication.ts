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
