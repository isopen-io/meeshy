package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for [GuestJoinForm] — the pure guest-join validation + request
 * builder. Every expectation is a hand-written literal asserted through the public
 * API, never the type's internals.
 *
 * Parity source: the web join form `isFormValid` gate
 * (`apps/web/components/join/AnonymousForm.tsx`) plus the `generateUsername`
 * auto-fill (`apps/web/hooks/use-join-flow.ts`). SOTA divergences (account-required
 * blocks anonymous submit; `toRequest` trims + null-omits) are asserted explicitly.
 */
class GuestJoinFormTest {

    private fun info(
        requireNickname: Boolean = false,
        requireEmail: Boolean = false,
        requireBirthday: Boolean = false,
        requireAccount: Boolean = false,
    ) = ShareLinkInfo(
        id = "l1",
        requireNickname = requireNickname,
        requireEmail = requireEmail,
        requireBirthday = requireBirthday,
        requireAccount = requireAccount,
    )

    private fun namedForm(base: GuestJoinForm) = base.withFirstName("Ada").withLastName("Lovelace")

    // ---- from(info) seeding ----

    @Test
    fun from_seedsRequirementFlagsAndDefaultsLanguageToFrench() {
        val form = GuestJoinForm.from(info(requireNickname = true, requireBirthday = true))

        assertThat(form.requireNickname).isTrue()
        assertThat(form.requireBirthday).isTrue()
        assertThat(form.requireEmail).isFalse()
        assertThat(form.requireAccount).isFalse()
        assertThat(form.language).isEqualTo("fr")
        assertThat(form.firstName).isEmpty()
    }

    @Test
    fun from_honoursAnExplicitLanguage() {
        assertThat(GuestJoinForm.from(info(), language = "en").language).isEqualTo("en")
    }

    @Test
    fun from_blankLanguageFallsBackToFrench() {
        assertThat(GuestJoinForm.from(info(), language = "   ").language).isEqualTo("fr")
    }

    // ---- canSubmit ----

    @Test
    fun freshForm_isNotSubmittable_becauseNamesAreBlank() {
        assertThat(GuestJoinForm.from(info()).canSubmit).isFalse()
    }

    @Test
    fun bothNamesPresentWithNoRequirements_isSubmittable() {
        val form = namedForm(GuestJoinForm.from(info()))

        assertThat(form.isFirstNameValid).isTrue()
        assertThat(form.isLastNameValid).isTrue()
        assertThat(form.canSubmit).isTrue()
    }

    @Test
    fun blankFirstNameBlocksSubmit_evenWhenLastNamePresent() {
        val form = GuestJoinForm.from(info()).withLastName("Lovelace")

        assertThat(form.isFirstNameValid).isFalse()
        assertThat(form.canSubmit).isFalse()
    }

    @Test
    fun requireNickname_blocksUntilUsernamePresent() {
        val blank = namedForm(GuestJoinForm.from(info(requireNickname = true)))
        assertThat(blank.isUsernameValid).isFalse()
        assertThat(blank.canSubmit).isFalse()

        val filled = blank.withUsername("ada")
        assertThat(filled.isUsernameValid).isTrue()
        assertThat(filled.canSubmit).isTrue()
    }

    @Test
    fun usernameOptionalWhenNotRequired() {
        val form = namedForm(GuestJoinForm.from(info(requireNickname = false)))

        assertThat(form.isUsernameValid).isTrue()
        assertThat(form.canSubmit).isTrue()
    }

    @Test
    fun requireEmail_blocksUntilEmailPresent() {
        val blank = namedForm(GuestJoinForm.from(info(requireEmail = true)))
        assertThat(blank.isEmailValid).isFalse()
        assertThat(blank.canSubmit).isFalse()

        val filled = blank.withEmail("ada@calc.org")
        assertThat(filled.isEmailValid).isTrue()
        assertThat(filled.canSubmit).isTrue()
    }

