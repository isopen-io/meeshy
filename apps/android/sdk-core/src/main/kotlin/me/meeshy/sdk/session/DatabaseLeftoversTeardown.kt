package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.DatabaseLeftovers

/**
 * Les copies de la base laissées par une reprise (`meeshy.db.corrupted.*`, `meeshy-fallback.db`) ne sont pas chiffrées
 * et portent l'historique du compte qui part : elles quittent le disque à chaque fin de session — déconnexion, compte
 * supprimé, session invitée close, appareil démarré déconnecté — et ne sont jamais rouvertes sous le compte suivant.
 */
public class DatabaseLeftoversTeardown @Inject constructor(
    private val leftovers: DatabaseLeftovers,
) : PerAccountCache {
    override suspend fun clear() {
        withContext(Dispatchers.IO) { leftovers.purge() }
    }
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class DatabaseLeftoversTeardownModule {
    @Binds @IntoSet
    public abstract fun bind(impl: DatabaseLeftoversTeardown): PerAccountCache
}
