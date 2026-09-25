import { isRememberableAudience, type ChoosableAudience } from './publication-audience';
import type { StudioPlane } from './story-document';
import {
  emptyStudioPage,
  isStudioPageEmpty,
  isStudioPagePublishable,
  pageMediaCount,
  pageWithAddedText,
  pageWithMediaDuration,
  pageWithSelected,
  pageWithSound,
  pageWithSoundPlane,
  pageWithSoundUpload,
  pageWithText,
  pageWithTextLayer,
  pageWithVisual,
  pageWithVisualAspectRatio,
  pageWithVisualCaption,
  pageWithVisualPose,
  pageWithVisualUpload,
  pageWithoutSound,
  pageWithoutText,
  pageWithoutVisual,
  readyAssetOf,
  selectedTextLayerOf,
  studioDoorAccepts,
  studioFailureKey,
  type StudioDoor,
  type StudioFailureKey,
  type StudioPage,
  type StudioSoundAsset,
  type StudioUploadState,
  type StudioVisualAsset,
} from './studio-page';
import type { StudioDraftSnapshot, StudioPageSnapshot, StudioTextLayerSnapshot } from './studio-draft-store';
import { IDENTITY_POSE, clampPose, type StudioPose } from './studio-pose';
import {
  STUDIO_TEXT_ALIGNS,
  STUDIO_TEXT_BACKGROUND_VALUES,
  STUDIO_TEXT_COLORS,
  STUDIO_TEXT_EFFECTS,
  STUDIO_TEXT_STYLES,
  nextTextLayerId,
  type StudioTextLayer,
} from './studio-text';

/**
 * **L'ÉTAT DU PLATEAU DE STORY** (#6900, élargi par #6943, #6944 puis #7684) —
 * ce que l'auteur pose, et où. Le plateau porte désormais **plusieurs PAGES**
 * (#7684, spécification §1.1 : « une PAGE est une slide, une slide est une
 * SCÈNE du canvas ») : chacune avec ses propres objets texte, son fond, son
 * calque d'avant-plan et son son — ce que `StudioDraft` portait SEUL avant ce
 * lot (`StudioPage`, `studio-page.ts`).
 *
 * Ce module est désormais la couche DRAFT : la gestion des pages elles-mêmes
 * (`withAddedPage`, `withoutPage`, `withCurrentPage`, `withPage`) et la
 * DÉLÉGATION des fonctions historiques vers la page COURANTE — leurs
 * signatures restent celles d'avant #7684 (`withVisual(draft, door, asset)`,
 * etc.) pour que les appelants existants n'aient qu'à lire `currentStudioPage
 * (draft)` là où ils lisaient `draft.background` directement.
 */
export type { StudioDoor, StudioFailureKey, StudioPage, StudioSoundAsset, StudioUploadState, StudioVisualAsset };
export { readyAssetOf, studioDoorAccepts, studioFailureKey };

/**
 * **LE PLAFOND D'UNE PUBLICATION** — deux contraintes SERVEUR qui partagent
 * aujourd'hui la même valeur, jamais une coïncidence à garder en dur deux
 * fois SANS le dire : `CanvasV3Schema.scenes` plafonne à 10
 * (`packages/shared/types/canvas-v3.ts:211`, une scène par PAGE) et
 * `MAX_POST_MEDIA` plafonne les médias d'UNE publication
 * (`packages/shared/types/attachment.ts:490`) — la même passerelle qui
 * refuserait un document à 11 scènes refuserait aussi 11 médias.
 * `STUDIO_PAGE_MAX` gouverne le NOMBRE DE PAGES ; ce même chiffre gouverne
 * aussi le NOMBRE DE MÉDIAS déjà posés (`studioPlaceRefusal`) — deux
 * questions distinctes, une seule valeur. **NON importé** de
 * `@meeshy/shared` en PRODUCTION (poids, #7684 revue-correction : `attachment
 * .ts` pèserait sur le chunk `story_studio` pour une seule constante) — le
 * témoin `studio.test.ts` importe `MAX_POST_MEDIA` et ÉPINGLE l'égalité, ce
 * fichier-ci n'a que la valeur.
 */
export const STUDIO_PAGE_MAX = 10;

