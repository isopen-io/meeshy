package me.meeshy.app.settings

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import java.util.UUID
import javax.inject.Inject
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import me.meeshy.sdk.cache.valueOrNull
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.packs.PackPurchaseLedger
import me.meeshy.sdk.model.packs.PackPurchaseRefusal
import me.meeshy.sdk.model.packs.PackShopFailure
import me.meeshy.sdk.model.packs.PackShopResponse
import me.meeshy.sdk.model.packs.ShopPack
import me.meeshy.sdk.packs.PackPurchaseOutcome
import me.meeshy.sdk.packs.PackShopRepository

/**
 * La vitrine, telle que l'écran la peint. [shop] est ce que le SERVEUR a servi en dernier (cache ou réseau) — `null` à
 * froid seulement ; le solde, la possession et le prix ne viennent que de là.
 */
data class PackShopUiState(
    val shop: PackShopResponse? = null,
    val loadFailed: Boolean = false,
    val selected: AppearancePackDomain = PackShopResponse.OFFERED.first(),
    val ledger: PackPurchaseLedger = PackPurchaseLedger(),
    val focusedSlug: String? = null,
) {
    val domains: List<AppearancePackDomain> get() = PackShopResponse.OFFERED
    val balance: Int? get() = shop?.balance

    /** `null` à froid (des rangées fantômes, jamais un spinner sur un cache non vide). */
    val packs: List<ShopPack>? get() = shop?.packs(selected)
    val pendingSlugs: Set<String> get() = ledger.pendingIn(selected)
    val failure: PackShopFailure? get() = ledger.failure

    /** Le pack mis en avant n'existe que parmi les rangées lues : un slug inconnu ne marque rien. */
    val focusTarget: String? get() = focusedSlug?.takeIf { slug -> packs?.any { it.slug == slug } == true }
}

/**
 * La Boutique des packs (iOS `UnifiedShopView` / `PackShopStore`). **Un achat n'est jamais optimiste** : le geste marque
 * le pack « en cours » et n'écrit ni possession ni solde ; le serveur répond, et SA réponse — pack, solde — est ce que
 * l'écran montre. Un refus ou une coupure ne changent rien d'affiché ; la vitrine est relue, c'est le serveur qui dit
 * le solde.
 *
 * L'identifiant d'intention naît au geste et reste attaché au pack tant que le geste n'est pas tranché : un nouvel essai
 * après une coupure le réutilise, le serveur ne débite qu'une fois. Le cache est celui du compte (`PackShopRepository`).
 */
@HiltViewModel
class PackShopViewModel @Inject constructor(
    private val repository: PackShopRepository,
    savedState: SavedStateHandle,
) : ViewModel() {

    private val shop = MutableStateFlow<PackShopResponse?>(null)
    private val loadFailed = MutableStateFlow(false)
    private val selected = MutableStateFlow(PackShopResponse.domainOf(savedState.get<String>(ARG_DOMAIN)))
    private val ledger = MutableStateFlow(PackPurchaseLedger())
    private val focusedSlug = savedState.get<String>(ARG_PACK)?.takeIf { it.isNotBlank() }

    val state: StateFlow<PackShopUiState> = combine(shop, loadFailed, selected, ledger) { served, failed, domain, gestures ->
        PackShopUiState(served, failed && served == null, domain, gestures, focusedSlug)
    }.stateIn(viewModelScope, SharingStarted.Eagerly, PackShopUiState(selected = selected.value, focusedSlug = focusedSlug))

    init {
        viewModelScope.launch {
            repository.shop(onSyncError = { loadFailed.value = true }).collect { result ->
                result.valueOrNull?.let { served ->
                    shop.value = served
                    loadFailed.value = false
                }
            }
        }
    }

    fun select(domain: AppearancePackDomain) {
        selected.value = domain
        ledger.update { it.dismissFailure() }
    }

    fun dismissFailure() = ledger.update { it.dismissFailure() }

    /** « Recharger » : un échec sur cache vide se rejoue ; sur cache non vide, rien n'a quitté l'écran. */
    fun retry() {
        loadFailed.value = false
        viewModelScope.launch { reread() }
    }

    fun buy(slug: String) {
        val domain = selected.value
        val begun = ledger.value.begin(domain, shop.value?.packs(domain)?.firstOrNull { it.slug == slug }) {
            UUID.randomUUID().toString()
        } ?: return
        ledger.value = begun.ledger
        viewModelScope.launch {
            // Le geste part et se conclut même si l'écran est quitté : le cache doit recevoir ce que le serveur a dit.
            val outcome = withContext(NonCancellable) {
                try {
                    repository.purchase(domain, slug, begun.requestId)
                } catch (_: Exception) {
                    PackPurchaseOutcome.Refused(PackPurchaseRefusal.UNREAD)
                }
            }
            when (outcome) {
                is PackPurchaseOutcome.Done -> {
                    shop.update { it?.applying(domain, outcome.purchase) }
                    ledger.update { it.settled(domain, slug) }
                }
                is PackPurchaseOutcome.Refused -> {
                    ledger.update { it.refused(domain, slug, outcome.refusal) }
                    reread()
                }
            }
        }
    }

    private suspend fun reread() {
        try {
            repository.refresh()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            loadFailed.value = true
        }
    }

    companion object {
        const val ARG_DOMAIN = "domain"
        const val ARG_PACK = "pack"
    }
}
