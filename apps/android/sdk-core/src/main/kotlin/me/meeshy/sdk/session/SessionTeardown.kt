package me.meeshy.sdk.session

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import me.meeshy.core.database.DatabaseRecovery
import me.meeshy.core.database.MeeshyDatabase
import me.meeshy.sdk.conversation.TranslationLayer
import me.meeshy.sdk.category.CategorySnapshotStore
import me.meeshy.sdk.preferences.PreferenceSnapshotStore
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.feedback.FeedbackToastCenter
import me.meeshy.sdk.friend.BlockCache
import me.meeshy.sdk.friend.FriendshipCache
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.model.session.LogoutPurgePolicy
import me.meeshy.sdk.model.session.PurgeCause
import me.meeshy.sdk.notification.NotificationRepository
import me.meeshy.sdk.story.StoryComposerDraftStore
import timber.log.Timber

/**
 * Wipes every disk-persisted, per-account cache on logout/account-switch — parity
 * with iOS `RootView`'s logout branch (`CacheCoordinator.reset()` + friendship-cache
 * clear, `apps/ios/Meeshy/App/MeeshyApp.swift`, part-13 audit). None of Meeshy's
 * on-device stores are namespaced by userId, so a second account signing in on the
 * same device would otherwise inherit the previous account's cached conversations,
 * messages, stories, categories, unsent chat drafts, an in-progress story composer
 * draft, conversation-lock PINs (same reasoning as iOS's own
 * `ConversationLockManager.resetForLogout`) — and, in-memory, the previous
 * account's friendship graph ([FriendshipCache]), blocklist ([BlockCache]) and
 * notifications ([NotificationRepository]): all three are process-wide
 * `@Singleton`s, so without an explicit clear here a second account signing in
 * on the SAME process would see the first account's pending friend requests,
 * blocked users and unread notifications until it happened to revalidate them.
 *
 * [wipe] is called by [me.meeshy.sdk.auth.AuthRepository.logout] before the caller
 * treats the session as ended, so a subsequent login never races a still-running
 * wipe. E2EE key material has no analogue here yet — Android carries no client-side
 * Signal/identity-key store to wipe (unlike iOS's Keychain-backed one); this seam is
 * where that clear would land once one exists.
 */
public interface SessionTeardown {
    /** Clears every per-account store. Idempotent — safe to call on an already-clear device. */
    public suspend fun wipe()

    /**
     * La même purge, quand la passerelle a elle-même clos la session (compte supprimé, accès d'invité retiré) :
     * si des envois en attente sont perdus, l'utilisateur en est prévenu. Par défaut, une purge ordinaire.
     */
    public suspend fun wipeAfterServerInvalidation() {
        wipe()
    }

    /**
     * La purge d'un appareil qui démarre déconnecté : [stillSignedOut] est relu À L'INTÉRIEUR de la barrière de compte,
     * juste avant de vider — une restauration de session survenue entre-temps n'est jamais effacée. Rend `true` quand
     * la purge a eu lieu.
     */
    public suspend fun wipeIfStillSignedOut(stillSignedOut: () -> Boolean): Boolean {
        if (!stillSignedOut()) return false
        wipe()
        return true
    }
}

