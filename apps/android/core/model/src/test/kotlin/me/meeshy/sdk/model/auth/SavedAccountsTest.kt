package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [SavedAccount] and [SavedAccounts], the pure multi-account
 * core backing the login screen's saved-account picker (multi-account, one-tap
 * switch).
 *
 * Parity source: iOS `AuthManager`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift`) — the
 * `loadSavedAccounts` D4 sort (`lastActiveAt` desc, `id` asc tie-break — pinned by
 * `SavedAccountsSortStabilityTests`), `upsertSavedAccount` (replace in place by id,
 * else insert at front), `removeFromSavedAccounts` (`removeAll { $0.id == userId }`) —
 * plus `SavedAccount` (`shortName == displayName ?? username`,
 * `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift`) and `LoginView`'s
 * `showPicker` (`!savedAccounts.isEmpty && !showNormalLogin`,
 * `apps/ios/Meeshy/Features/Main/Views/LoginView.swift`).
 *
 * Every assertion is on observable behaviour through the public API — the derived
 * short name, the sorted order, the upsert/remove/find transforms, and the picker
 * visibility gate — never on internal shape. Expectations are hand-written literals,
 * independent of how production derives them (not tautological).
 */
class SavedAccountsTest {

    private fun account(
        id: String,
        username: String = "user_$id",
        displayName: String? = "User $id",
        avatarUrl: String? = null,
        lastActiveAtMillis: Long = 0L,
    ) = SavedAccount(
        id = id,
        username = username,
        displayName = displayName,
        avatarUrl = avatarUrl,
        lastActiveAtMillis = lastActiveAtMillis,
    )

    // --- SavedAccount.shortName ---

    @Test
    fun shortName_displayNamePresent_usesDisplayName() {
        assertThat(account(id = "a", displayName = "Alice Cooper").shortName)
            .isEqualTo("Alice Cooper")
    }

    @Test
    fun shortName_displayNameNull_fallsBackToUsername() {
        assertThat(account(id = "a", username = "alice", displayName = null).shortName)
            .isEqualTo("alice")
    }

    @Test
    fun shortName_displayNameBlank_fallsBackToUsername() {
        assertThat(account(id = "a", username = "alice", displayName = "   ").shortName)
            .isEqualTo("alice")
    }

    // --- SavedAccounts.sorted ---

    @Test
    fun sorted_differentTimestamps_descendingByLastActive() {
        val result = SavedAccounts.sorted(
            listOf(
                account(id = "a", lastActiveAtMillis = 1_000L),
                account(id = "b", lastActiveAtMillis = 1_060L),
                account(id = "c", lastActiveAtMillis = 1_120L),
            )
        )
        assertThat(result.map { it.id }).containsExactly("c", "b", "a").inOrder()
    }

    @Test
    fun sorted_identicalTimestamps_secondaryKeyOnIdAscending() {
        val result = SavedAccounts.sorted(
            listOf(
                account(id = "zeta", lastActiveAtMillis = 1_000L),
                account(id = "alpha", lastActiveAtMillis = 1_000L),
                account(id = "mike", lastActiveAtMillis = 1_000L),
            )
        )
        assertThat(result.map { it.id }).containsExactly("alpha", "mike", "zeta").inOrder()
    }

    @Test
    fun sorted_mixedTimestamps_secondaryKeyOnlyForTies() {
        val result = SavedAccounts.sorted(
            listOf(
                account(id = "old1", lastActiveAtMillis = 1_000L),
                account(id = "old0", lastActiveAtMillis = 1_000L),
                account(id = "new", lastActiveAtMillis = 1_060L),
            )
        )
        assertThat(result.map { it.id }).containsExactly("new", "old0", "old1").inOrder()
    }

    @Test
    fun sorted_idempotent_inputOrderIrrelevant() {
        val inputs = listOf(
            account(id = "a", lastActiveAtMillis = 1_000L),
            account(id = "b", lastActiveAtMillis = 1_000L),
            account(id = "c", lastActiveAtMillis = 1_000L),
        )
        val forward = SavedAccounts.sorted(inputs).map { it.id }
        val reversed = SavedAccounts.sorted(inputs.reversed()).map { it.id }
        assertThat(forward).isEqualTo(reversed)
    }

    @Test
    fun sorted_empty_returnsEmpty() {
        assertThat(SavedAccounts.sorted(emptyList())).isEmpty()
    }

    @Test
    fun sorted_single_returnsSameElement() {
        val one = account(id = "solo")
        assertThat(SavedAccounts.sorted(listOf(one)).map { it.id }).containsExactly("solo")
    }

    // --- SavedAccounts.upsert ---

    @Test
    fun upsert_newAccount_prependsAtFront() {
        val existing = listOf(account(id = "a"), account(id = "b"))
        val result = SavedAccounts.upsert(existing, account(id = "c"))
        assertThat(result.map { it.id }).containsExactly("c", "a", "b").inOrder()
    }

    @Test
    fun upsert_intoEmpty_returnsSingleton() {
        val result = SavedAccounts.upsert(emptyList(), account(id = "a"))
        assertThat(result.map { it.id }).containsExactly("a")
    }

    @Test
    fun upsert_existingId_replacesInPlaceKeepingPosition() {
        val existing = listOf(account(id = "a"), account(id = "b"), account(id = "c"))
        val result = SavedAccounts.upsert(existing, account(id = "b", username = "renamed"))
        assertThat(result.map { it.id }).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun upsert_existingId_updatesFieldsAndTimestamp() {
        val existing = listOf(
            account(id = "a", username = "old", displayName = "Old", lastActiveAtMillis = 100L),
        )
        val result = SavedAccounts.upsert(
            existing,
            account(id = "a", username = "new", displayName = "New", lastActiveAtMillis = 999L),
        )
        val updated = result.single()
        assertThat(updated.username).isEqualTo("new")
        assertThat(updated.displayName).isEqualTo("New")
        assertThat(updated.lastActiveAtMillis).isEqualTo(999L)
    }

    @Test
    fun upsert_doesNotMutateInput() {
        val existing = listOf(account(id = "a"))
        SavedAccounts.upsert(existing, account(id = "b"))
        assertThat(existing.map { it.id }).containsExactly("a")
    }

    // --- SavedAccounts.remove ---

    @Test
    fun remove_removesMatchingId_leavesOthers() {
        val existing = listOf(account(id = "a"), account(id = "b"), account(id = "c"))
        val result = SavedAccounts.remove(existing, "b")
        assertThat(result.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun remove_unknownId_returnsListUnchanged() {
        val existing = listOf(account(id = "a"), account(id = "b"))
        val result = SavedAccounts.remove(existing, "zzz")
        assertThat(result.map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test
    fun remove_fromEmpty_returnsEmpty() {
        assertThat(SavedAccounts.remove(emptyList(), "a")).isEmpty()
    }

    @Test
    fun remove_doesNotMutateInput() {
        val existing = listOf(account(id = "a"), account(id = "b"))
        SavedAccounts.remove(existing, "a")
        assertThat(existing.map { it.id }).containsExactly("a", "b").inOrder()
    }

    // --- SavedAccounts.find ---

    @Test
    fun find_existingId_returnsAccount() {
        val existing = listOf(account(id = "a"), account(id = "b"))
        assertThat(SavedAccounts.find(existing, "b")?.id).isEqualTo("b")
    }

    @Test
    fun find_unknownId_returnsNull() {
        val existing = listOf(account(id = "a"))
        assertThat(SavedAccounts.find(existing, "zzz")).isNull()
    }

    @Test
    fun find_fromEmpty_returnsNull() {
        assertThat(SavedAccounts.find(emptyList(), "a")).isNull()
    }

    // --- SavedAccounts.showPicker ---

    @Test
    fun showPicker_accountsPresentAndNotNormalLogin_true() {
        assertThat(SavedAccounts.showPicker(listOf(account(id = "a")), showNormalLogin = false))
            .isTrue()
    }

    @Test
    fun showPicker_accountsPresentButNormalLogin_false() {
        assertThat(SavedAccounts.showPicker(listOf(account(id = "a")), showNormalLogin = true))
            .isFalse()
    }

    @Test
    fun showPicker_emptyAndNotNormalLogin_false() {
        assertThat(SavedAccounts.showPicker(emptyList(), showNormalLogin = false)).isFalse()
    }

    @Test
    fun showPicker_emptyAndNormalLogin_false() {
        assertThat(SavedAccounts.showPicker(emptyList(), showNormalLogin = true)).isFalse()
    }
}
