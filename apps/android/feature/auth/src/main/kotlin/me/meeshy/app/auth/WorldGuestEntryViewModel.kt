package me.meeshy.app.auth

import android.os.LocaleList
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.world.WorldEntry
import me.meeshy.sdk.model.world.WorldEntryFailure
import me.meeshy.sdk.model.world.WorldGuestEntryRules
import me.meeshy.sdk.model.world.WorldGuestStep
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionStore
import me.meeshy.sdk.world.WorldEntryRepository
import java.util.Locale
import javax.inject.Inject

/** La porte d'entrée sans compte : en cours de lecture, ouverte avec l'entrée servie, ou fermée. */
sealed interface WorldAvailability {
    data object Checking : WorldAvailability
    data class Open(val entry: WorldEntry) : WorldAvailability
    data object Unavailable : WorldAvailability
}

/** Où va l'écran dès qu'il a fini : le fil de World Wide, ou la porte des COMPTES quand un compte est ouvert. */
sealed interface WorldDestination {
    data class Conversation(val conversationId: String) : WorldDestination
    data class AccountJoin(val linkKey: String) : WorldDestination
}

data class WorldGuestEntryUiState(
    val availability: WorldAvailability = WorldAvailability.Checking,
    val step: WorldGuestStep = WorldGuestStep.NAME,
    val name: String = "",
    val language: String = WorldGuestEntryRules.proposedLanguage(null),
    val isEntering: Boolean = false,
    val failure: WorldEntryFailure? = null,
    val destination: WorldDestination? = null,
) {
    val trimmedName: String get() = WorldGuestEntryRules.trimmedName(name)
    val canContinue: Boolean get() = WorldGuestEntryRules.canContinue(name)
    val nameTooShort: Boolean get() = WorldGuestEntryRules.isNameTooShort(name)
    val canEnter: Boolean get() = availability is WorldAvailability.Open && canContinue && !isEntering && destination == null
    val worldTitle: String get() = (availability as? WorldAvailability.Open)?.entry?.title.orEmpty()
}

/**
 * #10006 — l'entrée SANS COMPTE dans World Wide, depuis le lien `https://meeshy.me/world` (le QR de la
 * landing) : nom → langue principale → fil. Miroir de `WorldGuestEntryViewModel` (iOS).
 *
 * La clé de jonction se LIT dans `GET /world` — elle n'est jamais écrite ici — puis l'invité entre par la
 * porte canonique des liens. Trois garde-fous :
 * - un compte DÉJÀ ouvert n'entre jamais en invité (un jeton de session invitée posé à côté d'un JWT
 *   mélangerait deux identités) : l'écran passe la main à la porte des comptes ([WorldDestination.AccountJoin]) ;
 * - une session invitée déjà ouverte sur cette clé est reprise sans reposer les questions ;
 * - « Entrer » ne part pas deux fois ([WorldGuestEntryUiState.isEntering]).
 */
@HiltViewModel
class WorldGuestEntryViewModel @Inject constructor(
    private val repository: WorldEntryRepository,
    private val sessionStore: AnonymousSessionStore,
    private val authState: ShareLinkAuthStateProviding,
) : ViewModel() {

    private val _state = MutableStateFlow(WorldGuestEntryUiState())
    val state: StateFlow<WorldGuestEntryUiState> = _state.asStateFlow()

    init {
        _state.update { it.copy(language = WorldGuestEntryRules.proposedLanguage(systemLanguageTag())) }
        load()
    }

    fun load() {
        viewModelScope.launch {
            when (val result = repository.entry()) {
                is NetworkResult.Success -> open(result.data)
                is NetworkResult.Failure -> _state.update {
                    // Un 404 (WORLD_UNAVAILABLE) ferme la porte ; hors ligne ou lent, l'entrée déjà servie reste valable.
                    if (it.availability is WorldAvailability.Open && !WorldGuestEntryRules.closesTheDoor(result.error.httpStatus)) {
                        it
                    } else {
                        it.copy(availability = WorldAvailability.Unavailable)
                    }
                }
            }
        }
    }

    private suspend fun open(entry: WorldEntry) {
        _state.update { it.copy(availability = WorldAvailability.Open(entry)) }
        if (authState.isAuthenticated()) {
            _state.update { it.copy(destination = WorldDestination.AccountJoin(entry.shareLinkIdentifier)) }
            return
        }
        val stored = sessionStore.load()
        val resumable = stored?.takeIf { it.linkId.trim() == entry.shareLinkIdentifier.trim() && it.conversationId.isNotBlank() }
        if (resumable != null) {
            _state.update { it.copy(destination = WorldDestination.Conversation(resumable.conversationId)) }
        }
    }

    fun onNameChange(value: String) {
        _state.update { it.copy(name = WorldGuestEntryRules.boundedName(value), failure = null) }
    }

    fun onLanguageChange(code: String) {
        _state.update { it.copy(language = code, failure = null) }
    }

    fun continueToLanguage() {
        _state.update { if (it.canContinue) it.copy(step = WorldGuestStep.LANGUAGE, failure = null) else it }
    }

    /** `true` quand le retour a été absorbé (langue → nom) ; `false` : l'écran se ferme. */
    fun back(): Boolean {
        val current = _state.value
        return when {
            current.isEntering -> true
            current.step == WorldGuestStep.LANGUAGE -> {
                _state.update { it.copy(step = WorldGuestStep.NAME, failure = null) }
                true
            }
            else -> false
        }
    }

    fun enter() {
        val current = _state.value
        val open = current.availability as? WorldAvailability.Open ?: return
        if (!current.canEnter) return
        _state.update { it.copy(isEntering = true, failure = null) }
        viewModelScope.launch {
            when (val result = repository.joinAsGuest(open.entry.shareLinkIdentifier, current.trimmedName, current.language)) {
                is NetworkResult.Success -> _state.update {
                    it.copy(isEntering = false, destination = WorldDestination.Conversation(result.data.conversationId))
                }
                is NetworkResult.Failure -> _state.update {
                    it.copy(
                        isEntering = false,
                        failure = WorldGuestEntryRules.failure(result.error.code, result.error.httpStatus, result.error.message),
                    )
                }
            }
        }
    }
}

private fun systemLanguageTag(): String? =
    runCatching { LocaleList.getDefault().takeIf { it.size() > 0 }?.get(0)?.toLanguageTag() }
        .getOrElse { Locale.getDefault().toLanguageTag() }
