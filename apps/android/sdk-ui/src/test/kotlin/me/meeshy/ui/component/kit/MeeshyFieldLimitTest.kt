package me.meeshy.ui.component.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyFieldLimitTest {

    @Test
    fun count_usesUtf16Units_soEmojiCountsTwice() {
        assertThat(MeeshyFieldLimit.count("a😀")).isEqualTo(3)
    }

    @Test
    fun truncate_keepsWholeGraphemesWithinLimit() {
        val family = "👨‍👩‍👧"

        assertThat(MeeshyFieldLimit.truncate("abcdef", 4)).isEqualTo("abcd")
        assertThat(MeeshyFieldLimit.truncate("$family!", 3)).isEqualTo("")
        assertThat(MeeshyFieldLimit.truncate("ab", 5)).isEqualTo("ab")
    }

    @Test
    fun isNear_isTrueFromEightyPercentOfLimit() {
        assertThat(MeeshyFieldLimit.isNear(count = 47, limit = 60)).isFalse()
        assertThat(MeeshyFieldLimit.isNear(count = 48, limit = 60)).isTrue()
    }

    @Test
    fun crossing_reportsRisingNearAndReached_butNotFalling() {
        assertThat(MeeshyFieldLimit.crossing(from = 47, to = 48, limit = 60)).isEqualTo(MeeshyFieldLimitCrossing.Near)
        assertThat(MeeshyFieldLimit.crossing(from = 59, to = 60, limit = 60)).isEqualTo(MeeshyFieldLimitCrossing.Reached)
        assertThat(MeeshyFieldLimit.crossing(from = 60, to = 40, limit = 60)).isNull()
        assertThat(MeeshyFieldLimit.crossing(from = 49, to = 50, limit = 60)).isNull()
    }

    @Test
    fun ledger_receive_truncatesAndEmitsOnce() {
        val (ledger, edit) = MeeshyFieldLedger.of("abc").receive("abcdef", limit = 4)

        assertThat(edit?.value).isEqualTo("abcd")
        assertThat(edit?.wasTruncated).isTrue()
        assertThat(edit?.emits).isTrue()
        assertThat(ledger.emitted).isEqualTo("abcd")
    }

    @Test
    fun ledger_receive_echoOfEmittedValue_returnsNothing() {
        val (_, edit) = MeeshyFieldLedger.of("abc").receive("abc", limit = null)

        assertThat(edit).isNull()
    }

    @Test
    fun ledger_resync_replacesDraftWithoutCommitting() {
        val (ledger, changed) = MeeshyFieldLedger.of("abc").resync("xyz")

        assertThat(changed).isTrue()
        assertThat(ledger.committed).isEqualTo("xyz")
    }

    @Test
    fun ledger_commit_onlyWhenValueChanged() {
        val (first, committed) = MeeshyFieldLedger.of("abc").commit("abcd")
        val (_, repeated) = first.commit("abcd")

        assertThat(committed).isEqualTo("abcd")
        assertThat(repeated).isNull()
    }
}
