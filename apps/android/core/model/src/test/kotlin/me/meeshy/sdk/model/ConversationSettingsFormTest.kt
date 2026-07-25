package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ConversationSettingsFormTest {

    private fun conversation(
        writeRole: String? = "member",
        announcement: Boolean = false,
        slowMode: Int? = 0,
        autoTranslate: Boolean? = false,
    ) = ApiConversation(
        id = "c1",
        defaultWriteRole = writeRole,
        isAnnouncementChannel = announcement,
        slowModeSeconds = slowMode,
        autoTranslateEnabled = autoTranslate,
    )

    @Test
    fun `from seeds a clean form matching the conversation`() {
        val form = ConversationSettingsForm.from(
            conversation(writeRole = "admin", announcement = true, slowMode = 30, autoTranslate = true),
        )

        assertThat(form.writeRole).isEqualTo(MemberRole.ADMIN)
        assertThat(form.isAnnouncementChannel).isTrue()
        assertThat(form.slowModeSeconds).isEqualTo(30)
        assertThat(form.autoTranslateEnabled).isTrue()
        assertThat(form.isDirty).isFalse()
        assertThat(form.canSave).isFalse()
    }

    @Test
    fun `from decodes an unknown write-role to member and a null auto-translate to off`() {
        val form = ConversationSettingsForm.from(conversation(writeRole = "owner", autoTranslate = null))

        assertThat(form.writeRole).isEqualTo(MemberRole.MEMBER)
        assertThat(form.autoTranslateEnabled).isFalse()
    }

    @Test
    fun `from snaps an off-menu slow-mode interval onto an offered choice`() {
        val form = ConversationSettingsForm.from(conversation(slowMode = 45))

        assertThat(form.slowModeSeconds).isEqualTo(30)
        // baseline is snapped too, so the seed is not spuriously dirty
        assertThat(form.isDirty).isFalse()
        assertThat(form.toUpdate()).isNull()
    }

    @Test
    fun `editing a single field marks the form dirty and saveable`() {
        val form = ConversationSettingsForm.from(conversation()).withAnnouncement(true)

        assertThat(form.isDirty).isTrue()
        assertThat(form.canSave).isTrue()
    }

    @Test
    fun `toUpdate is null when nothing changed`() {
        val form = ConversationSettingsForm.from(conversation(writeRole = "admin", slowMode = 60))

        assertThat(form.toUpdate()).isNull()
    }

    @Test
    fun `toUpdate carries only the changed fields`() {
        val form = ConversationSettingsForm
            .from(conversation(writeRole = "member", announcement = false, slowMode = 0, autoTranslate = false))
            .withWriteRole(MemberRole.ADMIN)
            .withSlowMode(60)

        val patch = form.toUpdate()

        assertThat(patch).isEqualTo(
            UpdateConversationSettingsRequest(defaultWriteRole = "admin", slowModeSeconds = 60),
        )
        assertThat(patch?.isAnnouncementChannel).isNull()
        assertThat(patch?.autoTranslateEnabled).isNull()
    }

    @Test
    fun `toUpdate emits an all-fields patch when every control changed`() {
        val form = ConversationSettingsForm
            .from(conversation(writeRole = "member", announcement = false, slowMode = 0, autoTranslate = false))
            .withWriteRole(MemberRole.MODERATOR)
            .withAnnouncement(true)
            .withSlowMode(300)
            .withAutoTranslate(true)

        assertThat(form.toUpdate()).isEqualTo(
            UpdateConversationSettingsRequest(
                defaultWriteRole = "moderator",
                isAnnouncementChannel = true,
                slowModeSeconds = 300,
                autoTranslateEnabled = true,
            ),
        )
    }

    @Test
    fun `toggling a field back to its baseline clears the dirty state`() {
        val form = ConversationSettingsForm.from(conversation(announcement = false))
            .withAnnouncement(true)
            .withAnnouncement(false)

        assertThat(form.isDirty).isFalse()
        assertThat(form.toUpdate()).isNull()
    }

    @Test
    fun `withSlowMode snaps an off-menu value before storing it`() {
        val form = ConversationSettingsForm.from(conversation(slowMode = 0)).withSlowMode(50)

        assertThat(form.slowModeSeconds).isEqualTo(60)
    }

    @Test
    fun `rebaselined re-anchors the current edits and marks the form clean`() {
        val edited = ConversationSettingsForm.from(conversation())
            .withWriteRole(MemberRole.ADMIN)
            .withSlowMode(30)

        val saved = edited.rebaselined()

        assertThat(saved.writeRole).isEqualTo(MemberRole.ADMIN)
        assertThat(saved.slowModeSeconds).isEqualTo(30)
        assertThat(saved.isDirty).isFalse()
        assertThat(saved.canSave).isFalse()
        assertThat(saved.toUpdate()).isNull()
    }
}
