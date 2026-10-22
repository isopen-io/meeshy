package me.meeshy.sdk.model.auth

/**
 * LA PLAUSIBILITÉ D'UN NUMÉRO — miroir de `packages/shared/utils/phone-plausibility.ts`.
 *
 * Distincte de sa VALIDITÉ (libphonenumber, côté passerelle) : ici on demande si quelqu'un a
 * tapé son numéro, ou rempli la case pour qu'elle se taise. Les bornes sont celles de la
 * directive porteur 2026-09-14 (> 8 chiffres, pas de chiffres identiques à la suite, pas de
 * répétition) ; une divergence rendrait le refus différent selon le client.
 */
public object PhonePlausibility {

    /** « > 8 chiffres ». */
    public const val MIN_DIGITS: Int = 9

    /** Cinq chiffres identiques d'affilée : `1111100000`. Quatre restent courants. */
    public const val MAX_IDENTICAL_RUN: Int = 5

    /** Au-delà de quatre chiffres, la répétition d'un groupe est trop rare pour distinguer un faux. */
    public const val MAX_REPEATED_UNIT: Int = 4

    public enum class Refusal { TOO_SHORT, IDENTICAL_RUN, REPEATED_PATTERN }

    public fun digitsOnly(raw: String): String = raw.filter(Char::isDigit)

    /** Le motif du refus, ou `null`. Une chaîne VIDE est plausible : l'absence relève de [SignupPhoneRefusal.Missing]. */
    public fun refusal(raw: String): Refusal? {
        val digits = digitsOnly(raw)
        return when {
            digits.isEmpty() -> null
            digits.length < MIN_DIGITS -> Refusal.TOO_SHORT
            hasIdenticalRun(digits) -> Refusal.IDENTICAL_RUN
            isWhollyRepeated(digits) -> Refusal.REPEATED_PATTERN
            else -> null
        }
    }

    public fun isPlausible(raw: String): Boolean = refusal(raw) == null

    private fun hasIdenticalRun(digits: String): Boolean {
        var run = 1
        for (i in 1 until digits.length) {
            run = if (digits[i] == digits[i - 1]) run + 1 else 1
            if (run >= MAX_IDENTICAL_RUN) return true
        }
        return false
    }

    /** `true` quand TOUTE la chaîne est un motif court répété — `0642424242` le CONTIENT seulement. */
    private fun isWhollyRepeated(digits: String): Boolean =
        (1..MAX_REPEATED_UNIT).any { unit ->
            digits.length % unit == 0 && digits.length / unit >= 3 &&
                digits.chunked(unit).all { it == digits.take(unit) }
        }
}

/**
 * Pourquoi le numéro ne permet pas d'avancer : ABSENT (requis par l'ÉCRAN, #9343 — la requête
 * reste valide sans lui côté serveur) ou implausible.
 */
public sealed interface SignupPhoneRefusal {
    public data object Missing : SignupPhoneRefusal
    public data class Implausible(val reason: PhonePlausibility.Refusal) : SignupPhoneRefusal

    public companion object {
        public fun of(rawPhone: String): SignupPhoneRefusal? {
            if (PhonePlausibility.digitsOnly(rawPhone).isEmpty()) return Missing
            return PhonePlausibility.refusal(rawPhone)?.let(::Implausible)
        }
    }
}

/**
 * Le moment où le refus du numéro se DIT : jamais pendant la première frappe, dès que le champ
 * est quitté avec une saisie ou qu'un envoi est tenté (`isPhoneChecked`). Un champ quitté VIDE
 * ne dit rien.
 */
public data class PhoneCheck(val isChecked: Boolean = false) {
    public fun fieldLeft(hasPhone: Boolean): PhoneCheck = if (hasPhone) copy(isChecked = true) else this
    public fun submitAttempted(): PhoneCheck = copy(isChecked = true)
}
