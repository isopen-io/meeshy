package me.meeshy.app.chat.river

import androidx.compose.runtime.Immutable
import java.time.ZoneId
import java.util.Locale
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
import me.meeshy.ui.format.bubbleClockLabel

/** La citation d'une réponse, sur UNE ligne (iOS `RiverReplyPreview`). */
@Immutable
internal data class RiverReplyPreview(val authorDisplayName: String, val text: String)

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
    val forwardedFromName: String?,
    val blurReveal: BubbleBlurRevealSpec?,
    val protection: RiverProtection,
    val isPending: Boolean,
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
            ),
            isForwarded = source.isForwarded,
            forwardedFromName = source.forwardedFromName,
            blurReveal = source.blurReveal,
            protection = protection(source),
            isPending = source.isPending,
        )
    }

    private fun replyPreview(source: BubbleContent): RiverReplyPreview? {
        if (source.replyToId == null) return null
        val author = source.replyToSenderName?.let(RiverConversationMapping::singleLine).orEmpty()
        val text = source.replyToText?.let(RiverConversationMapping::singleLine).orEmpty()
        if (author.isEmpty() && text.isEmpty()) return null
        return RiverReplyPreview(author, text)
    }

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
