package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [ShareLinkEntryPolicy] — the pure "how do I enter a
 * conversation from a share link?" decision engine. Every expectation is a
 * hand-written literal asserted through the public [ShareLinkEntryPolicy.intent]
 * API, never the type's internals.
 *
 * Parity source: iOS `ShareLinkEntryPolicy.intent(for:)`
 * (`packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkEntryPolicy.swift`).
 * The two load-bearing precedence rules are asserted explicitly:
 *  - unauthenticated: a stored guest session beats `requireAccount`;
 *  - authenticated: already-a-member beats `requireAccount`.
 */
class ShareLinkEntryPolicyTest {

    private fun facts(
        conversationId: String = "conv-1",
        isAuthenticated: Boolean = false,
        isAlreadyMember: Boolean = false,
        linkRequiresAccount: Boolean = false,
        hasStoredGuestSession: Boolean = false,
    ) = ShareLinkEntryFacts(
        conversationId = conversationId,
        isAuthenticated = isAuthenticated,
        isAlreadyMember = isAlreadyMember,
        linkRequiresAccount = linkRequiresAccount,
        hasStoredGuestSession = hasStoredGuestSession,
    )

    // ---- Unauthenticated branch ----

    @Test
    fun unauthenticated_withNoGuestSession_onOpenLink_joinsAnonymously() {
        val intent = ShareLinkEntryPolicy.intent(
            facts(isAuthenticated = false, linkRequiresAccount = false, hasStoredGuestSession = false),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.JoinAnonymously)
    }

    @Test
    fun unauthenticated_withNoGuestSession_onAccountRequiredLink_requiresAccount() {
        val intent = ShareLinkEntryPolicy.intent(
            facts(isAuthenticated = false, linkRequiresAccount = true, hasStoredGuestSession = false),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.RequiresAccount)
    }

    @Test
    fun unauthenticated_withStoredGuestSession_resumesIt() {
        val intent = ShareLinkEntryPolicy.intent(
            facts(isAuthenticated = false, linkRequiresAccount = false, hasStoredGuestSession = true),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.ResumeGuestSession)
    }

    @Test
    fun unauthenticated_storedGuestSession_beatsAccountRequirement() {
        // Precedence: an identity already acquired on THIS link wins over the
        // link's account requirement — re-asking would erase the only identity
        // the visitor has here.
        val intent = ShareLinkEntryPolicy.intent(
            facts(isAuthenticated = false, linkRequiresAccount = true, hasStoredGuestSession = true),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.ResumeGuestSession)
    }

    // ---- Authenticated branch ----

    @Test
    fun authenticated_alreadyMember_opensTheConversation() {
        val intent = ShareLinkEntryPolicy.intent(
            facts(conversationId = "conv-42", isAuthenticated = true, isAlreadyMember = true),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.OpenConversation(conversationId = "conv-42"))
    }

    @Test
    fun authenticated_alreadyMember_beatsAccountRequirement() {
        // Precedence: nothing to decide when you are already named in the room —
        // the account requirement is moot.
        val intent = ShareLinkEntryPolicy.intent(
            facts(
                conversationId = "conv-7",
                isAuthenticated = true,
                isAlreadyMember = true,
                linkRequiresAccount = true,
            ),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.OpenConversation(conversationId = "conv-7"))
    }

    @Test
    fun authenticated_notMember_onAccountRequiredLink_joinsWithAccount() {
        // Offering anonymity on a requireAccount link would offer a door the
        // server refuses (403 REQUIRES_ACCOUNT) — so join silently with the account.
        val intent = ShareLinkEntryPolicy.intent(
            facts(
                conversationId = "conv-9",
                isAuthenticated = true,
                isAlreadyMember = false,
                linkRequiresAccount = true,
            ),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.JoinWithAccount(conversationId = "conv-9"))
    }

    @Test
    fun authenticated_notMember_onOpenLink_asksToChooseIdentity() {
        val intent = ShareLinkEntryPolicy.intent(
            facts(
                conversationId = "conv-3",
                isAuthenticated = true,
                isAlreadyMember = false,
                linkRequiresAccount = false,
            ),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.ChooseIdentity(conversationId = "conv-3"))
    }

    @Test
    fun authenticated_notMember_openLink_storedGuestSessionDoesNotSkipTheChoice() {
        // A dormant guest session does not remove the choice from someone who now
        // has an account — it just becomes the "resume anonymously" branch the
        // presentation offers alongside the account.
        val intent = ShareLinkEntryPolicy.intent(
            facts(
                conversationId = "conv-5",
                isAuthenticated = true,
                isAlreadyMember = false,
                linkRequiresAccount = false,
                hasStoredGuestSession = true,
            ),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.ChooseIdentity(conversationId = "conv-5"))
    }

    // ---- conversationId threading ----

    @Test
    fun conversationId_isThreadedIntoEveryConversationScopedIntent() {
        val open = ShareLinkEntryPolicy.intent(
            facts(conversationId = "abc", isAuthenticated = true, isAlreadyMember = true),
        )
        val withAccount = ShareLinkEntryPolicy.intent(
            facts(conversationId = "abc", isAuthenticated = true, linkRequiresAccount = true),
        )
        val choose = ShareLinkEntryPolicy.intent(
            facts(conversationId = "abc", isAuthenticated = true),
        )

        assertThat(open).isEqualTo(ShareLinkEntryIntent.OpenConversation(conversationId = "abc"))
        assertThat(withAccount).isEqualTo(ShareLinkEntryIntent.JoinWithAccount(conversationId = "abc"))
        assertThat(choose).isEqualTo(ShareLinkEntryIntent.ChooseIdentity(conversationId = "abc"))
    }

    @Test
    fun authenticated_isAlreadyMemberIgnored_whenUnauthenticated() {
        // The member flag is only consulted on the authenticated branch — an
        // unauthenticated caller with a stale member flag still joins anonymously.
        val intent = ShareLinkEntryPolicy.intent(
            facts(isAuthenticated = false, isAlreadyMember = true, hasStoredGuestSession = false),
        )

        assertThat(intent).isEqualTo(ShareLinkEntryIntent.JoinAnonymously)
    }
}
