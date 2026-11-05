package me.meeshy.app.chat

import java.io.File
import me.meeshy.ui.component.bubble.LocalUploadProgress
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.media.MediaIntake
import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.ui.graphics.graphicsLayer
import me.meeshy.sdk.model.PlainSignalAdmission
import me.meeshy.sdk.model.reading.focal.FocalMetrics
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Alignment
import me.meeshy.ui.theme.MeeshySpacing
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import android.widget.Toast
import me.meeshy.feature.chat.R
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.ui.component.bubble.LocalBubbleContactCardAccounts
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.hexColor
import me.meeshy.app.chat.appearance.rememberConversationAppearance
import me.meeshy.ui.component.bubble.BubbleSkin
import me.meeshy.ui.component.bubble.LocalBubbleSkin
import me.meeshy.sdk.model.composer.ComposerAttachmentLimits

/**
 * The conversation screen: an assembly of five hosts drawn in layer order — background,
 * header, list, bottom bar and sheets — sharing one [ChatHostContext]. Each host owns its own
 * slice of the screen; this function only wires the ViewModel to them.
 */
@Composable
fun ChatScreen(
    onBack: () -> Unit,
    onStartCall: (peerName: String, isVideo: Boolean) -> Unit = { _, _ -> },
    onRejoinCall: (call: ActiveCallSession, peerName: String) -> Unit = { _, _ -> },
    onCreateShareLink: () -> Unit = {},
    /** True when THIS device is already engaged in a live call — suppresses the
     * « Rejoindre » pill so a minimised call viewing its own chat isn't offered
     * to rejoin the call it's already in. */
    hasLocalLiveCall: Boolean = false,
    localCall: ChatLocalCall = ChatLocalCall.NONE,
    /** Ouvre le post (story) cité par un message : le toucher de la carte de citation (#13296). */
    onOpenCitedPost: (postId: String) -> Unit = {},
    onOpenConversation: (conversationId: String) -> Unit = {},
    /**
     * #16420 — la configuration de la voix (gestion du profil existant, sinon l'assistant), ouverte par la note de
     * consentement d'un vocal, la feuille des langues d'un vocal et « Configurer » du popup d'envoi.
     */
    onOpenVoiceSettings: () -> Unit = {},
    /** La feuille de réglages du partage de position, fournie par l'application (voir [ChatNavigationActions]). */
    locationSettingsSheet: @Composable (accent: Color, onDismiss: () -> Unit) -> Unit = { _, _ -> },
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Un seul retour par fil : la fin de la conversation (#14645) peut arriver deux fois — la feuille
    // d'infos qui l'a rendue obsolète, puis l'événement socket — et un second pop sortirait de la liste.
    val leave = remember(onBack, state.conversationId) { OnceAction(onBack) }
    val endController = remember(viewModel) { viewModel.controllers.find<ConversationEndController>() }
    val conversationEnded by (endController?.ended ?: NOT_ENDED).collectAsStateWithLifecycle()
    LaunchedEffect(conversationEnded) { if (conversationEnded) leave() }
    ChatShellEffects(viewModel, remember(viewModel) { ChatLifecycleHooks() }, leave)
    EncryptionSwitchAnnouncementEffect(remember(viewModel) { viewModel.controllers.find<EncryptionSwitchAnnouncementController>() })
    val callEntry by viewModel.callEntry.collectAsStateWithLifecycle()
    val mayInviteFriends by viewModel.mayInviteFriends.collectAsStateWithLifecycle()

    // Re-probe the server for a still-active call each time the screen resumes
    // (returning from the call itself, an app relaunch mid-call) so the
    // « Rejoindre » pill reflects the server truth. Parité iOS ConversationView.
    LifecycleResumeEffect(Unit) {
        viewModel.refreshActiveCall()
        onPauseOrDispose { }
    }

    val appearance = rememberConversationAppearance(state.conversationId, state.accentColorHex)
    val accentColor = appearance.accentHex
        ?.let { hexColor(it) }
        ?.takeIf { it != Color.Unspecified }
        ?: MeeshyPalette.Indigo500
    val actions = remember(viewModel) { viewModel.hostActions() }
    val pendingPlace by viewModel.pendingPlace.collectAsStateWithLifecycle()
    val pendingTray = remember(viewModel) { viewModel.controllers.find<ComposerTrayController>() }
    val pending by (pendingTray?.state ?: NO_PENDING).collectAsStateWithLifecycle()
    val headerController = remember(viewModel) { viewModel.controllers.find<ChatHeaderController>() }
    val header by (headerController?.state ?: NO_HEADER).collectAsStateWithLifecycle()
    val selectionController = remember(viewModel) { viewModel.controllers.find<MessageSelectionController>() }
    val selection by (selectionController?.selection ?: NO_SELECTION).collectAsStateWithLifecycle()
    BackHandler(enabled = selection.isActive, onBack = actions.endSelection)
    val engagementController = remember(viewModel) { viewModel.controllers.find<ChatEngagementController>() }
    val engagementSnapshot by (engagementController?.snapshot ?: NO_ENGAGEMENT).collectAsStateWithLifecycle()
    val engagement = remember(engagementSnapshot, engagementController) {
        ChatEngagementBinding(engagementSnapshot, engagementController?.sent ?: NO_SENT)
    }
    val readingModeController = remember(viewModel) { viewModel.controllers.find<ReadingModeController>()?.let(::ThreadReadingModeViewModel) }
    val readingModeState by (readingModeController?.state ?: NO_READING_MODE).collectAsStateWithLifecycle()
    val summaryController = remember(viewModel) { viewModel.controllers.find<LivingSummaryController>() }
    val summaryBinding = remember(summaryController) {
        summaryController?.let { LivingSummaryBinding(it.agent, it.viewer, it::refreshAgent) } ?: LivingSummaryBinding.NONE
    }
    val readingMode = readingModeState?.let { modeState ->
        ChatReadingModeBinding(
            state = modeState,
            select = { readingModeController?.select(it) },
            resetToAuto = { readingModeController?.resetToAuto() },
            summary = summaryBinding,
        )
    }
    val downloadedFileIds by viewModel.downloadedFileIds.collectAsStateWithLifecycle()
    val landingState by viewModel.landingState.collectAsStateWithLifecycle()
    val governance = remember(viewModel) { viewModel.controllers.find<ConversationGovernanceController>() }
    val composerClosure by (governance?.composerClosure ?: NO_CLOSURE).collectAsStateWithLifecycle()
    val capabilities by (governance?.capabilities ?: NO_CAPABILITIES).collectAsStateWithLifecycle()
    val viewerRole by (governance?.viewerRole ?: NO_VIEWER_ROLE).collectAsStateWithLifecycle()
    val unreadAtOpening by viewModel.unreadAtOpening.collectAsStateWithLifecycle()
    val voiceConsent = rememberChatVoiceConsent(onOpenVoiceSettings)
    val host = rememberChatHostContext(
        state = state,
        composerText = viewModel.composerText,
        pending = pending,
        accentColor = accentColor,
        actions = actions,
        navigation = ChatNavigationActions(
            onBack = leave,
            onStartCall = onStartCall,
            onRejoinCall = onRejoinCall,
            onCreateShareLink = onCreateShareLink,
            hasLocalLiveCall = hasLocalLiveCall,
            localCall = localCall,
            onOpenCitedPost = onOpenCitedPost,
            onOpenConversation = onOpenConversation,
            callEntry = callEntry,
            mayInviteFriends = mayInviteFriends,
            locationSettingsSheet = locationSettingsSheet,
        ),
        header = header,
        readingMode = readingMode,
        pendingPlace = pendingPlace,
        selection = selection,
        engagement = engagement,
        downloadedFileIds = downloadedFileIds,
        takeLandingMessageId = viewModel::takeLandingMessageId,
        landing = landingState,
        composerClosure = composerClosure,
        capabilities = capabilities,
        listGate = viewModel.listGate,
        viewerRole = viewerRole,
        unreadAtOpening = unreadAtOpening,
        voiceConsent = voiceConsent,
    )

    val cardsViewModel: ChatContactCardsViewModel = hiltViewModel()
    val uploadProgress = hiltViewModel<ChatUploadProgressViewModel>().progress
    val voicePlayback: ChatAudioViewModel = hiltViewModel()
    val transcriptionRequests: ChatTranscriptionRequestsViewModel = hiltViewModel()
    val isEndToEnd = state.isEndToEnd
    val clearance = remember(cardsViewModel, state.conversationId, state.encryptionMode, isEndToEnd) {
        cardsViewModel.clearance(state.conversationId, state.encryptionMode)
    }
    val contactCards = remember(cardsViewModel, viewModel, isEndToEnd, clearance) {
        ChatContactCardAccounts(cardsViewModel.lookup, isEndToEnd, clearance, viewModel::downloadedFileUri)
    }
    // #13790 — relu à chaque recomposition, jamais retenu : une conversation confirmée claire en cours d'écran ouvre aussitôt
    // ses gestes, et un fil qui montre du bout en bout les ferme.
    val signalClearance = PlainSignalAdmission.clearanceOf(
        cardsViewModel.clearance(state.conversationId, state.encryptionMode),
        threadShowsEndToEnd = isEndToEnd,
    )
    CompositionLocalProvider(
        LocalBubbleContactCardAccounts provides contactCards,
        LocalUploadProgress provides uploadProgress,
        LocalChatContactCardScope provides contactCards::underConversation,
        LocalChatSignalClearance provides signalClearance,
        LocalChatVoicePlayback provides voicePlayback,
        LocalChatTranscriptionRequests provides transcriptionRequests,
        LocalBubbleSkin provides remember(appearance.personalAccentHex) { BubbleSkin.of(appearance.personalAccentHex) },
    ) {
    ChatBackgroundHost(appearance, state) {
        // L'en-tête est une bande FLOTTANTE posée au-dessus du fil (iOS : ZStack, zIndex 100) :
        // sa hauteur mesurée décale le haut du fil (`bandHeight`), et les bulles passent dessous.
        var headerHeightPx by remember { mutableIntStateOf(0) }
        val headerHeight = with(LocalDensity.current) { headerHeightPx.toDp() }
        // La barre de composition FLOTTE aussi (iOS : `ConversationComposerDock` superposé au fil) :
        // sa hauteur mesurée, clavier compris, devient la réserve basse du fil, et les bulles
        // défilent sous le verre.
        var composerHeightPx by remember { mutableIntStateOf(0) }
        val composerHeight = with(LocalDensity.current) { composerHeightPx.toDp() }
        val listBottomInset = rememberKeyboardFollowingInset(composerHeight + MeeshySpacing.sm, rememberComposerKeyboardState())
        Scaffold(containerColor = Color.Transparent) { _ ->
            Box(Modifier.fillMaxSize()) {
                ChatListHost(
                    host,
                    topInset = headerHeight,
                    bottomInset = listBottomInset,
                )
                // Pendant le geste du doigt l'en-tête et la barre de saisie glissent vers leur bord en se
                // fondant, et reviennent doigt levé (iOS `EdgeHiddenChrome`, `FocalChromeReturn`) ; sauf
                // recherche ouverte ou suggestions de mention.
                val chromeHidden = host.chrome.threadScroll.chromeHidden && !state.search.isActive && !state.mention.isActive
                Box(
                    Modifier
                        .onSizeChanged { headerHeightPx = it.height }
                        .hiddenTowardsEdge(chromeHidden, ChromeEdge.Top),
                ) {
                    ChatHeaderHost(host, remember(viewModel) { viewModel.controllers.find<ChatServerSearch>() })
                }
                Box(
                    Modifier
                        .align(Alignment.BottomCenter)
                        .onSizeChanged { composerHeightPx = it.height }
                        .hiddenTowardsEdge(chromeHidden, ChromeEdge.Bottom),
                ) {
                    ChatBottomBarHost(host)
                }
            }
        }
        ChatSheetsHost(host)
    }
    }
}

/**
 * The bytes + display name + declared content-type read back from a picked content Uri.
 * Shared with [me.meeshy.app.chat.IncomingShareScreen] (an inbound `ACTION_SEND` attachment is
 * read through the exact same content-Uri glue as a locally picked one).
 */
internal data class PickedAttachment(
    val file: File,
    val fileName: String,
    val mimeType: String?,
) {
    /** Les octets, pour une IMAGE à retoucher seulement : un média plus gros reste sur son fichier. */
    val bytes: ByteArray get() = file.readBytes()
}

/**
 * Copies a document/photo the user picked from the system picker, IN A STREAM, into a private file
 * ([MediaIntake]), resolving its display name and the platform's declared content-type. Returns
 * `null` when the stream cannot be opened (a revoked grant / deleted document) or when the file is
 * above the upload ceiling ([ComposerAttachmentLimits.MAX_UPLOAD_BYTES]), which stops the copy at
 * the first octet over: a long video is never pulled into memory nor fully copied.
 */
internal fun readPickedAttachment(context: Context, uri: Uri): PickedAttachment? {
    val resolver = context.contentResolver
    val fileName = queryDisplayName(resolver, uri) ?: uri.lastPathSegment ?: "attachment"
    val mimeType = resolver.getType(uri)
    val item = runCatching {
        resolver.openInputStream(uri)?.use { MediaIntake.copy(it, context.cacheDir, fileName, mimeType.orEmpty(), ComposerAttachmentLimits.MAX_UPLOAD_BYTES) }
    }.getOrNull() ?: return null
    val file = (item.source as? MediaUploadSource.OnDisk)?.file ?: return null
    return PickedAttachment(file = file, fileName = fileName, mimeType = mimeType)
}

private fun queryDisplayName(resolver: ContentResolver, uri: Uri): String? =
    runCatching {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) cursor.getString(index) else null
        }
    }.getOrNull()

