package me.meeshy.sdk.model

/**
 * Privacy & visibility catalog (feature-parity §L) — the toggle catalog and lens over the existing
 * [PrivacyPreferences] SSOT (`Preferences.kt`, the port of iOS `PrivacyPreferences`). Everything
 * here is a stateless building block with opaque parameters: the durable store lives in `:sdk-core`
 * and the settings orchestration is in `:feature:settings`.
 *
 * Only the thirteen booleans a user can actually change are catalogued. The iOS encryption leg
 * (`encryptionPreference` / `autoEncryptNewConversations` / …) is deliberately excluded: on iOS
 * that section is rendered greyed-out and non-interactive with a "coming soon / disabled" status
 * (product decision 2026-06-14), so the Android screen renders the same coming-soon section as pure
 * UI while the persisted [PrivacyPreferences] still round-trips those fields untouched.
 */

/** A privacy toggle's section, in display order — mirrors the iOS section grouping. */
public enum class PrivacyCategory { VISIBILITY, CONTACTS_GROUPS, MEDIA_DATA }

/** A single editable privacy toggle. */
public enum class PrivacyToggle {
    SHOW_ONLINE_STATUS,
    NOTIFY_CONTACTS_ON_RETURN,
    SHOW_LAST_SEEN,
    SHOW_READ_RECEIPTS,
    SHOW_TYPING_INDICATOR,
    HIDE_PROFILE_FROM_SEARCH,
    ALLOW_CONTACT_REQUESTS,
    ALLOW_GROUP_INVITES,
    ALLOW_CALLS_FROM_NON_CONTACTS,
    SAVE_MEDIA_TO_GALLERY,
    ALLOW_ANALYTICS,
    SHARE_USAGE_DATA,
    BLOCK_SCREENSHOTS,
}

/** A privacy row that opens an "(i)" explanation, in the iOS order of appearance. */
public enum class PrivacyInfoTopic {
    ONLINE_STATUS,
    NOTIFY_CONTACTS_ON_RETURN,
    READ_RECEIPTS,
    HIDE_FROM_CONTACT_SEARCH,
    CALLS_NON_CONTACTS,
    ANALYTICS,
}

/** A toggle paired with its current on/off state read from the prefs block. */
public data class PrivacyToggleState(
    val toggle: PrivacyToggle,
    val enabled: Boolean,
)

/** A category header with its member toggles, in declared order. */
public data class PrivacyCategorySection(
    val category: PrivacyCategory,
    val items: List<PrivacyToggleState>,
)

/** Maps a [PrivacyToggle] to its category and its getter/setter lens over [PrivacyPreferences]. */
public data class PrivacyToggleDescriptor(
    val toggle: PrivacyToggle,
    val category: PrivacyCategory,
    val get: (PrivacyPreferences) -> Boolean,
    val set: (PrivacyPreferences, Boolean) -> PrivacyPreferences,
)

/**
 * Pure catalog of the editable privacy toggles. Provides:
 *  - the read/write lens ([isEnabled]/[set]) so a single edit read-modify-writes exactly one
 *    boolean and never clobbers the rest of the block,
 *  - the grouped/ordered projection ([sections]) driving the editor UI.
 */
public object PrivacyCatalog {

