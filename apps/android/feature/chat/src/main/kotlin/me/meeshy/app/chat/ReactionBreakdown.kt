package me.meeshy.app.chat

import me.meeshy.sdk.model.ReactionSyncResponse

/**
 * A single reactor listed inside a [ReactionTab] — a durable, SDK-agnostic
 * projection of a `ReactionUserDetail` for the who-reacted sheet.
 */
data class ReactionReactor(
    val userId: String,
    val displayName: String,
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
 *  - A leading [ReactionTab.All] appears only when there are ≥2 emoji tabs; its
 *    reactors concatenate the emoji tabs in tab order, then float self entries
 *    to the front (a user who reacted with several emojis appears once per emoji).
 */
data class ReactionBreakdown(val tabs: List<ReactionTab>) {

    val isEmpty: Boolean get() = tabs.isEmpty()

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
                                displayName = detail.username.trim().takeIf { it.isNotEmpty() }
                                    ?: detail.userId,
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
            if (emojiTabs.size == 1) return ReactionBreakdown(emojiTabs)

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
) {
    val selectedTab: ReactionTab? get() = breakdown.tabs.getOrNull(selectedTabIndex)

    fun withSelectedTab(index: Int): ReactionDetailsUiState =
        if (index in breakdown.tabs.indices) copy(selectedTabIndex = index) else this
}
