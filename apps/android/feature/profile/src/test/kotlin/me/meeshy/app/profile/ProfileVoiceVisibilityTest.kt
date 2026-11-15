package me.meeshy.app.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class ProfileVoiceVisibilityTest {

    @Test
    fun `a private voice has no card`() {
        assertThat(ProfileVoiceVisibility.sample(false, "https://cdn/v.m4a", 4200)).isNull()
    }

    @Test
    fun `an undeclared visibility has no card`() {
        assertThat(ProfileVoiceVisibility.sample(null, "https://cdn/v.m4a", 4200)).isNull()
    }

    @Test
    fun `a public voice without an address has no card`() {
        assertThat(ProfileVoiceVisibility.sample(true, null, 4200)).isNull()
        assertThat(ProfileVoiceVisibility.sample(true, "", 4200)).isNull()
        assertThat(ProfileVoiceVisibility.sample(true, "   ", 4200)).isNull()
    }

    @Test
    fun `a public voice with an address has a card with its duration`() {
        assertThat(ProfileVoiceVisibility.sample(true, "https://cdn/v.m4a", 4200))
            .isEqualTo(ProfileVoiceSample(url = "https://cdn/v.m4a", durationMs = 4200))
    }

    @Test
    fun `an absent or non positive duration is unknown`() {
        assertThat(ProfileVoiceVisibility.sample(true, "https://cdn/v.m4a", null)?.durationMs).isNull()
        assertThat(ProfileVoiceVisibility.sample(true, "https://cdn/v.m4a", 0)?.durationMs).isNull()
    }

    @Test
    fun `the header projects the voice of the profile document`() {
        val voiced = MeeshyUser(
            id = "u1",
            username = "alice",
            voicePublic = true,
            voiceSampleUrl = "https://cdn/v.m4a",
            voiceSampleDurationMs = 3000,
        )
        assertThat(ProfileHeaderBuilder.build(voiced, 0L).voiceSample?.durationMs).isEqualTo(3000L)
        assertThat(ProfileHeaderBuilder.build(voiced.copy(voicePublic = false), 0L).voiceSample).isNull()
    }
}
