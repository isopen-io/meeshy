package me.meeshy.sdk.model.auth

import java.text.Normalizer

/**
 * L'IDENTITÉ DÉRIVÉE D'UNE ADRESSE — miroir de `packages/shared/utils/registration-identity.ts`
 * (le TypeScript fait foi) et de `RegistrationIdentity.swift`.
 *
 * La passerelle réexporte ce module TS : l'écran doit rendre EXACTEMENT les mêmes valeurs,
 * sans quoi il promettrait un pseudo que le serveur ne crée pas. Ce qui négocie avec la base
 * (un pseudo doit être LIBRE) n'est pas ici : une collision revient en refus `USERNAME_TAKEN`
 * accompagné de pseudos libres.
 */
public object RegistrationIdentity {

    /** Longueur maximale d'un `username` — borne de `registerRequestSchema`. */
    public const val PSEUDO_MAX: Int = 16

    /** En deçà, un pseudo n'est pas recevable (directive porteur 2026-10-30, #13825 : « le pseudo commence à 3 caractères »). */
    public const val PSEUDO_MIN: Int = 3

    /** En deçà, un prénom, un nom ou un nom affiché n'est pas recevable : « Al », « Li » passent, « A » non. */
    public const val NAME_MIN: Int = 2

    /** Le nombre de points de code d'une saisie une fois rognée — la mesure d'un pseudo d'inscription (Ajv). */
    public fun trimmedLength(value: String): Int = value.trim().let { it.codePointCount(0, it.length) }

    /**
     * Un prénom, un nom ou un nom affiché atteint [NAME_MIN] caractères VISIBLES ([VisibleNameLength], la mesure
     * de la passerelle) ; une saisie vide n'y atteint pas.
     */
    public fun isNameLongEnough(value: String): Boolean = VisibleNameLength.of(value) >= NAME_MIN

    /** Une saisie NON vide qui reste en deçà de [NAME_MIN] : le cas où le minimum se DIT sous le champ. */
    public fun isNameTooShort(value: String): Boolean =
        value.isNotBlank() && VisibleNameLength.of(value) < NAME_MIN

    /** Ce que la passerelle garde d'un pseudo d'invité (`SecuritySanitizer.sanitizeUsername`). */
    private val servedNicknameChar = Regex("[a-zA-Z0-9_.-]")

    /**
     * Le pseudo d'un INVITÉ se mesure sur la base que la passerelle en SERT (`servedGuestNicknameViolation`) :
     * « Al# » ou « Zoé » n'y gardent que deux caractères.
     */
    public fun isGuestNicknameLongEnough(value: String): Boolean =
        servedNicknameChar.findAll(value.trim()).count() >= PSEUDO_MIN

    /** Le recours quand le nom affiché ET l'adresse ne donnent rien de slugifiable. */
    public const val PSEUDO_DE_SECOURS: String = "user"

    private val combiningMarks = Regex("[\\u0300-\\u036f]")
    private val whitespaceRun = Regex("\\s+")
    private val notPseudoChar = Regex("[^a-z0-9_-]")
    private val separatorRun = Regex("[-_]{2,}")
    private val edgeSeparators = Regex("^[-_]+|[-_]+$")
    private val wordStart = Regex("(^|[\\s'.-])(\\p{L})")
    private val nonLowerLetter = Regex("[^a-z]+")

    /** Capitalise un nom en respectant les composés : `Jean-Pierre` et `O'Brien` restent tels quels. */
    public fun capitalizeName(name: String): String =
        name.trim().lowercase().replace(wordStart) { it.groupValues[1] + it.groupValues[2].uppercase() }

    /**
     * La forme « pseudo » d'une chaîne quelconque. L'ORDRE EST LA LOI : on replie les
     * séparateurs, on RAGNE les bords, PUIS on tronque.
     */
    public fun pseudoSlug(valeur: String): String =
        Normalizer.normalize(valeur, Normalizer.Form.NFD)
            .replace(combiningMarks, "")
            .lowercase()
            .replace(whitespaceRun, "-")
            .replace(notPseudoChar, "")
            .replace(separatorRun, "-")
            .replace(edgeSeparators, "")
            .take(PSEUDO_MAX)

    /** Ce qui précède l'arobase, sous-adressage retiré : `jean+meeshy@…` rend `jean`. */
    public fun partieLocale(email: String?): String =
        (email.orEmpty().substringBefore('@')).substringBefore('+')

    public fun slugDAdresse(email: String?): String =
        pseudoSlug(partieLocale(email).replace('.', '-'))

    /**
     * Le nom affiché tiré d'une adresse — `jean.dupont@…` rend `Jean Dupont`. Les chiffres
     * séparent comme `.`, `-` et `_` ; rend `""` quand rien n'est slugifiable (l'écran DEMANDE,
     * il ne fabrique pas).
     */
    public fun displayNameDepuisEmail(email: String?): String {
        val slug = slugDAdresse(email)
        if (slug.length < PSEUDO_MIN) return ""
        return slug.split(nonLowerLetter).filter { it.isNotEmpty() }.joinToString(" ") { capitalizeName(it) }
    }

    /** La racine du pseudo : le nom affiché s'il donne quelque chose, l'adresse sinon, le recours en dernier. */
    public fun pseudoRacine(displayName: String?, email: String?): String {
        val depuisNom = pseudoSlug(displayName.orEmpty())
        if (depuisNom.length >= PSEUDO_MIN) return depuisNom
        val depuisEmail = slugDAdresse(email)
        if (depuisEmail.length >= PSEUDO_MIN) return depuisEmail
        return PSEUDO_DE_SECOURS
    }

    /** Pourquoi un pseudo serait refusé — le MOTIF, jamais un booléen nu. */
    public enum class UsernameRefusal { TOO_SHORT, TOO_LONG, INVALID_CHARACTERS }

    /** La LONGUEUR se juge avant les caractères ; elle se compte en points de code. ASCII strict (`^[a-zA-Z0-9_-]+$`). */
    public fun usernameRefusal(value: String): UsernameRefusal? {
        val length = value.codePointCount(0, value.length)
        return when {
            length < PSEUDO_MIN -> UsernameRefusal.TOO_SHORT
            length > PSEUDO_MAX -> UsernameRefusal.TOO_LONG
            value.any { !(it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '_' || it == '-') } ->
                UsernameRefusal.INVALID_CHARACTERS
            else -> null
        }
    }
}
