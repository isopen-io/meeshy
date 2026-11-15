package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import me.meeshy.sdk.conversation.MessageColumnBackfill

/**
 * Remplit en arrière-plan les colonnes requêtables des messages écrits avant la migration 19,
 * depuis leur payload. Ne bloque jamais le démarrage : le travail part sur le dispatcher IO.
 */
class MessageColumnBackfillInitializer @Inject constructor(
    private val backfill: MessageColumnBackfill,
) : AppInitializer {
    override fun initialize() {
        backfill.launchIn(CoroutineScope(SupervisorJob() + Dispatchers.IO))
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface MessageColumnBackfillModule {
    @Binds
    @IntoSet
    fun messageColumnBackfillInitializer(impl: MessageColumnBackfillInitializer): AppInitializer
}