    public val descriptors: List<PrivacyToggleDescriptor> = listOf(
        PrivacyToggleDescriptor(
            PrivacyToggle.SHOW_ONLINE_STATUS, PrivacyCategory.VISIBILITY,
            { it.showOnlineStatus }, { p, e -> p.copy(showOnlineStatus = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN, PrivacyCategory.VISIBILITY,
            { it.notifyContactsOnReturn }, { p, e -> p.copy(notifyContactsOnReturn = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.SHOW_LAST_SEEN, PrivacyCategory.VISIBILITY,
            { it.showLastSeen }, { p, e -> p.copy(showLastSeen = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.SHOW_READ_RECEIPTS, PrivacyCategory.VISIBILITY,
            { it.showReadReceipts }, { p, e -> p.copy(showReadReceipts = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.SHOW_TYPING_INDICATOR, PrivacyCategory.VISIBILITY,
            { it.showTypingIndicator }, { p, e -> p.copy(showTypingIndicator = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.HIDE_PROFILE_FROM_SEARCH, PrivacyCategory.VISIBILITY,
            { it.hideProfileFromSearch }, { p, e -> p.copy(hideProfileFromSearch = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.ALLOW_CONTACT_REQUESTS, PrivacyCategory.CONTACTS_GROUPS,
            { it.allowContactRequests }, { p, e -> p.copy(allowContactRequests = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.ALLOW_GROUP_INVITES, PrivacyCategory.CONTACTS_GROUPS,
            { it.allowGroupInvites }, { p, e -> p.copy(allowGroupInvites = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS, PrivacyCategory.CONTACTS_GROUPS,
            { it.acceptCallsFromNonContacts }, { p, e -> p.copy(acceptCallsFromNonContacts = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.SAVE_MEDIA_TO_GALLERY, PrivacyCategory.MEDIA_DATA,
            { it.saveMediaToGallery }, { p, e -> p.copy(saveMediaToGallery = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.ALLOW_ANALYTICS, PrivacyCategory.MEDIA_DATA,
            { it.allowAnalytics }, { p, e -> p.copy(allowAnalytics = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.SHARE_USAGE_DATA, PrivacyCategory.MEDIA_DATA,
            { it.shareUsageData }, { p, e -> p.copy(shareUsageData = e) },
        ),
        PrivacyToggleDescriptor(
            PrivacyToggle.BLOCK_SCREENSHOTS, PrivacyCategory.MEDIA_DATA,
            { it.blockScreenshots }, { p, e -> p.copy(blockScreenshots = e) },
        ),
    )

    /**
     * Toggles with no effect yet, neither client-side nor gateway-side (iOS
     * `comingSoonPrivacyKeyPaths`). They are rendered greyed-out and inert, and [set] stays pure:
     * the refusal to write lives in [isWritable] so the persisted value is never touched.
     */
    public val comingSoon: Set<PrivacyToggle> = setOf(
        PrivacyToggle.BLOCK_SCREENSHOTS,
        PrivacyToggle.SAVE_MEDIA_TO_GALLERY,
        PrivacyToggle.SHARE_USAGE_DATA,
        PrivacyToggle.ALLOW_CONTACT_REQUESTS,
        PrivacyToggle.ALLOW_GROUP_INVITES,
    )

    /** Whether [toggle] is not applied anywhere yet (greyed "coming soon" row). */
    public fun isComingSoon(toggle: PrivacyToggle): Boolean = toggle in comingSoon

    /** Whether a user write on [toggle] is accepted — false for every coming-soon toggle. */
    public fun isWritable(toggle: PrivacyToggle): Boolean = toggle !in comingSoon

    /** The "(i)" explanation attached to [toggle], or null when the row has none. */
    public fun infoTopic(toggle: PrivacyToggle): PrivacyInfoTopic? = when (toggle) {
        PrivacyToggle.SHOW_ONLINE_STATUS -> PrivacyInfoTopic.ONLINE_STATUS
        PrivacyToggle.NOTIFY_CONTACTS_ON_RETURN -> PrivacyInfoTopic.NOTIFY_CONTACTS_ON_RETURN
        PrivacyToggle.SHOW_READ_RECEIPTS -> PrivacyInfoTopic.READ_RECEIPTS
        PrivacyToggle.HIDE_PROFILE_FROM_SEARCH -> PrivacyInfoTopic.HIDE_FROM_CONTACT_SEARCH
        PrivacyToggle.ALLOW_CALLS_FROM_NON_CONTACTS -> PrivacyInfoTopic.CALLS_NON_CONTACTS
        PrivacyToggle.ALLOW_ANALYTICS -> PrivacyInfoTopic.ANALYTICS
        else -> null
    }

    private val byToggle: Map<PrivacyToggle, PrivacyToggleDescriptor> =
        descriptors.associateBy { it.toggle }

    /** The current on/off state of [toggle] in [prefs]. */
    public fun isEnabled(prefs: PrivacyPreferences, toggle: PrivacyToggle): Boolean =
        byToggle.getValue(toggle).get(prefs)

    /** Returns a copy of [prefs] with [toggle]'s boolean set to [enabled], all else unchanged. */
    public fun set(
        prefs: PrivacyPreferences,
        toggle: PrivacyToggle,
        enabled: Boolean,
    ): PrivacyPreferences = byToggle.getValue(toggle).set(prefs, enabled)

    /**
     * Projects [prefs] into category-grouped sections in [PrivacyCategory] display order, each
     * item in declared order and carrying its live enabled state. Every category is non-empty
     * (each has at least one toggle), so the full ordered set is always returned.
     */
    public fun sections(prefs: PrivacyPreferences): List<PrivacyCategorySection> =
        PrivacyCategory.entries.map { category ->
            val items = descriptors
                .filter { it.category == category }
                .map { PrivacyToggleState(it.toggle, it.get(prefs)) }
            PrivacyCategorySection(category, items)
        }
}
