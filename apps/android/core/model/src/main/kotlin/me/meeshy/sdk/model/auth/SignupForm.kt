package me.meeshy.sdk.model.auth

import me.meeshy.sdk.model.RegisterRequest

/** Un champ de l'écran d'inscription — l'adresse sous laquelle un refus se pose. */
public enum class SignupField { DISPLAY_NAME, EMAIL, PHONE, PASSWORD }

/**
 * Un refus que le CLIENT prononce seul, sans demander la passerelle.
 *
 * Volontairement court : l'inscription n'appelle plus rien avant l'envoi (ni
 * debounce, ni sonde de disponibilité), donc tout ce qui demande le serveur —
 * adresse déjà prise, numéro déjà rattaché, nom déjà pris — arrive en réponse à
 * la soumission et vit dans [SignupRefusal], pas ici.
 */
public enum class SignupFieldIssue {
    /** Vide, ou sans une seule lettre — le miroir de `(?=.*\p{L})`. */
    DISPLAY_NAME_REQUIRED,
    DISPLAY_NAME_TOO_LONG,
    EMAIL_INVALID,
    PASSWORD_TOO_SHORT,
}

/** Le verdict local, un champ à la fois — rendu par [SignupForm.validate]. */
public data class SignupValidation(
    val displayName: SignupFieldIssue? = null,
    val email: SignupFieldIssue? = null,
    val password: SignupFieldIssue? = null,
) {
    public val isValid: Boolean
        get() = displayName == null && email == null && password == null

    /**
     * Le refus local porté par [field]. [SignupField.PHONE] n'en a jamais : le
     * téléphone n'est pas annoncé facultatif, mais un champ vide part
     * simplement absent de la charge — il ne peut donc pas bloquer l'envoi.
     */
    public fun issueFor(field: SignupField): SignupFieldIssue? = when (field) {
        SignupField.DISPLAY_NAME -> displayName
        SignupField.EMAIL -> email
        SignupField.PASSWORD -> password
        SignupField.PHONE -> null
    }
}

/**
 * Le cœur pur de l'inscription en UN écran : l'état immuable de la saisie, son
 * verdict local, et la charge qu'elle envoie.
 *
 * Il remplace les huit `RegistrationFields` du wizard et leurs cinq cœurs de
 * navigation. Ce qui disparaît avec eux n'est pas seulement du code : c'est
 * l'attente. Il n'y a plus de sonde de disponibilité, donc plus de bouton qui
 * reste gris une seconde après la dernière frappe, plus de verdict serveur à
 * franchir pour atteindre le champ suivant, et plus de refus découvert trois
 * écrans après le champ fautif — chaque refus se pose sous SON champ, à
 * l'envoi.
 *
 * Toute la normalisation est déléguée à [SignupFieldValidation] (le SSOT déjà
 * livré, partagé avec la récupération de compte et les réglages) et toute
 * l'inférence de région/langue à [SignupRegionInference] : ce type n'en
 * réimplémente aucune règle.
 *
 * @param displayName le nom affiché — la seule identité saisie.
 * @param dialCountryIso ISO 3166-1 alpha-2 du pays de l'indicatif choisi.
 * @param phoneDigits les chiffres nationaux, sans indicatif.
 * @param systemLanguage la langue de lecture (Prisme, rang 1).
 * @param regionalLanguage la langue de lecture secondaire (Prisme, rang 2) —
 *   déduite de la région, jamais montrée à la saisie.
 */
