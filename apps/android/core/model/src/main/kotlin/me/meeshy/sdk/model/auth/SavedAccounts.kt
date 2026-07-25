package me.meeshy.sdk.model.auth

/**
 * A previously signed-in account remembered for the login screen's saved-account
 * picker — faithful port of iOS `SavedAccount`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`).
 *
 * Persisted per device so a user can switch between multiple accounts with one tap
 * instead of re-typing credentials. Only the display metadata is kept here — never a
 * password or token; re-authentication still requires the password (the picker just
 * prefills the username and jumps focus to the password field).
 *
 * @property id the remembered account's user id (iOS `id`, a MongoDB ObjectId).
 * @property username the login handle prefilled when the row is tapped.
 * @property displayName the human name shown on the row, when known.
 * @property avatarUrl the avatar image URL, when known.
 * @property lastActiveAtMillis epoch-millis of the account's last activity, the
 *   primary sort key so the most recently used account floats to the top.
 */
data class SavedAccount(
    val id: String,
    val username: String,
    val displayName: String?,
    val avatarUrl: String?,
    val lastActiveAtMillis: Long,
) {
    /**
     * The name rendered on the picker row — iOS `shortName` (`displayName ??
     * username`). Hardened over iOS's null-only fallback: a blank/whitespace-only
     * display name also falls back to [username], so a row never renders empty.
     */
    val shortName: String
        get() = displayName?.takeIf { it.isNotBlank() } ?: username
}

/**
 * Pure transforms over the remembered-account list — port of the saved-account
 * logic iOS scatters across `AuthManager` (`loadSavedAccounts` sort,
 * `upsertSavedAccount`, `removeFromSavedAccounts`) and `LoginView` (`showPicker`).
 *
 * iOS keeps these as mutating methods on the stateful `AuthManager` singleton;
 * Android lifts them into a framework-free SSOT of immutable list-to-list functions
 * so every branch is JVM-testable and the app-side store owns only persistence (the
 * Keychain/DataStore read-write) and the observable `StateFlow`.
 */
object SavedAccounts {

    /**
     * Orders accounts for display — iOS `loadSavedAccounts`' D4 sort (pinned by
     * `SavedAccountsSortStabilityTests`): most recently active first
     * ([SavedAccount.lastActiveAtMillis] descending), with [SavedAccount.id]
     * ascending as a stable secondary key so accounts that share a timestamp keep a
     * deterministic order across cold starts (persisted JSON round-trips do not
     * preserve array order).
     */
    fun sorted(accounts: List<SavedAccount>): List<SavedAccount> =
        accounts.sortedWith(
            compareByDescending<SavedAccount> { it.lastActiveAtMillis }.thenBy { it.id },
        )

    /**
     * Inserts or refreshes [account] — iOS `upsertSavedAccount`. An account whose
     * [SavedAccount.id] already exists is replaced **in place** (its position is
     * preserved; re-sorting happens on read via [sorted]); an unknown account is
     * prepended to the front. Returns a new list; the input is never mutated.
     */
    fun upsert(accounts: List<SavedAccount>, account: SavedAccount): List<SavedAccount> {
        val index = accounts.indexOfFirst { it.id == account.id }
        if (index < 0) return listOf(account) + accounts
        return accounts.mapIndexed { i, existing -> if (i == index) account else existing }
    }

    /**
     * Drops the account with [userId] — iOS `removeFromSavedAccounts`
     * (`removeAll { $0.id == userId }`). A no-op (returns an equal list) when no
     * account matches. Returns a new list; the input is never mutated.
     */
    fun remove(accounts: List<SavedAccount>, userId: String): List<SavedAccount> =
        accounts.filterNot { it.id == userId }

    /**
     * The account with [userId], or `null` when none matches — backs one-tap select
     * (tapping a row prefills that account's username).
     */
    fun find(accounts: List<SavedAccount>, userId: String): SavedAccount? =
        accounts.firstOrNull { it.id == userId }

    /**
     * Whether the saved-account picker is shown instead of the credential form —
     * iOS `LoginView.showPicker` (`!savedAccounts.isEmpty && !showNormalLogin`): the
     * picker appears only when there is at least one remembered account and the user
     * has not explicitly switched to the "other account" form.
     */
    fun showPicker(accounts: List<SavedAccount>, showNormalLogin: Boolean): Boolean =
        accounts.isNotEmpty() && !showNormalLogin
}
