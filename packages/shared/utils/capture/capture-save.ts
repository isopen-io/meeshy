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
 *
 * Une prise par la zone cadre supplante, pour elle seule, la politique de
 * Réglages › Médias (#9684, l'original jamais en galerie par défaut) :
 * `decisions/2026-10-12-une-prise-par-le-cadre-part-en-galerie-une-prise-hors-cadre-reste-dans-l-app-10284.md`.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Media/CaptureSaveLaw.swift`.
 * Vecteurs : `fixtures/capture-save/capture-save.vectors.json`, rejoués des deux côtés.
 */

export const CAPTURE_ZONES = ['frame', 'outside'] as const;
export type CaptureZone = (typeof CAPTURE_ZONES)[number];

/** `keptInApp` : la prise ne vit QUE dans l'application (jamais en galerie). */
export type CaptureDestination =
  | { readonly gallery: true; readonly then: 'edit'; readonly keptInApp: false }
  | { readonly gallery: false; readonly then: 'edit'; readonly keptInApp: true };

/** L'identifiant du cadre posé sur la prise ; `null` = aucun cadre. */
export type FrameChoice = string | null;

/** Une prise par la zone cadre a, par construction, un cadre choisi. */
export type CaptureOrigin =
  | { readonly zone: 'frame'; readonly frameId: string }
  | { readonly zone: 'outside'; readonly frameId: FrameChoice };

/**
 * L'état d'enregistrement d'une prise en retouche : le cadre courant, et les
 * cadres avec lesquels elle est (ou part) en galerie — « aucun cadre » compris.
 */
export type TakeSaveState = {
  readonly currentFrame: FrameChoice;
  readonly savedWith: readonly FrameChoice[];
};

const FRAME_DESTINATION: CaptureDestination = { gallery: true, then: 'edit', keptInApp: false };
const OUTSIDE_DESTINATION: CaptureDestination = { gallery: false, then: 'edit', keptInApp: true };

export const captureDestination = (zone: CaptureZone): CaptureDestination =>
  zone === 'frame' ? FRAME_DESTINATION : OUTSIDE_DESTINATION;

/** L'état juste après la prise : une prise par le cadre part déjà en galerie (mise à jour optimiste). */
export const beginTake = (origin: CaptureOrigin): TakeSaveState => ({
  currentFrame: origin.frameId,
  savedWith: origin.zone === 'frame' ? [origin.frameId] : [],
});

/** « Enregistrer » est visible tant que la prise n'est pas en galerie AVEC le cadre courant. */
export const saveButtonVisible = (state: TakeSaveState): boolean => !state.savedWith.includes(state.currentFrame);

/** « Enregistrer » touché : la prise part en galerie avec le cadre courant (optimiste). */
export const applySaved = (state: TakeSaveState): TakeSaveState =>
  saveButtonVisible(state) ? { ...state, savedWith: [...state.savedWith, state.currentFrame] } : state;

/** L'écriture en galerie avec `frameId` a échoué : ce cadre redevient à enregistrer. */
export const applySaveFailed = (state: TakeSaveState, frameId: FrameChoice): TakeSaveState => ({
  ...state,
  savedWith: state.savedWith.filter((saved) => saved !== frameId),
});

export const applyFrameChange = (state: TakeSaveState, frameId: FrameChoice): TakeSaveState => ({
  ...state,
  currentFrame: frameId,
});
