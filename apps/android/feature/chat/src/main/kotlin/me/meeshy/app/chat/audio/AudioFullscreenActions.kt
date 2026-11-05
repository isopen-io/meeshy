package me.meeshy.app.chat.audio

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color
import androidx.work.WorkManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.app.chat.ChatController
import me.meeshy.app.chat.ChatControllerHost
import me.meeshy.app.chat.ChatHostActions
import me.meeshy.app.chat.ChatUiState
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.composer.ComposerSendGate
import me.meeshy.sdk.composer.ComposerSendKind
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.ComposeLanguageDetector
import me.meeshy.sdk.lang.LanguageIdentifying
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ComposerClosure
import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.fullscreen.AudioFullscreenOffer
import me.meeshy.sdk.model.fullscreen.FullscreenPieceReply
import me.meeshy.sdk.model.fullscreen.MediaReplyDrafts
import me.meeshy.sdk.outbox.OutboxFlushWorker
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.ui.component.audio.AudioFullscreenActionPort
import me.meeshy.ui.component.audio.AudioFullscreenSource

/**
 * **Répondre à un vocal SANS quitter son plein écran** (iOS `ConversationViewModel+FullscreenReply`) : le brouillon PAR
 * PIÈCE ([MediaReplyDrafts]) et le chemin d'envoi qui transforme la pièce REGARDÉE en un message qui la cite.
 *
 * L'écran ne connaît qu'un identifiant de pièce ; le contrôleur résout le PORTEUR dans la fenêtre du fil (jamais un message
 * en cours d'envoi), si bien que le `replyToId` gravé et l'ancre désignent le MÊME message — la passerelle refuse le couple
 * sinon, et un refus à l'envoi est un message perdu. La garde de protection est REJOUÉE à l'envoi
 * ([FullscreenPieceReply.admit]) : l'offre décide si le bouton existe, cette garde si l'envoi part.
 *
 * Il tient SON état dans SON flux ([ChatUiState] ne grossit pas). La lecture n'est jamais touchée : rien ici ne parle au
 * lecteur partagé.
 */
class AudioFullscreenReplyController @Inject constructor(
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val workManager: WorkManager,
    private val clock: CacheClock,
    private val languageIdentifier: LanguageIdentifying,
) : ChatController {

    private var host: ChatControllerHost? = null

    private val mutableDrafts = MutableStateFlow(MediaReplyDrafts())

    /** Un brouillon par pièce : refermer la barre ou tourner la page rend le texte tel qu'on l'a laissé. */
    val drafts: StateFlow<MediaReplyDrafts> = mutableDrafts.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        this.host = host
    }

    override fun detach() {
        host = null
    }

    /** Le message de la fenêtre qui porte [source] ; `null` s'il en est sorti, n'est pas accusé ou vit dans une autre conversation. */
    internal fun carrierOf(source: AudioFullscreenSource): ApiMessage? {
        val host = host ?: return null
        return host.messages.value
            .firstOrNull { it.message.id == source.carrierId && it.sendState == LocalSendState.SYNCED }
            ?.message
            ?.takeIf { it.conversationId == host.conversationId }
    }

    fun editDraft(pieceId: String, text: String) {
        mutableDrafts.update { it.editing(pieceId, text) }
    }

    /**
     * Envoie [text] en réponse à la pièce de [source]. `true` ⇒ la réponse part (le brouillon est vidé et la barre peut se
     * refermer) ; `false` ⇒ rien n'est parti et l'appelant garde son brouillon. Un échec d'enregistrement rend le brouillon
     * et le dit par le canal d'erreur de l'écran.
     */
    fun send(source: AudioFullscreenSource, text: String, closure: ComposerClosure?): Boolean {
        val host = host ?: return false
        val state = host.uiState.value
        val admission = FullscreenPieceReply.admit(text, carrierOf(source), source.attachmentId, state.isEndToEnd) ?: return false
        val gate = ComposerSendGate.evaluate(
            ComposerSendKind.TEXT,
            state.composerAffordances,
            state.slowModeState(clock.nowMillis()),
            closure,
        )
        if (!gate.allowed) return false
        val user = sessionRepository.currentUser.value ?: return false
        mutableDrafts.update { it.sent(source.attachmentId) }
        host.scope.launch {
            try {
                val language = ComposeLanguageDetector.originalLanguageAtSend(
                    text = admission.text,
                    manual = null,
                    senderLanguage = LanguageResolver.resolveUserLanguage(user),
                    identifier = languageIdentifier,
                )
                messageRepository.sendOptimistic(
                    conversationId = host.conversationId,
                    content = admission.text,
                    originalLanguage = language,
                    sender = user,
                    replyToId = admission.replyToId,
                    attachmentReplyToId = admission.attachmentReplyToId,
                )
                workManager.enqueue(OutboxFlushWorker.buildRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                mutableDrafts.update { it.editing(source.attachmentId, text) }
                host.reportError(e.message)
            }
        }
        return true
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AudioFullscreenReplyModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: AudioFullscreenReplyController): ChatController
}

