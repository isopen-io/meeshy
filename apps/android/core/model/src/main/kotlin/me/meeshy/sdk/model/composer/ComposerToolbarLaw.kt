package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.MessageEffectFlags

/** Les trois protections que la barre d'outils arme (iOS `ComposerProtection`). */
public enum class ComposerProtection { EPHEMERAL, VIEW_ONCE, BLURRED }

/** La couleur que prennent les icônes du verre (iOS `ComposerIconTint`). */
public sealed interface ComposerIconTint {
    public data class Protection(val protection: ComposerProtection) : ComposerIconTint
    public data object Brand : ComposerIconTint
    public data object Common : ComposerIconTint
}

/**
 * Les lois pures de la barre d'outils du composeur, portées d'iOS (`ComposerProtection`,
 * `ComposerIconTint`, `ComposerActionSlot.textStickerWordLimit`).
 */
public object ComposerToolbarLaw {
    /** Au-delà de ce nombre de mots, la touche Retour redevient « retour à la ligne ». */
    public const val RETURN_SENDS_WORD_LIMIT: Int = 7

    /** La protection dominante d'un jeu de drapeaux : éphémère > vue unique > flou. */
    public fun dominant(flags: Long): ComposerProtection? = when {
        MessageEffectFlags.has(flags, MessageEffectFlags.EPHEMERAL) -> ComposerProtection.EPHEMERAL
        MessageEffectFlags.has(flags, MessageEffectFlags.VIEW_ONCE) -> ComposerProtection.VIEW_ONCE
        MessageEffectFlags.has(flags, MessageEffectFlags.BLURRED) -> ComposerProtection.BLURRED
        else -> null
    }

    /** Une protection armée donne sa couleur ; sinon un effet en attente la marque ; sinon la commune. */
    public fun iconTint(flags: Long): ComposerIconTint {
        dominant(flags)?.let { return ComposerIconTint.Protection(it) }
        return if (MessageEffectFlags.hasAny(flags)) ComposerIconTint.Brand else ComposerIconTint.Common
    }

    /**
     * Les bits à basculer pour basculer un VOILE (flou ou vue unique) : allumer l'un éteint
     * l'autre (iOS `togglingVeil`). L'éphémère n'est pas un voile : il bascule seul.
     */
    public fun veilToggles(flags: Long, veil: ComposerProtection): List<Long> {
        val blurred = MessageEffectFlags.has(flags, MessageEffectFlags.BLURRED)
        val viewOnce = MessageEffectFlags.has(flags, MessageEffectFlags.VIEW_ONCE)
        return when (veil) {
            ComposerProtection.BLURRED ->
                if (!blurred && viewOnce) listOf(MessageEffectFlags.BLURRED, MessageEffectFlags.VIEW_ONCE)
                else listOf(MessageEffectFlags.BLURRED)
            ComposerProtection.VIEW_ONCE ->
                if (!viewOnce && blurred) listOf(MessageEffectFlags.VIEW_ONCE, MessageEffectFlags.BLURRED)
                else listOf(MessageEffectFlags.VIEW_ONCE)
            ComposerProtection.EPHEMERAL -> listOf(MessageEffectFlags.EPHEMERAL)
        }
    }

    /** Le nombre de mots d'un texte (séparés par des blancs). */
    public fun wordCount(text: String): Int = text.split(Regex("\\s+")).count { it.isNotEmpty() }

    /** La touche Retour envoie tant que le texte tient en [RETURN_SENDS_WORD_LIMIT] mots. */
    public fun returnSends(text: String): Boolean = wordCount(text) <= RETURN_SENDS_WORD_LIMIT

    /** Les emojis par défaut de la bande rapide, après les plus utilisés. */
    public val QUICK_EMOJI_DEFAULTS: List<String> = listOf("😂", "❤️", "👍", "😮", "😢", "🔥")

    /** La bande rapide : les emojis récents (au plus [limit]) complétés par les défauts, sans doublon. */
    public fun quickEmojis(recent: List<String>, limit: Int = 20): List<String> =
        (recent.take(limit) + QUICK_EMOJI_DEFAULTS).distinct()
}
