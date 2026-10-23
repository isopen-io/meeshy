package me.meeshy.sdk.model.avatar

/**
 * Mémoire d'un avatar sur son point : seul un VRAI changement de point fait onduler « ici » — une liste
 * qui s'affiche ne pulse pas. Pur : l'écran garde cet état en `remember` et appelle [observe].
 */
public data class AvatarPresenceTransition(val shownKey: String?, val changed: Boolean) {

    /** Nouvelle observation du point rendu ; `changed` ne retombe jamais pendant la vie de l'avatar. */
    public fun observe(dot: AvatarPresenceDot?): AvatarPresenceTransition {
        val key = dot?.transitionKey
        return if (key == shownKey) this else AvatarPresenceTransition(key, changed = true)
    }

    /** L'onde d'arrivée « ici » : seulement après un changement réel, jamais sous Réduire les animations. */
    public fun showsArrivalRipple(dot: AvatarPresenceDot?, reduceMotion: Boolean): Boolean =
        dot != null && dot.arrivesWithRipple && changed && !reduceMotion

    public companion object {
        /** Premier rendu : aucun changement, la clé de départ est celle du point montré. */
        public fun initial(dot: AvatarPresenceDot?): AvatarPresenceTransition =
            AvatarPresenceTransition(dot?.transitionKey, changed = false)

        /** Insertion : le point entrant REBONDIT un temps après la sortie de l'autre. */
        public const val INSERT_FROM_SCALE: Float = 0.2f
        public const val INSERT_DELAY_MILLIS: Int = 120
        public const val INSERT_SPRING_RESPONSE: Float = 0.42f
        public const val INSERT_SPRING_DAMPING: Float = 0.45f

        /** Retrait : le point sortant DIMINUE. */
        public const val REMOVE_TO_SCALE: Float = 0.1f
        public const val REMOVE_DURATION_MILLIS: Int = 180

        /** Sous Réduire les animations, le remplacement se fait en fondu seul. */
        public fun scalesOnReplace(reduceMotion: Boolean): Boolean = !reduceMotion
    }
}

/** Le coin bas-droit d'un avatar : une humeur, un point de présence, ou rien. */
public sealed class AvatarCornerBadge {

    public data object None : AvatarCornerBadge()

    /** L'humeur MASQUE le point ; elle porte sa couleur de présence en contour. */
    public data class Mood(
        val emoji: String,
        val outline: AvatarDotTone?,
        val hushed: Boolean,
        val animates: Boolean,
        val pulseIntensity: Float,
    ) : AvatarCornerBadge()

    public data class Dot(val dot: AvatarPresenceDot, val pulses: Boolean) : AvatarCornerBadge()

    public companion object {
        public const val MOOD_PULSE_REST: Float = 0.12f
        public const val MOOD_PULSE_ACTIVE: Float = 0.16f

        /** L'amplitude du pouls de l'humeur suit ce que fait le pair : imperceptible en plein écran. */
        public fun moodPulseIntensity(here: ConversationHere): Float = when (here) {
            ConversationHere.FOCUSED -> MoodBadgeMotion.HUSHED_SCALE - 1f
            ConversationHere.ACTIVE -> MOOD_PULSE_ACTIVE
            ConversationHere.HERE, ConversationHere.ABSENT -> MOOD_PULSE_REST
        }

        /**
         * Résout le coin. L'humeur n'existe que pour un avatar de personne ([isUser]) dont le contexte
         * l'autorise ; le point, lui, se peint dans TOUS les contextes (absent ou hors ligne = rien).
         * Le point pulse si l'appelant l'autorise, que la présence pulse ET qu'un anneau de story est
         * peint ; rien ne pulse sous Réduire les animations.
         */
        public fun resolve(
            context: AvatarContext,
            isUser: Boolean,
            moodEmoji: String?,
            dot: AvatarPresenceDot?,
            here: ConversationHere,
            enablePulse: Boolean,
            hasStoryRing: Boolean,
            reduceMotion: Boolean,
        ): AvatarCornerBadge {
            val mood = moodEmoji?.takeIf { isUser && context.showsMoodBadge && it.isNotEmpty() }
            if (mood != null) {
                return Mood(
                    emoji = mood,
                    outline = dot?.moodOutline,
                    hushed = here.isFocused,
                    animates = context.animatesMoodBadge && enablePulse && !reduceMotion,
                    pulseIntensity = moodPulseIntensity(here),
                )
            }
            if (dot == null) return None
            return Dot(dot, pulses = enablePulse && dot.pulses && hasStoryRing && !reduceMotion)
        }
    }
}
