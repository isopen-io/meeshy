package me.meeshy.sdk.e2ee

import android.content.Context
import android.content.SharedPreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.model.EndToEndSealedConversations
import me.meeshy.sdk.net.TokenStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.sync.SyncAccountProvider
import javax.inject.Singleton

/**
 * **LE REGISTRE, PAR COMPTE, DES CONVERSATIONS VUES CHIFFRÉES DE BOUT EN BOUT** (#12956) —
 * persistant, et qui ne recule jamais (#12949). Toute rétrogradation servie est ignorée : la
 * liste (`ConversationCacheSource`) garde le mode e2ee d'une conversation apprise, et la garde
 * de l'outbox (`EndToEndOutboxAdmission`) refuse tout clair vers elle. Miroir de
 * `apps/web/src/lib/end-to-end-regime-ledger.ts`.
 */
interface EndToEndRegimeLedger {
    fun isSealed(conversationId: String): Boolean

    fun learn(conversationId: String)

    companion object {
        /** Aucun registre (témoins, aperçus) : rien n'est appris, rien n'est retenu. */
        val None: EndToEndRegimeLedger = object : EndToEndRegimeLedger {
            override fun isSealed(conversationId: String): Boolean = false
            override fun learn(conversationId: String) = Unit
        }
    }
}

/** Registre volatil, par compte — témoins. */
class InMemoryEndToEndRegimeLedger(
    private val account: SyncAccountProvider = SyncAccountProvider { "test" },
) : EndToEndRegimeLedger {
    private val byAccount = mutableMapOf<String, EndToEndSealedConversations>()

    @Synchronized
    override fun isSealed(conversationId: String): Boolean =
        account.activeAccountId()?.let { byAccount[it]?.isSealed(conversationId) } == true

    @Synchronized
    override fun learn(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        byAccount[owner] = (byAccount[owner] ?: EndToEndSealedConversations()).learn(conversationId)
    }
}

/** Registre rangé dans les préférences privées de l'application, une clé par compte. */
class SharedPrefsEndToEndRegimeLedger(
    context: Context,
    private val account: SyncAccountProvider,
) : EndToEndRegimeLedger {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)

    @Synchronized
    override fun isSealed(conversationId: String): Boolean =
        account.activeAccountId()?.let { sealedOf(it).isSealed(conversationId) } == true

    @Synchronized
    override fun learn(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        val current = sealedOf(owner)
        val next = current.learn(conversationId)
        if (next === current) return
        prefs.edit().putStringSet(keyOf(owner), next.ids).apply()
    }

    private fun sealedOf(owner: String): EndToEndSealedConversations =
        EndToEndSealedConversations(prefs.getStringSet(keyOf(owner), emptySet())?.toSet() ?: emptySet())

    private fun keyOf(owner: String): String = "$KEY_PREFIX$owner"

    private companion object {
        const val FILE_NAME = "meeshy_e2ee_sealed_conversations"
        const val KEY_PREFIX = "sealed."
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal object EndToEndRegimeLedgerModule {
    @Provides
    @Singleton
    fun provideEndToEndRegimeLedger(
        @ApplicationContext context: Context,
        session: SessionRepository,
        tokens: TokenStore,
    ): EndToEndRegimeLedger = SharedPrefsEndToEndRegimeLedger(
        context,
        // Le compte de la session, sinon celui rangé au démarrage à froid (le drainage de l'outbox
        // tourne avant que la session ne soit relue) — la même lecture que `SessionOutboxOwnerSource`.
        SyncAccountProvider { (session.currentUserId ?: tokens.userId)?.takeIf { it.isNotBlank() } },
    )
}
