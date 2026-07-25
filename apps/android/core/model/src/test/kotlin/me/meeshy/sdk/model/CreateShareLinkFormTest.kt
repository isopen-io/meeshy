package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Duration
import java.time.Instant

/**
 * Behavioural spec for the pure share-link creation SSOT: [ShareLinkExpiration]'s
 * deterministic ISO computation and [CreateShareLinkForm]'s edit/validate/build
 * pipeline (port of iOS `CreateShareLinkView.create()`). Everything is driven
 * through the public API; the injected `nowMillis` keeps the expiry deterministic.
 */
class CreateShareLinkFormTest {

    private val now = Instant.parse("2026-07-25T12:00:00Z")
    private val nowMillis = now.toEpochMilli()

    // ---- ShareLinkExpiration ------------------------------------------------

    @Test
    fun never_hasNoExpiry() {
        assertThat(ShareLinkExpiration.Never.expiresAtIso(nowMillis)).isNull()
    }

    @Test
    fun each_finiteOption_addsItsHorizonToNow() {
        assertThat(ShareLinkExpiration.Hours24.expiresAtIso(nowMillis))
            .isEqualTo(now.plus(Duration.ofHours(24)).toString())
        assertThat(ShareLinkExpiration.Days7.expiresAtIso(nowMillis))
            .isEqualTo(now.plus(Duration.ofDays(7)).toString())
        assertThat(ShareLinkExpiration.Days30.expiresAtIso(nowMillis))
            .isEqualTo(now.plus(Duration.ofDays(30)).toString())
        assertThat(ShareLinkExpiration.Months3.expiresAtIso(nowMillis))
            .isEqualTo(now.plus(Duration.ofDays(90)).toString())
    }

    @Test
    fun finiteOption_isStrictlyInTheFuture() {
        val at = ShareLinkExpiration.Hours24.expiresAtIso(nowMillis)
        assertThat(Instant.parse(at).isAfter(now)).isTrue()
    }

    // ---- Seeding & submittability ------------------------------------------

    @Test
    fun from_seedsTheConversationAndTheIosDefaults() {
        val form = CreateShareLinkForm.from("conv-1")

        assertThat(form.conversationId).isEqualTo("conv-1")
        assertThat(form.requireNickname).isTrue()
        assertThat(form.allowAnonymousMessages).isTrue()
        assertThat(form.allowAnonymousImages).isTrue()
        assertThat(form.allowAnonymousFiles).isFalse()
        assertThat(form.allowViewHistory).isFalse()
        assertThat(form.requireAccount).isFalse()
        assertThat(form.maxUsesEnabled).isFalse()
        assertThat(form.expiration).isEqualTo(ShareLinkExpiration.Never)
        assertThat(form.canSubmit).isTrue()
    }

    @Test
    fun aBlankConversation_cannotBeSubmitted() {
        assertThat(CreateShareLinkForm.from("").canSubmit).isFalse()
        assertThat(CreateShareLinkForm.from("   ").canSubmit).isFalse()
        assertThat(CreateShareLinkForm.from("   ").toRequest(nowMillis)).isNull()
    }

    // ---- Edits are immutable copies ----------------------------------------

    @Test
    fun edits_returnCopiesAndNeverMutateTheSource() {
        val base = CreateShareLinkForm.from("c")
        val edited = base
            .withName("Twitter")
            .withDescription("Join us")
            .withSlug("My-Group")
            .withRequireEmail(true)
            .withAllowAnonymousFiles(true)
            .withExpiration(ShareLinkExpiration.Days7)
            .withMaxUsesEnabled(true)
            .withMaxUses(250)

        assertThat(base.name).isEmpty()
        assertThat(edited.name).isEqualTo("Twitter")
        assertThat(edited.description).isEqualTo("Join us")
        assertThat(edited.requireEmail).isTrue()
        assertThat(edited.allowAnonymousFiles).isTrue()
        assertThat(edited.expiration).isEqualTo(ShareLinkExpiration.Days7)
        assertThat(edited.maxUsesEnabled).isTrue()
        assertThat(edited.maxUses).isEqualTo(250)
    }

