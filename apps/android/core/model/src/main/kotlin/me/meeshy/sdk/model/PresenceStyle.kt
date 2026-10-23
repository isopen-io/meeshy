package me.meeshy.sdk.model

import me.meeshy.sdk.model.avatar.AvatarDotTone
import me.meeshy.sdk.model.avatar.AvatarPresenceDot

/**
 * Table CENTRALE état de présence -> teinte du point (miroir de `PresenceState.dotColor` / `showsIndicator` /
 * `pulses` d'iOS `PresenceStyle.swift` et de `PRESENCE_HEX` côté TypeScript). Règle 1/3/5 :
 * en ligne = vert (pulse), absent = orange, inactif = gris AFFICHÉ, hors ligne ou donnée absente = AUCUN point.
 * La couleur réelle est résolue côté UI par la teinte ; jamais redéclarée localement.
 */
public object PresenceStyle {

    /** La teinte du point d'un avatar, ou `null` quand rien ne se rend (hors ligne, présence absente). */
    public fun dotTone(state: PresenceState?): AvatarDotTone? = when (state) {
        PresenceState.ONLINE -> AvatarDotTone.ONLINE
        PresenceState.AWAY -> AvatarDotTone.AWAY
        PresenceState.IDLE -> AvatarDotTone.IDLE
        PresenceState.OFFLINE, null -> null
    }

    /** Hors ligne ne rend RIEN : ni point, ni badge, ni annonce TalkBack. */
    public fun showsIndicator(state: PresenceState?): Boolean = dotTone(state) != null

    /** Seul « en ligne » pulse. */
    public fun pulses(state: PresenceState?): Boolean = state == PresenceState.ONLINE

    /** Diamètre (dp) du point d'un avatar de [avatarSize] dp : 26 % (30 % pour « ici »), jamais sous 6 dp. */
    public fun dotDiameter(dot: AvatarPresenceDot, avatarSize: Float): Float = dot.diameter(avatarSize)

    /** Courbe easeOut des ondes (cubic-bezier 0, 0, 0.58, 1), comme `.easeOut` d'iOS. */
    public const val WAVE_EASE_X1: Float = 0f
    public const val WAVE_EASE_Y1: Float = 0f
    public const val WAVE_EASE_X2: Float = 0.58f
    public const val WAVE_EASE_Y2: Float = 1f

    /** Retard de l'onde d'arrivée avant qu'elle parte du point. */
    public const val ARRIVAL_DELAY_MILLIS: Int = 150
}
