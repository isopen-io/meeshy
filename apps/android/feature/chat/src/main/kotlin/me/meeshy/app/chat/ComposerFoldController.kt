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
import me.meeshy.sdk.chat.ComposerFoldStoring

/**
 * L'état replié ou déplié de la barre de composition d'UNE conversation ouverte (#16341) : lu dans [store] à
 * l'ouverture, réécrit à chaque repli ou dépliage, pour qu'on retrouve la barre comme on l'a laissée, y compris
 * après un redémarrage. Une conversation jamais touchée s'ouvre dépliée.
 */
class ComposerFoldController @Inject constructor(
    private val store: ComposerFoldStoring,
) : ChatController {

    private var conversationId: String? = null
    private val _minimized = MutableStateFlow(false)
    val minimized: StateFlow<Boolean> = _minimized.asStateFlow()

    override fun attach(host: ChatControllerHost) {
        conversationId = host.conversationId
        _minimized.value = store.isMinimized(host.conversationId)
    }

    fun setMinimized(minimized: Boolean) {
        val id = conversationId ?: return
        if (_minimized.value == minimized) return
        _minimized.value = minimized
        store.setMinimized(id, minimized)
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ComposerFoldModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: ComposerFoldController): ChatController
}
