package me.meeshy.app.stories

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.audio.SoundLibrary
import me.meeshy.sdk.model.composer.sound.ApiSound
import me.meeshy.sdk.model.composer.sound.SoundShelfLaw
import me.meeshy.sdk.model.composer.sound.SoundShelfTab
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

@Immutable
data class SoundShelfState(
    val tab: SoundShelfTab = SoundShelfTab.MINE,
    val query: String = "",
    val sounds: List<ApiSound> = emptyList(),
    val isLoading: Boolean = false,
    val nextCursor: String? = null,
    val renaming: ApiSound? = null,
    /** Le son dont le retrait attend confirmation (#9848). */
    val removing: ApiSound? = null,
    val removalFailed: Boolean = false,
) {
    val canRemove: Boolean get() = SoundShelfLaw.canRemove(tab)
    val canRename: Boolean get() = SoundShelfLaw.canRename(tab)
    val canLoadMore: Boolean get() = SoundShelfLaw.pages(tab) && nextCursor != null && !isLoading
    val empty get() = SoundShelfLaw.empty(tab, query)
}

/**
 * L'étagère des sons du composeur — miroir de `SoundLibraryPickerModel` (iOS) : « Mes sons » (curseur) et
 * « Tendances » (serveur), recherche débouncée, renommer en place, retrait OPTIMISTE (la ligne part au geste, un refus
 * la remet à SA place). L'aperçu sonore n'est pas ici : il vit avec la feuille, qui le libère en la quittant.
 */
@HiltViewModel
class SoundShelfViewModel @Inject constructor(
    private val library: SoundLibrary,
) : ViewModel() {

    private val _state = MutableStateFlow(SoundShelfState())
    val state: StateFlow<SoundShelfState> = _state.asStateFlow()

    /** Délai de saisie avant d'interroger — sans lui, chaque frappe partait au serveur sur « Tendances ». 0 en test. */
    internal var queryDebounceMs: Long = QUERY_DEBOUNCE_MS

    private var loadedOnce = false
    private var loadJob: Job? = null
    private var queryJob: Job? = null

    fun loadIfNeeded() {
        if (loadedOnce) return
        loadedOnce = true
        reload()
    }

    fun onTabChange(tab: SoundShelfTab) {
        if (tab == _state.value.tab) return
        _state.update { it.copy(tab = tab, sounds = emptyList(), nextCursor = null) }
        loadedOnce = true
        reload()
    }

    fun onQueryChange(query: String) {
        _state.update { it.copy(query = query) }
        queryJob?.cancel()
        queryJob = viewModelScope.launch {
            if (queryDebounceMs > 0) delay(queryDebounceMs)
            loadedOnce = true
            reload()
        }
    }

    /** Un chargement supplanté (onglet, saisie) est ANNULÉ : sa réponse tardive n'écrase jamais la liste d'après. */
    private fun reload() {
        loadJob?.cancel()
        val snapshot = _state.value
        _state.update { it.copy(isLoading = true, nextCursor = null) }
        loadJob = viewModelScope.launch {
            when (snapshot.tab) {
                SoundShelfTab.MINE -> when (val r = library.mine(snapshot.query.ifEmpty { null }, null)) {
                    is NetworkResult.Success -> _state.update { it.copy(sounds = r.data.sounds, nextCursor = r.data.nextCursor, isLoading = false) }
                    is NetworkResult.Failure -> _state.update { it.copy(sounds = emptyList(), isLoading = false) }
                }
                SoundShelfTab.TRENDING -> when (val r = library.trending(snapshot.query.ifEmpty { null })) {
                    is NetworkResult.Success -> _state.update { it.copy(sounds = r.data, nextCursor = null, isLoading = false) }
                    is NetworkResult.Failure -> _state.update { it.copy(sounds = emptyList(), isLoading = false) }
                }
            }
        }
    }

    fun loadMore() {
        val current = _state.value
        val cursor = current.nextCursor
        if (!current.canLoadMore || cursor == null) return
        _state.update { it.copy(isLoading = true) }
        loadJob = viewModelScope.launch {
            when (val r = library.mine(current.query.ifEmpty { null }, cursor)) {
                is NetworkResult.Success -> _state.update { it.copy(sounds = it.sounds + r.data.sounds, nextCursor = r.data.nextCursor, isLoading = false) }
                // Une page manquante ne vide pas la liste déjà affichée : fin de pagination silencieuse.
                is NetworkResult.Failure -> _state.update { it.copy(nextCursor = null, isLoading = false) }
            }
        }
    }

    fun beginRename(sound: ApiSound) = _state.update { it.copy(renaming = sound) }

    fun cancelRename() = _state.update { it.copy(renaming = null) }

    /** Remplace la ligne EN PLACE : recharger la liste ferait sauter le défilement au moment où l'on regarde le nom. */
    fun commitRename(title: String) {
        val target = _state.value.renaming ?: return
        _state.update { it.copy(renaming = null) }
        viewModelScope.launch {
            val result = library.rename(target.id, title)
            if (result is NetworkResult.Success) {
                _state.update { it.copy(sounds = SoundShelfLaw.replacing(it.sounds, result.data)) }
            }
        }
    }

    fun beginRemove(sound: ApiSound) = _state.update { it.copy(removing = sound, removalFailed = false) }

    fun cancelRemove() = _state.update { it.copy(removing = null) }

    fun confirmRemove() {
        val target = _state.value.removing ?: return
        val index = _state.value.sounds.indexOfFirst { it.id == target.id }
        _state.update {
            it.copy(removing = null, removalFailed = false, sounds = it.sounds.filterNot { s -> s.id == target.id })
        }
        if (index < 0) return
        viewModelScope.launch {
            if (library.remove(target.id) is NetworkResult.Failure) {
                _state.update { it.copy(sounds = SoundShelfLaw.restoring(it.sounds, target, index), removalFailed = true) }
            }
        }
    }

    private companion object {
        const val QUERY_DEBOUNCE_MS = 300L
    }
}
