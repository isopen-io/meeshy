package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StuckPublicationRecoveryTest {

    private fun candidate(
        cmid: String = "cmid_1",
        state: PublicationRowState = PublicationRowState.Pending,
        createdAt: Long = 0L,
        type: String? = "POST",
        voice: Boolean = false,
    ) = StuckPublicationRecovery.Candidate(cmid, state, createdAt, type, voice)

    private fun media(mime: String) = UploadedMedia("m1", "", mime, 0L, null, null, null, null)

    @Test
    fun `a composer with nothing written is blank`() {
        assertThat(StuckPublicationRecovery.isComposerBlank(null, null)).isTrue()
        assertThat(StuckPublicationRecovery.isComposerBlank(PostComposerDraftSnapshot(text = "  "), null)).isTrue()
    }

    @Test
    fun `a composer holding words or media is not blank`() {
        assertThat(StuckPublicationRecovery.isComposerBlank(PostComposerDraftSnapshot(text = "Salut"), null)).isFalse()
        assertThat(StuckPublicationRecovery.isComposerBlank(PostComposerDraftSnapshot(media = listOf(media("image/jpeg"))), null)).isFalse()
    }

    @Test
    fun `the newest row stuck for more than a minute is the one proposed`() {
        val older = candidate("old", createdAt = 1_000)
        val newer = candidate("new", createdAt = 5_000)

        assertThat(StuckPublicationRecovery.pick(listOf(older, newer), nowMillis = 70_000)?.cmid).isEqualTo("new")
    }

    @Test
    fun `a row waiting for less than the threshold is left alone`() {
        assertThat(StuckPublicationRecovery.pick(listOf(candidate(createdAt = 20_000)), nowMillis = 70_000)).isNull()
    }

    @Test
    fun `a row that gave up is not a stuck one - it has its own reopen`() {
        val exhausted = candidate(state = PublicationRowState.Exhausted)

        assertThat(StuckPublicationRecovery.pick(listOf(exhausted), nowMillis = 200_000)).isNull()
    }

    @Test
    fun `a stuck voice is never proposed and hides no older draft behind it`() {
        val voice = candidate("voice", createdAt = 9_000, voice = true)
        val older = candidate("text", createdAt = 1_000)

        assertThat(StuckPublicationRecovery.pick(listOf(older, voice), nowMillis = 200_000)).isNull()
    }

    @Test
    fun `a post stays a post and a reel is recomputed from its media`() {
        assertThat(StuckPublicationRecovery.forcePlainPost("POST")).isTrue()
        assertThat(StuckPublicationRecovery.forcePlainPost("REEL")).isFalse()
        assertThat(StuckPublicationRecovery.forcePlainPost(null)).isFalse()
        val stale = ReelComposition.defaultType(listOf(ReelComposition.MediaKind("image/jpeg", null)), StuckPublicationRecovery.forcePlainPost("REEL"))
        assertThat(stale).isEqualTo(PostType.POST)
    }
}