public class DefaultSessionTeardown(
    private val database: MeeshyDatabase,
    private val categorySnapshotStore: CategorySnapshotStore,
    private val conversationDraftStore: ConversationDraftStore,
    private val conversationLockStore: ConversationLockStore,
    private val storyComposerDraftStore: StoryComposerDraftStore,
    private val friendshipCache: FriendshipCache,
    private val notificationRepository: NotificationRepository,
    private val blockCache: BlockCache,
    private val preferenceSnapshotStore: PreferenceSnapshotStore? = null,
    private val perAccountCaches: Set<PerAccountCache> = emptySet(),
    private val guestSessions: AnonymousSessionStore? = null,
    private val fence: AccountFence? = null,
    private val feedbackToasts: FeedbackToastCenter? = null,
    private val lostSends: LostSendsNotifier? = null,
) : SessionTeardown {

    /**
     * Through [fence] (#13555): the account is closed FIRST — an outbox send in flight is cancelled and awaited, a write
     * begun under it can no longer commit — then the stores are wiped, so nothing written for the account that leaves
     * survives into the next one.
     */
    override suspend fun wipe() {
        purge(PurgeCause.USER_LOGOUT)
    }

    override suspend fun wipeAfterServerInvalidation() {
        purge(PurgeCause.SERVER_INVALIDATION)
    }

    override suspend fun wipeIfStillSignedOut(stillSignedOut: () -> Boolean): Boolean =
        purge(PurgeCause.SIGNED_OUT_AT_LAUNCH, stillSignedOut)

    /**
     * La purge est inconditionnelle ([LogoutPurgePolicy]) ; seul l'avertissement dépend de la cause et de la file.
     * [admitted] est lu sous la barrière AVANT de fermer le compte — faux, la barrière ne change rien (ni génération, ni
     * envoi annulé) —, puis relu après l'arrêt des envois en vol : faux, rien n'est vidé. Une ouverture de session
     * ([AccountFence.opening]) ne s'intercale jamais entre ces lectures et la fin du vidage.
     */
    private suspend fun purge(cause: PurgeCause, admitted: () -> Boolean = { true }): Boolean {
        var decision = LogoutPurgePolicy.decide(cause, pendingSends = 0)
        var purged = false
        val run: suspend () -> Unit = body@{
            if (!admitted()) return@body
            decision = LogoutPurgePolicy.decide(cause, pendingSends())
            clearAll()
            purged = true
        }
        if (fence == null) run() else fence.closeIf(admitted) { run() }
        if (purged && decision.warnLostSends) lostSends?.notify(decision.lostSends)
        return purged
    }

    private suspend fun pendingSends(): Int = try {
        withContext(Dispatchers.IO) { database.outboxDao().pendingCount() }
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        0
    }

    /**
     * #14655 — the vault outlives the session (same account, same history), so the erasures still owed to an account
     * survive its logout: they are only identifiers, stamped with their account, and the next session of THAT account
     * drains them. An unstamped row could be drained by another account, so it does not survive.
     */
    private suspend fun clearKeepingPlaintextErasures() {
        val erasures = database.plaintextErasureDao()
        val owed = erasures.all().filter { it.account.isNotEmpty() }
        database.clearAllTables()
        if (owed.isNotEmpty()) erasures.restore(owed)
        runCatching { DatabaseRecovery.clearStaleCorruptionMarker(database.openHelper.writableDatabase) }
    }

    private suspend fun clearAll() {
        feedbackToasts?.clear()
        // Room's clearAllTables() is a blocking call — never on the caller's dispatcher.
        withContext(Dispatchers.IO) { clearKeepingPlaintextErasures() }
        // Le L1 des traductions retenues est la copie en mémoire de tables que l'on vient de vider : le compte suivant
        // ne lit jamais les traductions du précédent, et réhydrate depuis son propre disque.
        TranslationLayer.of(database).clear()
        categorySnapshotStore.clearAll()
        conversationDraftStore.clearAll()
        conversationLockStore.resetForLogout()
        storyComposerDraftStore.clear()
        friendshipCache.clear()
        notificationRepository.clear()
        blockCache.clear()
        preferenceSnapshotStore?.clearAll()
        // Une session invitee persistee survivait a la deconnexion : ses droits d'envoi bridaient le composeur du compte
        // suivant, et son jeton restait sur le disque. Une fin de session invitee purge tout, comme une deconnexion.
        guestSessions?.clear()
        perAccountCaches.forEach { cache ->
            try {
                cache.clear()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: Exception) {
                Timber.e(failure, "PerAccountCache %s : echec du vidage", cache.javaClass.name)
            }
        }
    }
}
