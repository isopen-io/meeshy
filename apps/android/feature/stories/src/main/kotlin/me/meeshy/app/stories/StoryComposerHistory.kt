package me.meeshy.app.stories

import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.composer.HistoryStore
import me.meeshy.sdk.outbox.OutboxIds

/**
 * L'instantané de l'annuler/rétablir GLOBAL du composer (#12347, iOS `[StorySlide]` empilé dans
 * `HistoryStore`) : le deck complet — texte, stickers, fond, filtre, durée, ordre d'empilement,
 * dessin — et le répertoire des médias envoyés, pour qu'annuler une suppression de média retrouve
 * sa vignette. Les octets des envois différés vivent hors instantané (`pendingUploads`).
 */
internal data class ComposerSnapshot(
    val deck: StorySlideDeck,
    val attachments: List<UploadedMedia>,
)

internal fun StoryComposerUiState.snapshot(): ComposerSnapshot = ComposerSnapshot(deck, attachments)

/**
 * L'historique d'un composer : le magasin pur [HistoryStore] plus la clé du geste continu en cours.
 * Un glissé, un pincement ou une frappe ne valent qu'UN cran : le premier changement d'une clé
 * empile, les suivants remplacent le sommet ; tout changement discret referme le geste.
 */
internal class ComposerHistory private constructor(
    private val store: HistoryStore<ComposerSnapshot>,
    private val openGesture: String?,
) {
    constructor(initial: ComposerSnapshot) : this(HistoryStore<ComposerSnapshot>().push(initial).store, null)

    val canUndo: Boolean get() = store.canUndo
    val canRedo: Boolean get() = store.canRedo

    /** Enregistre [snapshot] ; [gesture] non nul = changement continu (voir la classe). */
    fun recorded(snapshot: ComposerSnapshot, gesture: String? = null): ComposerHistory {
        if (store.current == snapshot) return ComposerHistory(store, if (gesture == null) null else openGesture)
        val next = if (gesture != null && gesture == openGesture || onlySelectionMoved(snapshot)) {
            store.replaceCurrent(snapshot)
        } else {
            store.push(snapshot).store
        }
        return ComposerHistory(next, gesture)
    }

    /** Changer de diapo n'est pas une édition : le sommet suit la sélection sans créer de cran. */
    private fun onlySelectionMoved(snapshot: ComposerSnapshot): Boolean {
        val tip = store.current ?: return false
        return tip.attachments == snapshot.attachments &&
            tip.deck.selectedId != snapshot.deck.selectedId &&
            tip.deck.slides == snapshot.deck.slides
    }

    /** Un média que l'une des étapes encore joignables par annuler/rétablir montre : le retirer ne l'abandonne pas encore. */
    fun reaches(mediaId: String): Boolean = store.states.any { snapshot -> snapshot.deck.slides.any { mediaId in it.mediaIds } }

    fun undone(): Pair<ComposerHistory, ComposerSnapshot>? =
        store.undo()?.let { ComposerHistory(it.store, null) to it.state }

    fun redone(): Pair<ComposerHistory, ComposerSnapshot>? =
        store.redo()?.let { ComposerHistory(it.store, null) to it.state }
}

/**
 * Remet l'état d'écran sur [snapshot] : sélections refermées, brouillon et planche de dessin
 * resynchronisés sur la diapo courante, les envois différés que la diapo rétablie montre rendus (ceux de la pile [buried]),
 * et tout média que ni le répertoire ni les envois
 * différés ne connaissent plus (annulé entre-temps) retiré du deck plutôt que publié orphelin. Un média hors ligne qu'un
 * brouillon restauré ou rouvert nomme par son seul `cmid` (#13500) n'est dans aucun des deux et reste : son envoi n'est
 * annulé que lorsque plus aucune étape joignable ne le montre (#13621).
 */
internal fun StoryComposerUiState.restoredTo(
    snapshot: ComposerSnapshot,
    buried: List<PendingMediaUpload> = emptyList(),
): StoryComposerUiState {
    val pool = (pendingUploads + buried).distinctBy { it.cmid }
    val known = snapshot.attachments.mapTo(mutableSetOf()) { it.id } + pool.map { it.cmid }
    val orphans = snapshot.deck.slides.flatMap { it.mediaIds }.filterNot { it in known || OutboxIds.isCmid(it) }.toSet()
    val deck = orphans.fold(snapshot.deck) { acc, id -> acc.removeMedia(id) }
    val shown = deck.slides.flatMapTo(mutableSetOf()) { it.mediaIds }
    return copy(
        deck = deck,
        attachments = snapshot.attachments,
        pendingUploads = pool.filter { it.cmid in shown },
        selectedTextElementId = null,
        selectedStickerId = null,
        elementMenuId = null,
        stickerMenuId = null,
        snapFeedback = null,
    ).mirrorDraftToSelection()
}