    // ---- toRequest: trimming & null-omission --------------------------------

    @Test
    fun toRequest_trimsSlugToLowercaseAndNullOmitsBlankOptionals() {
        val request = CreateShareLinkForm.from("conv-1")
            .withName("  ")
            .withDescription("")
            .withSlug("  Mon-Groupe-2025  ")
            .toRequest(nowMillis)

        assertThat(request).isNotNull()
        assertThat(request!!.conversationId).isEqualTo("conv-1")
        assertThat(request.name).isNull()
        assertThat(request.description).isNull()
        assertThat(request.identifier).isEqualTo("mon-groupe-2025")
    }

    @Test
    fun toRequest_carriesTrimmedNonBlankIdentityFields() {
        val request = CreateShareLinkForm.from("conv-1")
            .withName("  Launch  ")
            .withDescription("  come in  ")
            .toRequest(nowMillis)!!

        assertThat(request.name).isEqualTo("Launch")
        assertThat(request.description).isEqualTo("come in")
    }

    // ---- toRequest: max-uses gate ------------------------------------------

    @Test
    fun maxUses_isOmittedUntilEnabled_thenCarriesTheValue() {
        val disabled = CreateShareLinkForm.from("c").withMaxUses(500).toRequest(nowMillis)!!
        assertThat(disabled.maxUses).isNull()

        val enabled = CreateShareLinkForm.from("c")
            .withMaxUsesEnabled(true)
            .withMaxUses(500)
            .toRequest(nowMillis)!!
        assertThat(enabled.maxUses).isEqualTo(500)
    }

    // ---- toRequest: expiration ---------------------------------------------

    @Test
    fun expiration_isTranslatedThroughTheSelectedOption() {
        val never = CreateShareLinkForm.from("c").toRequest(nowMillis)!!
        assertThat(never.expiresAt).isNull()

        val dated = CreateShareLinkForm.from("c")
            .withExpiration(ShareLinkExpiration.Days30)
            .toRequest(nowMillis)!!
        assertThat(dated.expiresAt).isEqualTo(now.plus(Duration.ofDays(30)).toString())
    }

    // ---- toRequest: account gate forces the sub-requirements off -----------

    @Test
    fun requireAccount_forcesEveryGuestSubRequirementOff() {
        val request = CreateShareLinkForm.from("c")
            .withRequireNickname(true)
            .withRequireEmail(true)
            .withRequireBirthday(true)
            .withRequireAccount(true)
            .toRequest(nowMillis)!!

        assertThat(request.requireAccount).isTrue()
        assertThat(request.requireNickname).isFalse()
        assertThat(request.requireEmail).isFalse()
        assertThat(request.requireBirthday).isFalse()
    }

    @Test
    fun withoutAccount_theGuestSubRequirementsTravelAsChosen() {
        val request = CreateShareLinkForm.from("c")
            .withRequireNickname(true)
            .withRequireEmail(true)
            .withRequireBirthday(false)
            .withRequireAccount(false)
            .toRequest(nowMillis)!!

        assertThat(request.requireAccount).isFalse()
        assertThat(request.requireNickname).isTrue()
        assertThat(request.requireEmail).isTrue()
        assertThat(request.requireBirthday).isFalse()
    }

    @Test
    fun permissionToggles_flowStraightToTheRequest() {
        val request = CreateShareLinkForm.from("c")
            .withAllowAnonymousMessages(false)
            .withAllowAnonymousImages(false)
            .withAllowAnonymousFiles(true)
            .withAllowViewHistory(true)
            .toRequest(nowMillis)!!

        assertThat(request.allowAnonymousMessages).isFalse()
        assertThat(request.allowAnonymousImages).isFalse()
        assertThat(request.allowAnonymousFiles).isTrue()
        assertThat(request.allowViewHistory).isTrue()
    }
}
