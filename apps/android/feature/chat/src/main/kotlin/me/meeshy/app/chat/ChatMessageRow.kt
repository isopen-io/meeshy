package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.app.chat.conversationcard.LocalConversationLinkCards
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.deeplink.ConversationLinkTarget
import me.meeshy.sdk.link.LinkPreview
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.link.LinkPreviewParser
import me.meeshy.ui.component.bubble.BubbleAccessibilityAction
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.FlatRowFocus
import me.meeshy.ui.component.bubble.greetsArrivals
import me.meeshy.ui.format.bubbleClockLabel
import me.meeshy.sdk.model.BubbleFlagTap
import me.meeshy.sdk.model.playback.VoiceFlagRoute
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.sdk.model.reading.focal.FocalFocusTimestamp
import me.meeshy.sdk.model.PlainSignalAdmission
import java.time.Instant
import java.time.ZoneId
import java.util.Locale
import me.meeshy.sdk.model.AudioPlayerChromeElection
import me.meeshy.ui.component.bubble.LocalBubbleAudioChrome

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
    /** Appui long sur UNE image de la grille (#13461) : cette pièce seule s'aperçoit. */
    val onImageLongPress: (messageId: String, attachmentId: String) -> Unit = { _, _ -> },
    /** Tap sur la carte d'un lieu partagé : la carte plein écran s'ouvre. */
    val onLocationClick: (messageId: String, location: me.meeshy.ui.component.bubble.BubbleLocation) -> Unit = { _, _ -> },
    val onReplyPreviewClick: (messageId: String) -> Unit = {},
    val onFlagTap: (messageId: String, code: String) -> Unit = { _, _ -> },
    /** Le drapeau d'une langue de PISTE d'un vocal (jamais un texte à traduire) : voix, texte et karaoké suivent. */
    val onAudioLanguage: (messageId: String, code: String) -> Unit = { _, _ -> },
    val onReplyCountTap: (messageId: String) -> Unit = {},
    val onReplyCountLongPress: (messageId: String) -> Unit = {},
    val onRetry: (messageId: String) -> Unit = {},
    /** Tap sur le smiley d'ajout de réaction du dernier message reçu. */
    val onAddReaction: (messageId: String) -> Unit = {},
    /** Appui long de 0,4 s sur le smiley d'ajout : le sélecteur d'emoji complet. */
    val onOpenReactPicker: (messageId: String) -> Unit = {},
    /** Tap sur l'avatar de l'auteur (pied d'identité d'une suite reçue en groupe) : sa fiche profil. */
    val onSenderTap: (bubble: BubbleContent) -> Unit = {},
    /** Double toucher sur un avis d'arrivée : la fiche de participation de l'arrivant. */
    val onOpenJoinProfile: (bubble: BubbleContent) -> Unit = {},
    /** « Dis-lui salut » d'un message d'arrivée (#16338) : les @mentions des arrivants dans le composeur. */
    val onGreetArrivals: (messageId: String) -> Unit = {},
    /** Double tap sur une notice d'appel de la rangée plate : rappeler (ou rejoindre l'appel en cours). */
    val onCallBack: (bubble: BubbleContent) -> Unit = {},
    /** Icône de traduction de l'élu Focal : l'explorateur des langues du message. */
    val onTranslationDetail: (messageId: String) -> Unit = {},
    /** Window-space frame of the bubble, captured during layout for the long-press hero. */
    val onBubbleFramed: (messageId: String, frame: Rect) -> Unit = { _, _ -> },
    /** Tap sur le nom de l'auteur cité dans une citation de la rangée plate : sa fiche profil. */
    val onQuotedAuthorTap: (bubble: BubbleContent) -> Unit = {},
    /** Tap sur la miniature du média cité : la visionneuse du message cité (repli : le saut à l'original). */
    val onQuotedMediaTap: (messageId: String, quotedId: String) -> Unit = { _, _ -> },
    /** Tap sur la carte d'une story citée (#13296) : le post s'ouvre. */
    val onStoryCitationOpen: (postId: String) -> Unit = {},
    /** Un toucher sur une rangée en mode sélection (#13294) : la coche ou la décoche. */
    val onToggleSelection: (messageId: String) -> Unit = {},
    /** « Ouvrir » ou une jonction confirmée depuis la carte d'un lien de conversation (#13672). */
    val onOpenConversation: (conversationId: String) -> Unit = {},
    /** #16420 — la note de consentement sous mon vocal : la configuration de la voix s'ouvre. */
    val onOpenVoiceConsent: () -> Unit = {},
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
    audioPlayer: ChatVoicePlayback? = null,
    canWrite: Boolean = true,
    showReplyCountPill: Boolean = false,
    /** Script / Focal : la rangée plate (iOS `FocalRow`) au lieu de la bulle. */
    flat: Boolean = false,
    /** Opacité de l'heure et des coches de la rangée plate, lue au dessin. */
    metaAlpha: () -> Float = { 0f },
    /** Focal : la rangée plate est l'élue de la scène (cadre, loupe [focalScale], chips). */
    focalElected: Boolean = false,
    focalScale: Float = 1f,
    /** Le mode sélection multiple est ouvert (#13294) : la rangée ne glisse plus, un toucher la coche. */
    selecting: Boolean = false,
    /** Les traductions demandées (`messageId|langue`) : le drapeau de la langue attendue montre un indicateur. */
    translatingLanguages: Set<String> = emptySet(),
    selected: Boolean = false,
    /** L'overlay d'appui long présente CETTE cellule : elle s'efface en fondu, la copie élevée prend sa place. */
    hiddenForOverlay: Boolean = false,
) {
    val audioPlayback by rememberBubbleVoicePlayback(audioPlayer, bubble.audios)
    val linkContext = LocalContext.current
    val messageId = bubble.messageId
    val offer = remember(bubble, canWrite) { MessageRowOffer.of(bubble, canWrite) }
    // #13790 — vers une conversation qui n'est pas connue claire, la puce d'une réaction ne se touche pas et « + » n'existe pas.
    val reacts = PlainSignalAdmission.offers(LocalChatSignalClearance.current)
    val replyLabel = stringResource(R.string.chat_action_reply)
    val forwardLabel = stringResource(R.string.chat_action_forward)
    val menuLabel = stringResource(R.string.chat_swipe_action_menu)
    // Le panneau secondaire est un état de vue de la bulle (iOS `@State secondaryLangCode`), pas du fil.
    var secondaryCode by remember(messageId) { mutableStateOf<String?>(null) }
    val flagHaptics = rememberMeeshyHaptics()
    val transcriptionRequests = LocalChatTranscriptionRequests.current
    val callbacks = remember(bubble, actions, audioPlayer, transcriptionRequests, offer, replyLabel, forwardLabel, menuLabel, reacts, canWrite, secondaryCode) {
        BubbleCallbacks(
            onLongPress = { actions.onLongPress(messageId) },
            onReactionClick = { emoji: String -> actions.onReactionClick(messageId, emoji) }.takeIf { reacts },
            onReactionLongPress = { actions.onReactionLongPress(messageId) },
            onImageClick = { index -> actions.onImageClick(messageId, index) },
            onImageLongClick = { index ->
                val attachmentId = bubble.images.getOrNull(index)?.attachmentId
                if (attachmentId == null) actions.onLongPress(messageId) else actions.onImageLongPress(messageId, attachmentId)
            },
            onLocationClick = { location -> actions.onLocationClick(messageId, location) },
            onFileClick = { file -> actions.onFileClick(messageId, file.attachmentId) },
            onReplyPreviewClick = { actions.onReplyPreviewClick(messageId) },
            onStoryCitationClick = bubble.storyReply?.postId?.takeIf { bubble.storyReply?.opensTarget == true }
                ?.let { postId -> { actions.onStoryCitationOpen(postId) } },
            onQuotedAuthorTap = { actions.onQuotedAuthorTap(bubble) }.takeIf { bubble.replyToAuthor != null },
            onQuotedMediaTap = bubble.replyToId?.let { quotedId -> { actions.onQuotedMediaTap(messageId, quotedId) } },
            onFlagTap = { code ->
                flagHaptics.light()
                val voiceTrack = bubble.voiceFlagTrack(code)
                if (voiceTrack != null) {
                    actions.onAudioLanguage(messageId, voiceTrack)
                } else {
                    val strip = bubble.languageStrip
                    val active = strip.firstOrNull { it.isActive }?.code
                    val outcome = BubbleFlagTap.handleTap(
                        code = code,
                        current = BubbleFlagTap.Context(activeCode = active, secondaryCode = secondaryCode),
                        originalLanguage = strip.firstOrNull { it.isOriginal }?.code,
                        preferredCode = bubble.primaryLanguageCode,
                        contentCodes = strip.filter { !it.isTranslatable }.mapTo(HashSet()) { it.code },
                    )
                    secondaryCode = outcome.secondaryCode
                    when (outcome.action) {
                        BubbleFlagTap.Action.SwitchPrimary ->
                            if (outcome.activeCode != active) actions.onFlagTap(messageId, code)
                        BubbleFlagTap.Action.RequestTranslation -> actions.onFlagTap(messageId, code)
                        BubbleFlagTap.Action.OpenSecondary, BubbleFlagTap.Action.CloseSecondary, BubbleFlagTap.Action.None -> Unit
                    }
                }
            },
            onTranslate = { actions.onTranslationDetail(messageId) },
            onShowReadStatus = { actions.onLongPress(messageId) },
            onRetry = { actions.onRetry(messageId) },
            onCallBack = { actions.onCallBack(bubble) }.takeIf { bubble.callSummary != null },
            onSayHi = { actions.onGreetArrivals(messageId) }.takeIf { canWrite && bubble.greetsArrivals },
            onOpenJoinProfile = { _: String -> actions.onOpenJoinProfile(bubble) }.takeIf { bubble.joinNotice?.opensProfile == true },
            onAddReaction = { actions.onAddReaction(messageId) }.takeIf { reacts },
            onTapConsentNotice = actions.onOpenVoiceConsent.takeIf { bubble.voiceConsentMissing },
            onOpenReactPicker = { actions.onOpenReactPicker(messageId) }.takeIf { reacts },
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
            } + BubbleAccessibilityAction(menuLabel) { actions.onLongPress(messageId) },
        ).withVoice(audioPlayer, bubble).withTranscriptionRequests(transcriptionRequests, bubble)
    }
    val translatingCodes = remember(translatingLanguages, messageId) {
        translatingLanguages.filter { it.startsWith("$messageId|") }.mapTo(HashSet()) { it.removePrefix("$messageId|") }
    }
    val shownBubble = remember(bubble, secondaryCode, translatingCodes) {
        if (secondaryCode == null && translatingCodes.isEmpty()) {
            bubble
        } else {
            bubble.copy(openSecondaryCode = secondaryCode, translatingCodes = translatingCodes)
        }
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
    val swipeResistance = BubbleSwipeResistance.of(bubble.audios.isNotEmpty(), bubble.videoCount)
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
    // Une URL qui désigne une conversation Meeshy devient sa carte (iOS `ConversationLinkCard`, #13672).
    val conversationCards = LocalConversationLinkCards.current
    val conversationCardTarget = remember(linkUrl, conversationCards) {
        conversationCards?.let { cards -> linkUrl?.let { ConversationLinkTarget.target(it, cards.webOrigin) } }
    }
    // iOS rend l'aperçu de lien DANS la bulle, sous le texte (`BubbleLinkEmbed`).
    val linkAccessory: (@Composable (Color) -> Unit)? = if (linkUrl == null) {
        null
    } else {
        { ink ->
            // La rangée plate n'a pas de fond : son aperçu prend l'accent, comme une bulle reçue.
            val onTint = bubble.isOutgoing && !flat
            val preview: @Composable () -> Unit = {
                LinkPreviewCard(
                    state = linkState,
                    isOutgoing = false,
                    accentColor = if (onTint) ink else accentColor,
                    ink = if (onTint) ink else null,
                    inBubble = true,
                    onOpenUrl = { url -> openChatLink(linkContext, url, accentColor.toArgb()) },
                )
            }
            MessageLinkAttachment(
                cardTarget = conversationCardTarget,
                cards = conversationCards,
                fallbackAccent = accentColor,
                onOpenConversation = actions.onOpenConversation,
                preview = preview,
            )
        }
    }
    SelectableRowFrame(
        selecting = selecting,
        selected = selected,
        accentColor = accentColor,
        onToggle = { actions.onToggleSelection(messageId) },
    ) {
    val mentionNames = remember(mentionDisplayNames, bubble.servedMentionNames) {
        MentionRoster.withServedNames(mentionDisplayNames, bubble.servedMentionNames)
    }
    SwipeRowContainer(
        isOutgoing = bubble.isOutgoing,
        createdAtIso = bubble.createdAtIso,
        resistance = swipeResistance,
        hiddenForOverlay = hiddenForOverlay,
        onReply = onSwipeReply.takeUnless { selecting },
        onForward = onSwipeForward.takeUnless { selecting },
        modifier = Modifier.onGloballyPositioned {
            actions.onBubbleFramed(messageId, it.boundsInWindow())
        },
    ) {
        CompositionLocalProvider(LocalBubbleAudioChrome provides AudioPlayerChromeElection.of(focalElected)) {
        ThreadRow(
            rendering = if (flat) ThreadRowRendering.Flat else ThreadRowRendering.Bubble,
            bubble = shownBubble,
            accentColor = accentColor,
            callbacks = callbacks,
            audioPlayback = audioPlayback,
            mentionDisplayNames = mentionNames,
            highlightTerm = highlightTerm,
            linkAccessory = linkAccessory,
            metaAlpha = metaAlpha,
            focus = if (focalElected) rememberFlatRowFocus(bubble, focalScale, actions) else null,
        )
        }
    }
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

/** Le lieu d'une bulle ouvert en plein écran : la bulle qui le porte et le lieu, tel que rendu. */
internal data class OpenedPlace(val messageId: String, val place: me.meeshy.sdk.model.SharedPlace) {
    companion object {
        fun of(messageId: String, location: me.meeshy.ui.component.bubble.BubbleLocation): OpenedPlace? {
            val lat = location.latitude ?: return null
            val lon = location.longitude ?: return null
            return OpenedPlace(
                messageId,
                me.meeshy.sdk.model.SharedPlace(lat, lon, location.placeName, location.address),
            )
        }
    }
}

/**
 * La langue de PISTE qu'un drapeau du pied sélectionne sur un vocal ouvert ([VoiceFlagRoute]) : `null` quand le drapeau est
 * un drapeau de texte (la loi des drapeaux de la bulle s'applique), inerte, ou que le vocal est protégé.
 */
private fun BubbleContent.voiceFlagTrack(code: String): String? {
    if (audios.isEmpty() || audios.any { it.isProtected }) return null
    val original = audios.firstNotNullOfOrNull { it.originalLanguage }
    val route = VoiceFlagRoute.route(
        code = code,
        textContentCodes = languageStrip.filter { !it.isTranslatable }.mapTo(HashSet()) { it.code },
        audioOriginal = original,
        audioTrackCodes = audios.flatMap { it.translatedLanguages },
    )
    return (route as? VoiceFlagRoute.Route.Audio)?.let { it.track ?: original }
}
