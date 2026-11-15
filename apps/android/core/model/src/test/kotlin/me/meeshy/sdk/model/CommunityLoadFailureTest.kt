package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CommunityLoadFailureTest {

    @Test
    fun `a 403 and a 404 are the same refusal, so an id never says a private community exists`() {
        assertThat(CommunityLoadFailure.of(ContentFetchFailure.FORBIDDEN)).isEqualTo(CommunityLoadFailure.REFUSED)
        assertThat(CommunityLoadFailure.of(ContentFetchFailure.NOT_FOUND)).isEqualTo(CommunityLoadFailure.REFUSED)
    }

    @Test
    fun `network and server stay distinct causes`() {
        assertThat(CommunityLoadFailure.of(ContentFetchFailure.NETWORK)).isEqualTo(CommunityLoadFailure.NETWORK)
        assertThat(CommunityLoadFailure.of(ContentFetchFailure.SERVER)).isEqualTo(CommunityLoadFailure.SERVER)
    }

    @Test
    fun `retry is offered only where retrying can succeed`() {
        assertThat(CommunityLoadFailure.REFUSED.offersRetry).isFalse()
        assertThat(CommunityLoadFailure.NETWORK.offersRetry).isTrue()
        assertThat(CommunityLoadFailure.SERVER.offersRetry).isTrue()
    }
}
