package me.meeshy.sdk.model.auth

/**
 * La saisie du second facteur à la connexion : les deux formes du contrat de
 * `POST /auth/login/2fa` (`minLength: 6, maxLength: 9`) — un code TOTP à 6 chiffres, ou un code de
 * secours `XXXX-XXXX` (tiret facultatif) tiré de l'alphabet de `TwoFactorService.generateBackupCodes`.
 *
 * iOS `LoginView.twoFactorSection` ne filtre pas et n'exige que 6 caractères : un code de secours collé
 * y passe. Android normalise (majuscules, caractères ASCII alphanumériques et tiret, 9 au plus) et
 * n'active « Se connecter » que pour une forme complète ; la passerelle reste seule juge du code.
 *
 * Distinct de [OtpCodeField] : le code reçu par e-mail ou SMS n'a qu'une forme, 6 chiffres.
 */
object TwoFactorCodeField {

    const val MAX_LENGTH = 9

    private const val BACKUP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    private val TOTP = Regex("[0-9]{6}")
    private val BACKUP = Regex("[$BACKUP_ALPHABET]{4}-?[$BACKUP_ALPHABET]{4}")

    fun sanitize(raw: String): String =
        raw.map(Char::uppercaseChar)
            .filter { it in '0'..'9' || it in 'A'..'Z' || it == '-' }
            .joinToString("")
            .take(MAX_LENGTH)

    fun isComplete(code: String): Boolean = TOTP.matches(code) || BACKUP.matches(code)
}
