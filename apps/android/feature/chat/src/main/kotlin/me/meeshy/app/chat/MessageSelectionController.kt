package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.selection.MessageSelection

/**
 * Le mode sélection multiple du fil (#13294, iOS `ConversationView+Selection`). Il porte SON état
 * dans SON flux — [ChatUiState] ne grossit pas — et la liste n'en lit que ce qu'une bulle affiche
 * (mode ouvert ? cochée ?), si bien que cocher une bulle ne recompose que cette bulle.
 *
 * Les gestes sont purs ([MessageSelection]) ; ce contrôleur ne fait que les ranger et élaguer la
 * sélection quand un message coché disparaît du fil (supprimé, masqué, expiré).
 */
class MessageSelectionController @Inject constructor() : ChatController {

    private val _selection = MutableStateFlow(MessageSelection.Inactive)
    val selection: StateFlow<MessageSelection> = _selection.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        host.scope.launch {
            host.uiState
                .map { state -> state.messages.mapTo(HashSet()) { it.messageId } }
                .distinctUntilChanged()
                .collect { present -> _selection.value = _selection.value.retaining(present) }
        }
    }

    /** Entre dans le mode en semant [seedMessageId] — point d'entrée unique (le menu d'appui long). */
    fun begin(seedMessageId: String) {
        _selection.value = MessageSelection.begin(seedMessageId)
    }

    /** Bascule [messageId] ; rend le verdict pour que l'écran signale le plafond. */
    fun toggle(messageId: String): MessageSelection.Toggle {
        val verdict = _selection.value.toggle(messageId)
        if (verdict is MessageSelection.Toggle.Changed) _selection.value = verdict.selection
        return verdict
    }

    fun end() {
        _selection.value = _selection.value.end()
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class MessageSelectionModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: MessageSelectionController): ChatController
}

/** Aucun contrôleur de sélection (tests, aperçus) : le mode reste inactif. */
internal val NO_SELECTION: StateFlow<MessageSelection> = MutableStateFlow(MessageSelection.Inactive)