private val NO_CLOSURE: kotlinx.coroutines.flow.StateFlow<me.meeshy.sdk.model.ComposerClosure?> = kotlinx.coroutines.flow.MutableStateFlow(null)
private val NO_CAPABILITIES: kotlinx.coroutines.flow.StateFlow<me.meeshy.sdk.model.conversationlist.ConversationRowMenuCapabilities?> = kotlinx.coroutines.flow.MutableStateFlow(null)
private val NO_VIEWER_ROLE: kotlinx.coroutines.flow.StateFlow<String?> = kotlinx.coroutines.flow.MutableStateFlow(null)
private val NOT_ENDED: kotlinx.coroutines.flow.StateFlow<Boolean> = kotlinx.coroutines.flow.MutableStateFlow(false)

/** Une action qui ne s'exécute qu'une fois : le retour d'un fil qui se ferme (#14645). */
internal class OnceAction(private val action: () -> Unit) : () -> Unit {
    private var done = false

    override fun invoke() {
        if (done) return
        done = true
        action()
    }
}

/**
 * #16420 — le consentement vocal du fil, lu à l'ouverture et RELU à chaque retour au premier plan (la configuration de la
 * voix vient peut-être de l'accorder) ; un octroi refusé depuis le popup d'envoi se dit (iOS `conversation.voiceConsent.failed`).
 */
