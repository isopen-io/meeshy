package me.meeshy.sdk.session

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import javax.inject.Inject
import me.meeshy.sdk.lifecycle.AppLifecycleHook
import me.meeshy.sdk.model.session.LogoutPurgePolicy
import me.meeshy.sdk.net.TokenStore

/**
 * Purge un appareil qui démarre DÉJÀ déconnecté (déconnexion interrompue, session retirée pendant que l'app était
 * morte). Un démarrage à froid sur session valide ne purge jamais ([LogoutPurgePolicy.purgeAtLaunch]). La session se
 * relit sous la barrière de compte ([SessionTeardown.wipeIfStillSignedOut]) : la restauration d'une session sauvegardée,
 * lancée en même temps, n'est jamais vidée juste après sa création.
 */
public class LaunchPurgeHook @Inject constructor(
    private val tokenStore: TokenStore,
    private val teardown: SessionTeardown,
) : AppLifecycleHook {
    override val name: String get() = "launch-purge"

    override suspend fun onAppCreate() {
        if (!signedOut()) return
        teardown.wipeIfStillSignedOut { signedOut() }
    }

    private fun signedOut(): Boolean = LogoutPurgePolicy.purgeAtLaunch(hasSession = tokenStore.isAuthenticated)
}

@Module
@InstallIn(SingletonComponent::class)
public abstract class LaunchPurgeModule {
    @Binds @IntoSet
    public abstract fun bindHook(impl: LaunchPurgeHook): AppLifecycleHook
}
