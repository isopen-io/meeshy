package me.meeshy.app.chat.river

import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.sdk.model.ServedProfileDecorItem
import androidx.compose.runtime.Immutable
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.BubbleStickerSpec
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.reading.river.RiverBubble
import me.meeshy.sdk.model.reading.river.RiverConversationMapping
import me.meeshy.sdk.model.reading.river.RiverConversationMessage
import me.meeshy.sdk.model.reading.river.RiverGeometry
import me.meeshy.sdk.model.reading.river.RiverGroupPosition
import me.meeshy.sdk.model.reading.river.RiverLayout
import me.meeshy.sdk.model.reading.river.RiverTimeScale
import me.meeshy.ui.component.StoryRingState
import me.meeshy.ui.component.bubble.BubbleBlurRevealSpec
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.BubbleStoryReply
import me.meeshy.ui.component.bubble.EmojiDetector
import me.meeshy.ui.component.bubble.ReplyMediaKind
import me.meeshy.ui.component.river.riverRendersAttachments
import me.meeshy.ui.component.bubble.drawnSticker
import me.meeshy.ui.format.bubbleClockLabel

/** La citation d'une réponse, sur UNE ligne (iOS `RiverReplyPreview`). */
@Immutable
internal data class RiverReplyPreview(
    val authorDisplayName: String,
    val text: String,
    /** La vignette servie du média cité : la zone média sous la ligne (iOS `RiverQuotedMedia`), absente pour un texte seul. */
    val thumbnailUrl: String? = null,
)

/**
 * L'identité de la voix qui parle : sa photo, sa fiche, l'anneau de sa story. La PRÉSENCE n'y est
 * pas — elle se lit au plus bas niveau (`rememberPresence`, au pied de l'avatar), pour qu'un point
 * qui change de couleur ne réinvalide jamais le rendu des bulles.
 */
@Immutable
internal data class RiverBubbleIdentity(
    val avatarUrl: String?,
    val userId: String?,
    val profile: ProfileSheetUser?,
    val storyRing: StoryRingState,
    /** La conversation du message : « ici » (`viewing:*`) ne vaut que pour elle, lu au pied de l'avatar. */
    val conversationId: String? = null,
    /** Le contour équipé de l'expéditeur, tel que servi : l'avatar le résout par le catalogue. */
    val avatarRing: ServedProfileDecorItem? = null,
)

/** Ce qui remplace le texte d'une bulle que rien n'a le droit de montrer. */
internal enum class RiverProtection { NONE, END_TO_END_SEALED, BURNED }

/**
 * Ce que le lecteur voit dans UNE bulle de la Rivière : texte PRISME (servi par le fil), heure, nom,
 * graine de couleur, aperçu de la réponse, position dans son groupe. Immuable et comparable : la
 * bulle saute sa recomposition tant que son contenu ne change pas (iOS `RiverBubbleView: Equatable`).
 */
@Immutable
internal data class RiverBubbleContent(
    val bubble: RiverBubble,
    val senderDisplayName: String,
    val colorSeed: String,
    val timeString: String,
    val text: String,
    val layout: RiverLayout,
    val replyPreview: RiverReplyPreview?,
    val groupPosition: RiverGroupPosition,
    val identity: RiverBubbleIdentity?,
    val isForwarded: Boolean,
    val forwardAttribution: ForwardAttribution,
    val blurReveal: BubbleBlurRevealSpec?,
    val protection: RiverProtection,
    val isPending: Boolean,
    /** L'échéance d'un message éphémère (epoch ms) : passée, la bulle se retire comme dans le fil. */
    val expiresAtMs: Long? = null,
    /** Le sticker que la bulle DESSINE à la place de son texte de repli (#14534, iOS `FocalRow.stickerBlock`). */
    val sticker: BubbleStickerSpec? = null,
    /** La story citée, rendue en carte dans la bulle (iOS `storyCitation`) ; jamais pour un contenu protégé. */
    val storyReply: BubbleStoryReply? = null,
    /** Un emoji envoyé SEUL grossit à cette taille (iOS `emojiFontSize`) ; `null` : un texte ordinaire. */
    val emojiFontSizeSp: Int? = null,
    /**
     * Le message dont le corps rend des pièces (photos, fichiers, lieux, vocaux), remis aux MÊMES atomes que la
     * rangée plate ; `null` quand il n'en porte pas ou que sa protection les interdit (aucun média avant révélation).
     */
    val attachments: BubbleContent? = null,
)

/**
 * **Ce que la peau de la Rivière LIT, construit une fois par entrée** (iOS `RiverRendering`, #3946) :
 * la toile et les rangées ne font que des lectures en temps constant — jamais un index reconstruit
 * par image de défilement. L'échelle du temps (un tri du fil entier) suit le même chemin.
 */
@Immutable
internal class RiverRendering(
    val geometry: RiverGeometry,
    val contents: List<RiverBubbleContent>,
    val timeScale: RiverTimeScale?,
) {
    val contentByMessageId: Map<String, RiverBubbleContent> =
        LinkedHashMap<String, RiverBubbleContent>(contents.size).also { map ->
            contents.forEach { map.putIfAbsent(it.bubble.messageId, it) }
        }

    val bubbleByRank: Map<Int, RiverBubble> =
        LinkedHashMap<Int, RiverBubble>(geometry.bubbles.size).also { map ->
            geometry.bubbles.forEach { map.putIfAbsent(it.rank, it) }
        }

    /** Le contenu de la bulle du rang [rank], s'il existe — une rangée sans entrée reste vide, jamais un crash. */
    fun contentAt(rank: Int): RiverBubbleContent? = bubbleByRank[rank]?.let { contentByMessageId[it.messageId] }

    companion object {
        val Empty: RiverRendering by lazy {
            RiverRendering(RiverThreadMapping.geometry(emptyList()), emptyList(), null)
        }
    }
}

