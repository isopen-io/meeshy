package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiViolation
import org.junit.Test

/**
 * Le routage d'un refus vers le champ qui le porte.
 *
 * Un refus typé rangé dans une bannière globale oblige l'utilisateur à
 * retrouver seul lequel de ses cinq champs est en cause : ces témoins fixent
 * l'adresse de chacun, y compris celle du seul refus qui arrive sous un statut
 * de succès.
 */
class SignupSubmitErrorTest {

    private fun fieldOf(error: SignupSubmitError?): SignupField? =
        (error as? SignupSubmitError.Field)?.target

    // ---- codes typés ---------------------------------------------------------

    @Test
    fun emailTaken_landsUnderTheEmail() {
        val routed = SignupErrorRouter.route(
            code = "EMAIL_TAKEN",
            fieldName = "email",
            message = "Email already in use",
        )

        assertThat(routed).isEqualTo(
            SignupSubmitError.Field(SignupField.EMAIL, SignupRefusal.EMAIL_TAKEN, "Email already in use"),
        )
    }

    @Test
    fun usernameTaken_landsUnderTheDisplayName_theOnlyInputThatCanChangeIt() {
        val routed = SignupErrorRouter.route(code = "USERNAME_TAKEN", fieldName = "username")

        assertThat(fieldOf(routed)).isEqualTo(SignupField.DISPLAY_NAME)
        assertThat((routed as SignupSubmitError.Field).refusal).isEqualTo(SignupRefusal.NAME_TAKEN)
    }

    @Test
    fun phoneInvalid_landsUnderThePhone() {
        val routed = SignupErrorRouter.route(code = "PHONE_INVALID", fieldName = "phoneNumber")

        assertThat(fieldOf(routed)).isEqualTo(SignupField.PHONE)
        assertThat((routed as SignupSubmitError.Field).refusal).isEqualTo(SignupRefusal.PHONE_INVALID)
    }

    @Test
    fun typedCodeWins_evenWhenTheRootFieldDisagrees() {
        // Le code dit le POURQUOI ; un `field` incohérent ne doit pas le renvoyer ailleurs.
        val routed = SignupErrorRouter.route(code = "EMAIL_TAKEN", fieldName = "phoneNumber")

        assertThat(fieldOf(routed)).isEqualTo(SignupField.EMAIL)
    }

    @Test
    fun codeIsReadCaseInsensitively() {
        assertThat(fieldOf(SignupErrorRouter.route(code = "email_taken"))).isEqualTo(SignupField.EMAIL)
    }

    // ---- réseau --------------------------------------------------------------

    @Test
    fun network_isNeverAFieldRefusal() {
        assertThat(SignupErrorRouter.route(code = "NETWORK", message = "timeout"))
            .isEqualTo(SignupSubmitError.Network)
    }

    // ---- violations ----------------------------------------------------------

    @Test
    fun validationError_routesTheFirstViolationThatNamesAFieldOfThisScreen() {
        val routed = SignupErrorRouter.route(
            code = "VALIDATION_ERROR",
            message = "Validation failed",
            violations = listOf(
                ApiViolation(path = "/body/password", message = "must be at least 6 characters"),
            ),
        )

        assertThat(routed).isEqualTo(
            SignupSubmitError.Field(
                SignupField.PASSWORD,
                SignupRefusal.INVALID,
                "must be at least 6 characters",
            ),
        )
    }

    @Test
    fun validationError_skipsAViolationOnAnInputThisScreenDoesNotShow() {
        val routed = SignupErrorRouter.route(
            code = "VALIDATION_ERROR",
            violations = listOf(
                ApiViolation(path = "captcha", message = "required"),
                ApiViolation(path = "displayName", message = "must contain a letter"),
            ),
        )

        assertThat(fieldOf(routed)).isEqualTo(SignupField.DISPLAY_NAME)
    }

    @Test
    fun validationError_withNoRoutableViolation_staysGlobal() {
        val routed = SignupErrorRouter.route(
            code = "VALIDATION_ERROR",
            message = "Validation failed",
            violations = listOf(ApiViolation(path = "captcha", message = "required")),
        )

        assertThat(routed).isEqualTo(SignupSubmitError.Global("Validation failed"))
    }

    @Test
    fun violationMessageFallsBackToTheEnvelopeMessage() {
        val routed = SignupErrorRouter.route(
            code = "VALIDATION_ERROR",
            message = "Validation failed",
            violations = listOf(ApiViolation(path = "email")),
        )

        assertThat((routed as SignupSubmitError.Field).serverMessage).isEqualTo("Validation failed")
    }

