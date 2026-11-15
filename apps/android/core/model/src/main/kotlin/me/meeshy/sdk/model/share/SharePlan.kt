package me.meeshy.sdk.model.share

import me.meeshy.sdk.model.ContentExitLaw
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.model.ReelComposition

/*
 * **LE plan de l'écran de partage unique** (#13469, #10949) — pur : aucune requête, aucun réseau.
 * Miroir de `SharePlanner` (iOS, `SharePlan.swift`) et de `planShare`
 * (`packages/shared/utils/share-plan.ts`, qui fait foi). La nature d'un message se lit par la
 * loi de sortie ([ContentExitLaw]), jamais par une règle redite ici.
 */

enum class ShareCardKind { POST, STORY, REEL, PROFILE, INVITATION }

/** Ce que l'écran reçoit à envoyer. */
sealed interface ShareEntry {
    data class Text(val text: String) : ShareEntry
    data class Link(val url: String, val text: String? = null) : ShareEntry
    data class Media(val media: List<ShareMedia>, val text: String? = null) : ShareEntry
    data class Piece(val message: ShareMessage, val attachmentId: String) : ShareEntry
    data class Messages(val messages: List<ShareMessage>) : ShareEntry
    data class Card(val kind: ShareCardKind, val url: String?) : ShareEntry
}

/** Un destinataire choisi. [encrypted] faux = non chiffré. */
data class ShareDestination(val id: String, val encrypted: Boolean = false)

enum class ShareAction {
    SEND, CAPTION, REORDER, GROUPING, PUBLISH_POST, PUBLISH_STORY, PUBLISH_REEL, STUDIO, SAVE, COPY_LINK, COPY_TEXT,
    IMAGER, SHARE_OUT,
}

enum class ShareWithheldReason {
    SINGLE_PHOTO_NOT_A_REEL, NOT_A_REEL, TOO_MANY_FOR_PUBLICATION, FLAME, BLURRED, ENCRYPTED, CITES_PROTECTED,
}

enum class ShareWithdrawReason { VIEW_ONCE, AFTER_READ, UNAVAILABLE }

data class ShareWithheld(val action: ShareAction, val reason: ShareWithheldReason)

data class ShareWithdrawal(val id: String, val reason: ShareWithdrawReason)

enum class ShareTitle { SEND, FORWARD }

enum class ShareGrouping { TOGETHER, SEPARATELY }

data class ShareCaption(val placement: Placement, val maxLength: Int = ShareLimits.MAX_CAPTION_LENGTH) {
    enum class Placement {
        /** La légende est le texte du message (du premier en « Séparément »). */
        MESSAGE_TEXT,

        /** La légende part en message à part, juste après la copie (D4). */
        SEPARATE_MESSAGE,
    }
}

/**
 * Source chiffrée : la copie se fait sur l'appareil ; les destinations [warnDestinationIds]
 * ne sont pas chiffrées et reçoivent l'avertissement (D7).
 */
data class ShareEncryption(val warnDestinationIds: List<String>) {
    val copyOnDevice: Boolean get() = true
}

data class ShareLimitsReport(val files: Int, val bytes: Long, val trimCount: Int, val recipients: Int, val overRecipients: Int)

data class SharePlan(
    val title: ShareTitle,
    /** Ce qui part, dans l'ordre : ids des messages, de la pièce, ou des médias (index sans id). */
    val kept: List<String>,
    val withdrawn: List<ShareWithdrawal>,
    /** Rien ne part : tout ce qui est choisi est protégé ou indisponible. */
    val blocked: ShareWithdrawReason?,
    val actions: List<ShareAction>,
    val withheld: List<ShareWithheld>,
    val grouping: ShareGrouping?,
    val caption: ShareCaption?,
    /** La copie d'une flamme dure AU PLUS autant que la source — présélectionnée. */
    val flameMaxDurationSeconds: Int?,
    /** La copie d'un flouté reste floutée (D8). */
    val blurInherited: Boolean,
    val encryption: ShareEncryption?,
    val limits: ShareLimitsReport,
    val canSend: Boolean,
) {
    fun offers(action: ShareAction): Boolean = action in actions

    fun withheldReason(action: ShareAction): ShareWithheldReason? = withheld.firstOrNull { it.action == action }?.reason
}

