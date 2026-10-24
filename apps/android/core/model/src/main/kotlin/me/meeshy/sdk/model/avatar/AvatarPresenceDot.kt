package me.meeshy.sdk.model.avatar

import kotlin.math.PI
import kotlin.math.cos
import me.meeshy.sdk.model.PresenceState

/** Teinte symbolique d'un point ou d'un contour : la couleur réelle est résolue côté UI. */
public enum class AvatarDotTone { HERE, ONLINE, AWAY, IDLE }

/**
 * Ce que le point d'un avatar rend dans un contexte de conversation — miroir de `AvatarPresenceDot`
 * (PresenceStyle.swift) et de `presenceDotHex(status, { here })` côté TypeScript.
 *
 * Être ICI prime sur la présence globale et se rend même quand celle-ci est masquée : c'est un signal
 * d'activité servi par la room, comme la frappe. `null` = aucun point. Hors ligne ne rend jamais rien.
 */
public sealed class AvatarPresenceDot {

    public data object Here : AvatarPresenceDot()
    public data class Presence(val state: PresenceState) : AvatarPresenceDot()

    public val tone: AvatarDotTone
        get() = when (this) {
            Here -> AvatarDotTone.HERE
            is Presence -> when (state) {
                PresenceState.ONLINE -> AvatarDotTone.ONLINE
                PresenceState.AWAY -> AvatarDotTone.AWAY
                PresenceState.IDLE, PresenceState.OFFLINE -> AvatarDotTone.IDLE
            }
        }

    /** L'identité du point pour ses transitions : quand elle change, l'un cède la place à l'autre. */
    public val transitionKey: String
        get() = when (this) {
            Here -> "here"
            is Presence -> "presence.${state.name.lowercase()}"
        }

    /** Le point « ici » pulse en arrivant — une onde qui part de lui et s'éteint. */
    public val arrivesWithRipple: Boolean get() = this == Here

    /** Le mood remplace le point et porte sa couleur quand elle dit « ici » ou « en ligne ». */
    public val moodOutline: AvatarDotTone?
        get() = when (this) {
            Here -> AvatarDotTone.HERE
            is Presence -> if (state == PresenceState.ONLINE) AvatarDotTone.ONLINE else null
        }

    /** Respiration d'échelle de la pastille : « ici » a son onde, les autres seulement `online`. */
    public val pulses: Boolean
        get() = when (this) {
            Here -> false
            is Presence -> state == PresenceState.ONLINE
        }

    /** Diamètre du point, jamais sous [MINIMUM_DIAMETER] (réaction, frappe : 20 à 24 dp). */
    public fun diameter(avatarSize: Float): Float = when (this) {
        Here -> maxOf(MINIMUM_DIAMETER, avatarSize * HERE_RATIO)
        is Presence -> maxOf(MINIMUM_DIAMETER, avatarSize * PRESENCE_RATIO)
    }

    public companion object {
        public const val PRESENCE_RATIO: Float = 0.26f
        public const val HERE_RATIO: Float = 0.30f
        public const val MINIMUM_DIAMETER: Float = 6f

        /**
         * [Here] prime et se rend même sans présence servie ; sinon la présence ne rend un point que
         * si elle montre un indicateur (offline et absente = aucun point).
         */
        public fun resolve(presence: PresenceState?, isHere: Boolean): AvatarPresenceDot? {
            if (isHere) return Here
            if (presence == null || presence == PresenceState.OFFLINE) return null
            return Presence(presence)
        }

        /**
         * Décalage (dx = dy) qui pose le CENTRE du point sur le cercle de l'avatar, à 45 degrés, depuis
         * l'alignement bas-droite de son cadre (l'avatar seul, ou l'anneau de story quand il est peint).
         */
        public fun centerOffset(avatarSize: Float, frameSize: Float, dotDiameter: Float): Float {
            val target = frameSize / 2f + avatarSize / 2f * cos(PI / 4).toFloat()
            return target - (frameSize - dotDiameter / 2f)
        }
    }
}

/**
 * Onde du point « ici » : imperceptible quand le pair regarde en plein écran, douce au repos, à peine
 * plus ample quand il agit. Seule l'arrivée pulse franchement ([PresenceArrival]).
 */
public data class PresenceHereWave(val peakScale: Float, val startOpacity: Float, val durationMillis: Int) {
    public companion object {
        public val HUSH: PresenceHereWave = PresenceHereWave(1.25f, 0.2f, 2800)
        public val REST: PresenceHereWave = PresenceHereWave(1.6f, 0.3f, 2400)
        public val VIVID: PresenceHereWave = PresenceHereWave(1.9f, 0.4f, 1800)

        public fun forHere(here: ConversationHere): PresenceHereWave? = when (here) {
            ConversationHere.ABSENT -> null
            ConversationHere.HERE -> REST
            ConversationHere.ACTIVE -> VIVID
            ConversationHere.FOCUSED -> HUSH
        }
    }
}

/** Arrivée « ici » : le point grossit en ressort et un gros pulse part de lui avant qu'il se stabilise. */
public object PresenceArrival {
    public const val PEAK_SCALE: Float = 3f
    public const val LINE_WIDTH: Float = 3f
    public const val START_OPACITY: Float = 0.9f
    public const val DURATION_MILLIS: Int = 900
}