/** LE BROUILLON — une suite de PAGES et l'identifiant de celle qu'on édite. */
export type StudioDraft = {
  readonly pages: readonly StudioPage[];
  readonly currentPage: string;
  /** La langue de COMPOSITION par défaut — un concept de SESSION, pas de
   * page (`useComposeLanguage({ initialLanguage })`) : elle graine tout objet
   * texte NOUVEAU, quelle que soit la page où il naît. */
  readonly language?: string;
  /**
   * **L'AUDIENCE CHOISIE PAR L'AUTEUR** (#7683) — `null` tant que rien n'est
   * choisi : le corps de `POST /posts` part alors SANS `visibility` (D-111).
   * `ChoosableAudience`, jamais `PostVisibility` : un brouillon ne PEUT pas
   * tenir `ONLY`/`EXCEPT` sans leur liste de personnes.
   */
  readonly visibility: ChoosableAudience | null;
};

/** La page COURANTE — le SITE UNIQUE de lecture, pour que « quelle page ? »
 * se réponde une fois. Un `currentPage` orphelin (donnée corrompue) retombe
 * sur la première page plutôt que de lever une exception. */
export function currentStudioPage(draft: StudioDraft): StudioPage {
  return draft.pages.find((page) => page.id === draft.currentPage) ?? draft.pages[0]!;
}

const allTexts = (draft: StudioDraft): readonly StudioTextLayer[] => draft.pages.flatMap((page) => page.texts);

/** Un identifiant de PAGE unique DANS CE BROUILLON — `page-1`, `page-2`…,
 * calculé contre l'existant (même loi que `nextTextLayerId`, #5102 : « un
 * identifiant qui ne s'alloue pas ne collisionne pas »). */
function nextPageId(pages: readonly StudioPage[]): string {
  const used = pages.map((page) => Number.parseInt(page.id.replace(/^page-/, ''), 10)).filter((n) => Number.isInteger(n));
  return `page-${Math.max(0, ...used) + 1}`;
}

export function emptyStudioDraft(language: string): StudioDraft {
  const page = emptyStudioPage('page-1', 'text-1', language);
  return { pages: [page], currentPage: page.id, visibility: null };
}

export function isStudioDraftEmpty(draft: StudioDraft): boolean {
  return draft.pages.every(isStudioPageEmpty);
}

/** Les pages qui PARTIRONT — une page sans matière ne produit aucune scène
 * (`composeStoryCanvasPages`). Le SITE UNIQUE de « combien de scènes ? » pour
 * le sous-menu de disposition (`layoutIsServed`) : compter `pages.length`
 * offrait une disposition qu'une page vide rendait sans effet. */
export function studioPublishablePageCount(draft: StudioDraft): number {
  return draft.pages.filter((page) => !isStudioPageEmpty(page)).length;
}

/** LE SITE UNIQUE de mutation d'UNE page — un `id` inconnu rend le brouillon
 * INCHANGÉ (même identité), pour que la tuile mémoïsée d'une autre page ne
 * re-rende jamais pour rien (Zero Unnecessary Re-render). */
export function withPage(draft: StudioDraft, id: string, change: (page: StudioPage) => StudioPage): StudioDraft {
  if (!draft.pages.some((page) => page.id === id)) return draft;
  return { ...draft, pages: draft.pages.map((page) => (page.id === id ? change(page) : page)) };
}

const withCurrentPageChange = (draft: StudioDraft, change: (page: StudioPage) => StudioPage): StudioDraft => withPage(draft, draft.currentPage, change);

/* ── LES PAGES ────────────────────────────────────────────────────────────── */

/** Ajoute une page VIDE et la rend COURANTE (`StoryComposerViewModel+Slides.
 * swift:72-77`) — inerte au plafond (`STUDIO_PAGE_MAX`), jamais une onzième
 * page silencieuse. Son texte de graine reçoit un `id` unique contre TOUTES
 * les pages du brouillon (`translationSetPath`, `storyEffectsV3.ts:635-643`,
 * prend le PREMIER objet d'un `id` donné, toutes scènes confondues). */
export function withAddedPage(draft: StudioDraft, language: string): StudioDraft {
  if (draft.pages.length >= STUDIO_PAGE_MAX) return draft;
  const id = nextPageId(draft.pages);
  const textId = nextTextLayerId(allTexts(draft));
  const page = emptyStudioPage(id, textId, language);
  return { ...draft, pages: [...draft.pages, page], currentPage: page.id };
}

/** Retire une page — inerte sous DEUX pages (`removeSlide`,
 * `StoryComposerViewModel+Slides.swift:79-83`) et sur un `id` inconnu.
 * Retirer la page COURANTE fait courante la PRÉCÉDENTE (ou la première) ;
 * retirer une AUTRE page ne change jamais la courante. */
export function withoutPage(draft: StudioDraft, id: string): StudioDraft {
  if (draft.pages.length <= 1) return draft;
  const index = draft.pages.findIndex((page) => page.id === id);
  if (index === -1) return draft;
  const pages = draft.pages.filter((page) => page.id !== id);
  const currentPage = draft.currentPage === id ? (pages[Math.max(0, index - 1)]?.id ?? pages[0]!.id) : draft.currentPage;
  return { ...draft, pages, currentPage };
}

