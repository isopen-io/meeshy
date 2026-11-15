package me.meeshy.sdk.model.scene

/**
 * Les deux modes du plan de rendu unique (miroir de `StoryRenderer.RenderMode`).
 *
 * - [EDIT] : tout est visible à pleine opacité, texte source brut (on édite l'original, pas une
 *   copie traduite), aucune fenêtre ni keyframe.
 * - [PLAY] : fenêtres `startTime`/`duration`, keyframes, fondus, transitions de clips, Prisme.
 */
public enum class SceneRenderMode { EDIT, PLAY }

/** Un objet est dans sa fenêtre (VISIBLE) ou, à l'arrêt dans l'aperçu de frise, un FANTÔME. */
public enum class ScenePresence { VISIBLE, GHOST }

/** Opacité du fantôme de la frise (#8370) : hors fenêtre, un objet est caché en lecture et à .25 à l'arrêt. */
public const val SCENE_GHOST_OPACITY: Double = 0.25