@Composable
private fun rememberChatVoiceConsent(
    onOpenVoiceSettings: () -> Unit,
    viewModel: ChatVoiceConsentViewModel = hiltViewModel(),
): ChatVoiceConsentBinding {
    LifecycleResumeEffect(viewModel) {
        viewModel.refresh()
        onPauseOrDispose { }
    }
    val context = LocalContext.current
    val failed = stringResource(R.string.chat_voice_consent_failed)
    LaunchedEffect(viewModel, failed) {
        viewModel.grantFailures.collect { Toast.makeText(context, failed, Toast.LENGTH_LONG).show() }
    }
    val missing by viewModel.missing.collectAsStateWithLifecycle()
    val open by androidx.compose.runtime.rememberUpdatedState(onOpenVoiceSettings)
    return remember(viewModel, missing) {
        ChatVoiceConsentBinding(
            missing = missing,
            openSettings = { open() },
            claimSendPrompt = viewModel::claimSendPrompt,
            grant = viewModel::grant,
        )
    }
}

/** #13794 — le passage au bout en bout fait sous les yeux du fil s'annonce, avec le libellé d'iOS (toast d'information). */
@Composable
private fun EncryptionSwitchAnnouncementEffect(announcer: EncryptionSwitchAnnouncementController?) {
    val context = LocalContext.current
    val notice = stringResource(R.string.conversation_encryption_switched_enabled)
    LaunchedEffect(announcer, notice) {
        announcer?.announcements?.collect { Toast.makeText(context, notice, Toast.LENGTH_LONG).show() }
    }
}