/** Change la scène courante (`selectSlide(at:)`) — un `id` inconnu ⇒ inchangé. */
export function withCurrentPage(draft: StudioDraft, id: string): StudioDraft {
  return draft.pages.some((page) => page.id === id) ? { ...draft, currentPage: id } : draft;
}

/**
 * **RETIRER PLUSIEURS PAGES D'UN COUP** (#7707) — ce qu'un échec PARTIEL du
 * canal `.scene` laisse derrière lui : les pages PARTIES n'ont plus leur
 * place dans le brouillon, celles qui restent gardent leur IDENTITÉ D'OBJET
 * (Zero Unnecessary Re-render, comme `withPage`). Des `id` inconnus sont
 * ignorés — jamais une exception pour un id déjà retiré.
 *
 * **Retirer TOUTES les pages laisse le brouillon INCHANGÉ** : le succès
 * COMPLET d'une publication passe par `clear(viewerId)` (le brouillon entier
 * disparaît) — jamais par ici, qui ne réduit un document qu'à ce qu'il en
 * reste à publier.
 */
export function withoutPages(draft: StudioDraft, ids: readonly string[]): StudioDraft {
  const removed = new Set(ids);
  const pages = draft.pages.filter((page) => !removed.has(page.id));
  const first = pages[0];
  if (first === undefined || pages.length === draft.pages.length) return draft;
  return { ...draft, pages, currentPage: removed.has(draft.currentPage) ? first.id : draft.currentPage };
}

/** Le nombre de médias (fond/calque/son) que le DOCUMENT ENTIER porte, prêts
 * OU en vol — comparé à `MAX_POST_MEDIA` par `studioPlaceRefusal`. */
export function studioMediaCount(draft: StudioDraft): number {
  return draft.pages.reduce((sum, page) => sum + pageMediaCount(page), 0);
}

export type StudioPlaceRefusal = 'door' | 'media-max';

/** Le refus AVANT de poser un fichier — la porte (mauvais MIME) ou le
 * plafond du DOCUMENT entier (les 10 médias de `MAX_POST_MEDIA`, comptés sur
 * TOUTES les pages, jamais seulement la courante). Une porte déjà OCCUPÉE sur
 * la page courante REMPLACE son média (question 9.1 de #6900) : le compte ne
 * monte pas, le remplacement passe même au plafond. */
export function studioPlaceRefusal(draft: StudioDraft, door: StudioDoor, mimeType: string): StudioPlaceRefusal | null {
  if (!studioDoorAccepts(door, mimeType)) return 'door';
  const page = currentStudioPage(draft);
  const occupied = (door === 'visual' ? page.background : door === 'overlay' ? page.overlay : page.sound) !== null;
  return !occupied && studioMediaCount(draft) >= STUDIO_PAGE_MAX ? 'media-max' : null;
}

/* ── LES OBJETS TEXTE, DÉLÉGUÉS À LA PAGE COURANTE ───────────────────────── */

export const selectedTextLayer = (draft: StudioDraft): StudioTextLayer | null => selectedTextLayerOf(currentStudioPage(draft));

export function withAddedText(draft: StudioDraft, language: string): StudioDraft {
  const textId = nextTextLayerId(allTexts(draft));
  return withCurrentPageChange(draft, (page) => pageWithAddedText(page, textId, language));
}

export function withSelected(draft: StudioDraft, id: string | null): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithSelected(page, id));
}

/**
 * **L'AUDIENCE COMMISE** (#7683) — porte sur le BROUILLON entier, pas sur une
 * page : une publication n'a qu'une seule audience quel que soit son nombre
 * de pages.
 */
export function withAudience(draft: StudioDraft, visibility: ChoosableAudience): StudioDraft {
  return { ...draft, visibility };
}

export function withoutText(draft: StudioDraft, id: string): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithoutText(page, id));
}

/** LE site unique de mutation d'un objet texte de la page COURANTE. */
export function withTextLayer(draft: StudioDraft, id: string, change: (layer: StudioTextLayer) => StudioTextLayer): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithTextLayer(page, id, change));
}

export function withText(draft: StudioDraft, id: string, text: string): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithText(page, id, text));
}

/* ── LES TROIS PORTES, DÉLÉGUÉES À LA PAGE COURANTE ──────────────────────── */

export function withVisual(draft: StudioDraft, door: 'visual' | 'overlay', asset: StudioVisualAsset): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithVisual(page, door, asset));
}

