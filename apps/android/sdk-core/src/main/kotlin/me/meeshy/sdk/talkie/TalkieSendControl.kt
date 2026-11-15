package me.meeshy.sdk.talkie

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.model.feedback.FeedbackToastKind
import me.meeshy.sdk.model.relation.TalkieSendOutcome

/**
 * Ce que tout écran qui émet le talkie partage (fiche, en-tête de conversation) : l'émetteur, la ligne retirée sur un
 * `TALKIE_NOT_ALLOWED` (ni grisée ni expliquée), les issues dites en bandeau — une information neutre pour le repli, une
 * erreur sinon (#17141) — et l'arrêt du micro quand l'écran s'en va.
 */
class TalkieSendControl(
    val sender: TalkieSender,
    private val toasts: FeedbackToastCenter,
    private val scope: CoroutineScope,
    private val detached: CoroutineScope,
) {
    private val _withdrawn = MutableStateFlow(false)
    val withdrawn: StateFlow<Boolean> = _withdrawn.asStateFlow()

    fun press(userId: String) = sender.press(userId)

    fun release() {
        scope.launch { sender.release() }
    }

    /** Dit l'issue que l'écran a mise en mots ; `NOT_ALLOWED` retire la ligne sans rien dire. */
    fun present(outcome: TalkieSendOutcome, text: String) {
        sender.consumeNotice()
        if (outcome == TalkieSendOutcome.NOT_ALLOWED) {
            _withdrawn.value = true
            return
        }
        toasts.show(text, if (outcome.isInformation) FeedbackToastKind.INFO else FeedbackToastKind.ERROR)
    }

    /** Une information neutre (réveil d'un destinataire, rappel du geste). */
    fun inform(text: String) = toasts.show(text, FeedbackToastKind.INFO)

    /** L'écran s'en va : une prise de parole en cours se termine, hors de la portée qui meurt avec lui. */
    fun close() {
        if (sender.isActive) detached.launch { sender.release() }
    }
}