    // ---- routage par le `field` de la racine ---------------------------------

    @Test
    fun anUntypedCodeStillFollowsTheRootField() {
        val routed = SignupErrorRouter.route(code = "SOMETHING_ELSE", fieldName = "password", message = "nope")

        assertThat(routed).isEqualTo(
            SignupSubmitError.Field(SignupField.PASSWORD, SignupRefusal.INVALID, "nope"),
        )
    }

    @Test
    fun anUnknownRefusalWithNoRoutableHint_staysGlobal() {
        assertThat(SignupErrorRouter.route(code = "HTTP_500", message = "Server error"))
            .isEqualTo(SignupSubmitError.Global("Server error"))
    }

    // ---- la clé de champ -----------------------------------------------------

    @Test
    fun fieldFor_readsTheLeafOfAPointerPath() {
        assertThat(SignupErrorRouter.fieldFor("/body/email")).isEqualTo(SignupField.EMAIL)
        assertThat(SignupErrorRouter.fieldFor("body.phoneNumber")).isEqualTo(SignupField.PHONE)
    }

    @Test
    fun fieldFor_isCaseInsensitiveAndTrimmed() {
        assertThat(SignupErrorRouter.fieldFor("  DisplayName ")).isEqualTo(SignupField.DISPLAY_NAME)
    }

    @Test
    fun fieldFor_mapsEveryNameOfTheOldPayloadOntoTheDisplayName() {
        assertThat(SignupErrorRouter.fieldFor("username")).isEqualTo(SignupField.DISPLAY_NAME)
        assertThat(SignupErrorRouter.fieldFor("firstName")).isEqualTo(SignupField.DISPLAY_NAME)
        assertThat(SignupErrorRouter.fieldFor("lastName")).isEqualTo(SignupField.DISPLAY_NAME)
    }

    @Test
    fun fieldFor_unknownOrAbsentName_isNull() {
        assertThat(SignupErrorRouter.fieldFor(null)).isNull()
        assertThat(SignupErrorRouter.fieldFor("  ")).isNull()
        assertThat(SignupErrorRouter.fieldFor("captcha")).isNull()
    }

    // ---- le conflit qui arrive sous un 200 -----------------------------------

    @Test
    fun phoneOwnershipConflict_isAPhoneRefusal() {
        assertThat(SignupErrorRouter.phoneOwnershipConflict.target).isEqualTo(SignupField.PHONE)
        assertThat(SignupErrorRouter.phoneOwnershipConflict.refusal)
            .isEqualTo(SignupRefusal.PHONE_OWNERSHIP_CONFLICT)
    }

    // ---- quel message un champ porte -----------------------------------------

    @Test
    fun serverRefusalWinsOverTheLocalVerdict() {
        val validation = SignupValidation(email = SignupFieldIssue.EMAIL_INVALID)
        val refusal = SignupSubmitError.Field(SignupField.EMAIL, SignupRefusal.EMAIL_TAKEN, "taken")

        assertThat(SignupFieldMessages.resolve(SignupField.EMAIL, validation, refusal))
            .isEqualTo(SignupFieldMessage.Refused(SignupRefusal.EMAIL_TAKEN, "taken"))
    }

    @Test
    fun aRefusalOnAnotherFieldLeavesThisOnesLocalVerdictInPlace() {
        val validation = SignupValidation(email = SignupFieldIssue.EMAIL_INVALID)
        val refusal = SignupErrorRouter.phoneOwnershipConflict

        assertThat(SignupFieldMessages.resolve(SignupField.EMAIL, validation, refusal))
            .isEqualTo(SignupFieldMessage.Local(SignupFieldIssue.EMAIL_INVALID))
    }

    @Test
    fun aGlobalRefusalNeverLandsUnderAField() {
        val globalError = SignupSubmitError.Global("Server error")

        SignupField.entries.forEach { field ->
            assertThat(SignupFieldMessages.resolve(field, SignupValidation(), globalError)).isNull()
        }
    }

    @Test
    fun noRefusalAndNoLocalIssue_showsNothing() {
        assertThat(SignupFieldMessages.resolve(SignupField.PASSWORD, SignupValidation(), null)).isNull()
    }

    @Test
    fun thePhoneNeverCarriesALocalIssue() {
        val validation = SignupValidation(
            displayName = SignupFieldIssue.DISPLAY_NAME_REQUIRED,
            email = SignupFieldIssue.EMAIL_INVALID,
            password = SignupFieldIssue.PASSWORD_TOO_SHORT,
        )

        assertThat(SignupFieldMessages.resolve(SignupField.PHONE, validation, null)).isNull()
    }
}
