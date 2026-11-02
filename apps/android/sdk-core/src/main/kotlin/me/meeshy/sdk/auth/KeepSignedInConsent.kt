package me.meeshy.sdk.auth

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.SessionBackupConsent
import javax.inject.Inject
import javax.inject.Singleton

/**
 * « Rester connecté sur cet appareil » gouverne aussi la sauvegarde hors de l'app (#14058, décision porteur) :
 * décoché, la session n'est jamais écrite au Block Store. Le choix fait à la connexion ([open]) est lié au compte
 * qui s'ouvre ([bind]) AVANT que ses jetons ne s'écrivent ; ensuite, il se relit dans le compte mémorisé
 * ([SavedAccountsStore], `keepsSession`), qui le garde d'un lancement à l'autre.
 */
@Singleton
class KeepSignedInConsent @Inject constructor(
    private val savedAccounts: SavedAccountsStore,
) : SessionBackupConsent {

    @Volatile
    private var opening: Boolean? = null

    @Volatile
    private var bound: Pair<String, Boolean>? = null

    /** Le choix de la case pour la session qui s'ouvre (connexion, puis second facteur ou preuve d'adresse). */
    fun open(keepsSession: Boolean) {
        opening = keepsSession
    }

    /** La session de [userId] s'ouvre : le choix en attente lui revient, coché par défaut. */
    fun bind(userId: String) {
        bound = userId to (opening ?: true)
        opening = null
    }

    override fun allows(userId: String): Boolean {
        val decided = bound
        if (decided != null && decided.first == userId) return decided.second
        return savedAccounts.accounts.value.firstOrNull { it.id == userId }?.keepsSession ?: true
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class KeepSignedInConsentModule {
    @Binds
    abstract fun bindsSessionBackupConsent(consent: KeepSignedInConsent): SessionBackupConsent
}
