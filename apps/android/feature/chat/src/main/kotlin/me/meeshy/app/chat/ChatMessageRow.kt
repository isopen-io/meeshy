package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.chat.R
import me.meeshy.sdk.link.LinkPreview
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.link.LinkPreviewParser
import me.meeshy.ui.component.bubble.BubbleAccessibilityAction
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FlatRowFocus
import me.meeshy.ui.component.bubble.FocalFlatRow
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.reading.focal.FocalFocusTimestamp
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.ui.component.bubble.MessageBubble
import me.meeshy.ui.theme.MeeshyPalette

/**
 * The callbacks one message row can raise, all keyed by the message id so a single instance
 * serves every row of the list (no per-row lambda allocation) and a future gesture is one more
 * field with a neutral default — never one more positional parameter on [ChatMessageRow].
 * Built once per screen from the ViewModel; the row itself never sees the ViewModel.
 */
@Immutable
internal class ChatMessageRowActions(
    val onReply: (messageId: String) -> Unit = {},
    val onForward: (messageId: String) -> Unit = {},
    val onLongPress: (messageId: String) -> Unit = {},
    val onReactionClick: (messageId: String, emoji: String) -> Unit = { _, _ -> },
    val onReactionLongPress: (messageId: String) -> Unit = {},
    val onImageClick: (messageId: String, imageIndex: Int) -> Unit = { _, _ -> },
    val onFileClick: (messageId: String, attachmentId: String?) -> Unit = { _, _ -> },
    val onReplyPreviewClick: (messageId: String) -> Unit = {},
    val onFlagTap: (messageId: String, code: String) -> Unit = { _, _ -> },
    val onReplyCountTap: (messageId: String) -> Unit = {},
    val onReplyCountLongPress: (messageId: String) -> Unit = {},
    val onRetry: (messageId: String) -> Unit = {},
    /** Tap sur le smiley d'ajout de réaction du dernier message reçu. */
    val onAddReaction: (messageId: String) -> Unit = {},
    /** Tap sur l'avatar de l'auteur (pied d'identité d'une suite reçue en groupe) : sa fiche profil. */
    val onSenderTap: (bubble: BubbleContent) -> Unit = {},
    /** Icône de traduction de l'élu Focal : l'explorateur des langues du message. */
    val onTranslationDetail: (messageId: String) -> Unit = {},
    /** Window-space frame of the bubble, captured during layout for the long-press hero. */
    val onBubbleFramed: (messageId: String, frame: Rect) -> Unit = { _, _ -> },
)

/**
 * One message of the chat list: the two-way swipe wrapper (reply / forward) around the bubble, its link preview,
 * the reply-thread pill and the failed-send retry line. This is the single extension point for
 * everything that hangs off a message — later slices add their section here and nowhere else.
 *
 * The swipe and the TalkBack actions of the bubble read [MessageRowOffer], the projection of the
 * menu's law (#12760): a view-once, a notice, an unconfirmed bubble or a reader who may not write
 * gets no reply gesture at all, and an encrypted message exposes no « Forward ».
 *
 * It emits SIBLING layouts with no wrapping container, exactly as the list item did before the
 * split, so a `LazyColumn` item lays them out one under the other: host it as a lazy item or
 * inside a [androidx.compose.foundation.layout.Column].
 */
