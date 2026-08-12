package me.meeshy.sdk.model

/**
 * Partial admin conversation-settings patch sent to `PUT /conversations/{id}` —
 * feature-parity §Chat (conversation moderation). Null fields are omitted so each
 * save carries only what actually changed. Mirrors the null-omit convention of
 * [me.meeshy.sdk.net.api.ConversationPreferencesUpdate]; the server replies with
 * [UpdateConversationResponse].
 */
@kotlinx.serialization.Serializable
data class UpdateConversationSettingsRequest(
    val defaultWriteRole: String? = null,
    val isAnnouncementChannel: Boolean? = null,
    val slowModeSeconds: Int? = null,
    val autoTranslateEnabled: Boolean? = null,
)

/**
 * Pure, immutable reducer for the admin conversation-settings editor — the four
 * moderation controls iOS surfaces (write-role, announcement mode, slow-mode
 * interval, auto-translate). Seeded from the loaded [ApiConversation]; each edit
 * returns a new form via `copy`; [toUpdate] emits a minimal patch of only the
 * fields that differ from the loaded [baseline]. The ViewModel stays a thin caller
 * over this — no settings logic leaks into the UI layer.
 *
 * SOTA over iOS, whose editor mutates three `@State` fields and always PUTs the
 * full object: Android computes a dirty-diff, so a no-op save is impossible
 * ([canSave] is false) and an unchanged field is never overwritten.
 */
data class ConversationSettingsForm(
    val writeRole: MemberRole,
    val isAnnouncementChannel: Boolean,
    val slowModeSeconds: Int,
    val autoTranslateEnabled: Boolean,
    val baseline: Baseline,
) {
    /** The loaded server values the current edits are diffed against. */
    data class Baseline(
        val writeRole: MemberRole,
        val isAnnouncementChannel: Boolean,
        val slowModeSeconds: Int,
        val autoTranslateEnabled: Boolean,
    )

    /** Any of the four controls differs from the loaded server value. */
    val isDirty: Boolean
        get() = writeRole != baseline.writeRole ||
            isAnnouncementChannel != baseline.isAnnouncementChannel ||
            slowModeSeconds != baseline.slowModeSeconds ||
            autoTranslateEnabled != baseline.autoTranslateEnabled

    /** The save button's single verdict — nothing to save unless something changed. */
    val canSave: Boolean get() = isDirty

    fun withWriteRole(role: MemberRole): ConversationSettingsForm = copy(writeRole = role)

    fun withAnnouncement(enabled: Boolean): ConversationSettingsForm =
        copy(isAnnouncementChannel = enabled)

    /** Snaps [seconds] onto the offered [SlowModeOptions] before storing it. */
    fun withSlowMode(seconds: Int): ConversationSettingsForm =
        copy(slowModeSeconds = SlowModeOptions.nearest(seconds))

    fun withAutoTranslate(enabled: Boolean): ConversationSettingsForm =
        copy(autoTranslateEnabled = enabled)

    /**
     * The minimal patch to persist, or `null` when nothing changed. Each field is
     * present only if it differs from [baseline]; the role is encoded via its
     * [MemberRole.wireValue].
     */
    fun toUpdate(): UpdateConversationSettingsRequest? {
        if (!isDirty) return null
        return UpdateConversationSettingsRequest(
            defaultWriteRole = writeRole.wireValue.takeIf { writeRole != baseline.writeRole },
            isAnnouncementChannel =
                isAnnouncementChannel.takeIf { isAnnouncementChannel != baseline.isAnnouncementChannel },
            slowModeSeconds = slowModeSeconds.takeIf { slowModeSeconds != baseline.slowModeSeconds },
            autoTranslateEnabled =
                autoTranslateEnabled.takeIf { autoTranslateEnabled != baseline.autoTranslateEnabled },
        )
    }

    /**
     * Re-anchor the baseline to the current edited values, marking the form clean
     * again. Called after the server accepts a save, so a second immediate save is
     * a no-op ([canSave] is false) until the user edits again.
     */
    fun rebaselined(): ConversationSettingsForm =
        copy(
            baseline = Baseline(
                writeRole = writeRole,
                isAnnouncementChannel = isAnnouncementChannel,
                slowModeSeconds = slowModeSeconds,
                autoTranslateEnabled = autoTranslateEnabled,
            ),
        )

    companion object {
        /**
         * Seed a clean form from a loaded conversation. The write-role string
         * decodes via [MemberRole.from] (unknown/absent → member), the interval is
         * snapped onto the offered [SlowModeOptions] so the picker always has a
         * matching choice, and a null auto-translate flag reads as off.
         */
        fun from(conversation: ApiConversation): ConversationSettingsForm {
            val role = MemberRole.from(conversation.defaultWriteRole)
            val slow = SlowModeOptions.nearest(conversation.slowModeSeconds)
            val auto = conversation.autoTranslateEnabled ?: false
            return ConversationSettingsForm(
                writeRole = role,
                isAnnouncementChannel = conversation.isAnnouncementChannel,
                slowModeSeconds = slow,
                autoTranslateEnabled = auto,
                baseline = Baseline(
                    writeRole = role,
                    isAnnouncementChannel = conversation.isAnnouncementChannel,
                    slowModeSeconds = slow,
                    autoTranslateEnabled = auto,
                ),
            )
        }
    }
}
