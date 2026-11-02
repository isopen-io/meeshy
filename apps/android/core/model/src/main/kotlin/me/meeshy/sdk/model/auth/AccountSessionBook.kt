package me.meeshy.sdk.model.auth

/** What a saved-account row shows: the open session, a dormant one, or none. */
enum class AccountRowState { CURRENT, SIGNED_IN, SIGNED_OUT }

/**
 * Pure book of the device's account sessions — mirror of iOS
 * `AuthManager+Accounts` (#8286): ONE account is active; the others, when
 * kept (`keepsSession`), sleep with their tokens and resume without a
 * password; an un-kept account loses its tokens when left.
 *
 * It owns no token (the vault does) and no display data (`SavedAccounts` does):
 * it answers "who is active, who keeps a session, what does each row show".
 */
data class AccountSessionBook(
    val activeId: String? = null,
    val keeps: Map<String, Boolean> = emptyMap(),
) {
    /** The account leaves unmarked entries kept: the first account is kept without a question. */
    fun keepsSession(id: String): Boolean = keeps[id] ?: true

    /** Makes [id] the single active account, remembering whether it is kept. */
    fun activate(id: String, keepSignedIn: Boolean = true): AccountSessionBook =
        copy(activeId = id, keeps = keeps + (id to keepSignedIn))

    /** Leaves the active account; [Departure.wipe] names the one whose tokens must go. */
    fun leave(): Departure {
        val outgoing = activeId ?: return Departure(this, wipe = null)
        val wipe = outgoing.takeUnless { keepsSession(it) }
        return Departure(copy(activeId = null), wipe)
    }

    /** Forgets [id] entirely (account removed from the device). */
    fun forget(id: String): AccountSessionBook =
        copy(activeId = activeId.takeUnless { it == id }, keeps = keeps - id)

    fun rowState(id: String, accountsWithTokens: Set<String>): AccountRowState = when {
        id == activeId -> AccountRowState.CURRENT
        id in accountsWithTokens -> AccountRowState.SIGNED_IN
        else -> AccountRowState.SIGNED_OUT
    }

    /** Another account than the active one keeps a session: only then is "stay signed in" offered. */
    fun offersKeepSignedIn(accountsWithTokens: Set<String>): Boolean =
        accountsWithTokens.any { it != activeId && keepsSession(it) }

    data class Departure(val book: AccountSessionBook, val wipe: String?)

    companion object {
        fun of(accounts: List<SavedAccount>, activeId: String?): AccountSessionBook =
            AccountSessionBook(activeId, accounts.associate { it.id to it.keepsSession })
    }
}
