package me.meeshy.sdk.model.preview

import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.AttachmentProtectionVerdict
import me.meeshy.sdk.model.LastMessageSummaryKind
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.protectionVerdict

/**
 * L'EFFET APPLIQUÉ À LA LIGNE 2 (#16975) — miroir de `PreviewEffect`
 * (`packages/shared/utils/conversation-preview.ts`) et de `ConversationPreviewEffect` (SDK Swift) :
 * une DESCRIPTION, jamais un rendu.
 *
 * - [veil] : la ligne d'un message flouté se peint en substitut voilé, sans aucun caractère.
 * - [finish] : l'effet PERSISTANT, peint FIGÉ (aucune animation en boucle dans une liste).
 * - [entrance] : l'effet d'APPARITION, joué une fois quand le message ARRIVE sur une ligne visible,
 *   au plus [ENTRANCE_MAX_MS], transformation seule.
 */
data class PreviewEffect(
    val veil: Boolean,
    val finish: PreviewFinish?,
    val entrance: PreviewEntrance?,
) {
    companion object {
        /** `PREVIEW_ENTRANCE_MAX_MS`. */
        const val ENTRANCE_MAX_MS: Int = 450

        val VEILED: PreviewEffect = PreviewEffect(veil = true, finish = null, entrance = null)
    }
}

enum class PreviewFinish { GLOW, PULSE, RAINBOW, SPARKLE }

enum class PreviewEntrance { SHAKE, POP }

private val FINISHES: List<Pair<Long, PreviewFinish>> = listOf(
    MessageEffectFlags.GLOW to PreviewFinish.GLOW,
    MessageEffectFlags.PULSE to PreviewFinish.PULSE,
    MessageEffectFlags.RAINBOW to PreviewFinish.RAINBOW,
    MessageEffectFlags.SPARKLE to PreviewFinish.SPARKLE,
)

private val ENTRANCES: List<Pair<Long, PreviewEntrance>> = listOf(
    MessageEffectFlags.SHAKE to PreviewEntrance.SHAKE,
    MessageEffectFlags.ZOOM to PreviewEntrance.POP,
    MessageEffectFlags.EXPLODE to PreviewEntrance.POP,
    MessageEffectFlags.CONFETTI to PreviewEntrance.POP,
    MessageEffectFlags.FIREWORKS to PreviewEntrance.POP,
    MessageEffectFlags.WAOO to PreviewEntrance.POP,
)

/**
 * L'effet que la ligne 2 applique pour [message], ou `null`.
 *
 * La protection suit le classement qu'Android dessine déjà ([LastMessageSummaryKind.of]) : seule la
 * ligne « masqué » ([LastMessageSummaryKind.HIDDEN]) se voile ; un effet comportemental ne s'applique
 * qu'à une ligne [LastMessageSummaryKind.STANDARD], et en plus, fermé par défaut, à un message qui ne
 * porte aucun bit de cycle de vie (éphémère sans échéance servie, flou ou vue unique par le seul bit)
 * ni une première pièce jointe masquée. Un appel ou un message système n'a jamais d'effet.
 */
fun previewEffectOf(message: ApiConversationLastMessage?, nowMillis: Long): PreviewEffect? {
    if (message == null || message.callSummary != null || message.messageType == "system") return null
    return when (LastMessageSummaryKind.of(message, nowMillis)) {
        LastMessageSummaryKind.HIDDEN -> PreviewEffect.VEILED
        LastMessageSummaryKind.STANDARD -> behaviouralEffect(message)
        else -> null
    }
}

private fun behaviouralEffect(message: ApiConversationLastMessage): PreviewEffect? {
    val flags = (message.effectFlags ?: 0).toLong() and 0xFFFFFFFFL
    if (flags and MessageEffectFlags.LIFECYCLE_MASK != 0L) return null
    if (message.attachments?.firstOrNull()?.protectionVerdict == AttachmentProtectionVerdict.Masked) return null
    val finish = FINISHES.firstOrNull { (bit, _) -> flags and bit != 0L }?.second
    val entrance = ENTRANCES.firstOrNull { (bit, _) -> flags and bit != 0L }?.second
    if (finish == null && entrance == null) return null
    return PreviewEffect(veil = false, finish = finish, entrance = entrance)
}

/**
 * Faut-il jouer l'apparition ? Seulement quand le dernier message de la ligne CHANGE pendant qu'elle
 * est composée : l'appelant initialise [previousId] avec l'id du premier rendu (premier affichage et
 * recyclage de liste ne jouent donc rien), et rien ne joue sous « réduire les animations » ni en
 * économie d'énergie.
 */
fun shouldPlayEntrance(
    previousId: String?,
    currentId: String?,
    reduceMotion: Boolean,
    powerSave: Boolean,
): Boolean {
    if (currentId == null || previousId == currentId) return false
    return !reduceMotion && !powerSave
}
