package me.meeshy.sdk.status

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import me.meeshy.sdk.model.StatusEntry

/** Le point touché sur le badge d'humeur, en pixels du repère de la fenêtre racine. */
public data class StatusBubbleAnchor(val x: Float, val y: Float)

/** Ce que la bulle d'humeur montre : `entry` nul = aucune bulle. */
public data class StatusBubbleState(
    val entry: StatusEntry? = null,
    val anchor: StatusBubbleAnchor? = null,
)

/**
 * L'unique bulle d'humeur de la fenêtre (iOS `StatusBubbleController`) : le rail, la liste des conversations ou
 * toute autre porte la montrent par [show] ; un seul hôte à la racine la dessine, dans le repère de la fenêtre,
 * ancrée au point touché. Une bulle est un popover contextuel : elle ne survit pas à une navigation
 * ([onNavigationToken]), sinon elle se ré-ancrerait sur l'écran suivant.
 */
@Singleton
public class StatusBubbleController @Inject constructor() {
    private val mutableState = MutableStateFlow(StatusBubbleState())
    public val state: StateFlow<StatusBubbleState> = mutableState.asStateFlow()

    @Volatile private var lastTouch: StatusBubbleAnchor? = null
    private var navigationToken: Any? = null
    private var hasNavigationToken: Boolean = false

    /** Le dernier toucher posé sur la fenêtre : l'ancre de la bulle que le geste suivant ouvrira. */
    public fun noteTouch(x: Float, y: Float) {
        lastTouch = StatusBubbleAnchor(x, y)
    }

    public fun show(entry: StatusEntry, anchor: StatusBubbleAnchor? = lastTouch) {
        mutableState.value = StatusBubbleState(entry = entry, anchor = anchor)
    }

    public fun dismiss() {
        mutableState.update { if (it.entry == null) it else StatusBubbleState() }
    }

    /** Le jeton de navigation courant (la route) : tout changement ferme la bulle, la première lecture non. */
    public fun onNavigationToken(token: Any?) {
        val changed = hasNavigationToken && token != navigationToken
        navigationToken = token
        hasNavigationToken = true
        if (changed) dismiss()
    }
}
