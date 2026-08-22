package me.meeshy.app.auth

import me.meeshy.sdk.model.ShareLinkEntryFacts
import me.meeshy.sdk.model.ShareLinkEntryIntent
import me.meeshy.sdk.model.ShareLinkEntryPolicy
import me.meeshy.sdk.model.ShareLinkInfo
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.AnonymousSessionStore

/**
 * The one network read the resolver performs — the public preview of a share
 * link. A `fun interface` seam (not the concrete [me.meeshy.sdk.session.AnonymousSessionRepository])
 * so the resolver is decoupled from the transport and trivially faked in tests;
 * the consumer wires it to `repository::preview`.
 */
public fun interface ShareLinkPreviewProviding {
    public suspend fun preview(identifier: String): NetworkResult<ShareLinkInfo>
}

/**
 * The outcome of resolving a share-link deep link: the pure routing
 * [ShareLinkEntryIntent] plus the conversation title to show while it is applied.
 */
public data class ShareLinkEntryResolution(
    val intent: ShareLinkEntryIntent,
    val conversationTitle: String?,
)

/**
 * Gathers the facts a share link demands, then asks the pure rule
 * ([ShareLinkEntryPolicy]) how a person should enter. App-side, not SDK: it does
 * I/O (the preview) and consults device state (the stored guest session), so by
 * the grain test it is product orchestration. The decision itself is the SDK's.
 *
 * Faithful port of iOS `ShareLinkEntryResolver`
 * (`apps/ios/Meeshy/Features/Main/Navigation/ShareLinkEntryResolver.swift`), with
 * two SOTA hardenings over the iOS force-unwrapping original:
 *  - a blank identifier is inert (never the doomed empty-preview request);
 *  - a preview that carries no conversation, or a blank conversation id, resolves
 *    to `null` instead of crashing — a link that opens nothing is worse than one
 *    that cannot offer the choice, and the caller falls back to a plain join.
 *
 * Android's guest-session store is single-valued (one guest session per device),
 * so "a stored session for THIS link" is decided by comparing the stored
 * [me.meeshy.sdk.model.AnonymousSessionContext.linkId] to the identifier — a
 * session opened on a different link must never resume here.
 */
public class ShareLinkEntryResolver(
    private val previewProvider: ShareLinkPreviewProviding,
    private val sessionStore: AnonymousSessionStore,
) {
    /**
     * `null` when the link cannot be resolved — the caller then falls back to the
     * plain join path. `knownConversationIds` is the caller's IN-MEMORY list: a
     * paginated list may omit an old conversation, and the false "not a member"
     * costs one extra question, never a wrong entry (the "continue with my
     * account" branch hits an idempotent join).
     */
    public suspend fun resolve(
        identifier: String,
        isAuthenticated: Boolean,
        knownConversationIds: Set<String>,
    ): ShareLinkEntryResolution? {
        val trimmed = identifier.trim()
        if (trimmed.isEmpty()) return null

        val info = when (val result = previewProvider.preview(trimmed)) {
            is NetworkResult.Success -> result.data
            is NetworkResult.Failure -> return null
        }

        val conversationId = info.conversation?.id?.trim().orEmpty()
        if (conversationId.isEmpty()) return null

        val facts = ShareLinkEntryFacts(
            conversationId = conversationId,
            isAuthenticated = isAuthenticated,
            isAlreadyMember = knownConversationIds.contains(conversationId),
            linkRequiresAccount = info.requireAccount,
            hasStoredGuestSession = sessionStore.load()?.linkId?.trim() == trimmed,
        )

        return ShareLinkEntryResolution(
            intent = ShareLinkEntryPolicy.intent(facts),
            conversationTitle = info.conversation?.title,
        )
    }
}
