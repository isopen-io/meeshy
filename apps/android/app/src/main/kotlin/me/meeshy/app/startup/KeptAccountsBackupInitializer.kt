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
import kotlinx.coroutines.launch
import me.meeshy.sdk.auth.KeptAccountsBackup
import me.meeshy.sdk.auth.SavedAccountsStore

/**
 * Les comptes gardés « Rester connecté » survivent à la réinstallation (#14079) : au lancement, ceux que le coffre porte
 * et que l'appareil ne connaît plus reviennent au sélecteur avec leur session ; ensuite, chaque changement de la liste
 * des comptes accorde le coffre (un compte qu'on ne garde plus, ou dont on se déconnecte, en sort).
 */
class KeptAccountsBackupInitializer @Inject constructor(
    private val backup: KeptAccountsBackup,
    private val savedAccounts: SavedAccountsStore,
) : AppInitializer {
    override fun initialize() {
        CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
            backup.restoreDormant()
            savedAccounts.accounts.collect(backup::sync)
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
interface KeptAccountsBackupInitializerModule {
    @Binds
    @IntoSet
    fun keptAccountsBackupInitializer(impl: KeptAccountsBackupInitializer): AppInitializer
}
