package me.meeshy.app.chat

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.EndToEndRegime
import me.meeshy.sdk.socket.MessageSocketManager

/**
 * #13794 — ce que le fil OUVERT dit quand le bout en bout s'active sous ses yeux, miroir d'iOS
 * (`EncryptionSwitchAnnouncement`) : une annonce par époque, avec le libellé d'iOS. Une bascule vers un mode lisible par
 * le serveur repeint le fil (`EndToEndRegimeBinding`) sans s'annoncer, et une annonce vers le clair ne se dit pas : le
 * bout en bout ne se désactive pas (#12949). La fermeture du composeur ne dépend pas de cette annonce : le registre et la
 * ligne en cache la portent.
 */
class EncryptionSwitchAnnouncementController @Inject constructor(
    private val messageSocketManager: MessageSocketManager,
) : ChatController {

    private val _announcements = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val announcements: SharedFlow<Unit> = _announcements.asSharedFlow()

    override fun attach(host: ChatControllerHost) {
        val id = host.conversationId
        host.scope.launch {
            var announcedEpochs = emptySet<Int?>()
            messageSocketManager.encryptionChanged.collect { event ->
                if (event.conversationId != id || !EndToEndRegime.isEndToEnd(event.mode)) return@collect
                if (event.epoch in announcedEpochs) return@collect
                announcedEpochs = announcedEpochs + event.epoch
                _announcements.tryEmit(Unit)
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class EncryptionSwitchAnnouncementControllerModule {

    @Binds
    @IntoSet
    abstract fun controller(impl: EncryptionSwitchAnnouncementController): ChatController
}
