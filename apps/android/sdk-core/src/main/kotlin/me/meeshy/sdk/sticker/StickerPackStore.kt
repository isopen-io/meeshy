package me.meeshy.sdk.sticker

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import me.meeshy.sdk.model.sticker.StickerPackState
import me.meeshy.sdk.model.sticker.StickerPackSummary
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.StickerPackApi
import me.meeshy.sdk.net.apiCall

/**
 * Les packs de stickers installés, cache d'abord : la feuille montre ce qu'elle sait (la dernière liste
 * servie) pendant que [refresh] la revalide ; une panne réseau n'efface jamais la liste. Installer ou
 * retirer un pack est OPTIMISTE ([StickerPackState]) : la bascule est immédiate, le refus du serveur la
 * défait et signale le pack en échec.
 */
@Singleton
public class StickerPackStore @Inject constructor(private val api: StickerPackApi) {
    private val _packs = MutableStateFlow<List<StickerPackSummary>?>(null)
    private val _state = MutableStateFlow(StickerPackState())

    /** `null` = on ne sait pas encore (les packs intégrés sont alors présumés installés). */
    public val packs: StateFlow<List<StickerPackSummary>?> = _packs.asStateFlow()
    public val state: StateFlow<StickerPackState> = _state.asStateFlow()

    public suspend fun refresh() {
        val result = apiCall { api.installed() }
        val list = (result as? NetworkResult.Success)?.data?.packs ?: return
        _packs.value = list
        val inFlight = _state.value.pending.keys.filter { _state.value.isInstalled(it) }
        _state.value = _state.value.copy(installed = list.map { it.slug }.toSet() + inFlight)
    }

    /** Installe ([install] = true) ou retire un pack ; rend `false` si le serveur a refusé (état d'avant restauré). */
    public suspend fun setInstalled(slug: String, install: Boolean): Boolean {
        val before = _state.value
        if (before.isPending(slug) || before.isInstalled(slug) == install) return true
        _state.value = before.begin(slug)
        val result = apiCall { if (install) api.install(slug) else api.uninstall(slug) }
        val ok = result is NetworkResult.Success
        _state.value = if (ok) _state.value.settle(slug) else _state.value.rollback(slug)
        if (ok) refresh()
        return ok
    }

    public fun clearFailure() {
        _state.value = _state.value.clearFailure()
    }
}
