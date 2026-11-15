package me.meeshy.app.stories

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Une couverture vient d'être rendue » (iOS `StoryCoverRenderSignal`) : les cellules qui l'observent se rafraîchissent.
 * [bump] vide d'abord la mémoire des sondes ([StoryCoverMemo]), sinon une absence mémorisée masquerait la couverture écrite
 * après coup ; il est le seul point par où une couverture annonce son arrivée.
 */
@Singleton
class StoryCoverRenderSignal @Inject constructor(private val memo: StoryCoverMemo) {
    private val _generation = MutableStateFlow(0)
    val generation: StateFlow<Int> = _generation.asStateFlow()

    fun bump() {
        memo.bumpGeneration()
        _generation.update { it + 1 }
    }
}