public data class SignupForm(
    val displayName: String = "",
    val email: String = "",
    val dialCountryIso: String = CountryCatalog.priority.first(),
    val phoneDigits: String = "",
    val password: String = "",
    val systemLanguage: String = SignupRegionInference.DEFAULT_LANGUAGE,
    val regionalLanguage: String = SignupRegionInference.SECONDARY_LANGUAGE,
) {

    /** L'indicatif E.164 du pays choisi (`"+33"`), ou `""` s'il est inconnu. */
    public val dialCode: String get() = CountryCatalog.dialCode(dialCountryIso).orEmpty()

    /** Les seuls chiffres de [phoneDigits] — la valeur qui part sur le fil. */
    public val normalizedPhoneDigits: String get() = SignupFieldValidation.phoneDigits(phoneDigits)

    /** Un numéro a été saisi — donc il voyage. Vide ⇒ absent de la charge. */
    public val hasPhone: Boolean get() = normalizedPhoneDigits.isNotEmpty()

    /**
     * Applique une saisie de téléphone, d'où qu'elle vienne — frappe, collage ou
     * remplissage automatique.
     *
     * Un numéro INTERNATIONAL (`+33…`, `0033…`) porte déjà son pays : le garder
     * tel quel dans le champ national le ferait partir avec l'indicatif EN
     * DOUBLE (`+33` + `33612…`). On en déduit donc le pays ([CountryCatalog.isoForPhoneNumber],
     * qui élit le plus long indicatif correspondant) et on ne garde que les
     * chiffres nationaux. C'est la complexité payée dans le CODE pour que le
     * collage d'un numéro complet — le geste le plus naturel — fonctionne sans
     * que l'utilisateur ait rien à comprendre.
     *
     * Tout le reste ne garde que ses chiffres et laisse le pays choisi
     * intact : un numéro national ne dit rien de son pays.
     */
    public fun withPhoneEntry(raw: String): SignupForm {
        val trimmed = raw.trim()
        val international = when {
            trimmed.startsWith("+") -> trimmed
            trimmed.startsWith("00") -> "+" + trimmed.substring(2)
            else -> null
        }
        val iso = international?.let { CountryCatalog.isoForPhoneNumber(it) }
            ?: return copy(phoneDigits = SignupFieldValidation.phoneDigits(raw))
        val dialDigits = SignupFieldValidation.phoneDigits(CountryCatalog.dialCode(iso).orEmpty())
        val national = SignupFieldValidation.phoneDigits(international).removePrefix(dialDigits)
        return copy(dialCountryIso = iso, phoneDigits = national)
    }

    /**
     * Le verdict local COMPLET — celui qui commande le bouton. Un champ vide y
     * porte déjà son refus : c'est ce qui garde « Créer mon compte » inactif
     * tant que le nom, l'e-mail et le mot de passe ne sont pas valides.
     */
    public fun validate(): SignupValidation = SignupValidation(
        displayName = displayNameIssue(),
        email = if (SignupFieldValidation.isEmailValidLocally(email.trim())) null else SignupFieldIssue.EMAIL_INVALID,
        password = if (password.length >= PASSWORD_MIN_LENGTH) null else SignupFieldIssue.PASSWORD_TOO_SHORT,
    )

    /** Le bouton est actif dès que nom, e-mail et mot de passe sont valides. */
    public val canSubmit: Boolean get() = validate().isValid

    /**
     * Le sous-ensemble de [validate] qu'on AFFICHE : un champ encore vide n'est
     * pas une faute, c'est un champ qu'on n'a pas rempli. Le bouton inactif le
     * dit déjà, et écrire « obligatoire » sous quatre champs vierges à
     * l'ouverture accueille l'utilisateur par quatre reproches.
     *
     * « Vide » au sens de la SAISIE, pas du contenu : des espaces sont quelque
     * chose que l'utilisateur a tapé, et le refus qu'ils valent doit se voir.
     */
    public fun visibleValidation(): SignupValidation {
        val all = validate()
        return SignupValidation(
            displayName = all.displayName?.takeIf { displayName.isNotEmpty() },
            email = all.email?.takeIf { email.isNotEmpty() },
            password = all.password?.takeIf { password.isNotEmpty() },
        )
    }

    /**
     * La charge exacte de `POST /auth/register` :
     * `{ displayName, email, password, systemLanguage, regionalLanguage?,
     * phoneNumber?, phoneCountryCode? }`.
     *
     * Le téléphone est OMIS quand aucun chiffre n'a été saisi — les deux champs
     * partent ensemble ou pas du tout, jamais un numéro sans son pays. La langue
     * régionale est omise quand elle est vide OU égale à la principale : servir
     * deux fois le même rang au Prisme ne lui apprend rien.
     *
     * Les chiffres partent TELS QUE TAPÉS, avec leur pays — jamais préfixés de
     * l'indicatif. Un « 06 12 34 56 78 » français composé en `+33` +
     * `0612345678` porte un préfixe national que l'E.164 ne connaît pas, et le
     * retirer soi-même se trompe dès l'Italie, dont les fixes GARDENT leur zéro.
     * La passerelle normalise avec `phoneCountryCode` (libphonenumber,
     * `normalizePhoneWithCountry`) : c'est son site unique, et c'est exactement
     * ce que le web v3 lui remet — le champ tel quel et l'ISO du sélecteur.
     */
    public fun toRegisterRequest(): RegisterRequest {
        val digits = normalizedPhoneDigits
        val system = systemLanguage.trim().ifBlank { SignupRegionInference.DEFAULT_LANGUAGE }
        val regional = regionalLanguage.trim().takeIf { it.isNotEmpty() && it != system }
        return RegisterRequest(
            displayName = displayName.trim(),
            email = SignupFieldValidation.normalizedEmail(email),
            password = password,
            systemLanguage = system,
            regionalLanguage = regional,
            phoneNumber = if (digits.isEmpty()) null else digits,
            phoneCountryCode = if (digits.isEmpty()) null else dialCountryIso,
        )
    }

    /**
     * Miroir de la seule règle de `personNamePatternSource`
     * (`^(?=.*\p{L})[\p{L}\p{M}\s'’ʼ.-]+$`, packages/shared/types/api-schemas/auth.ts)
     * qui vaille comme garde d'écran : **au moins une lettre**.
     *
     * Le jeu de caractères, lui, n'est PAS miroité : il borne `firstName` /
     * `lastName`, pas `displayName`, que les schémas partagés ne contraignent
     * qu'en longueur (`api-schemas/user.ts`, `maxLength: 100`). Un miroir plus
     * strict que le serveur refuserait ici des noms que la passerelle accepte —
     * et un refus client n'a pas de recours, là où un refus serveur revient
     * typé et se pose sous le champ.
     */
    private fun displayNameIssue(): SignupFieldIssue? {
        val trimmed = displayName.trim()
        return when {
            trimmed.length > DISPLAY_NAME_MAX_LENGTH -> SignupFieldIssue.DISPLAY_NAME_TOO_LONG
            trimmed.none(Char::isLetter) -> SignupFieldIssue.DISPLAY_NAME_REQUIRED
            else -> null
        }
    }

    public companion object {
        /**
         * `PASSWORD_MIN_LENGTH` (packages/shared/utils/validation.ts) et le
         * `minLength: 6` du schéma Ajv de `registerRequestSchema` — la même
         * borne, pour que la saisie ne franchisse jamais un écran qu'un
         * message Ajv brut refuserait à l'envoi.
         */
        public const val PASSWORD_MIN_LENGTH: Int = 6

        /** `displayName` du schéma partagé (`api-schemas/user.ts`, `maxLength: 100`). */
        public const val DISPLAY_NAME_MAX_LENGTH: Int = 100

        /**
         * Le formulaire pré-rempli depuis la locale de l'appareil : la langue de
         * lecture (rangs 1 et 2 du Prisme) et le pays de l'indicatif.
         *
         * Aucune de ces trois entrées n'est lue ici — le cœur reste sans
         * `Locale` : l'appelant fournit la langue et la région brutes
         * (`DeviceLocaleProvider` côté app), l'ensemble des codes de langue
         * servis ([LanguageStepSelection.pickerLanguages]) et celui des pays
         * connus ([CountryCatalog.dialCodes]).
         *
         * Une région inconnue laisse le pays au premier de [CountryCatalog.priority],
         * jamais vide : un bouton d'indicatif sans indicatif n'ouvre rien.
         */
        public fun defaults(
            deviceLanguage: String?,
            deviceRegion: String?,
            supportedLanguageCodes: Set<String>,
            knownCountryCodes: Set<String>,
        ): SignupForm {
            val languages = SignupRegionInference.inferLanguages(
                deviceLanguage = deviceLanguage,
                deviceRegion = deviceRegion,
                supportedLanguageCodes = supportedLanguageCodes,
            )
            val countryIso = SignupRegionInference.inferCountryIso(
                deviceRegion = deviceRegion,
                knownCountryCodes = knownCountryCodes,
            )
            return SignupForm(
                dialCountryIso = countryIso ?: CountryCatalog.priority.first(),
                systemLanguage = languages.systemLanguage,
                regionalLanguage = languages.regionalLanguage,
            )
        }
    }
}
