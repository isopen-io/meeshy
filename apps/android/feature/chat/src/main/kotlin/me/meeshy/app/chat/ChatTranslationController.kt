package me.meeshy.app.chat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver
import me.meeshy.ui.component.bubble.MessageDetailExplorer
import me.meeshy.ui.component.bubble.MessageLanguageExplorer

/**
 * The Prisme Linguistique of the conversation screen, on the viewer's side: which language
 * each bubble currently shows, the on-demand translation of a language the message has no
 * content for yet, and the per-message language explorer.
 *
 * It owns the two maps the bubble projection reads — the bubbles flipped back to their
 * original ([showingOriginal]) and the language a flag tap switched a bubble to
 * ([activeLanguageOverride]) — and the in-flight translation keys, which live in
 * [ChatUiState.translatingLanguages] as `messageId|language` so each language of a message
 * is tracked on its own. The rank-ordered resolution itself is never re-implemented here:
 * [LanguageFlagTapResolver] and [MessageDetailExplorer] carry it.
 */
internal class ChatTranslationController(
    private val scope: CoroutineScope,
    private val state: ChatStateAccess,
    private val messages: StateFlow<List<LocalMessage>>,
    private val messageRepository: MessageRepository,
    private val sessionRepository: SessionRepository,
    private val messageSocketManager: MessageSocketManager,
    private val conversationId: String,
) {

    private val mutableShowingOriginal = MutableStateFlow<Set<String>>(emptySet())

    /** The bubbles the viewer flipped back to their original language. */
    val showingOriginal: StateFlow<Set<String>> = mutableShowingOriginal.asStateFlow()

    private val mutableActiveLanguageOverride = MutableStateFlow<Map<String, String>>(emptyMap())

    /**
     * messageId -> the language code the viewer switched that bubble to via a flag
     * tap. Absent = default Prisme resolution (preferred translation, or the
     * original toggled through [showingOriginal]).
     */
    val activeLanguageOverride: StateFlow<Map<String, String>> = mutableActiveLanguageOverride.asStateFlow()

    /**
     * Starts the two collectors of the slice: the live language-explorer projection
     * (rebuilt off the same cache stream, so a translation landing re-renders the open
     * explorer) and the `message:translation` frames of this conversation merged into the
     * cache.
     */
    fun start() {
        scope.launch {
            combine(
                state.flow.map { it.explorerMessageId }.distinctUntilChanged(),
                messages,
                sessionRepository.currentUser,
                state.flow.map { it.translatingLanguages }.distinctUntilChanged(),
                activeLanguageOverride,
            ) { explorerId, loaded, user, translating, overrides ->
                buildLanguageExplorer(explorerId, loaded, user, translating, overrides)
            }
                .distinctUntilChanged()
                .collect { explorer -> state.update { it.copy(languageExplorer = explorer) } }
        }
        scope.launch {
            messageSocketManager.translationReceived.collect { event ->
                if (event.conversationId == conversationId) {
                    messageRepository.applyTranslation(
                        event.messageId,
                        event.targetLanguage,
                        event.translatedContent,
                    )
                }
            }
        }
    }

    fun toggleShowOriginal(messageId: String) {
        mutableShowingOriginal.update { if (messageId in it) it - messageId else it + messageId }
        state.update { it.copy(actionMessageId = null) }
    }

    /**
     * Tap on a Prisme language-flag chip: switch the bubble's displayed language,
     * or revert to the default resolution when the tapped flag is already active.
     * Delegates the decision to the pure [LanguageFlagTapResolver] so the transition
     * stays behaviour-tested; here we only apply it to the per-message override map.
     */
    fun onFlagTap(messageId: String, code: String) {
        val message = messages.value.firstOrNull { it.message.id == messageId }?.message ?: return
        val prefs = sessionRepository.currentUser.value ?: EmptyContentPreferences
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = code,
            activeCode = resolvedActiveCode(messageId, message, prefs),
            originalLanguage = message.originalLanguage,
            translations = message.translations,
        )
        when (result) {
            is LanguageFlagTapResolver.Result.Activate ->
                mutableActiveLanguageOverride.update { it + (messageId to result.code) }
            LanguageFlagTapResolver.Result.Revert ->
                mutableActiveLanguageOverride.update { it - messageId }
            is LanguageFlagTapResolver.Result.RequestTranslation ->
                requestOnDemandTranslation(messageId, result.targetLanguage)
            LanguageFlagTapResolver.Result.None -> Unit
        }
    }

    /**
     * The viewer tapped a configured language the message has no content for yet:
     * translate it on demand, then switch the bubble to it. The merged translation
     * arrives through the cache stream (so the strip's translatable chip becomes a
     * live content chip), and the active override points the bubble at it. A failed
     * or inert translation leaves the strip's translatable chip in place to retry;
     * a second tap while the request is in flight is ignored.
     */
    private fun requestOnDemandTranslation(messageId: String, targetLanguage: String) {
        val key = "$messageId|$targetLanguage"
        if (key in state.value.translatingLanguages) return
        state.update { it.copy(translatingLanguages = it.translatingLanguages + key) }
        scope.launch {
            try {
                val stored = messageRepository.requestTranslation(messageId, targetLanguage)
                if (stored) {
                    mutableActiveLanguageOverride.update { it + (messageId to targetLanguage) }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                state.update { it.copy(errorMessage = error.message) }
            } finally {
                state.update { it.copy(translatingLanguages = it.translatingLanguages - key) }
            }
        }
    }

    /**
     * Open the per-message language explorer (long-press → "Explore languages"):
     * the exhaustive Prisme view listing every explorable language with its
     * translate / retranslate affordance. Closing the action sheet first keeps a
     * single sheet on screen.
     */
    fun openLanguageExplorer(messageId: String) {
        state.update { it.copy(explorerMessageId = messageId, actionMessageId = null) }
    }

    fun dismissLanguageExplorer() {
        state.update { it.copy(explorerMessageId = null) }
    }

    /**
     * Retranslate a language from the explorer — force a fresh translation even when
     * that language already has content (unlike [onFlagTap], which would merely
     * switch to the existing text). A refresh that returns identical text is an inert
     * no-op at the repository; a differing result re-renders live off the cache
     * stream. A request already in flight for the same language is not duplicated.
     */
    fun onExplorerRetranslate(messageId: String, code: String) {
        val target = code.normalizedCode() ?: return
        messages.value.firstOrNull { it.message.id == messageId } ?: return
        requestOnDemandTranslation(messageId, target)
    }

    /**
     * Project the open explorer message into a [MessageLanguageExplorer], or null
     * when no explorer is open / the target has paged out. The in-flight codes are
     * the viewer's [ChatUiState.translatingLanguages] keys scoped to this message,
     * and the selected language is the active flag-tap override — so the explorer
     * highlights whatever the bubble is currently displaying.
     */
    private fun buildLanguageExplorer(
        explorerMessageId: String?,
        loaded: List<LocalMessage>,
        user: MeeshyUser?,
        translating: Set<String>,
        overrides: Map<String, String>,
    ): MessageLanguageExplorer? {
        val id = explorerMessageId ?: return null
        val message = loaded.firstOrNull { it.message.id == id }?.message ?: return null
        val prefix = "$id|"
        val translatingCodes = translating
            .filter { it.startsWith(prefix) }
            .map { it.removePrefix(prefix) }
            .toSet()
        return MessageDetailExplorer.build(
            originalLanguage = message.originalLanguage,
            content = message.content,
            translations = message.translations,
            preferences = user ?: EmptyContentPreferences,
            translatingCodes = translatingCodes,
            selectedCode = overrides[id],
        )
    }

    /**
     * The language code currently displayed for [messageId]: an explicit flag-tap
     * override if any, else the default Prisme resolution — the original when the
     * translate toggle is on, otherwise the preferred translation (or the original
     * when none is preferred).
     */
    private fun resolvedActiveCode(
        messageId: String,
        message: ApiMessage,
        prefs: LanguageResolver.ContentLanguagePreferences,
    ): String? {
        activeLanguageOverride.value[messageId]?.let { return it.normalizedCode() }
        val original = message.originalLanguage.normalizedCode()
        if (messageId in showingOriginal.value) return original
        return LanguageResolver.preferredTranslation(message.translations, prefs)
            ?.targetLanguage?.normalizedCode()
            ?: original
    }
}

private fun String?.normalizedCode(): String? =
    this?.trim()?.lowercase()?.takeIf { it.isNotEmpty() }
