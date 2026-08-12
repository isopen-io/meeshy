package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.Duration
import java.time.Instant
import org.junit.Test

/**
 * Behavioural spec for [ExtendShareLinkForm] — the pure SSOT deciding what a valid
 * `PATCH /links/{id}/extend` body looks like. The extend route *requires* a concrete
 * `expiresAt`, so "never" is not a submittable choice (unlike creation, where a link
 * may be perpetual). Horizons are computed against an injected clock for determinism.
 */
class ExtendShareLinkFormTest {

    private val now = Instant.parse("2026-07-25T12:00:00Z").toEpochMilli()

    @Test
    fun default_isSubmittableWithAConcreteFutureExpiry() {
        val form = ExtendShareLinkForm()

        assertThat(form.canSubmit).isTrue()
        val request = form.toRequest(now)
        assertThat(request).isNotNull()
        assertThat(Instant.parse(request!!.expiresAt)).isGreaterThan(Instant.ofEpochMilli(now))
    }

    @Test
    fun never_isNotSubmittableAndYieldsNoRequest() {
        val form = ExtendShareLinkForm(expiration = ShareLinkExpiration.Never)

        assertThat(form.canSubmit).isFalse()
        assertThat(form.toRequest(now)).isNull()
    }

    @Test
    fun hours24_extendsExactlyTwentyFourHoursFromNow() {
        val request = ExtendShareLinkForm(expiration = ShareLinkExpiration.Hours24).toRequest(now)

        assertThat(request!!.expiresAt)
            .isEqualTo(Instant.ofEpochMilli(now).plus(Duration.ofHours(24)).toString())
    }

    @Test
    fun days7_extendsExactlySevenDaysFromNow() {
        val request = ExtendShareLinkForm(expiration = ShareLinkExpiration.Days7).toRequest(now)

        assertThat(request!!.expiresAt)
            .isEqualTo(Instant.ofEpochMilli(now).plus(Duration.ofDays(7)).toString())
    }

    @Test
    fun days30_extendsExactlyThirtyDaysFromNow() {
        val request = ExtendShareLinkForm(expiration = ShareLinkExpiration.Days30).toRequest(now)

        assertThat(request!!.expiresAt)
            .isEqualTo(Instant.ofEpochMilli(now).plus(Duration.ofDays(30)).toString())
    }

    @Test
    fun months3_extendsExactlyNinetyDaysFromNow() {
        val request = ExtendShareLinkForm(expiration = ShareLinkExpiration.Months3).toRequest(now)

        assertThat(request!!.expiresAt)
            .isEqualTo(Instant.ofEpochMilli(now).plus(Duration.ofDays(90)).toString())
    }

    @Test
    fun withExpiration_isImmutableAndReturnsANewInstance() {
        val original = ExtendShareLinkForm(expiration = ShareLinkExpiration.Days7)

        val next = original.withExpiration(ShareLinkExpiration.Days30)

        assertThat(next.expiration).isEqualTo(ShareLinkExpiration.Days30)
        assertThat(original.expiration).isEqualTo(ShareLinkExpiration.Days7)
    }

    @Test
    fun options_offerTheFourConcreteHorizonsAndNeverNever() {
        assertThat(ExtendShareLinkForm.options).containsExactly(
            ShareLinkExpiration.Hours24,
            ShareLinkExpiration.Days7,
            ShareLinkExpiration.Days30,
            ShareLinkExpiration.Months3,
        ).inOrder()
        assertThat(ExtendShareLinkForm.options).doesNotContain(ShareLinkExpiration.Never)
    }
}
