package me.meeshy.app.chat

import me.meeshy.sdk.model.ReactionGroup
import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.model.ReactionUserDetail

/**
 * A single reactor listed inside a [ReactionTab] — a durable, SDK-agnostic
 * projection of a `ReactionUserDetail` for the who-reacted sheet.
 */
data class ReactionReactor(
    val userId: String,
    /** `null` when the server gave no name — the sheet then shows the localized "Unknown". */
    val displayName: String?,
    val avatarUrl: String?,
    val emoji: String,
    val isSelf: Boolean,
)

/**
 * A tab in the who-reacted sheet. [All] aggregates every reaction across emojis;
 * [Emoji] scopes the list to one emoji.
 */
sealed interface ReactionTab {
    val count: Int
    val reactors: List<ReactionReactor>

    data class All(
        override val count: Int,
        override val reactors: List<ReactionReactor>,
    ) : ReactionTab

    data class Emoji(
        val emoji: String,
        override val count: Int,
        override val reactors: List<ReactionReactor>,
    ) : ReactionTab
}

/**
 * The pure who-reacted breakdown SSOT for a message's reactions.
 *
 * Product decision (kept out of the Composable so it stays JVM-testable):
 * given a [ReactionSyncResponse] and the current user id, derive the ordered
 * tab set and each tab's ordered reactor list.
 *
 * Rules:
 *  - A group is kept only when its emoji is non-blank **and** it has an
 *    effective count > 0 (the server count when positive, else the reactor
 *    count). A group with a positive count but a truncated/empty reactor list
 *    still shows its tab (with an empty list) rather than lying about the total.
 *  - Emoji tabs sort by effective count descending; ties preserve the original
 *    group order (stable).
 *  - Within a tab the current user floats to the top; the rest keep their
 *    incoming order. Duplicated reactor ids within a group collapse to the first.
 *  - A leading [ReactionTab.All] appears as soon as there is one emoji tab (iOS "Toutes"); its
 *    reactors concatenate the emoji tabs in tab order, then float self entries
 *    to the front (a user who reacted with several emojis appears once per emoji).
 */
data class ReactionBreakdown(val tabs: List<ReactionTab>) {

    val isEmpty: Boolean get() = tabs.isEmpty()

    /**
     * The breakdown with the viewer's own [emoji] reaction added ([present]) or taken back —
     * the optimistic mirror of a toggle, so the open sheet moves at once. Inert without a viewer id.
     */
    fun withSelfReaction(emoji: String, selfId: String, selfName: String?, present: Boolean): ReactionBreakdown {
        val id = selfId.trim()
        val target = emoji.trim()
        if (id.isEmpty() || target.isEmpty()) return this
        val groups = tabs.filterIsInstance<ReactionTab.Emoji>().map { tab ->
            ReactionGroup(
                emoji = tab.emoji,
                count = tab.count,
                users = tab.reactors.map { ReactionUserDetail(it.userId, it.displayName.orEmpty(), it.avatarUrl) },
            )
        }
        val existing = groups.firstOrNull { it.emoji == target }
        val updated = when {
            existing == null && present -> groups + ReactionGroup(
                emoji = target,
                count = 1,
                users = listOf(ReactionUserDetail(id, selfName.orEmpty())),
            )
            existing == null -> groups
            else -> groups.map { group ->
                if (group.emoji != target) return@map group
                val has = group.users.any { it.userId == id }
                when {
                    present && !has -> group.copy(
                        count = group.count + 1,
                        users = group.users + ReactionUserDetail(id, selfName.orEmpty()),
                    )
                    !present && has -> group.copy(
                        count = (group.count - 1).coerceAtLeast(0),
                        users = group.users.filterNot { it.userId == id },
                    )
                    else -> group
                }
            }
        }
        return of(ReactionSyncResponse(messageId = "", reactions = updated), id)
    }

    companion object {
        fun of(response: ReactionSyncResponse, currentUserId: String): ReactionBreakdown {
            val self = currentUserId.trim().takeIf { it.isNotEmpty() }

            val emojiTabs = response.reactions
                .mapNotNull { group ->
                    val emoji = group.emoji.trim()
                    if (emoji.isEmpty()) return@mapNotNull null

                    val reactors = group.users
                        .distinctBy { it.userId }
                        .map { detail ->
                            ReactionReactor(
                                userId = detail.userId,
                                displayName = detail.username.trim().takeIf { it.isNotEmpty() },
                                avatarUrl = detail.avatar?.trim()?.takeIf { it.isNotEmpty() },
                                emoji = emoji,
                                isSelf = self != null && detail.userId == self,
                            )
                        }
                        .selfFirst()

                    val count = if (group.count > 0) group.count else reactors.size
                    if (count <= 0) return@mapNotNull null

                    ReactionTab.Emoji(emoji = emoji, count = count, reactors = reactors)
                }
                .sortedByDescending { it.count }

            if (emojiTabs.isEmpty()) return ReactionBreakdown(emptyList())
            val all = ReactionTab.All(
                count = emojiTabs.sumOf { it.count },
                reactors = emojiTabs.flatMap { it.reactors }.selfFirst(),
            )
            return ReactionBreakdown(listOf(all) + emojiTabs)
        }

        private fun List<ReactionReactor>.selfFirst(): List<ReactionReactor> {
            val (mine, others) = partition { it.isSelf }
            return mine + others
        }
    }
}

/**
 * The who-reacted sheet's UI state: which message it targets, whether the
 * detail fetch is still in flight, the resolved [breakdown], and the currently
 * selected tab. Selecting an out-of-range tab is inert.
 */
data class ReactionDetailsUiState(
    val messageId: String,
    val isLoading: Boolean,
    val breakdown: ReactionBreakdown,
    val selectedTabIndex: Int = 0,
    /** The twelve most-used emojis for the quick-add strip (iOS `EmojiUsageTracker.topEmojis(count: 12)`). */
    val quickEmojis: List<String> = emptyList(),
) {
    val selectedTab: ReactionTab? get() = breakdown.tabs.getOrNull(selectedTabIndex)

    fun withSelectedTab(index: Int): ReactionDetailsUiState =
        if (index in breakdown.tabs.indices) copy(selectedTabIndex = index) else this
}
