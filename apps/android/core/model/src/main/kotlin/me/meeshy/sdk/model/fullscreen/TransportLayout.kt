package me.meeshy.sdk.model.fullscreen

import me.meeshy.sdk.model.media.PlaybackSpeed

/** Les contrôles qu'un hôte demande au transport vidéo (miroir de `MeeshyVideoPlayer.ControlSet`). */
public enum class VideoControl { PLAY_PAUSE, SCRUBBER, DURATION, SKIP, MUTE, AIRPLAY, SPEED, LOOP, PIP }

/** Où le transport se rend : gabarit historique, centre seul, couloir de progression, colonne d'actions. */
public enum class TransportPlacement { STACKED, CENTER, CORRIDOR, RAIL }

public enum class TransportBarItem { MUTE, AUDIO_OUTPUT }

public enum class TransportMenuItem { SPEED, LOOP, PIP }

/**
 * Répartition PURE des contrôles de transport entre la barre, le menu ⋯ et le rail
 * (miroir de `TransportLayout.swift`, #6162 / #9577). Le PiP est masqué, jamais grisé,
 * quand l'appareil ne le supporte pas.
 */
public object TransportLayout {

    /** Hauteur réelle de la barre, publiée pour que l'hôte la réserve. */
    public const val BAR_HEIGHT_DP: Int = 48

    /** Vitesses proposées par le menu ⋯. */
    public val menuSpeeds: List<PlaybackSpeed> = listOf(
        PlaybackSpeed.X1_0, PlaybackSpeed.X1_25, PlaybackSpeed.X1_5, PlaybackSpeed.X1_75, PlaybackSpeed.X2_0,
    )

    public fun barItems(controls: Set<VideoControl>): List<TransportBarItem> = buildList {
        if (VideoControl.MUTE in controls) add(TransportBarItem.MUTE)
        if (VideoControl.AIRPLAY in controls) add(TransportBarItem.AUDIO_OUTPUT)
    }

    public fun menuItems(controls: Set<VideoControl>, pipSupported: Boolean = true): List<TransportMenuItem> = buildList {
        if (VideoControl.SPEED in controls) add(TransportMenuItem.SPEED)
        if (VideoControl.LOOP in controls) add(TransportMenuItem.LOOP)
        if (VideoControl.PIP in controls && pipSupported) add(TransportMenuItem.PIP)
    }

    public fun showsMenuButton(controls: Set<VideoControl>, pipSupported: Boolean = true): Boolean =
        menuItems(controls, pipSupported).isNotEmpty()

    public fun showsCenter(placement: TransportPlacement): Boolean =
        placement == TransportPlacement.STACKED || placement == TransportPlacement.CENTER

    public fun showsBar(
        placement: TransportPlacement,
        controls: Set<VideoControl>,
        pipSupported: Boolean = true,
    ): Boolean {
        val carriesProgress = VideoControl.SCRUBBER in controls || VideoControl.DURATION in controls
        return when (placement) {
            TransportPlacement.CENTER, TransportPlacement.RAIL -> false
            TransportPlacement.CORRIDOR -> carriesProgress
            TransportPlacement.STACKED ->
                carriesProgress || barItems(controls).isNotEmpty() || showsMenuButton(controls, pipSupported)
        }
    }

    public fun showsBarItems(placement: TransportPlacement): Boolean = placement == TransportPlacement.STACKED

    public fun showsRail(
        placement: TransportPlacement,
        controls: Set<VideoControl>,
        pipSupported: Boolean = true,
    ): Boolean = placement == TransportPlacement.RAIL &&
        (barItems(controls).isNotEmpty() || showsMenuButton(controls, pipSupported))

    public fun keepsAccessiblePlayPause(centerVisible: Boolean, controls: Set<VideoControl>): Boolean =
        !centerVisible && VideoControl.PLAY_PAUSE in controls

    public fun showsSkip(placement: TransportPlacement, controls: Set<VideoControl>): Boolean = when (placement) {
        TransportPlacement.STACKED -> VideoControl.SCRUBBER in controls
        TransportPlacement.CENTER -> VideoControl.SKIP in controls
        TransportPlacement.CORRIDOR, TransportPlacement.RAIL -> false
    }

    public fun showsElapsedTime(placement: TransportPlacement, controls: Set<VideoControl>): Boolean =
        placement == TransportPlacement.STACKED && VideoControl.DURATION in controls

    public fun showsTotalDuration(placement: TransportPlacement, controls: Set<VideoControl>): Boolean =
        placement != TransportPlacement.CENTER && VideoControl.DURATION in controls

    public fun wrapsBarInGlass(placement: TransportPlacement): Boolean = placement == TransportPlacement.STACKED
}