/** Construit le rendu : la règle est ici, les composables ne font que le peindre. */
internal object RiverRenderingBuilder {

    fun build(
        geometry: RiverGeometry,
        bubbles: List<BubbleContent>,
        storyRing: (userId: String?) -> StoryRingState,
        zone: ZoneId = ZoneId.systemDefault(),
        locale: Locale = Locale.getDefault(),
    ): RiverRendering {
        val byId = HashMap<String, BubbleContent>(bubbles.size).also { map ->
            bubbles.forEach { map.putIfAbsent(it.messageId, it) }
        }
        val positions = RiverConversationMapping.groupPositions(geometry.bubbles)
        val contents = geometry.bubbles.mapNotNull { bubble ->
            byId[bubble.messageId]?.let { content(bubble, it, geometry.layout, positions, storyRing) }
        }
        val timeScale = RiverTimeScale.resolve(
            ranks = geometry.bubbles.map { RiverTimeScale.RankTime(it.rank, it.createdAtMs) },
            zone = zone,
            locale = locale,
        )
        return RiverRendering(geometry, contents, timeScale)
    }

    private fun content(
        bubble: RiverBubble,
        source: BubbleContent,
        layout: RiverLayout,
        positions: Map<String, RiverGroupPosition>,
        storyRing: (String?) -> StoryRingState,
    ): RiverBubbleContent {
        val name = RiverConversationMapping.displayName(source.asRiverMessage())
        val userId = source.senderProfile?.userId ?: source.senderId
        return RiverBubbleContent(
            bubble = bubble,
            senderDisplayName = name,
            colorSeed = name,
            timeString = bubbleClockLabel(source.createdAtIso).orEmpty(),
            text = source.text,
            layout = layout,
            replyPreview = replyPreview(source),
            groupPosition = positions[bubble.messageId] ?: RiverGroupPosition.SOLO,
            identity = if (bubble.isSystem) null else RiverBubbleIdentity(
                avatarUrl = source.senderAvatarUrl,
                userId = userId,
                profile = source.senderProfile,
                storyRing = storyRing(userId),
                conversationId = source.viewingConversationId,
                avatarRing = source.senderRing,
            ),
            isForwarded = source.isForwarded,
            forwardAttribution = source.forwardAttribution,
            blurReveal = source.blurReveal,
            protection = protection(source),
            isPending = source.isPending,
            expiresAtMs = isoToEpochMillisOrNull(source.expiresAtIso),
            sticker = source.drawnSticker?.takeIf { protection(source) == RiverProtection.NONE },
            storyReply = source.storyReply?.takeIf { protection(source) == RiverProtection.NONE },
            emojiFontSizeSp = emojiFontSize(source),
            attachments = attachmentsSource(source),
        )
    }

    private fun replyPreview(source: BubbleContent): RiverReplyPreview? {
        if (source.replyToId == null) return null
        val author = source.replyToSenderName?.let(RiverConversationMapping::singleLine).orEmpty()
        val text = source.replyToText?.let(RiverConversationMapping::singleLine).orEmpty()
        val thumbnail = quotedThumbnail(source)
        if (author.isEmpty() && text.isEmpty() && thumbnail == null) return null
        return RiverReplyPreview(author, text, thumbnail)
    }

    /** La vignette d'une image citée, sauf citation supprimée : un message retiré ne montre plus son média. */
    fun quotedThumbnail(source: BubbleContent): String? =
        source.replyToThumbnailUrl?.takeIf {
            it.isNotBlank() && !source.replyToDeleted && source.replyToMediaKind == ReplyMediaKind.Image
        }

    /** Un emoji seul grossit, mais jamais dans une réponse (comme la rangée plate) ni sous protection. */
    fun emojiFontSize(source: BubbleContent): Int? {
        if (protection(source) != RiverProtection.NONE || source.text.isBlank() || source.replyToText != null) return null
        return EmojiDetector.fontSizeSp(source.emojiOnlyCount)
    }

    /** Les pièces ne partent vers l'écran que si rien ne les protège et qu'aucun sticker ne tient lieu de corps. */
    fun attachmentsSource(source: BubbleContent): BubbleContent? =
        source.takeIf {
            protection(it) == RiverProtection.NONE && it.drawnSticker == null && it.riverRendersAttachments
        }

    /** Un éphémère dont l'échéance est atteinte n'a plus rien à montrer (le fil le retire au même instant). */
    fun isExpired(content: RiverBubbleContent, nowMs: Long): Boolean =
        content.expiresAtMs?.let { nowMs >= it } == true

    /** Un message que rien ne déchiffre ou que la vue unique a brûlé ne rend jamais son texte. */
    fun protection(source: BubbleContent): RiverProtection = when {
        source.isEndToEndSealed -> RiverProtection.END_TO_END_SEALED
        source.isViewOnce && source.isViewOnceOpenedByMe -> RiverProtection.BURNED
        else -> RiverProtection.NONE
    }

    private fun BubbleContent.asRiverMessage(): RiverConversationMessage = RiverConversationMessage(
        id = messageId,
        senderId = senderId ?: senderName ?: messageId,
        senderName = senderName?.takeIf { it.isNotBlank() },
        senderUsername = senderUsername?.takeIf { it.isNotBlank() },
        createdAtMs = 0.0,
    )
}
