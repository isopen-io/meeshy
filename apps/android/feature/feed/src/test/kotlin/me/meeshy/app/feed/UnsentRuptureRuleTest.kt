package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaFate
import me.meeshy.sdk.model.media.MediaUploadProgress
import me.meeshy.sdk.model.media.RuptureGesture
import me.meeshy.sdk.publication.UnsentMedia
import me.meeshy.sdk.publication.UnsentPublication
import me.meeshy.sdk.publication.UnsentPublicationKind
import me.meeshy.sdk.publication.UnsentPublicationStatus
import org.junit.Test

class UnsentRuptureRuleTest {

    private fun media(vararg fates: MediaFate) = fates.mapIndexed { i, fate -> UnsentMedia("m$i", fate, MediaUploadProgress.Idle) }

    private fun item(
        status: UnsentPublicationStatus,
        kind: UnsentPublicationKind = UnsentPublicationKind.POST,
        media: List<UnsentMedia>,
    ) = UnsentPublication("c", kind, "t", media.size, status, 1L, null, media)

    @Test
    fun `a failed publication that lost a media is not offered a retry that can only fail again`() {
        val lost = item(UnsentPublicationStatus.FAILED, media = media(MediaFate.UPLOADED, MediaFate.LOST))
        val rupture = UnsentRuptureRule.rupture(lost, offline = false)

        assertThat(rupture.gesture).isEqualTo(RuptureGesture.REPLACE_MISSING)
        assertThat(UnsentRuptureRule.showsRetry(lost, rupture)).isFalse()
        assertThat(rupture.missing).isEqualTo(1)
        assertThat(rupture.intact).isEqualTo(1)
    }

    @Test
    fun `a failed publication with everything intact keeps its retry`() {
        val refused = item(UnsentPublicationStatus.FAILED, media = media(MediaFate.REFUSED))
        val rupture = UnsentRuptureRule.rupture(refused, offline = false)

        assertThat(UnsentRuptureRule.showsRetry(refused, rupture)).isTrue()
    }

    @Test
    fun `a publication still sending says nothing while it goes well`() {
        val sending = item(UnsentPublicationStatus.SENDING, media = media(MediaFate.WAITING))

        assertThat(UnsentRuptureRule.speaks(sending, UnsentRuptureRule.rupture(sending, offline = false))).isFalse()
    }

    @Test
    fun `a publication waiting for the connection says so`() {
        val sending = item(UnsentPublicationStatus.SENDING, media = media(MediaFate.WAITING))
        val rupture = UnsentRuptureRule.rupture(sending, offline = true)

        assertThat(rupture.gesture).isEqualTo(RuptureGesture.WAIT_FOR_NETWORK)
        assertThat(UnsentRuptureRule.speaks(sending, rupture)).isTrue()
    }

    @Test
    fun `a story whose media is gone cannot be reopened so it is told to be composed again`() {
        val story = item(UnsentPublicationStatus.FAILED, UnsentPublicationKind.STORY, media(MediaFate.LOST))

        assertThat(UnsentRuptureRule.replaceByRecomposing(story)).isTrue()
        assertThat(UnsentRuptureRule.replaceByRecomposing(story.copy(kind = UnsentPublicationKind.POST))).isFalse()
    }

    @Test
    fun `a publication whose media is refused for its location is never offered a retry, only a replacement`() {
        val refused = item(UnsentPublicationStatus.FAILED, media = media(MediaFate.LOCATION_REFUSED))
        val rupture = UnsentRuptureRule.rupture(refused, offline = false)

        assertThat(rupture.gesture).isEqualTo(RuptureGesture.REPLACE_MISSING)
        assertThat(UnsentRuptureRule.showsRetry(refused, rupture)).isFalse()
        assertThat(UnsentRuptureRule.speaks(refused, rupture)).isTrue()
    }
}
