package me.meeshy.sdk.model.feedback

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedbackToastTest {
    private fun delay(
        kind: FeedbackToastKind = FeedbackToastKind.SUCCESS,
        tappable: Boolean = false,
        reader: Boolean = false,
        system: Long? = null,
    ) = FeedbackToastTiming.dismissDelayMillis(kind, tappable, reader, system)

    private fun toast(message: String = "ok", kind: FeedbackToastKind = FeedbackToastKind.SUCCESS) =
        FeedbackToast(1, message, kind, isTappable = false, shownAtMillis = 10_000)

    @Test fun `un succes ou une info dure 3 secondes`() {
        assertThat(delay()).isEqualTo(3_000)
        assertThat(delay(FeedbackToastKind.INFO)).isEqualTo(3_000)
    }

    @Test fun `une erreur dure plus qu un succes`() {
        assertThat(delay(FeedbackToastKind.ERROR)).isGreaterThan(delay())
    }

    @Test fun `un toast cliquable dure 6 secondes`() {
        assertThat(delay(tappable = true)).isEqualTo(6_000)
    }

    @Test fun `sous lecteur d ecran tout toast dure au moins 6 secondes`() {
        assertThat(delay(reader = true)).isEqualTo(6_000)
        assertThat(delay(FeedbackToastKind.ERROR, reader = true)).isEqualTo(6_000)
    }

    @Test fun `le delai recommande par le systeme allonge mais ne raccourcit jamais`() {
        assertThat(delay(system = 10_000)).isEqualTo(10_000)
        assertThat(delay(system = 500)).isEqualTo(3_000)
    }

    @Test fun `un message identique dans les 2 secondes est un doublon`() {
        assertThat(toast().isDuplicateOf("ok", FeedbackToastKind.SUCCESS, 11_999)).isTrue()
    }

    @Test fun `apres 2 secondes ou avec un autre message ce n est pas un doublon`() {
        assertThat(toast().isDuplicateOf("ok", FeedbackToastKind.SUCCESS, 12_000)).isFalse()
        assertThat(toast().isDuplicateOf("autre", FeedbackToastKind.SUCCESS, 10_500)).isFalse()
        assertThat(toast().isDuplicateOf("ok", FeedbackToastKind.ERROR, 10_500)).isFalse()
    }
}