export function withoutVisual(draft: StudioDraft, door: 'visual' | 'overlay'): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithoutVisual(page, door));
}

export function withVisualUpload(draft: StudioDraft, door: 'visual' | 'overlay', upload: StudioUploadState): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithVisualUpload(page, door, upload));
}

export function withVisualAspectRatio(draft: StudioDraft, door: 'visual' | 'overlay', previewUrl: string, aspectRatio: number): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithVisualAspectRatio(page, door, previewUrl, aspectRatio));
}

export function withMediaDuration(draft: StudioDraft, door: StudioDoor, previewUrl: string, durationMs: number): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithMediaDuration(page, door, previewUrl, durationMs));
}

export function withVisualCaption(draft: StudioDraft, door: 'visual' | 'overlay', caption: string): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithVisualCaption(page, door, caption));
}

export function withVisualPose(draft: StudioDraft, door: 'visual' | 'overlay', pose: StudioPose): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithVisualPose(page, door, pose));
}

export function withSound(draft: StudioDraft, asset: StudioSoundAsset): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithSound(page, asset));
}

export function withoutSound(draft: StudioDraft): StudioDraft {
  return withCurrentPageChange(draft, pageWithoutSound);
}

export function withSoundUpload(draft: StudioDraft, upload: StudioUploadState): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithSoundUpload(page, upload));
}

export function withSoundPlane(draft: StudioDraft, plane: StudioPlane): StudioDraft {
  return withCurrentPageChange(draft, (page) => pageWithSoundPlane(page, plane));
}

/**
 * LE BOUTON PUBLIER EST INERTE — loi 4. `false` sur un brouillon VIDE (TOUTES
 * ses pages vides) et sur tout asset en ÉCHEC, sur N'IMPORTE QUELLE page — la
 * garde couvre le document entier, pas seulement la page à l'écran.
 */
export function canPublishStudioDraft(draft: StudioDraft): boolean {
  if (isStudioDraftEmpty(draft)) return false;
  return draft.pages.every(isStudioPagePublishable);
}

/* ── LE BROUILLON PERSISTÉ ───────────────────────────────────────────────── */

