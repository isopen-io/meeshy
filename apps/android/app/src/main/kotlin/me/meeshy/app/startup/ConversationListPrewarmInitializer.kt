package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.flow.map
import me.meeshy.sdk.conversation.ConversationListPrewarmer
import me.meeshy.sdk.session.SessionRepository

/** Préchauffe la liste des conversations dès qu'un compte est authentifié (lot liste-chargement-cache-first). */
class ConversationListPrewarmInitializer @Inject constructor(
    private val prewarmer: ConversationListPrewarmer,
    private val session: SessionRepository,
) : AppInitializer {
    override fun initialize() {
        prewarmer.start(session.currentUser.map { it?.id })
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ConversationListPrewarmModule {
    @Binds
    @IntoSet
    fun conversationListPrewarmInitializer(impl: ConversationListPrewarmInitializer): AppInitializer
}
