package me.meeshy.sdk.model.fullscreen

import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

/**
 * Les cotes du chrome plein écran : UNE table pour tous les visualiseurs (galerie de
 * conversation, plein écran audio, story, réel, vidéo, image, photo de profil, lieu).
 *
 * Miroir de `FullscreenChromeMetrics.swift` (#8878) — les valeurs sont en dp, pas en
 * points : le disque de verre tient 40 dp (36 pt côté iOS) et sa cible tactile 48 dp
 * (44 pt), le plancher d'accessibilité d'Android. Un glyphe est figé en dp : il est
 * borné par son disque et ne grandit pas avec la taille de police.
 */
public object FullscreenChromeMetrics {

    /** Le disque de verre d'un bouton du chrome — ce qu'on VOIT. */
    public const val DISC_DIAMETER_DP: Int = 40

    /** La zone tactile — ce qu'on TOUCHE. Elle déborde le disque tout autour. */
    public const val TAP_TARGET_DP: Int = 48

    /** Le glyphe d'un disque, figé dans son disque. */
    public const val DISC_GLYPH_SIZE_DP: Int = 18

    /** Le glyphe d'une action FLOTTANTE du rail (story, réel), figé dans sa cellule. */
    public const val FLOATING_GLYPH_SIZE_DP: Int = 22

    /** La largeur d'une cellule flottante : le glyphe et son libellé ou son compteur. */
    public const val FLOATING_CELL_WIDTH_DP: Int = 56

    /** L'intervalle entre deux actions d'une colonne ou d'un rail (jeton `sm`). */
    public const val RAIL_SPACING_DP: Int = 8

    /** La gouttière latérale du chrome (jeton `lg`). */
    public const val EDGE_INSET_DP: Int = 16

    /** La marge au-dessus de la barre haute, sous la zone sûre (jeton `sm`). */
    public const val TOP_INSET_DP: Int = 8

    /** L'intervalle entre les éléments de la barre haute (jeton `sm`). */
    public const val BAR_SPACING_DP: Int = 8

    /** La course verticale qui ferme un visualiseur dont l'axe vertical est libre. */
    public const val DISMISS_DRAG_THRESHOLD_DP: Int = 150

    /** Le délai au bout duquel le chrome d'une vidéo EN LECTURE s'efface de lui-même. */
    public val AUTO_HIDE_DELAY: Duration = 3.seconds

    /**
     * Le délai au bout duquel le bouton pause CENTRAL s'efface, une fois la lecture partie
     * (#9577). Plus court que [AUTO_HIDE_DELAY] et distinct de lui : le bouton est posé sur
     * l'image, le reste du chrome autour.
     */
    public val PLAY_PAUSE_FADE_DELAY: Duration = 1.seconds

    /** Le décalage qui fait jaillir la rangée d'émojis à GAUCHE du bouton qui l'ouvre. */
    public const val REACTION_STRIP_LEADING_OFFSET_DP: Int = -FLOATING_CELL_WIDTH_DP

    /** Le CONTOUR d'une action flottante : le même glyphe, agrandi d'autant, derrière lui. */
    public const val OUTLINE_SCALE: Float = 1.22f

    /** Le HALO qui accompagne le contour : une ombre de sa teinte. */
    public const val OUTLINE_GLOW_RADIUS_DP: Int = 7

    /** L'opacité de ce halo. */
    public const val OUTLINE_GLOW_OPACITY: Float = 0.55f
}

/** Les verbes du chrome plein écran — un verbe, un symbole, partout (#8878). */
public enum class FullscreenChromeSymbol {
    Close,
    Back,
    More,
    React,
    ReactBadge,
    Like,
    LikeActive,
    Reply,
    Comments,
    Share,
    Save,
    Saved,
    Repost,
    Compose,
    AudioOutput,
    Play,
    Pause,
}

/** Un palier d'un voile : l'opacité du noir à une position (0 = bord haut du voile). */
public data class FullscreenScrimStop(val opacity: Float, val location: Float)

/**
 * Le voile de lisibilité : deux dégradés noirs, ancrés au haut et au bas de l'ÉCRAN, qui
 * détachent le chrome du média. Valeurs du lecteur de story (#6701), reprises par la
 * galerie (#6904) et la scène d'un réel.
 */
public object FullscreenScrimMetrics {

    /** La hauteur du voile haut AU-DELÀ de la zone sûre. */
    public const val TOP_EXTENT_DP: Int = 110

    /** La hauteur du voile bas. */
    public const val BOTTOM_HEIGHT_DP: Int = 240

    public val TOP_STOPS: List<FullscreenScrimStop> = listOf(
        FullscreenScrimStop(opacity = 0.7f, location = 0f),
        FullscreenScrimStop(opacity = 0.4f, location = 0.5f),
        FullscreenScrimStop(opacity = 0f, location = 1f),
    )

    public val BOTTOM_STOPS: List<FullscreenScrimStop> = listOf(
        FullscreenScrimStop(opacity = 0f, location = 0f),
        FullscreenScrimStop(opacity = 0.55f, location = 0.45f),
        FullscreenScrimStop(opacity = 0.92f, location = 1f),
    )
}