const oneOf = <T extends string>(table: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (table as readonly string[]).includes(value) ? (value as T) : fallback;

const poseOf = (value: unknown): StudioPose => {
  if (typeof value !== 'object' || value === null) return IDENTITY_POSE;
  const record = value as Record<string, unknown>;
  const n = (key: string, fallback: number): number => (typeof record[key] === 'number' ? (record[key] as number) : fallback);
  return clampPose({ x: n('x', 0.5), y: n('y', 0.5), scale: n('scale', 1), rotation: n('rotation', 0) });
};

/** UN objet texte relu — chaque champ NORMALISÉ contre la table du studio. */
function textLayerFromSnapshot(snapshot: StudioTextLayerSnapshot, language: string): StudioTextLayer {
  return {
    id: snapshot.id,
    text: snapshot.text,
    language: typeof snapshot.language === 'string' && snapshot.language !== '' ? snapshot.language : language,
    style: oneOf(STUDIO_TEXT_STYLES, snapshot.style, 'bold'),
    effect: oneOf(STUDIO_TEXT_EFFECTS, snapshot.effect, 'none'),
    color: oneOf(STUDIO_TEXT_COLORS, snapshot.color, 'FFFFFF'),
    align: oneOf(STUDIO_TEXT_ALIGNS, snapshot.align, 'center'),
    background:
      typeof snapshot.background === 'string' && (STUDIO_TEXT_BACKGROUND_VALUES as readonly string[]).includes(snapshot.background)
        ? snapshot.background
        : null,
    pose: poseOf(snapshot.pose),
  };
}

/** UNE page relue — chaque média restauré est PRÊT et se prévisualise depuis
 * le SERVEUR (`resolveUrl`) : c'est le seul cas où l'aperçu lit le réseau. */
function pageFromSnapshot(snapshot: StudioPageSnapshot, resolveUrl: (fileUrl: string) => string, language: string): StudioPage {
  const visual = (
    ref: NonNullable<StudioPageSnapshot['background'] | StudioPageSnapshot['overlay']> | undefined,
  ): StudioVisualAsset | null =>
    ref === undefined
      ? null
      : {
          previewUrl: resolveUrl(ref.fileUrl),
          mediaType: ref.mediaType,
          ...(ref.aspectRatio !== undefined ? { aspectRatio: ref.aspectRatio } : {}),
          ...(ref.durationMs !== undefined ? { durationMs: ref.durationMs } : {}),
          caption: ref.caption ?? '',
          pose: poseOf('pose' in ref ? ref.pose : undefined),
          upload: {
            phase: 'ready',
            postMediaId: ref.postMediaId,
            fileUrl: ref.fileUrl,
            ...(ref.thumbHash !== undefined ? { thumbHash: ref.thumbHash } : {}),
          },
        };
  const texts =
    snapshot.texts.length === 0
      ? emptyStudioPage(snapshot.id, 'text-1', language).texts
      : snapshot.texts.map((layer) => textLayerFromSnapshot(layer, language));
  return {
    id: snapshot.id,
    texts,
    selected: texts[0]?.id ?? null,
    background: visual(snapshot.background),
    overlay: visual(snapshot.overlay),
    sound:
      snapshot.sound === undefined
        ? null
        : {
            previewUrl: resolveUrl(snapshot.sound.fileUrl),
            plane: snapshot.sound.plane === 'foreground' ? 'foreground' : 'background',
            ...(snapshot.sound.durationMs !== undefined ? { durationMs: snapshot.sound.durationMs } : {}),
            upload: {
              phase: 'ready',
              postMediaId: snapshot.sound.postMediaId,
              fileUrl: snapshot.sound.fileUrl,
              ...(snapshot.sound.thumbHash !== undefined ? { thumbHash: snapshot.sound.thumbHash } : {}),
            },
          },
  };
}

/** Ce qui se PERSISTE pour UNE page : les objets texte AVEC leur pose, les
 * légendes, et les médias PRÊTS — jamais un `File`, jamais une URL locale. */
function pageSnapshotOf(page: StudioPage): StudioPageSnapshot {
  const visual = (asset: StudioVisualAsset | null) => {
    const ready = asset === null ? null : readyAssetOf(asset.upload);
    if (asset === null || ready === null) return undefined;
    return {
      ...ready,
      mediaType: asset.mediaType,
      ...(asset.aspectRatio !== undefined ? { aspectRatio: asset.aspectRatio } : {}),
      ...(asset.durationMs !== undefined ? { durationMs: asset.durationMs } : {}),
      ...(asset.caption !== '' ? { caption: asset.caption } : {}),
      pose: asset.pose,
    };
  };
  const background = visual(page.background);
  const overlay = visual(page.overlay);
  const sound = page.sound === null ? null : readyAssetOf(page.sound.upload);
  return {
    id: page.id,
    texts: page.texts.map((layer) => ({ ...layer })),
    ...(background !== undefined ? { background } : {}),
    ...(overlay !== undefined ? { overlay } : {}),
    ...(sound !== null && page.sound !== null
      ? { sound: { ...sound, plane: page.sound.plane, ...(page.sound.durationMs !== undefined ? { durationMs: page.sound.durationMs } : {}) } }
      : {}),
  };
}

/** Ce qui se PERSISTE — les PAGES, la page courante, et l'audience choisie.
 * `language` part SI au moins une page porte du texte : c'est la graine de
 * `useComposeLanguage`, un concept de SESSION plutôt que par page. */
export function studioSnapshotOf(draft: StudioDraft, language: string): StudioDraftSnapshot {
  return {
    schema: 2,
    pages: draft.pages.map(pageSnapshotOf),
    currentPage: draft.currentPage,
    ...(allTexts(draft).some((layer) => layer.text.trim() !== '') ? { language } : {}),
    ...(draft.visibility !== null ? { visibility: draft.visibility } : {}),
  };
}

/** Le brouillon RELU — `null` (aucun brouillon) rend un plateau vide dans la
 * langue demandée. Le SCHÉMA d'un snapshot corrompu ou d'une version FUTURE
 * est déjà écarté par le magasin (`studio-draft-store.ts`) : ce composeur ne
 * reçoit jamais que la forme PAGES, jamais la forme précédente. */
export function studioDraftFromSnapshot(
  snapshot: StudioDraftSnapshot | null,
  resolveUrl: (fileUrl: string) => string,
  language: string,
): StudioDraft {
  if (snapshot === null || snapshot.pages.length === 0) return emptyStudioDraft(language);
  const composeLanguage = snapshot.language ?? language;
  const pages = snapshot.pages.map((page) => pageFromSnapshot(page, resolveUrl, composeLanguage));
  const currentPage = pages.some((page) => page.id === snapshot.currentPage) ? (snapshot.currentPage as string) : pages[0]!.id;
  return {
    pages,
    currentPage,
    ...(snapshot.language !== undefined ? { language: snapshot.language } : {}),
    visibility: isRememberableAudience(snapshot.visibility) ? snapshot.visibility : null,
  };
}
