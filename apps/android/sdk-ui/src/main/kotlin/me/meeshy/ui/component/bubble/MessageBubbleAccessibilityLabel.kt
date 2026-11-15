package me.meeshy.ui.component.bubble

import me.meeshy.sdk.model.text.PlainText
import java.util.Locale
import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.sdk.model.MessageSourceKind

/**
 * Localized wording for the composed message-bubble accessibility label, injected by the
 * Compose layer from string resources so [MessageBubbleAccessibilityLabel] stays free of any
 * Android dependency and fully JVM-testable — the same injection pattern as
 * [me.meeshy.ui.format.RelativeTimeFormat].
 *
 * Count/name templates carry a single positional placeholder (`%d` for counts, `%s` for a name
 * or summary). [replyToExcerpt] carries two positional placeholders (`%1$s` author, `%2$s`
 * excerpt) since order must survive localization.
 */
public data class BubbleAccessibilityStrings(
    val unknownSender: String,
    val deleted: String,
    val replyToAuthor: String,
    val replyToExcerpt: String,
    val replyToYou: String,
    val images: String,
    val videos: String,
    val audios: String,
    val location: String,
    val file: String,
    val contactCard: String,
    val contactCardAccount: String,
    val viewOnceSealed: String,
    val viewOnce: String,
    val blurred: String,
    val edited: String,
    val pinned: String,
    /** « Transféré » : annoncé quand la politique ne nomme personne ; blanc ⇒ rien. */
    val forwarded: String = "",
    /** « Transféré depuis %s » (un groupe au moins public) ; blanc ⇒ [forwarded]. */
    val forwardedFromGroup: String = "",
    /** « Transf. de %s » (un tête-à-tête) ; blanc ⇒ [forwarded]. */
    val forwardedFromPerson: String = "",
    val ephemeral: String,
    val reactions: String,
    val delivery: BubbleDeliveryA11yStrings,
    /** What an end-to-end message this device cannot open says (#13110); blank ⇒ nothing of it is read. */
    val endToEndSealed: String = "",
    /** « Sans compte » : annoncé après le nom d'un invité anonyme ; blanc ⇒ rien. */
    val anonymousSender: String = "",
    /** La source annoncée pour un message qui ne vient pas d'un utilisateur ; blanc ⇒ rien. */
    val sources: BubbleSourceA11yStrings = BubbleSourceA11yStrings(),
)

/** L'étiquette parlée de chaque source non utilisateur ; blanc ⇒ la source n'est pas annoncée. */
public data class BubbleSourceA11yStrings(
    val system: String = "",
    val ads: String = "",
    val app: String = "",
    val agent: String = "",
    val authority: String = "",
) {
    internal fun of(kind: MessageSourceKind): String = when (kind) {
        MessageSourceKind.User -> ""
        MessageSourceKind.System -> system
        MessageSourceKind.Ads -> ads
        MessageSourceKind.App -> app
        MessageSourceKind.Agent -> agent
        MessageSourceKind.Authority -> authority
    }
}

/** The six spoken delivery phrasings, one per [DeliveryStatus] arm. */
public data class BubbleDeliveryA11yStrings(
    val sending: String,
    val slow: String,
    val queued: String,
    val sent: String,
    val delivered: String,
    val read: String,
    val failed: String,
)

/**
 * Composes a single spoken accessibility label for a message bubble — a faithful port of iOS
 * `MessageAccessibilityLabelComposer.compose`, adapted to the flat Android [BubbleContent] model.
 *
 * The reading order is frozen to match iOS: sender → (view-once chip alone) → reply → text →
 * images → videos → audios → location → contact cards → files → time → delivery → edited →
 * pinned → protection chrome (ephemeral, view once, blurred) → reactions. Parts are joined with
 * `", "`. A deleted message short-circuits to the sender plus the "deleted" phrasing; a sealed
 * view-once message says only its chip, the time and the ephemeral countdown; a blurred message
 * never reads its text.
 *
 * The clock is supplied by the caller only where a time is actually presented; a blank/absent
 * value drops the time arm.
 */
public object MessageBubbleAccessibilityLabel {

