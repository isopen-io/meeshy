package me.meeshy.app.appearance

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.appearance.ServedAppearanceContractStore
import timber.log.Timber

/**
 * Au démarrage, les packs servis installés reprennent leur dernier contrat valide depuis le disque (#16265), hors du fil
 * principal et sans réseau : le fond d'une conversation ou le contour choisis dans un pack non embarqué se peignent dès le
 * premier rendu, hors ligne compris.
 */
class ServedAppearanceRestoreInitializer internal constructor(
    private val store: ServedAppearanceContractStore,
    private val io: CoroutineDispatcher,
) : AppInitializer {

    @Inject
    constructor(store: ServedAppearanceContractStore) : this(store, Dispatchers.IO)

    override fun initialize() {
        CoroutineScope(SupervisorJob() + io).launch {
            runCatching { store.restore() }.onFailure { Timber.w(it, "contrats d'apparence servis illisibles") }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface ServedAppearanceRestoreModule {
    @Binds
    @IntoSet
    fun servedAppearanceRestoreInitializer(impl: ServedAppearanceRestoreInitializer): AppInitializer
}
