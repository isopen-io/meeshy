package me.meeshy.sdk.model.contacts

/** Ce que la saisie du clavier numérique demande au serveur (iOS `KeypadViewModel.search`). */
sealed interface KeypadQuery {
    /** Sous les seuils : aucune requête, l'invite s'affiche. */
    data object Idle : KeypadQuery

    /** Recherche exacte par téléphone ; [digits] ne contient que des chiffres (`GET users/phone/{digits}`). */
    data class Phone(val digits: String) : KeypadQuery

    /** Recherche par nom ou identifiant (`GET users/search`). */
    data class Name(val text: String) : KeypadQuery
}

/**
 * Loi pure du champ « Numéro ou nom » : une seule saisie sert de pavé et de recherche, la classification est
 * automatique. Uniquement des chiffres, `+ - ( ) .` et espaces ⇒ numéro (3 chiffres minimum) ; sinon nom
 * (2 caractères minimum). Miroir de `KeypadViewModel` iOS.
 */
object KeypadInput {
    const val MIN_PHONE_DIGITS = 3
    const val MIN_NAME_LENGTH = 2

    private const val PHONE_SEPARATORS = "+ -()."

    fun classify(input: String): KeypadQuery {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return KeypadQuery.Idle
        val isPhone = trimmed.all { it in '0'..'9' || it in PHONE_SEPARATORS }
        if (isPhone) {
            val digits = trimmed.filter { it in '0'..'9' }
            return if (digits.length >= MIN_PHONE_DIGITS) KeypadQuery.Phone(digits) else KeypadQuery.Idle
        }
        return if (trimmed.length >= MIN_NAME_LENGTH) KeypadQuery.Name(trimmed) else KeypadQuery.Idle
    }

    fun append(input: String, key: String): String = input + key

    fun deleteLast(input: String): String = input.dropLast(1)

    fun clear(): String = ""
}
