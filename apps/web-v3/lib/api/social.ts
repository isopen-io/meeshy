import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

import { chaine, instant, nombre, objet } from './lecture';
import { demande, media, servie, traductions, type MediaDeStory, type Recuperateur } from './publication';
import { baseDeLaPasserelle } from './passerelle';

/**
 * LE FIL SOCIAL (`/feed`, #5031) — les posts et réels du VOISINAGE du lecteur,
 * et le rail de stories qui les surmonte. Même passerelle, même Prisme que
 * `lib/api/publication.ts` (story, commentaires) : ce module n'en réécrit
 * AUCUNE règle, il en importe les primitives (`demande`, `media`, `servie`,
 * `traductions`) — la carte de traductions d'un post et sa descente sont
 * IDENTIQUES, qu'il s'ouvre en plein écran ou qu'il défile dans le fil.
 *
 * LA SEULE PORTE : `GET /api/v1/social/posts?scope=home` — `scope=home`
 * exige un compte enregistré (`routes/posts/feed.ts:789`, les neuf scopes
 * autres que `author`/`community` sont réservés à un `registeredUserId`) : la
 * v3 ne demande donc jamais ce fil sans jeton. `scope=stories` sert le rail
 * (`chargerStories`, la MÊME route que la story plein écran consomme via
 * `storiesVisibles` dans `publication.ts`, ici pour son VOISINAGE plutôt que
 * pour un segment).
 *
 * LE `where` DE `PostFeedService.getFeed` NE SERT QUE `POST` ET `REEL`
 * (`type: { in: [PostType.POST, PostType.REEL] }`) — jamais un STATUS ni une
 * STORY : ce module ne les lit donc pas, et n'a pas à les refuser comme
 * `publicationLue` le fait pour l'écran des commentaires.
 *
 * CHAQUE POST PORTE SES TEXTES DISTINCTS QUE LE PRISME DU LECTEUR RECONNAÎT
 * (§ Prisme cycle 123, « la variante block rend une zone traductions
 * disponibles CLIQUABLE, et cliquer n'y changeait RIEN » — corrigé BORNÉ au
 * budget de document, § doc-comment de `textesDuPost`). `textesDuPost` les
 * énumère — l'élu du Prisme, l'original, puis les autres traductions QUE CE
 * LECTEUR CONFIGURE — pour que la vue les rende toutes et que cliquer une
 * langue en changeant le texte AFFICHÉ soit un fait du document (un groupe de
 * boutons radio, sans une ligne de JavaScript), jamais une promesse qu'aucun
 * contrôle ne tient — et jamais non plus la carte `translations` ENTIÈRE,
 * dont la taille dépend des AUTRES lecteurs, pas de celui-ci.
 */

const CHEMIN_DES_POSTS = '/api/v1/social/posts';

export type TexteDeLangue = {
  readonly langue: string | null;
  readonly texte: string;
  /** Vrai pour le texte ÉCRIT — jamais traduit. Sa puce porte « original ». */
  readonly origine: boolean;
};

export type PostDuFil = {
  readonly id: string;
  readonly genre: 'POST' | 'REEL';
  readonly auteur: string;
  readonly auteurId: string | null;
  readonly publieA: string | null;
  /**
   * TOUS les textes DISTINCTS que ce post porte, l'ÉLU du Prisme en premier
   * (donc le radio coché par défaut) — jamais un seul, sous peine de
   * reproduire le défaut du cycle 123.
   */
  readonly textes: readonly TexteDeLangue[];
  readonly medias: readonly MediaDeStory[];
  readonly aimeParMoi: boolean;
  readonly aimes: number;
  readonly commentaires: number;
  readonly reposts: number;
  readonly reposteParMoi: boolean;
};

export type Vignette = {
  readonly id: string;
  readonly auteur: string;
  readonly auteurId: string | null;
  /**
   * `isViewedByMe`, tel que `PostFeedService.fetchAndEnrichStories` le sert
   * DANS LES DEUX PROJECTIONS (`services/gateway/src/services/PostFeedService.ts`
   * — « isViewedByMe (anneau vu/non-vu) reste servi dans les deux »).
   * `cible/feed.png` distingue deux anneaux (Ibrahim/Marta accentués — pas
   * encore vues — contre Sara/Luc neutres) : le SEUL signal utile d'un rail
   * de stories, perdu si ce champ n'est pas lu.
   */
  readonly vu: boolean;
};

