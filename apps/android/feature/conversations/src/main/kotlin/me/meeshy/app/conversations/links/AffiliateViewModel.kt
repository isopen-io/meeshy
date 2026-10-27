package me.meeshy.app.conversations.links

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.AffiliateReferralRepository
import me.meeshy.sdk.link.AffiliateRepository
import me.meeshy.sdk.link.LinksCache
import me.meeshy.sdk.model.links.AffiliateCreateForm
import me.meeshy.sdk.model.links.AffiliateTokensState
import me.meeshy.sdk.net.NetworkResult
import javax.inject.Inject

data class AffiliateUiState(
    val tokens: AffiliateTokensState = AffiliateTokensState(),
    val hasLoaded: Boolean = false,
    val isRefreshing: Boolean = false,
    val refreshFailed: Boolean = false,
    val createSheet: AffiliateCreateSheet? = null,
)

data class AffiliateCreateSheet(
    val form: AffiliateCreateForm = AffiliateCreateForm(),
    val isCreating: Boolean = false,
    val failed: Boolean = false,
)

/**
 * Le parrainage (iOS `AffiliateViewModel`) : jetons en cache d'abord, revalidation silencieuse, création
 * en tête de liste, suppression optimiste avec retour arrière sur l'instantané si le serveur refuse.
 */
@HiltViewModel
class AffiliateViewModel @Inject constructor(
    private val reading: AffiliateRepository,
    private val writing: AffiliateReferralRepository,
    private val cache: LinksCache,
) : ViewModel() {

    private val cached = cache.affiliateTokens()
    private val _state = MutableStateFlow(
        AffiliateUiState(tokens = AffiliateTokensState(cached.orEmpty()), hasLoaded = cached != null),
    )
    val state: StateFlow<AffiliateUiState> = _state.asStateFlow()

    private val _events = Channel<LinkEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    private var job: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        if (job?.isActive == true) return
        _state.update { it.copy(isRefreshing = true) }
        job = viewModelScope.launch {
            val fetched = (reading.listTokens() as? NetworkResult.Success)?.data
            fetched?.let(cache::putAffiliateTokens)
            _state.update { current ->
                current.copy(
                    tokens = fetched?.let { AffiliateTokensState(it) } ?: current.tokens,
                    hasLoaded = current.hasLoaded || fetched != null,
                    isRefreshing = false,
                    refreshFailed = fetched == null,
                )
            }
        }
    }

    fun openCreate() = _state.update { it.copy(createSheet = AffiliateCreateSheet()) }

    fun dismissCreate() = _state.update { it.copy(createSheet = null) }

    fun editForm(transform: (AffiliateCreateForm) -> AffiliateCreateForm) = _state.update { current ->
        current.copy(createSheet = current.createSheet?.let { it.copy(form = transform(it.form), failed = false) })
    }

    fun create() {
        val sheet = _state.value.createSheet ?: return
        val request = sheet.form.request() ?: return
        if (sheet.isCreating) return
        _state.update { it.copy(createSheet = sheet.copy(isCreating = true, failed = false)) }
        viewModelScope.launch {
            when (val result = writing.createToken(request.name, request.maxUses, request.expiresAt)) {
                is NetworkResult.Success -> {
                    val next = _state.value.tokens.prepended(result.data)
                    cache.putAffiliateTokens(next.tokens)
                    _state.update { it.copy(tokens = next, createSheet = null) }
                    _events.send(LinkEvent.Created)
                }
                is NetworkResult.Failure -> _state.update { current ->
                    current.copy(createSheet = current.createSheet?.copy(isCreating = false, failed = true))
                }
            }
        }
    }

    fun delete(id: String) {
        val snapshot = _state.value.tokens
        val next = snapshot.removed(id)
        _state.update { it.copy(tokens = next) }
        cache.putAffiliateTokens(next.tokens)
        viewModelScope.launch {
            _events.send(LinkEvent.Removed)
            if (writing.deleteToken(id) is NetworkResult.Failure) {
                _state.update { it.copy(tokens = snapshot) }
                cache.putAffiliateTokens(snapshot.tokens)
                _events.send(LinkEvent.RemoveFailed)
            }
        }
    }
}