object SharePlanner {
    private enum class Family { IMAGE, VIDEO, AUDIO, FILE }

    private data class Offer(val actions: List<ShareAction>, val withheld: List<ShareWithheld> = emptyList()) {
        companion object {
            val None = Offer(emptyList())
            fun plain(vararg actions: ShareAction) = Offer(actions.toList())
            fun merged(vararg offers: Offer) = Offer(offers.flatMap { it.actions }, offers.flatMap { it.withheld })
        }
    }

    private data class Withhold(val actions: List<ShareAction>, val reason: ShareWithheldReason)

    private data class Nature(val withhold: List<Withhold>, val flameSeconds: Int?, val blurred: Boolean, val encrypted: Boolean)

    private data class Draft(
        val title: ShareTitle,
        val kept: List<String>,
        val withdrawn: List<ShareWithdrawal>,
        val blocked: ShareWithdrawReason?,
        val offer: Offer,
        val nature: Nature?,
        val media: List<ShareMedia>,
        val captionPlacement: ShareCaption.Placement?,
    )

    private val publish = listOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO)
    private val exports = listOf(
        ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.PUBLISH_REEL, ShareAction.STUDIO, ShareAction.SAVE,
        ShareAction.COPY_LINK, ShareAction.COPY_TEXT, ShareAction.IMAGER, ShareAction.SHARE_OUT,
    )
    private val publications = listOf(ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.PUBLISH_REEL, ShareAction.STUDIO)

    private fun familyOf(media: ShareMedia): Family {
        val mime = media.mimeType.lowercase()
        return when {
            mime.startsWith("image/") -> Family.IMAGE
            mime.startsWith("video/") -> Family.VIDEO
            mime.startsWith("audio/") -> Family.AUDIO
            else -> Family.FILE
        }
    }

    /** Visuels homogènes, ou sons seuls (D13) ; jamais un fichier. */
    private fun publicationOffer(media: List<ShareMedia>): Offer {
        val families = media.map(::familyOf)
        val visual = families.all { it == Family.IMAGE || it == Family.VIDEO }
        val sound = families.all { it == Family.AUDIO }
        if (media.isEmpty() || !(visual || sound)) return Offer.None
        if (media.size > ShareLimits.MAX_PUBLICATION_MEDIA) {
            return Offer(emptyList(), publish.map { ShareWithheld(it, ShareWithheldReason.TOO_MANY_FOR_PUBLICATION) })
        }
        if (sound) return Offer(publish)
        val reel = ReelComposition.qualifiesAsReel(media.map { ReelComposition.MediaKind(it.mimeType, it.durationMs?.toLong()) })
        if (reel) return Offer(publish + ShareAction.PUBLISH_REEL)
        val singlePhoto = media.size == 1 && families.first() == Family.IMAGE
        val reason = if (singlePhoto) ShareWithheldReason.SINGLE_PHOTO_NOT_A_REEL else ShareWithheldReason.NOT_A_REEL
        return Offer(publish, listOf(ShareWithheld(ShareAction.PUBLISH_REEL, reason)))
    }

    private fun isBlurredCarrier(isBlurred: Boolean?, effectFlags: Long?): Boolean =
        isBlurred == true || ((effectFlags ?: 0L) and MessageEffectFlags.BLURRED) != 0L

    private fun hasText(text: String?): Boolean = !text.isNullOrBlank()

    private fun withdrawReason(message: ShareMessage, pieces: List<ShareMedia>? = null): ShareWithdrawReason? =
        when (val verdict = message.exitLaw(pieces).forward) {
            is ContentExitLaw.ForwardVerdict.Allowed -> null
            is ContentExitLaw.ForwardVerdict.Refused -> when (verdict.reason) {
                ContentExitLaw.ForwardRefusal.VIEW_ONCE -> ShareWithdrawReason.VIEW_ONCE
                ContentExitLaw.ForwardRefusal.AFTER_READ -> ShareWithdrawReason.AFTER_READ
            }
        }

    private fun natureOf(sources: List<Pair<ShareMessage, List<ShareMedia>>>): Nature {
        val flames = sources.mapNotNull { (message, pieces) -> message.exitLaw(pieces).forward.maxDurationSeconds }
        val blurred = sources.any { (message, pieces) ->
            isBlurredCarrier(message.isBlurred, message.effectFlags) || pieces.any { isBlurredCarrier(it.isBlurred, it.effectFlags) }
        }
        val encrypted = sources.any { it.first.encrypted }
        val citesProtected = sources.any { it.first.citesProtected }
        val withhold = buildList {
            if (flames.isNotEmpty()) add(Withhold(exports, ShareWithheldReason.FLAME))
            if (blurred) add(Withhold(exports, ShareWithheldReason.BLURRED))
            if (encrypted) add(Withhold(publications, ShareWithheldReason.ENCRYPTED))
            if (citesProtected) add(Withhold(listOf(ShareAction.IMAGER), ShareWithheldReason.CITES_PROTECTED))
        }
        return Nature(withhold, flames.minOrNull(), blurred, encrypted)
    }

    private fun applying(nature: Nature, offer: Offer): Offer {
        fun reason(action: ShareAction) = nature.withhold.firstOrNull { action in it.actions }?.reason
        val kept = offer.actions.filter { reason(it) == null }
        val removed = offer.actions.mapNotNull { action -> reason(action)?.let { ShareWithheld(action, it) } }
        return Offer(kept, removed + offer.withheld.filter { reason(it.action) == null })
    }

    private fun cardOffer(kind: ShareCardKind): Offer = when (kind) {
        ShareCardKind.POST, ShareCardKind.REEL -> Offer.plain(
            ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY,
            ShareAction.COPY_LINK, ShareAction.SHARE_OUT,
        )
        ShareCardKind.STORY -> Offer.plain(
            ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY,
            ShareAction.PUBLISH_REEL, ShareAction.STUDIO, ShareAction.COPY_LINK, ShareAction.SHARE_OUT,
        )
        ShareCardKind.PROFILE, ShareCardKind.INVITATION -> Offer.plain(
            ShareAction.SEND, ShareAction.CAPTION, ShareAction.COPY_LINK, ShareAction.SHARE_OUT,
        )
    }

    private fun mediaIds(media: List<ShareMedia>): List<String> = media.mapIndexed { index, item -> item.id ?: index.toString() }

    private fun sendDraft(offer: Offer, caption: ShareCaption.Placement?, media: List<ShareMedia> = emptyList()) =
        Draft(ShareTitle.SEND, mediaIds(media), emptyList(), null, offer, null, media, caption)

    private fun blockedDraft(reason: ShareWithdrawReason, withdrawn: List<ShareWithdrawal> = emptyList()) =
        Draft(ShareTitle.FORWARD, emptyList(), withdrawn, reason, Offer.None, null, emptyList(), null)

    private fun pieceDraft(message: ShareMessage, attachmentId: String): Draft {
        val piece = message.pieces.firstOrNull { it.id == attachmentId } ?: return blockedDraft(ShareWithdrawReason.UNAVAILABLE)
        withdrawReason(message, listOf(piece))?.let { return blockedDraft(it) }
        val offer = Offer.merged(
            Offer.plain(ShareAction.SEND, ShareAction.CAPTION), publicationOffer(listOf(piece)),
            Offer.plain(ShareAction.SAVE, ShareAction.SHARE_OUT),
        )
        return Draft(
            ShareTitle.FORWARD, listOf(attachmentId), emptyList(), null, offer, natureOf(listOf(message to listOf(piece))),
            emptyList(), ShareCaption.Placement.SEPARATE_MESSAGE,
        )
    }

    private fun messagesDraft(messages: List<ShareMessage>): Draft {
        val withdrawn = messages.mapNotNull { message -> withdrawReason(message)?.let { ShareWithdrawal(message.id, it) } }
        val withdrawnIds = withdrawn.map { it.id }.toSet()
        val kept = messages.filter { it.id !in withdrawnIds }
        if (kept.isEmpty()) return blockedDraft(withdrawn.firstOrNull()?.reason ?: ShareWithdrawReason.UNAVAILABLE, withdrawn)
        val pieces = kept.singleOrNull()?.pieces.orEmpty()
        val publishable = if (pieces.isEmpty()) Offer.None else Offer.merged(
            publicationOffer(pieces), Offer.plain(ShareAction.SAVE, ShareAction.SHARE_OUT),
        )
        val offer = Offer.merged(
            Offer.plain(ShareAction.SEND, ShareAction.CAPTION),
            if (kept.size > 1 || pieces.size > 1) Offer.plain(ShareAction.REORDER) else Offer.None,
            publishable,
            Offer.plain(ShareAction.IMAGER),
            if (kept.any { hasText(it.text) }) Offer.plain(ShareAction.COPY_TEXT) else Offer.None,
        )
        return Draft(
            ShareTitle.FORWARD, kept.map { it.id }, withdrawn, null, offer, natureOf(kept.map { it to it.pieces }),
            emptyList(), ShareCaption.Placement.SEPARATE_MESSAGE,
        )
    }

    private fun draftOf(entry: ShareEntry): Draft = when (entry) {
        is ShareEntry.Text -> sendDraft(
            Offer.plain(ShareAction.SEND, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO), null,
        )
        is ShareEntry.Link -> sendDraft(
            Offer.plain(
                ShareAction.SEND, ShareAction.CAPTION, ShareAction.PUBLISH_POST, ShareAction.PUBLISH_STORY, ShareAction.STUDIO,
                ShareAction.COPY_LINK, ShareAction.SHARE_OUT,
            ),
            ShareCaption.Placement.MESSAGE_TEXT,
        )
        is ShareEntry.Media -> sendDraft(
            Offer.merged(
                Offer.plain(ShareAction.SEND, ShareAction.CAPTION),
                if (entry.media.size > 1) Offer.plain(ShareAction.REORDER, ShareAction.GROUPING) else Offer.None,
                publicationOffer(entry.media),
            ),
            ShareCaption.Placement.MESSAGE_TEXT, entry.media,
        )
        is ShareEntry.Piece -> pieceDraft(entry.message, entry.attachmentId)
        is ShareEntry.Messages -> messagesDraft(entry.messages)
        is ShareEntry.Card -> sendDraft(cardOffer(entry.kind), ShareCaption.Placement.MESSAGE_TEXT)
    }

    /** Le plus petit nombre de pièces à retirer, depuis la fin, pour tenir les deux plafonds. */
    fun trimCount(media: List<ShareMedia>): Int {
        val sizes = media.map { maxOf(0L, it.bytes ?: 0L) }
        val keep = (media.size downTo 0).firstOrNull { count ->
            count <= ShareLimits.MAX_FILES && sizes.take(count).sum() <= ShareLimits.MAX_TOTAL_BYTES
        } ?: 0
        return media.size - keep
    }

    fun plan(entry: ShareEntry, destinations: List<ShareDestination> = emptyList()): SharePlan {
        val draft = draftOf(entry)
        val offer = draft.nature?.let { applying(it, draft.offer) } ?: draft.offer
        val actions = offer.actions.distinct()
        val bytes = draft.media.sumOf { maxOf(0L, it.bytes ?: 0L) }
        val trim = trimCount(draft.media)
        val overRecipients = maxOf(0, destinations.size - ShareLimits.MAX_RECIPIENTS)
        return SharePlan(
            title = draft.title,
            kept = draft.kept,
            withdrawn = draft.withdrawn,
            blocked = draft.blocked,
            actions = actions,
            withheld = offer.withheld,
            grouping = ShareGrouping.TOGETHER.takeIf { ShareAction.GROUPING in actions },
            caption = draft.captionPlacement?.takeIf { ShareAction.CAPTION in actions }?.let { ShareCaption(it) },
            flameMaxDurationSeconds = draft.nature?.flameSeconds,
            blurInherited = draft.nature?.blurred == true,
            encryption = ShareEncryption(destinations.filterNot { it.encrypted }.map { it.id }).takeIf { draft.nature?.encrypted == true },
            limits = ShareLimitsReport(draft.media.size, bytes, trim, destinations.size, overRecipients),
            canSend = draft.blocked == null && ShareAction.SEND in actions && trim == 0 && destinations.isNotEmpty() && overRecipients == 0,
        )
    }
}
