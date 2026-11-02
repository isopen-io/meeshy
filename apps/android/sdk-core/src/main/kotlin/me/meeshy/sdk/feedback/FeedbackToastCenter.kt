package me.meeshy.sdk.feedback

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.feedback.FeedbackToast
import me.meeshy.sdk.model.feedback.FeedbackToastKind

/**
 * Le présentateur UNIQUE des toasts de retour : miroir de `FeedbackToastManager` (iOS). Un seul toast à la fois,
 * un nouveau remplace le courant, un message identique dans la fenêtre de 2 s n'est pas ré-affiché. L'hôte
 * (`FeedbackToastCenterHost`) projette [current] et planifie la fermeture ; ce type n'a ni horloge de fermeture ni UI.
 */
@Singleton
public class FeedbackToastCenter internal constructor(private val clock: () -> Long) {

    @Inject public constructor() : this(System::currentTimeMillis)

    private val lock = Any()
    private var nextId = 1L
    private var lastShown: FeedbackToast? = null
    private var tapHandler: (() -> Unit)? = null
    private val state = MutableStateFlow<FeedbackToast?>(null)

    public val current: StateFlow<FeedbackToast?> = state.asStateFlow()

    /** Montre [message] ; [onTap] rend le toast cliquable (tap = action puis fermeture). */
    public fun show(message: String, kind: FeedbackToastKind = FeedbackToastKind.SUCCESS, onTap: (() -> Unit)? = null) {
        if (message.isBlank()) return
        synchronized(lock) {
            val now = clock()
            if (lastShown?.isDuplicateOf(message, kind, now) == true) return
            val toast = FeedbackToast(nextId++, message, kind, isTappable = onTap != null, shownAtMillis = now)
            lastShown = toast
            tapHandler = onTap
            state.value = toast
        }
    }

    /** Le tap de l'utilisateur : l'action s'exécute UNE fois, puis le toast se ferme. Sans effet sur un toast déjà remplacé. */
    public fun tap(id: Long) {
        val action = synchronized(lock) {
            if (state.value?.id != id) return
            tapHandler.also {
                tapHandler = null
                state.value = null
            }
        }
        action?.invoke()
    }

    /** Fermeture (délai écoulé, glissé vers le haut) : ne vise que le toast [id], jamais son successeur. */
    public fun dismiss(id: Long) {
        synchronized(lock) {
            if (state.value?.id != id) return
            tapHandler = null
            state.value = null
        }
    }

    /** Purge le toast, son action et la mémoire de déduplication : un toast de A ne survit pas à sa session. */
    public fun clear() {
        synchronized(lock) {
            tapHandler = null
            lastShown = null
            state.value = null
        }
    }
}