/**
 * L'ÉNUMÉRATION DES TEXTES DISTINCTS d'un post — l'élu du Prisme d'abord,
 * l'original ensuite (s'il diffère), puis les AUTRES traductions QUE LE
 * PRISME DU LECTEUR RECONNAÎT — jamais la carte `translations` ENTIÈRE.
 * Une langue déjà comptée (comparée par `normalizeLanguageForDedup`, la même
 * canonicalisation que `servie()`) n'apparaît qu'une fois : l'élu et
 * l'original peuvent coïncider si le lecteur préfère la langue même dans
 * laquelle le post est écrit.
 *
 * BORNÉ À `langues` (la sortie de `resolveUserLanguagesOrdered`, ≤ 4 entrées,
 * § Prisme) — jamais aux langues QUE LA TRADUCTION AUTOMATIQUE A PRODUITES
 * pour d'AUTRES lecteurs. Un post populaire porte 3 à 12 traductions au
 * moment où sa carte grossit (une par premier accès d'un viewer dans cette
 * langue, § schéma) : les inliner TOUTES fait FRANCHIR le plafond de document
 * (`budgets.json › documents.document_o`) dès la troisième — mesuré, jamais
 * la queue d'un produit multilingue. Le Prisme sert la langue du LECTEUR,
 * jamais celle d'un voisin (§ Cohérence de positionnement) : une traduction
 * que ce lecteur ne peut pas configurer ne lui coûte donc plus un octet.
 */
export const textesDuPost = ({
  carte,
  langueOriginale,
  texteOriginal,
  langues,
}: {
  readonly carte: Readonly<Record<string, string>>;
  readonly langueOriginale: string | null;
  readonly texteOriginal: string;
  readonly langues: readonly string[];
}): readonly TexteDeLangue[] => {
  const elue = servie({ carte, langueOriginale, langues, langueDemandee: null });
  const vus = new Set<string>();
  const marque = (langue: string | null): boolean => {
    const cle = langue === null ? `\0${vus.size}` : normalizeLanguageForDedup(langue);
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  };

  const languesDuPrisme = new Set(langues.map((langue) => normalizeLanguageForDedup(langue)));

  const resultat: TexteDeLangue[] = [];
  if (elue !== null && marque(elue.language)) {
    resultat.push({ langue: elue.language, texte: elue.text, origine: false });
  }
  if (texteOriginal !== '' && marque(langueOriginale)) {
    resultat.push({ langue: langueOriginale, texte: texteOriginal, origine: true });
  }
  Object.entries(carte)
    .filter(([langue]) => languesDuPrisme.has(normalizeLanguageForDedup(langue)))
    .filter(([langue]) => marque(langue))
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([langue, texte]) => resultat.push({ langue, texte, origine: false }));

  return resultat;
};

const posteDuFil = ({
  brut,
  langues,
  origine,
}: {
  readonly brut: Readonly<Record<string, unknown>>;
  readonly langues: readonly string[];
  readonly origine: string;
}): PostDuFil | null => {
  const id = chaine(brut.id);
  const type = chaine(brut.type);
  if (id === null || (type !== 'POST' && type !== 'REEL')) return null;

  const auteur = objet(brut.author);
  const carte = traductions(brut.translations);
  const langueOriginale = chaine(brut.originalLanguage);
  const texteOriginal = chaine(brut.content) ?? '';

  return {
    id,
    genre: type,
    auteur: chaine(auteur?.displayName) ?? chaine(auteur?.username) ?? 'Quelqu’un',
    auteurId: chaine(brut.authorId) ?? chaine(auteur?.id),
    publieA: instant(brut.createdAt),
    textes: textesDuPost({ carte, langueOriginale, texteOriginal, langues }),
    medias: Array.isArray(brut.media)
      ? brut.media.map((piece) => media(piece, origine)).filter((piece): piece is MediaDeStory => piece !== null)
      : [],
    aimeParMoi: brut.isLikedByMe === true,
    aimes: nombre(brut.likeCount) ?? 0,
    commentaires: nombre(brut.commentCount) ?? 0,
    reposts: nombre(brut.repostCount) ?? 0,
    reposteParMoi: brut.isRepostedByMe === true,
  };
};

export type Fil =
  | {
      readonly genre: 'fil';
      readonly posts: readonly PostDuFil[];
      /**
       * `null` — plus rien à charger. Une chaîne — le curseur à passer à
       * `filSocial({ curseur })` pour la page suivante (`?cursor=` de
       * `/feed`, § critère de fin « le fil se parcourt »). PORTÉ jusqu'à la
       * vue, qui rend le lien SEULEMENT quand il est non nul — une valeur
       * calculée qu'aucun lecteur n'atteint n'a servi personne (cycle 122).
       */
      readonly curseurSuivant: string | null;
    }
  | { readonly genre: 'session-expiree' }
  | { readonly genre: 'panne' };