@Composable
internal fun ChatMessageRow(
    bubble: BubbleContent,
    accentColor: Color,
    mentionDisplayNames: Map<String, String>?,
    highlightTerm: String?,
    replyCount: Int?,
    linkPreviewStore: LinkPreviewStore,
    linkPreviewCache: LinkPreviewCache,
    actions: ChatMessageRowActions,
    audioPlayer: ChatAudioPlayer? = null,
    canWrite: Boolean = true,
    showReplyCountPill: Boolean = false,
    /** Script / Focal : la rangée plate (iOS `FocalRow`) au lieu de la bulle. */
    flat: Boolean = false,
    /** Opacité de l'heure et des coches de la rangée plate, lue au dessin. */
    metaAlpha: () -> Float = { 0f },
    /** Focal : la rangée plate est l'élue de la scène (cadre, loupe [focalScale], chips). */
    focalElected: Boolean = false,
    focalScale: Float = 1f,
) {
    val uriHandler = LocalUriHandler.current
    val audioPlayback by remember(bubble.audios, audioPlayer) {
        derivedStateOf { audioPlayer?.let { player -> bubble.audios.firstNotNullOfOrNull(player::bubbleFor) } }
    }
    val linkContext = LocalContext.current
    val messageId = bubble.messageId
    val offer = remember(bubble, canWrite) { MessageRowOffer.of(bubble, canWrite) }
    val replyLabel = stringResource(R.string.chat_action_reply)
    val forwardLabel = stringResource(R.string.chat_action_forward)
    val callbacks = remember(bubble, actions, audioPlayer, uriHandler, offer, replyLabel, forwardLabel) {
        BubbleCallbacks(
            onLongPress = { actions.onLongPress(messageId) },
            onReactionClick = { emoji -> actions.onReactionClick(messageId, emoji) },
            onReactionLongPress = { actions.onReactionLongPress(messageId) },
            onImageClick = { index -> actions.onImageClick(messageId, index) },
            onLocationClick = { location ->
                location.geoUri?.let { runCatching { uriHandler.openUri(it) } }
            },
            onAudioClick = { audio -> audioPlayer?.toggle(audio) },
            onFileClick = { file -> actions.onFileClick(messageId, file.attachmentId) },
            onReplyPreviewClick = { actions.onReplyPreviewClick(messageId) },
            onFlagTap = { code -> actions.onFlagTap(messageId, code) },
            onRetry = { actions.onRetry(messageId) },
            onAddReaction = { actions.onAddReaction(messageId) },
            onSenderTap = if (bubble.senderProfile != null) {
                { actions.onSenderTap(bubble) }
            } else {
                null
            },
            accessibilityActions = offer.accessibilityActions.map { action ->
                when (action) {
                    MessageRowAction.Reply -> BubbleAccessibilityAction(replyLabel) { actions.onReply(messageId) }
                    MessageRowAction.Forward -> BubbleAccessibilityAction(forwardLabel) { actions.onForward(messageId) }
                }
            },
        )
    }
    val onSwipeReply: (() -> Unit)? = remember(messageId, actions, offer.canReply) {
        if (offer.canReply) {
            { actions.onReply(messageId) }
        } else {
            null
        }
    }
    // Le côté opposé à la réponse transfère, comme sur iOS (#4021) : tant que la sélection
    // multiple n'existe pas sur Android, le glissé ouvre directement la feuille de transfert.
    val onSwipeForward: (() -> Unit)? = remember(messageId, actions, offer.canForward) {
        if (offer.canForward) {
            { actions.onForward(messageId) }
        } else {
            null
        }
    }
    // Une bulle audio/vidéo résiste : le glissé ne doit pas gêner la barre de lecture.
    val swipeResistance = if (bubble.audios.isNotEmpty() || bubble.videoCount > 0) {
        SwipeResistance.Resistant
    } else {
        SwipeResistance.Normal
    }
    val linkUrl = remember(bubble.text) {
        LinkPreviewParser.firstUrl(bubble.text)
    }
    if (linkUrl != null) {
        LaunchedEffect(linkUrl) { linkPreviewStore.request(linkUrl) }
    }
    val linkState = LinkPreview.stateFor(
        bubble.text,
        linkUrl?.let {
            linkPreviewCache.outcomeFor(
                LinkPreviewParser.canonicalize(it),
                System.currentTimeMillis(),
            )
        } ?: LinkPreviewOutcome.Empty,
    )
    // iOS rend l'aperçu de lien DANS la bulle, sous le texte (`BubbleLinkEmbed`).
    val linkAccessory: (@Composable (Color) -> Unit)? = if (linkUrl == null) {
        null
    } else {
        { ink ->
            // La rangée plate n'a pas de fond : son aperçu prend l'accent, comme une bulle reçue.
            val onTint = bubble.isOutgoing && !flat
            LinkPreviewCard(
                state = linkState,
                isOutgoing = false,
                accentColor = if (onTint) ink else accentColor,
                ink = if (onTint) ink else null,
                inBubble = true,
                onOpenUrl = { url -> openChatLink(linkContext, url, accentColor.toArgb()) },
            )
        }
    }
    SwipeRowContainer(
        isOutgoing = bubble.isOutgoing,
        createdAtIso = bubble.createdAtIso,
        resistance = swipeResistance,
        onReply = onSwipeReply,
        onForward = onSwipeForward,
        modifier = Modifier.onGloballyPositioned {
            actions.onBubbleFramed(messageId, it.boundsInWindow())
        },
    ) {
        if (flat) {
            FocalFlatRow(
                content = bubble,
                accentColor = accentColor,
                callbacks = callbacks,
                audioPlayback = audioPlayback,
                mentionDisplayNames = mentionDisplayNames,
                highlightTerm = highlightTerm,
                metaAlpha = metaAlpha,
                bodyAccessory = linkAccessory,
                focus = if (focalElected) rememberFlatRowFocus(bubble, focalScale, actions) else null,
            )
        } else MessageBubble(
            content = bubble,
            // iOS : la bulle envoyée porte l'indigo de marque (BubbleSkin.brand), pas l'accent
            // de la conversation — l'accent reste aux liens, citations et réactions.
            outgoingColor = MeeshyPalette.Indigo500,
            accentColor = accentColor,
            mentionDisplayNames = mentionDisplayNames,
            highlightTerm = highlightTerm,
            callbacks = callbacks,
            audioPlayback = audioPlayback,
            bodyAccessory = linkAccessory,
        )
    }
    // iOS n'a plus de pastille « N réponses » sous la bulle (le fil s'ouvre par l'appui long →
    // Plus → Fil) : elle n'apparaît que si [showReplyCountPill] le demande.
    if (replyCount != null && showReplyCountPill) {
        ReplyCountPill(
            count = replyCount,
            isOutgoing = bubble.isOutgoing,
            accentColor = accentColor,
            onClick = { actions.onReplyCountTap(messageId) },
            onLongClick = { actions.onReplyCountLongPress(messageId) },
        )
    }
}

