package me.meeshy.sdk.sync

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.TranslationFailureEntry
import me.meeshy.sdk.model.TranslationFailureLedger

/**
 * L'état d'échec de traduction par message et par langue, lu par la bulle (icône d'alerte discrète, un
 * toucher relance). Source unique : le [TranslationFailureApplier] l'écrit au fil des événements du serveur,
 * la bulle ne fait que le lire. Il ne contient aucun contenu de message.
 */
@Singleton
class TranslationFailureStore @Inject constructor() {
    private val mutable = MutableStateFlow(TranslationFailureLedger())

    val ledger: StateFlow<TranslationFailureLedger> = mutable.asStateFlow()

    fun failed(entry: TranslationFailureEntry) = mutable.update { it.failed(entry) }

    fun textTranslated(messageId: String, language: String) = mutable.update { it.textTranslated(messageId, language) }

    fun transcribed(messageId: String, attachmentId: String?) = mutable.update { it.transcribed(messageId, attachmentId) }

    fun audioTranslated(messageId: String, attachmentId: String?, language: String) =
        mutable.update { it.audioTranslated(messageId, attachmentId, language) }

    /** Le toucher de relance : l'icône s'éteint tout de suite, la demande repart. */
    fun retried(messageId: String) = mutable.update { it.retried(messageId) }

    fun forget(messageId: String) = mutable.update { it.forget(messageId) }
}
