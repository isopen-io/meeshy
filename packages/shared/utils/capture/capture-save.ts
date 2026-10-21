/**
 * LA LOI D'ENREGISTREMENT D'UNE PRISE (#10284) — le cadre EST le déclencheur.
 *
 * Directive porteur 2026-10-12 : « photo ou vidéo à partir du cadre, on
 * sauvegarde dans la galerie et on passe à l'édition, et en filmant sans passer
 * par la zone cadre, on passe à l'edition aussi mais on preserve juste l'image
 * dans l'application uniquement, de toute façon le bouton enregistré de l'ecran
 * d'apres disparait si on a déjà enregistré sinon reste visible, disparait tant
 * qu'on ne change pas de cadre pour refaire l'enregistrement. »
 *
 * - zone `frame` : la case du cadre choisi (toucher = photo, appui long = vidéo).
 * - zone `outside` : la scène, ou le déclencheur rond quand AUCUN cadre n'est choisi.
 * - « déjà enregistré » se lit par VERSION, la paire (cadre, format) : changer de
 *   format (story, carré) fait réapparaître « Enregistrer » comme changer de cadre (#10296).
 *
 * La directive fixe des DÉFAUTS ; le réglage de l'utilisateur prime (correction
 * porteur 2026-10-12 : « il faut respecter la consigne et reglage utilisateur.
 * Je n'exprimais que le comportement par défaut »). Réglages › Médias
 * « enregistrer l'original » (#9684) activé, l'original d'une prise hors cadre
 * part en galerie ; par défaut, il reste dans l'app. Une prise par le cadre part
 * en galerie : c'est le défaut, et aucun réglage ne le contredit.
 * `decisions/2026-10-12-une-prise-par-le-cadre-part-en-galerie-une-prise-hors-cadre-reste-dans-l-app-10284.md`.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Media/CaptureSaveLaw.swift`.
 * Vecteurs : `fixtures/capture-save/capture-save.vectors.json`, rejoués des deux côtés.
 */

export const CAPTURE_ZONES = ['frame', 'outside'] as const;
export type CaptureZone = (typeof CAPTURE_ZONES)[number];

/** `keptInApp` : la prise ne vit QUE dans l'application (jamais en galerie). Hors cadre avec le réglage, c'est l'ORIGINAL qui part en galerie. */
export type CaptureDestination =
  | { readonly gallery: true; readonly then: 'edit'; readonly keptInApp: false }
  | { readonly gallery: false; readonly then: 'edit'; readonly keptInApp: true };

/** L'identifiant du cadre posé sur la prise ; `null` = aucun cadre. */
export type FrameChoice = string | null;

/** Le format de l'image écrite (`story`, `square`, une proportion…) : opaque pour la loi. */
export type CaptureFormat = string;

/**
 * Une VERSION de la prise : la paire (cadre, format). Changer l'un ou l'autre
 * produit une autre image, donc une autre version à enregistrer (#10296,
 * porteur 2026-10-12 : « Oui ce doit faire apparaitre Enregistrer »).
 */
export type SavedVersion = { readonly frameId: FrameChoice; readonly format: CaptureFormat };

/** Une prise par la zone cadre a, par construction, un cadre choisi. */
export type CaptureOrigin =
  | { readonly zone: 'frame'; readonly frameId: string; readonly format: CaptureFormat }
  | { readonly zone: 'outside'; readonly frameId: FrameChoice; readonly format: CaptureFormat };

/**
 * L'état d'enregistrement d'une prise en retouche : la version courante (cadre,
 * format), et les versions déjà (ou en train d'être) en galerie — « aucun cadre » compris.
 */
export type TakeSaveState = {
  readonly currentFrame: FrameChoice;
  readonly currentFormat: CaptureFormat;
  readonly savedWith: readonly SavedVersion[];
};

const FRAME_DESTINATION: CaptureDestination = { gallery: true, then: 'edit', keptInApp: false };
const OUTSIDE_DESTINATION: CaptureDestination = { gallery: false, then: 'edit', keptInApp: true };

/** `savesOriginal` : Réglages › Médias « enregistrer l'original » (#9684) ; absent = le défaut, désactivé. */
export type CaptureDestinationOptions = { readonly savesOriginal?: boolean };

export const captureDestination = (zone: CaptureZone, { savesOriginal = false }: CaptureDestinationOptions = {}): CaptureDestination =>
  zone === 'frame' || savesOriginal ? FRAME_DESTINATION : OUTSIDE_DESTINATION;

const currentVersion = (state: TakeSaveState): SavedVersion => ({ frameId: state.currentFrame, format: state.currentFormat });

const sameVersion = (a: SavedVersion, b: SavedVersion): boolean => a.frameId === b.frameId && a.format === b.format;

/** L'état juste après la prise : une prise par le cadre part déjà en galerie, au format de la prise (mise à jour optimiste). */
export const beginTake = (origin: CaptureOrigin): TakeSaveState => ({
  currentFrame: origin.frameId,
  currentFormat: origin.format,
  savedWith: origin.zone === 'frame' ? [{ frameId: origin.frameId, format: origin.format }] : [],
});

/** « Enregistrer » est visible tant que la prise n'est pas en galerie dans la version courante (cadre, format). */
export const saveButtonVisible = (state: TakeSaveState): boolean =>
  !state.savedWith.some((saved) => sameVersion(saved, currentVersion(state)));

/** « Enregistrer » touché : la version courante part en galerie (optimiste). */
export const applySaved = (state: TakeSaveState): TakeSaveState =>
  saveButtonVisible(state) ? { ...state, savedWith: [...state.savedWith, currentVersion(state)] } : state;

/** L'écriture en galerie de `version` a échoué : CETTE version redevient à enregistrer, qui peut ne plus être la courante. */
export const applySaveFailed = (state: TakeSaveState, version: SavedVersion): TakeSaveState => ({
  ...state,
  savedWith: state.savedWith.filter((saved) => !sameVersion(saved, version)),
});

export const applyFrameChange = (state: TakeSaveState, frameId: FrameChoice): TakeSaveState => ({
  ...state,
  currentFrame: frameId,
});

export const applyFormatChange = (state: TakeSaveState, format: CaptureFormat): TakeSaveState => ({
  ...state,
  currentFormat: format,
});