    public fun compose(
        content: BubbleContent,
        strings: BubbleAccessibilityStrings,
        locale: Locale,
        timeText: String? = null,
    ): String {
        val parts = mutableListOf<String>()

        if (!content.isOutgoing) {
            parts += content.senderName?.takeIf { it.isNotBlank() } ?: strings.unknownSender
            if (content.senderIsAnonymous) strings.anonymousSender.takeIf { it.isNotBlank() }?.let { parts += it }
            strings.sources.of(content.sourceKind).takeIf { it.isNotBlank() }?.let { parts += it }
        }

        if (content.isEndToEndSealed) {
            strings.endToEndSealed.takeIf { it.isNotBlank() }?.let { parts += it }
            timeText?.takeIf { it.isNotBlank() }?.let { parts += it }
            return parts.joinToString(", ")
        }

        if (!content.isDeleted && content.isSealedViewOnce) {
            parts += strings.viewOnceSealed
            timeText?.takeIf { it.isNotBlank() }?.let { parts += it }
            if (content.expiresAtIso != null) parts += strings.ephemeral
            return parts.joinToString(", ")
        }

        replyLabel(content, strings)?.let { parts += it }

        if (content.isDeleted) {
            parts += strings.deleted
            return parts.joinToString(", ")
        }

        if (content.text.isNotBlank() && !content.isBlurred) {
            parts += PlainText.of(content.text)
        }

        if (content.images.isNotEmpty()) {
            parts += String.format(locale, strings.images, content.images.size)
        }
        if (content.videoCount > 0) {
            parts += String.format(locale, strings.videos, content.videoCount)
        }
        if (content.audios.isNotEmpty()) {
            parts += String.format(locale, strings.audios, content.audios.size)
        }
        content.locations.forEach { _ -> parts += strings.location }
        content.contactCards.forEach { card -> parts += contactCardLabel(card, strings, locale) }
        content.files
            .filterNot { it.isVideo || it.isContactCard }
            .forEach { file -> parts += String.format(locale, strings.file, file.name?.trim().orEmpty()) }

        timeText?.takeIf { it.isNotBlank() }?.let { parts += it }

        if (content.isOutgoing) {
            parts += deliveryLabel(content.deliveryStatus, content.isSlowSend, strings.delivery)
        }
        if (content.isEdited) parts += strings.edited
        if (content.pinnedAtIso != null) parts += strings.pinned
        if (content.isForwarded) forwardedLabel(content.forwardAttribution, strings, locale).takeIf { it.isNotBlank() }?.let { parts += it }
        if (content.expiresAtIso != null) parts += strings.ephemeral
        if (content.isViewOnce) parts += strings.viewOnce
        if (content.isBlurred) parts += strings.blurred

        if (content.reactions.isNotEmpty()) {
            val summary = content.reactions.joinToString(", ") { "${it.emoji} ${it.count}" }
            parts += String.format(locale, strings.reactions, summary)
        }

        return parts.joinToString(", ")
    }

    private val BubbleContent.isSealedViewOnce: Boolean
        get() = isViewOnce && !isViewOnceOpenedByMe

    private fun contactCardLabel(
        card: BubbleContactCard,
        strings: BubbleAccessibilityStrings,
        locale: Locale,
    ): String {
        val head = String.format(locale, strings.contactCard, card.name?.trim().orEmpty())
        val account = card.accountUsername?.trim()?.takeIf { it.isNotEmpty() } ?: return head
        return head + ", " + String.format(locale, strings.contactCardAccount, "@$account")
    }

    private fun replyLabel(content: BubbleContent, strings: BubbleAccessibilityStrings): String? {
        if (content.replyToText == null && !content.replyToDeleted) return null
        val author = when {
            content.replyToIsMe -> strings.replyToYou
            else -> content.replyToSenderName?.takeIf { it.isNotBlank() } ?: strings.unknownSender
        }
        val excerpt = content.replyToText?.trim()?.takeIf { it.isNotEmpty() }
        return if (excerpt != null) {
            String.format(strings.replyToExcerpt, author, excerpt)
        } else {
            String.format(strings.replyToAuthor, author)
        }
    }

    private fun deliveryLabel(
        status: DeliveryStatus,
        isSlow: Boolean,
        strings: BubbleDeliveryA11yStrings,
    ): String = when (status) {
        DeliveryStatus.Pending -> if (isSlow) strings.slow else strings.sending
        DeliveryStatus.QueuedOffline -> strings.queued
        DeliveryStatus.Sent -> strings.sent
        DeliveryStatus.Delivered -> strings.delivered
        DeliveryStatus.Read -> strings.read
        DeliveryStatus.Failed -> strings.failed
    }

    private fun forwardedLabel(attribution: ForwardAttribution, strings: BubbleAccessibilityStrings, locale: Locale): String =
        when (attribution) {
            is ForwardAttribution.Group ->
                if (strings.forwardedFromGroup.isBlank()) strings.forwarded else String.format(locale, strings.forwardedFromGroup, attribution.name)
            is ForwardAttribution.Person ->
                if (strings.forwardedFromPerson.isBlank()) strings.forwarded else String.format(locale, strings.forwardedFromPerson, attribution.name)
            ForwardAttribution.Anonymous -> strings.forwarded
        }
}