/**
 * LE FIL — `scope=home`, l'ordonnancement que `PostFeedService.getFeed`
 * calcule déjà (récence, engagement, affinité, diversité) : ce module ne
 * retrie rien, il RESSERT l'ordre servi.
 */
export const filSocial = async ({
  jeton,
  langues,
  curseur,
  limite = 20,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly langues: readonly string[];
  readonly curseur?: string;
  readonly limite?: number;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<Fil> => {
  const origine = base ?? baseDeLaPasserelle();
  const parametres = new URLSearchParams({ scope: 'home', limit: String(limite) });
  if (curseur !== undefined) parametres.set('cursor', curseur);
  const reponse = await demande(`${origine}${CHEMIN_DES_POSTS}?${parametres.toString()}`, jeton, recuperer);

  if (reponse === null) return { genre: 'panne' };
  if (reponse.status === 401) return { genre: 'session-expiree' };
  if (!reponse.ok) return { genre: 'panne' };

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return { genre: 'panne' };

  return {
    genre: 'fil',
    posts: enveloppe.data
      .map((ligne) => objet(ligne))
      .filter((ligne): ligne is Readonly<Record<string, unknown>> => ligne !== null)
      .map((ligne) => posteDuFil({ brut: ligne, langues, origine }))
      .filter((post): post is PostDuFil => post !== null),
    curseurSuivant:
      objet(enveloppe.pagination)?.hasMore === true ? (chaine(objet(enveloppe.pagination)?.nextCursor) ?? null) : null,
  };
};

/**
 * LE RAIL DE STORIES — `scope=stories&projection=tray`, projeté à sa plus
 * simple expression : un identifiant, un auteur, l'état vu/non-vu, ce que la
 * vignette du rail montre. La lecture COMPLÈTE d'une story (texte, médias,
 * expiration) reste celle de `lib/api/publication.ts` — ce module ne la
 * réécrit pas, il n'ouvre qu'un VOISINAGE.
 *
 * `projection=tray` (`routes/posts/feed.ts:213`, `postIncludes.ts:264-296`,
 * `trayStorySelect`) : la passerelle sert alors « rings + author + latest
 * thumbnail + viewed state » plutôt que le corps plein (canvas, traductions,
 * aperçu des commentaires) — « which dominate the full-body payload (50
 * stories shipped whole) ». Une whitelist déjà branchée sur `scope=stories`,
 * jamais une capacité nouvelle.
 *
 * `limite` REPREND celle des publications (`filSocial`, 20) — un rail est un
 * couloir qui défile, pas une page à part ; ni mesure ni promesse ergonomique
 * précise n'a été prise sur ce nombre au-delà de « moins que le plafond
 * historique de 50 copié sans raison ».
 *
 * DISTINCTE DE `storiesVisibles` (`publication.ts`) — qui projette
 * `{ id, auteurId, publieeA }` pour calculer le VOISINAGE d'une story déjà
 * ouverte (segments, précédente/suivante). Le rail veut le NOM affiché et
 * l'état vu, `storiesVisibles` n'en a besoin d'aucun des deux ; les deux
 * lisent la même route pour deux questions différentes (règle 6 : « une
 * fonction qui répond à deux questions n'en répond juste à aucune »), donc
 * deux projections, un seul appel réseau chacune.
 */
const LIMITE_DU_RAIL = 20;

export const railDeStories = async ({
  jeton,
  base,
  recuperer,
}: {
  readonly jeton: string;
  readonly base?: string;
  readonly recuperer?: Recuperateur;
}): Promise<readonly Vignette[]> => {
  const reponse = await demande(
    `${base ?? baseDeLaPasserelle()}${CHEMIN_DES_POSTS}?scope=stories&projection=tray&limit=${LIMITE_DU_RAIL}`,
    jeton,
    recuperer,
  );
  if (reponse === null || !reponse.ok) return [];

  const enveloppe = objet(await reponse.json().catch(() => null));
  if (enveloppe?.success !== true || !Array.isArray(enveloppe.data)) return [];

  return enveloppe.data
    .map((brut) => objet(brut))
    .filter((brut): brut is Readonly<Record<string, unknown>> => brut !== null)
    .map((brut): Vignette | null => {
      const id = chaine(brut.id);
      if (id === null) return null;
      const auteur = objet(brut.author);
      return {
        id,
        auteur: chaine(auteur?.displayName) ?? chaine(auteur?.username) ?? 'Quelqu’un',
        auteurId: chaine(brut.authorId) ?? chaine(auteur?.id),
        vu: brut.isViewedByMe === true,
      };
    })
    .filter((vignette): vignette is Vignette => vignette !== null);
};
