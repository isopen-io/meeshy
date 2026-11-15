package me.meeshy.app.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.profile.ProfileDecorOutcome
import me.meeshy.sdk.profile.ProfileDecorRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Qui je suis, pour poser un élément sur MON avatar et MA bannière. */
data class ShopViewerMe(
    val name: String = "?",
    val avatarUrl: String? = null,
    val bannerPhoto: String? = null,
    val decor: ServedProfileDecor = ServedProfileDecor.EMPTY,
    val accentHex: String = DEFAULT_ACCENT_HEX,
) {
    companion object {
        const val DEFAULT_ACCENT_HEX = "#6366F1"
    }
}

data class PackShopBrowseUiState(
    val stack: ShopBrowseStack = ShopBrowseStack(),
    val contents: Map<AppearancePackDomain, Map<String, ShopPackContents>> = emptyMap(),
    val me: ShopViewerMe = ShopViewerMe(),
    val equipFailed: Boolean = false,
) {
    fun contentsOf(domain: AppearancePackDomain, slug: String): ShopPackContents? = contents[domain]?.get(slug)

    fun itemsOf(domain: AppearancePackDomain, slug: String): List<ShopItem> =
        (contentsOf(domain, slug) as? ShopPackContents.Ready)?.items.orEmpty()
}

/**
 * La fiche d'un pack et le plein écran de ses éléments, par-dessus la boutique (#16269). Ce que contient un pack vient
 * de la seule couture [ShopItemResolver] ; équiper passe par le [ProfileDecorRepository] — optimiste, le côté touché
 * est rétabli par lui si le serveur refuse — et l'écran ne fait que dire l'échec.
 */
@HiltViewModel
class PackShopBrowseViewModel @Inject constructor(
    private val resolver: ShopItemResolver,
    private val decorRepository: ProfileDecorRepository,
    session: SessionRepository,
) : ViewModel() {

    private val stack = MutableStateFlow(ShopBrowseStack())
    private val contents = MutableStateFlow<Map<AppearancePackDomain, Map<String, ShopPackContents>>>(emptyMap())
    private val equipFailed = MutableStateFlow(false)
    private val asked = mutableSetOf<String>()

    val state: StateFlow<PackShopBrowseUiState> = combine(stack, contents, session.currentUser, equipFailed) { routes, known, user, failed ->
        val me = user?.let {
            val name = it.displayName?.takeIf(String::isNotBlank) ?: it.username
            ShopViewerMe(name, it.avatar, it.banner, it.servedDecor, DynamicColorGenerator.profileAccentHex(it.id, name))
        } ?: ShopViewerMe()
        PackShopBrowseUiState(routes, known, me, failed)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, PackShopBrowseUiState())

    /** Lit, une fois chacun, le contenu des packs d'un domaine : la fiche, le plein écran et « Autres propositions ». */
    fun prepare(domain: AppearancePackDomain, packs: List<ShopPack>, language: String) {
        packs.map { it.slug }.filter { asked.add("${domain.wire}.$it") }.forEach { slug ->
            viewModelScope.launch {
                val read = try {
                    resolver.contents(domain, slug, language)
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    asked.remove("${domain.wire}.$slug")
                    ShopPackContents.DownloadRequired
                }
                contents.update { all -> all + (domain to (all[domain].orEmpty() + (slug to read))) }
            }
        }
    }

    fun openDetail(domain: AppearancePackDomain, slug: String) = stack.update { it.push(ShopBrowseRoute.Detail(domain, slug)) }

    fun openViewer(domain: AppearancePackDomain, slug: String, index: Int = 0) {
        equipFailed.value = false
        stack.update { it.push(ShopBrowseRoute.Viewer(domain, slug, index)) }
    }

    /** Un élément d'un autre pack, depuis « Autres propositions » : il remplace le plein écran courant. */
    fun showProposal(item: ShopItem) {
        val index = state.value.itemsOf(item.domain, item.pack).indexOfFirst { it.key == item.key }.coerceAtLeast(0)
        equipFailed.value = false
        stack.update { it.replaceTop(ShopBrowseRoute.Viewer(item.domain, item.pack, index)) }
    }

    /** Le pager a changé de page : le retour et la rotation retrouvent l'élément regardé. */
    fun settle(index: Int) = stack.update { current ->
        val top = current.top as? ShopBrowseRoute.Viewer ?: return@update current
        if (top.index == index) current else current.replaceTop(top.copy(index = index))
    }

    /** Retour système, ✕ ou glissement : `false` quand il n'y avait rien à refermer (la boutique elle-même se ferme). */
    fun back(): Boolean {
        if (!stack.value.isOpen) return false
        stack.update { it.pop() }
        return true
    }

    fun dismissEquipFailure() {
        equipFailed.value = false
    }

    fun equip(item: ShopItem) {
        val side = ShopBrowseRules.side(item.domain) ?: return
        if (ShopBrowseRules.isEquipped(item, state.value.me.decor)) return
        equipFailed.value = false
        val served = ServedProfileDecorItem(item.pack, item.key, PackOrigin.BUILTIN, contract = null)
        viewModelScope.launch {
            val outcome = try {
                decorRepository.equip(served, side)
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                null
            }
            if (outcome == null || outcome is ProfileDecorOutcome.Failed) equipFailed.value = true
        }
    }
}
