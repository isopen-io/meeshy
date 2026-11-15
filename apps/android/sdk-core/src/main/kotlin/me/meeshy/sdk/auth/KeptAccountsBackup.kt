package me.meeshy.sdk.auth

import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.model.auth.SavedAccount
import me.meeshy.sdk.model.auth.SavedAccounts
import me.meeshy.sdk.net.AccountShelf
import me.meeshy.sdk.net.AccountTokens
import me.meeshy.sdk.net.BackedUpAccount
import me.meeshy.sdk.net.BackedUpSession
import me.meeshy.sdk.net.SessionBackup
import me.meeshy.sdk.net.TokenStore

/**
 * Les comptes gardés « Rester connecté sur cet appareil » survivent à la réinstallation, comme dans le Keychain iOS
 * (#14079). Chacun a son entrée au coffre ([AccountShelf]) tant qu'il est gardé ET qu'il a une session ; un compte qu'on
 * ne garde plus, qu'on retire du sélecteur ou dont on se déconnecte en sort. Au lancement d'une installation neuve,
 * [restoreDormant] remet ces comptes dans le coffre à jetons et dans le sélecteur ; le compte actif, lui, revient par sa
 * propre sauvegarde ([SessionBackup]) et son renouvellement.
 */
@Singleton
class KeptAccountsBackup @Inject constructor(
    private val shelf: AccountShelf,
    private val tokenStore: TokenStore,
    private val savedAccounts: SavedAccountsStore,
    private val sessionBackup: SessionBackup,
) {
    private val lock = Any()

    /**
     * Ce que le coffre porte à la connaissance de CE processus : ce qu'il y a posé, et ce que [restoreDormant] y a lu.
     * Seul ce qu'il connaît s'efface ; lu au lancement, un effacement perdu la fois précédente (processus tué, coffre
     * indisponible) se rejoue au premier [sync] au lieu de laisser l'entrée vivre à jamais.
     */
    private var shelved: Map<String, BackedUpAccount> = emptyMap()

    /** Accorde le coffre aux [accounts] : les quinze plus récents, gardés et avec une session, y ont leur entrée. */
    fun sync(accounts: List<SavedAccount>) = synchronized(lock) {
        val wanted = SavedAccounts.sorted(accounts)
            .filter { it.keepsSession }
            .mapNotNull(::shelfEntry)
            .take(AccountShelf.MAX_ACCOUNTS)
            .associateBy { it.userId }
        (shelved.keys - wanted.keys).forEach(shelf::erase)
        wanted.values.filter { shelved[it.userId] != it }.forEach(shelf::save)
        shelved = wanted
    }

    /**
     * Remet au sélecteur, avec leur session, les comptes gardés que le coffre porte et que l'appareil ne connaît plus
     * (réinstallation). Ni le compte actif, ni celui que sa propre sauvegarde rouvre, ni un compte déjà connu ne sont
     * touchés. Rend le nombre de comptes remis.
     */
    suspend fun restoreDormant(): Int {
        val opening = tokenStore.userId ?: sessionBackup.read()?.userId
        val known = savedAccounts.accounts.value.mapTo(mutableSetOf()) { it.id }
        val onShelf = shelf.readAll()
        synchronized(lock) { shelved = onShelf.associateBy { it.userId } + shelved }
        val missing = onShelf.filter { it.userId != opening && it.userId !in known && tokenStore.tokensOf(it.userId) == null }
        missing.forEach { account ->
            tokenStore.keepDormant(account.userId, AccountTokens(account.session.jwt, account.session.sessionToken))
            savedAccounts.upsert(
                SavedAccount(
                    id = account.userId,
                    username = account.username,
                    displayName = account.displayName,
                    avatarUrl = account.avatarUrl,
                    lastActiveAtMillis = 0L,
                    keepsSession = true,
                ),
            )
        }
        return missing.size
    }

    private fun shelfEntry(account: SavedAccount): BackedUpAccount? {
        val tokens = tokenStore.tokensOf(account.id) ?: return null
        val jwt = tokens.jwt?.takeIf { it.isNotBlank() } ?: return null
        val session = tokens.sessionToken?.takeIf { it.isNotBlank() } ?: return null
        return BackedUpAccount(
            session = BackedUpSession(userId = account.id, jwt = jwt, sessionToken = session),
            username = account.username,
            displayName = account.displayName,
            avatarUrl = account.avatarUrl,
        )
    }
}
