package me.meeshy.sdk.model.licenses

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshySourceOfferTest {

    private val sha = "0123456789abcdef0123456789abcdef01234567"

    @Test
    fun fullCommit_pointsAtTheTreeOfThatCommit() {
        val offer = MeeshySourceOffer.of(sha)
        assertThat(offer.url).isEqualTo("https://github.com/isopen-io/meeshy/tree/$sha")
        assertThat(offer.shortCommit).isEqualTo("0123456")
    }

    @Test
    fun noCommit_pointsAtTheRepository() {
        val offer = MeeshySourceOffer.of(null)
        assertThat(offer.url).isEqualTo(MeeshySourceOffer.REPOSITORY_URL)
        assertThat(offer.shortCommit).isNull()
    }

    @Test
    fun emptyShortOrNonHexValue_holdsNoCommit() {
        assertThat(MeeshySourceOffer.of("").commit).isNull()
        assertThat(MeeshySourceOffer.of("0123456").commit).isNull()
        assertThat(MeeshySourceOffer.of("z".repeat(40)).commit).isNull()
        assertThat(MeeshySourceOffer.of(sha + sha).commit).isNull()
    }

    @Test
    fun caseAndWhitespace_areNormalized() {
        assertThat(MeeshySourceOffer.of("  ${sha.uppercase()}\n").commit).isEqualTo(sha)
    }
}
