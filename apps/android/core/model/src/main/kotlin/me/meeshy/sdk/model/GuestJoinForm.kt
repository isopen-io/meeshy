package me.meeshy.sdk.model

/**
 * The guest (anonymous shared-link) join form — the pure, immutable SSOT for what
 * a visitor must supply before joining a conversation via a share link, and how
 * those fields become an [AnonymousJoinRequest].
 *
 * Faithful port of the web join form's validation
 * (`apps/web/components/join/AnonymousForm.tsx` → `isFormValid`): first/last name
 * are always required; the nickname / email / birthday become required only when
 * the link demands them ([ShareLinkInfo.requireNickname] / `requireEmail` /
 * `requireBirthday`). SOTA over both web and iOS on two points:
 *
 * 1. A link that [requireAccount] cannot be joined anonymously at all, so
 *    [canSubmit] stays false — the caller steers such a visitor to sign in
 *    instead of firing a request the gateway will reject.
 * 2. [toRequest] is the single builder: it trims every field, omits an empty
 *    optional (username / email / birthday travel as `null`, never `""`), and
 *    falls back to [DEFAULT_LANGUAGE] for a blank language — so a malformed body
 *    can never leave this type.
 */
data class GuestJoinForm(
    val firstName: String = "",
    val lastName: String = "",
    val username: String = "",
    val email: String = "",
    val birthday: String = "",
    val language: String = DEFAULT_LANGUAGE,
    val requireNickname: Boolean = false,
    val requireEmail: Boolean = false,
    val requireBirthday: Boolean = false,
    val requireAccount: Boolean = false,
) {
    val isFirstNameValid: Boolean get() = firstName.isNotBlank()
    val isLastNameValid: Boolean get() = lastName.isNotBlank()
    val isUsernameValid: Boolean get() = !requireNickname || username.isNotBlank()
    val isEmailValid: Boolean get() = !requireEmail || email.isNotBlank()
    val isBirthdayValid: Boolean get() = !requireBirthday || birthday.isNotBlank()

    /** An account-required link cannot be joined anonymously — steer to sign-in. */
    val requiresAccount: Boolean get() = requireAccount

    val canSubmit: Boolean
        get() = !requireAccount &&
            isFirstNameValid &&
            isLastNameValid &&
            isUsernameValid &&
            isEmailValid &&
            isBirthdayValid

    fun withFirstName(value: String): GuestJoinForm = copy(firstName = value)

    fun withLastName(value: String): GuestJoinForm = copy(lastName = value)

    fun withUsername(value: String): GuestJoinForm = copy(username = value)

    fun withEmail(value: String): GuestJoinForm = copy(email = value)

    fun withBirthday(value: String): GuestJoinForm = copy(birthday = value)

    fun withLanguage(value: String): GuestJoinForm = copy(language = value)

    /**
     * Fill in a suggested [username] only when it is still blank and both names
     * are present — mirrors the web auto-fill (`updateAnonymousForm`), but keeps
     * the randomness at the edge: the caller supplies [suffix]. Returns the same
     * instance when nothing should change.
     */
    fun suggestingUsername(suffix: Int): GuestJoinForm {
        if (username.isNotBlank()) return this
        if (firstName.isBlank() || lastName.isBlank()) return this
        return copy(username = suggestedUsername(firstName, lastName, suffix))
    }

    /** Build the wire request, or `null` when the form is not submittable. */
    fun toRequest(): AnonymousJoinRequest? {
        if (!canSubmit) return null
        return AnonymousJoinRequest(
            firstName = firstName.trim(),
            lastName = lastName.trim(),
            username = username.trim().ifBlank { null },
            email = email.trim().ifBlank { null },
            birthday = birthday.trim().ifBlank { null },
            language = language.trim().ifBlank { DEFAULT_LANGUAGE },
        )
    }

    companion object {
        const val DEFAULT_LANGUAGE: String = "fr"

        /** Seed a fresh form from a link's requirement flags. */
        fun from(info: ShareLinkInfo, language: String = DEFAULT_LANGUAGE): GuestJoinForm =
            GuestJoinForm(
                language = language.ifBlank { DEFAULT_LANGUAGE },
                requireNickname = info.requireNickname,
                requireEmail = info.requireEmail,
                requireBirthday = info.requireBirthday,
                requireAccount = info.requireAccount,
            )

        /**
         * Deterministic username suggestion — port of the web
         * `generateUsername`: lowercase, strip everything but `a`–`z`, join with
         * `_`, then a zero-padded 3-digit suffix (the caller supplies the number;
         * it is reduced modulo 1000 so any injected value stays in range).
         */
        fun suggestedUsername(firstName: String, lastName: String, suffix: Int): String {
            val cleanFirst = firstName.lowercase().filter { it in 'a'..'z' }
            val cleanLast = lastName.lowercase().filter { it in 'a'..'z' }
            val padded = ((suffix % 1000) + 1000) % 1000
            return "${cleanFirst}_$cleanLast${padded.toString().padStart(3, '0')}"
        }
    }
}