/**
 * Ce que l'élue Focal montre et ouvre : sa date complète (`FocalFocusTimestamp` : « Aujourd'hui
 * 12:30 », « Hier », jour de semaine, « Sam. 3 oct. 2025 · 14:41 »), le détail des langues par
 * l'icône de traduction, et — faute d'une feuille « Infos » sur Android — le menu du message par
 * la chip de date.
 */
@Composable
private fun rememberFlatRowFocus(bubble: BubbleContent, scale: Float, actions: ChatMessageRowActions): FlatRowFocus {
    val words = FocalFocusTimestamp.Words(
        today = stringResource(R.string.chat_date_today),
        yesterday = stringResource(R.string.chat_date_yesterday),
        dayBeforeYesterday = stringResource(R.string.chat_date_day_before_yesterday),
    )
    val messageId = bubble.messageId
    return remember(bubble.createdAtIso, scale, words, actions, messageId) {
        val clock = bubbleClockLabel(bubble.createdAtIso).orEmpty()
        val sentAt = isoToEpochMillisOrNull(bubble.createdAtIso)?.let(Instant::ofEpochMilli)
        val label = sentAt?.let {
            FocalFocusTimestamp.label(
                sentAt = it,
                timeString = clock,
                now = Instant.now(),
                zone = ZoneId.systemDefault(),
                locale = Locale.getDefault(),
                words = words,
            )
        } ?: clock
        FlatRowFocus(
            contentScale = scale,
            timestampLabel = label,
            onShowMessageInfo = { actions.onLongPress(messageId) },
            onShowTranslationDetail = { actions.onTranslationDetail(messageId) },
        )
    }
}
