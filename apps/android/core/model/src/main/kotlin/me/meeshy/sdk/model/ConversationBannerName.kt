package me.meeshy.sdk.model

/**
 * The local-first group name a conversation banner shows: the renamed name (else the server
 * title) with the favorite-classification emoji in the lead.
 *
 * Pure `:core:model` building block — the port of iOS
 * `NotificationToastManager.ConversationPresentation` (`name = customName ?? title`) plus its
 * `composedSubtitle` (`"<favorite> <name>"`, favorite first). The favorite emoji
 * ([ApiConversationPreferences.reaction]) and the local rename ([ApiConversationPreferences.customName])
 * exist ONLY on the device — the gateway knows just the canonical [ApiConversation.title] — so this
 * is the single piece of the banner the server cannot compose, and it belongs on the client.
 *
 * Consumed by `NotificationBannerViewModel` to feed `NotificationBannerFraming.present(groupName)`;
 * a `null` result tells that framing to fall back to the server-supplied title.
 */
public object ConversationBannerName {

    /**
     * `<favoriteEmoji> <name>` (favorite first), or `<name>` alone when there is no favorite;
     * `null` when there is no local name at all (both [customName] and [title] blank/absent), so the
     * caller falls back to the server title rather than showing a lone emoji.
     *
     * [customName] wins over [title] (the local rename is what the reader named the thread). A
     * blank/whitespace value in ANY field is treated as absent — a trimmed favorite of `""` never
     * prefixes a stray space, matching iOS `composedSubtitle`'s `trimmingCharacters` guard.
     */
    public fun composed(customName: String?, title: String?, favoriteEmoji: String?): String? {
        val name = customName.nonBlank() ?: title.nonBlank() ?: return null
        val favorite = favoriteEmoji.nonBlank() ?: return name
        return "$favorite $name"
    }

    private fun String?.nonBlank(): String? = this?.trim()?.takeIf { it.isNotEmpty() }
}