/**
 * **Les actions du plein écran audio, branchées sur la conversation** : l'offre est jugée sur le porteur de la fenêtre,
 * réagir bascule la réaction du MESSAGE (optimiste, défaite par `OwnReactionWithdrawals` sur un refus), transférer ouvre la
 * feuille de la PIÈCE ([ChatHostActions.openForwardPiece], qui garde sa carte de refus fail-closed), répondre monte la barre
 * [MediaReplyComposerBar]. « Créer avec ce média » n'a pas de route Android : sans [composeLauncher], aucun bouton.
 */
internal class ChatAudioFullscreenActions(
    private val replies: AudioFullscreenReplyController,
    private val toggleReaction: (messageId: String, emoji: String) -> Unit,
    private val openForwardPiece: (messageId: String, attachmentId: String) -> Unit,
    private val state: ChatUiState,
    private val clearance: ConversationClearance,
    private val closure: ComposerClosure?,
    private val composeLauncher: ((AudioFullscreenSource) -> Unit)? = null,
) : AudioFullscreenActionPort {

    override fun offer(source: AudioFullscreenSource): AudioFullscreenOffer {
        val carrier = replies.carrierOf(source)
        val law = AudioFullscreenOffer.of(
            carrier = carrier,
            pieceId = source.attachmentId,
            inWindow = carrier != null,
            conversationIsEncrypted = state.isEndToEnd,
            clearance = clearance,
        )
        return law.copy(
            reply = law.reply && state.viewerMayWrite && closure == null,
            compose = law.compose && composeLauncher != null,
        )
    }

    override fun quickReactions(): List<String> = state.quickReactions

    override fun ownReactions(source: AudioFullscreenSource): Set<String> = state.ownReactions[source.carrierId].orEmpty()

    override fun react(source: AudioFullscreenSource, emoji: String) {
        if (offer(source).react) toggleReaction(source.carrierId, emoji)
    }

    override fun forward(source: AudioFullscreenSource) {
        if (offer(source).forward) openForwardPiece(source.carrierId, source.attachmentId)
    }

    override fun compose(source: AudioFullscreenSource) {
        if (offer(source).compose) composeLauncher?.invoke(source)
    }

    @Composable
    override fun ReplyBar(source: AudioFullscreenSource, accent: Color, onClose: () -> Unit) {
        MediaReplyComposerBar(
            source = source,
            accent = accent,
            initialDraft = remember(source.attachmentId) { replies.drafts.value.draft(source.attachmentId) },
            onDraftChange = { text -> replies.editDraft(source.attachmentId, text) },
            onSend = { text -> replies.send(source, text, closure) },
            onClose = onClose,
        )
    }
}

/**
 * Le port du plein écran audio pour l'écran de conversation ; `null` quand aucun contrôleur n'est contribué (la page n'a
 * alors aucune action, comme un post). Refait seulement quand ce que l'offre lit change.
 */
@Composable
internal fun rememberChatAudioFullscreenActions(
    replies: AudioFullscreenReplyController?,
    actions: ChatHostActions,
    state: ChatUiState,
    clearance: ConversationClearance,
    closure: ComposerClosure?,
): AudioFullscreenActionPort? {
    if (replies == null) return null
    return remember(replies, state.messages, state.ownReactions, state.quickReactions, state.isEndToEnd, state.viewerMayWrite, clearance, closure) {
        ChatAudioFullscreenActions(
            replies = replies,
            toggleReaction = actions.toggleReaction,
            openForwardPiece = actions.openForwardPiece,
            state = state,
            clearance = clearance,
            closure = closure,
        )
    }
}
