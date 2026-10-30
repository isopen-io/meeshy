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

    /** #13628 — la passerelle a SERVI cette conversation sans bout en bout : son mode est connu clair (un mode nul servi n'est plus « inconnu »). */
    fun isClearConfirmed(conversationId: String): Boolean = false

    /** Retient, en un seul lot, les conversations que la passerelle vient de servir sans bout en bout. Ne retient jamais une scellée. */
    fun confirmClear(conversationIds: Collection<String>) = Unit

    /**
     * #13820 — un envoi hors du fil a été mis en file sans que le mode de cette conversation ait pu être relu (hors ligne) :
     * son mode en cache ne suffit plus, la garde de l'outbox le relira avant le prochain clair.
     */
    fun isModeUnconfirmed(conversationId: String): Boolean = false

    fun markModeUnconfirmed(conversationId: String) = Unit

    /** #13820 — la passerelle vient de servir le mode de cette conversation : le cache suffit de nouveau. */
    fun confirmMode(conversationId: String) = Unit

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
    private val clearByAccount = mutableMapOf<String, Set<String>>()
    private val unconfirmedByAccount = mutableMapOf<String, Set<String>>()

    @Synchronized
    override fun isModeUnconfirmed(conversationId: String): Boolean =
        account.activeAccountId()?.let { conversationId in unconfirmedByAccount[it].orEmpty() } == true

    @Synchronized
    override fun markModeUnconfirmed(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        unconfirmedByAccount[owner] = unconfirmedByAccount[owner].orEmpty() + conversationId
    }

    @Synchronized
    override fun confirmMode(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        unconfirmedByAccount[owner] = unconfirmedByAccount[owner].orEmpty() - conversationId
    }

    @Synchronized
    override fun isClearConfirmed(conversationId: String): Boolean =
        account.activeAccountId()?.let { conversationId in clearByAccount[it].orEmpty() } == true

    @Synchronized
    override fun confirmClear(conversationIds: Collection<String>) {
        val owner = account.activeAccountId() ?: return
        val sealed = byAccount[owner] ?: EndToEndSealedConversations()
        clearByAccount[owner] = clearByAccount[owner].orEmpty() + conversationIds.filterNot(sealed::isSealed)
    }

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

    @Synchronized
    override fun isClearConfirmed(conversationId: String): Boolean =
        account.activeAccountId()?.let { conversationId in clearOf(it) } == true

    @Synchronized
    override fun confirmClear(conversationIds: Collection<String>) {
        val owner = account.activeAccountId() ?: return
        val sealed = sealedOf(owner)
        val current = clearOf(owner)
        val added = conversationIds.filterNot { it in current || sealed.isSealed(it) }
        if (added.isEmpty()) return
        prefs.edit().putStringSet(clearKeyOf(owner), current + added).apply()
    }

    @Synchronized
    override fun isModeUnconfirmed(conversationId: String): Boolean =
        account.activeAccountId()?.let { conversationId in unconfirmedOf(it) } == true

    @Synchronized
    override fun markModeUnconfirmed(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        val current = unconfirmedOf(owner)
        if (conversationId in current) return
        // #13820 — écrite AVANT que la ligne d'outbox ne soit validée : un processus tué entre les deux ne doit pas laisser
        // une ligne en file dont la conversation aurait oublié qu'elle est à relire.
        prefs.edit().putStringSet(unconfirmedKeyOf(owner), current + conversationId).commit()
    }

    @Synchronized
    override fun confirmMode(conversationId: String) {
        val owner = account.activeAccountId() ?: return
        val current = unconfirmedOf(owner)
        if (conversationId !in current) return
        prefs.edit().putStringSet(unconfirmedKeyOf(owner), current - conversationId).apply()
    }

    private fun unconfirmedOf(owner: String): Set<String> =
        prefs.getStringSet(unconfirmedKeyOf(owner), emptySet())?.toSet() ?: emptySet()

    private fun unconfirmedKeyOf(owner: String): String = "$UNCONFIRMED_KEY_PREFIX$owner"

    private fun clearOf(owner: String): Set<String> = prefs.getStringSet(clearKeyOf(owner), emptySet())?.toSet() ?: emptySet()

    private fun clearKeyOf(owner: String): String = "$CLEAR_KEY_PREFIX$owner"

    private fun sealedOf(owner: String): EndToEndSealedConversations =
        EndToEndSealedConversations(prefs.getStringSet(keyOf(owner), emptySet())?.toSet() ?: emptySet())

    private fun keyOf(owner: String): String = "$KEY_PREFIX$owner"

    private companion object {
        const val FILE_NAME = "meeshy_e2ee_sealed_conversations"
        const val KEY_PREFIX = "sealed."
        const val CLEAR_KEY_PREFIX = "clear."
        const val UNCONFIRMED_KEY_PREFIX = "reread."
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
