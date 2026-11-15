package me.meeshy.app.startup

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.time.ZoneId
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.sdk.lock.ConversationLockStore
import timber.log.Timber

/**
 * #13647 — ouvre hors du fil principal ce que la première image de la liste lirait sinon dessus : le coffre
 * Keystore des verrous de conversation (que la liste lit avant d'afficher une ligne) et les règles du fuseau
 * horaire (première date formatée). Rien n'est rendu plus tard : la liste lit la même valeur, déjà prête.
 */
class OffMainWarmUpInitializer internal constructor(
    private val lockStore: ConversationLockStore,
    private val io: CoroutineDispatcher,
) : AppInitializer {

    @Inject
    constructor(lockStore: ConversationLockStore) : this(lockStore, Dispatchers.IO)

    override val priority: Int = Int.MIN_VALUE

    override fun initialize() {
        CoroutineScope(SupervisorJob() + io).launch {
            runCatching { lockStore.lockedConversationIdsFlow }.onFailure { Timber.w(it, "coffre des verrous illisible") }
            runCatching { ZoneId.systemDefault().rules }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface OffMainWarmUpModule {
    @Binds
    @IntoSet
    fun offMainWarmUpInitializer(impl: OffMainWarmUpInitializer): AppInitializer
}