    @Test
    fun requireBirthday_blocksUntilBirthdayPresent() {
        val blank = namedForm(GuestJoinForm.from(info(requireBirthday = true)))
        assertThat(blank.isBirthdayValid).isFalse()
        assertThat(blank.canSubmit).isFalse()

        val filled = blank.withBirthday("1815-12-10")
        assertThat(filled.isBirthdayValid).isTrue()
        assertThat(filled.canSubmit).isTrue()
    }

    @Test
    fun requireAccount_blocksAnonymousSubmit_evenWhenEveryFieldIsFilled() {
        val form = namedForm(GuestJoinForm.from(info(requireAccount = true)))
            .withUsername("ada")
            .withEmail("ada@calc.org")
            .withBirthday("1815-12-10")

        assertThat(form.requiresAccount).isTrue()
        assertThat(form.canSubmit).isFalse()
    }

    // ---- toRequest ----

    @Test
    fun toRequest_isNullWhenNotSubmittable() {
        assertThat(GuestJoinForm.from(info()).toRequest()).isNull()
    }

    @Test
    fun toRequest_trimsFieldsAndOmitsEmptyOptionals() {
        val form = GuestJoinForm.from(info())
            .withFirstName("  Ada ")
            .withLastName(" Lovelace  ")

        val request = form.toRequest()!!

        assertThat(request.firstName).isEqualTo("Ada")
        assertThat(request.lastName).isEqualTo("Lovelace")
        assertThat(request.username).isNull()
        assertThat(request.email).isNull()
        assertThat(request.birthday).isNull()
        assertThat(request.language).isEqualTo("fr")
    }

    @Test
    fun toRequest_carriesTrimmedOptionalsWhenProvided() {
        val form = namedForm(GuestJoinForm.from(info(), language = "es"))
            .withUsername("  ada_l  ")
            .withEmail(" ada@calc.org ")
            .withBirthday(" 1815-12-10 ")

        val request = form.toRequest()!!

        assertThat(request.username).isEqualTo("ada_l")
        assertThat(request.email).isEqualTo("ada@calc.org")
        assertThat(request.birthday).isEqualTo("1815-12-10")
        assertThat(request.language).isEqualTo("es")
    }

    @Test
    fun toRequest_blankLanguageFallsBackToFrench() {
        val form = namedForm(GuestJoinForm.from(info())).withLanguage("   ")

        assertThat(form.toRequest()!!.language).isEqualTo("fr")
    }

    // ---- suggestingUsername ----

    @Test
    fun suggestingUsername_fillsBlankUsernameWhenBothNamesPresent() {
        val form = namedForm(GuestJoinForm.from(info())).suggestingUsername(7)

        assertThat(form.username).isEqualTo("ada_lovelace007")
    }

    @Test
    fun suggestingUsername_leavesAnExistingUsernameUntouched() {
        val form = namedForm(GuestJoinForm.from(info())).withUsername("chosen")

        assertThat(form.suggestingUsername(1)).isSameInstanceAs(form)
    }

    @Test
    fun suggestingUsername_isInertUntilBothNamesArePresent() {
        val onlyFirst = GuestJoinForm.from(info()).withFirstName("Ada")

        assertThat(onlyFirst.suggestingUsername(1)).isSameInstanceAs(onlyFirst)
    }

    @Test
    fun suggestedUsername_stripsNonLettersAndZeroPadsTheSuffix() {
        assertThat(GuestJoinForm.suggestedUsername("Ada 3", "O'Brien", 42))
            .isEqualTo("ada_obrien042")
    }

    @Test
    fun suggestedUsername_reducesAnOutOfRangeSuffixModulo1000() {
        assertThat(GuestJoinForm.suggestedUsername("A", "B", 1234)).isEqualTo("a_b234")
        assertThat(GuestJoinForm.suggestedUsername("A", "B", -1)).isEqualTo("a_b999")
    }
}
