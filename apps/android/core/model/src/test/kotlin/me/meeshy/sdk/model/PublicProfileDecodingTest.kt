package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class PublicProfileDecodingTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(extra: String = "") = json.decodeFromString(
        PublicProfile.serializer(),
        """{"id":"u1","username":"bob","isOnline":true$extra}""",
    )

    @Test
    fun `an unknown relation stays a string and reads as none`() {
        val profile = decode(""","relation":"blocked_by_aliens"""")

        assertThat(profile.relation).isEqualTo("blocked_by_aliens")
        assertThat(profile.relationKind).isEqualTo(PublicProfile.RelationKind.NONE)
    }

    @Test
    fun `a known relation is typed`() {
        assertThat(decode(""","relation":"pending_sent"""").relationKind)
            .isEqualTo(PublicProfile.RelationKind.PENDING_SENT)
    }

    @Test
    fun `an absent stats block is null and the user survives`() {
        val profile = decode()

        assertThat(profile.stats).isNull()
        assertThat(profile.user.username).isEqualTo("bob")
        assertThat(profile.user.isOnline).isTrue()
    }

    @Test
    fun `an unreadable stats block is null and never sinks the document`() {
        val profile = decode(""","stats":"oops"""")

        assertThat(profile.stats).isNull()
        assertThat(profile.user.id).isEqualTo("u1")
    }

    @Test
    fun `served stats are decoded`() {
        val profile = decode(""","stats":{"totalMessages":7,"languagesUsed":3}""")

        assertThat(profile.stats?.totalMessages).isEqualTo(7)
        assertThat(profile.stats?.languagesUsed).isEqualTo(3)
    }

    @Test
    fun `an absent isSelf is false`() {
        assertThat(decode().isSelf).isFalse()
        assertThat(decode(""","isSelf":true""").isSelf).isTrue()
    }

    @Test
    fun `unknown fields are ignored`() {
        assertThat(decode(""","brandNewField":{"a":1}""").user.id).isEqualTo("u1")
    }

    @Test
    fun `withheld presence stays absent`() {
        val profile = json.decodeFromString(
            PublicProfile.serializer(),
            """{"id":"u1","username":"bob"}""",
        )

        assertThat(profile.user.isOnline).isNull()
        assertThat(profile.user.lastActiveAt).isNull()
    }

    @Test
    fun `voice fields are null when absent and read when present`() {
        val bare = json.decodeFromString(MeeshyUser.serializer(), """{"id":"u","username":"x"}""")
        assertThat(bare.voicePublic).isNull()
        assertThat(bare.voiceSampleUrl).isNull()
        assertThat(bare.voiceSampleDurationMs).isNull()
        assertThat(bare.voiceQuality).isNull()

        val voiced = json.decodeFromString(
            MeeshyUser.serializer(),
            """{"id":"u","username":"x","voicePublic":true,"voiceSampleUrl":"https://v","voiceSampleDurationMs":4200,"voiceQuality":0.87}""",
        )
        assertThat(voiced.voicePublic).isTrue()
        assertThat(voiced.voiceSampleUrl).isEqualTo("https://v")
        assertThat(voiced.voiceSampleDurationMs).isEqualTo(4200)
        assertThat(voiced.voiceQuality).isEqualTo(0.87)
    }

    @Test
    fun `the expand query is stable and omits the relation unless asked`() {
        assertThat(ProfileExpansion.query(ProfileExpansion.DEFAULT)).isEqualTo("stats,presence")
        assertThat(ProfileExpansion.query(setOf(ProfileExpansion.RELATION, ProfileExpansion.STATS)))
            .isEqualTo("stats,relation")
        assertThat(ProfileExpansion.query(emptySet())).isNull()
    }

    @Test
    fun `a profile round-trips through its own serializer`() {
        val original = decode(""","relation":"friend","isSelf":false,"stats":{"totalMessages":2}""")
        val again = json.decodeFromString(
            PublicProfile.serializer(),
            json.encodeToString(PublicProfile.serializer(), original),
        )

        assertThat(again).isEqualTo(original)
    }
}
