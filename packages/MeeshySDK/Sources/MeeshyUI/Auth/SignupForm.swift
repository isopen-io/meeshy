import Foundation
import MeeshySDK

/// Ce que l'écran d'inscription SAIT, sans rien de ce qu'il MONTRE.
///
/// Une `struct` pure : quatre saisies (nom, e-mail, téléphone, mot de passe),
/// le pays de l'indicatif, les deux rangs du Prisme, leurs règles locales, et la
/// composition de la charge `POST /auth/register`. Aucun réseau, aucun
/// singleton, aucune horloge — donc entièrement éprouvable sans simulateur.
///
/// ### Pourquoi au SDK, et non côté app
///
/// Le test du grain de `packages/MeeshySDK/CLAUDE.md` la place ici sur ses
/// quatre questions : elle prend des paramètres OPAQUES (une `Locale`), ne lit
/// aucun singleton nommé Meeshy, ne résout aucune URL et n'applique aucune
/// cascade de replis UX. Ce qu'elle encode n'est pas une décision produit mais
/// le CONTRAT de `RegisterRequest`, un type du SDK : quels champs partent, et
/// lesquels sont absents quand ils sont vides. La décision produit — quand
/// envoyer, quoi afficher d'un refus, où mener après — vit dans
/// `SignupViewModel`, côté app.
///
/// La ligne se lit ainsi : **la forme SAIT composer la charge ; elle ne sait pas
/// qu'un bouton existe.**
public struct SignupForm: Equatable {

    // MARK: - Saisies

    /// Le pseudo et le nom affiché TAPÉS (#6479, refaits par #7897).
    ///
    /// `nil` = jamais touché : le champ SUIT l'adresse en direct. Une chaîne =
    /// la saisie, qui gagne ; vidée, la dérivation reparaît en filigrane et
    /// repart. L'écran montre `effectiveUsername` / `effectiveDisplayName` et
    /// écrit ici. Miroir de `SignupFormState` (`apps/web/src/lib/signup-form.ts`).
    public var username: String?
    public var displayName: String?
    public var email: String
    /// Les chiffres SEULS, sans indicatif : l'indicatif vient de `country`.
    public var phoneDigits: String
    public var password: String
    /// Le pays de l'indicatif téléphonique, pré-sélectionné depuis la locale.
    public var country: CountryCode
    /// Rang 1 du Prisme — la langue dans laquelle l'utilisateur LIRA Meeshy.
    public var systemLanguage: String
    /// Rang 2, déduit de la RÉGION et jamais montré : un francophone au Canada
    /// lit en français, et l'anglais reste servi quand le français manque.
    public var regionalLanguage: String

    // MARK: - Règles locales
    //
    // Miroirs de `AuthSchemas.register` (packages/shared/utils/validation.ts).
    // Elles ne dupliquent PAS le serveur : elles évitent d'envoyer une charge
    // dont on sait déjà qu'elle sera refusée. Le serveur reste l'arbitre.

    /// Longueur maximale d'un nom affiché — **100**, la valeur du schéma serveur
    /// (`AuthSchemas.register.displayName`, `z.string().min(1).max(100)`).
    ///
    /// Ce n'est PAS la limite de `firstName`/`lastName` (50 chacun) : ceux-là ne
    /// partent plus, la passerelle les dérive. Recopier 50 ici rendrait le
    /// client plus STRICT que le serveur — un refus local pour une saisie que la
    /// passerelle aurait acceptée, ce qui est le défaut le plus difficile à
    /// diagnostiquer d'une validation miroir : rien ne rougit nulle part.
    public static let displayNameMaxLength = 100

    /// Longueur minimale du mot de passe — **6**, miroir de
    /// `PASSWORD_MIN_LENGTH` (`packages/shared/utils/validation.ts`).
    ///
    /// C'est la SEULE source du minimum côté client : le placeholder du champ
    /// l'annonce, la validation locale l'applique. Le dépôt n'emploie nulle part
    /// `UITextInputPasswordRules`, et ce lot ne l'introduit pas — la règle n'y
    /// serait pas plus vraie, seulement écrite une deuxième fois, dans une API
    /// que la cible iOS 16 de l'app ne sert pas partout.
    public static let passwordMinLength = 6

    /// Miroir du pattern serveur `personNamePatternSource`
    /// (`^(?=.*\p{L})[\p{L}\p{M}\s'’ʼ.-]+$`) : lettres (accents et marques
    /// combinantes incluses — `CharacterSet.letters` couvre L* et M*), espaces,
    /// apostrophes droite ET typographiques (le clavier iOS insère `’`), points
    /// et tirets ; au moins une lettre ; `displayNameMaxLength` caractères au plus.
    ///
    /// Un nom FOURNI tient le pattern et la borne ; un champ VIDE est valide,
    /// parce qu'il est LÉGITIME (#6441, suite de #6424) — la passerelle le
    /// DÉRIVE alors de la partie locale de l'adresse (`displayNameDepuisEmail`,
    /// `services/gateway/src/services/auth/registration-identity.ts`). C'est le
    /// même arbitrage que `isPasswordValid` ci-dessous, et le doc-comment de
    /// `displayNameMaxLength` nomme déjà le défaut qu'il écarte : un refus
    /// local pour une charge que la passerelle ACCEPTE, et rien ne rougit
    /// nulle part.
    public static func isDisplayNameValid(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return true }
        guard trimmed.count <= displayNameMaxLength else { return false }
        guard trimmed.unicodeScalars.contains(where: { CharacterSet.letters.contains($0) }) else { return false }
        let allowed = CharacterSet.letters
            .union(.whitespaces)
            .union(CharacterSet(charactersIn: "'’ʼ.-"))
        return trimmed.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    /// Rapprochement du `z.email` serveur : « a@b » et « alice@com. » le
    /// passaient quand la règle était « contient @ et . ».
    public static func isEmailValid(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: #"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil
    }

    /// Un mot de passe FOURNI doit atteindre la borne ; un champ VIDE est
    /// valide, parce qu'il est LÉGITIME (#6424).
    ///
    /// Le compte naît alors sans mot de passe, et sa porte est le lien magique.
    /// Garder l'ancienne règle ici rendrait le client plus strict que le
    /// serveur — le défaut que le doc-comment de `displayNameMaxLength` nomme
    /// juste au-dessus : un refus local pour une charge que la passerelle
    /// accepte, et rien ne rougit nulle part.
    public static func isPasswordValid(_ value: String) -> Bool {
        value.isEmpty || value.count >= passwordMinLength
    }

    /// `true` quand l'utilisateur a réellement TAPÉ un mot de passe.
    ///
    /// Distinct de `isPasswordValid`, qui répond « cette saisie est-elle
    /// acceptable ». Celle-ci répond « y a-t-il une saisie », et c'est elle qui
    /// décide si la clé part dans la charge.
    public static func hasPassword(_ value: String) -> Bool { !value.isEmpty }

    /// `true` quand l'utilisateur a réellement TAPÉ un nom affiché.
    ///
    /// Jumelle de `hasPassword` : `isDisplayNameValid` répond « cette saisie
    /// est-elle acceptable », celle-ci « y a-t-il une saisie » — et c'est elle
    /// qui décide si la clé part dans la charge.
    public static func hasDisplayName(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    public var isDisplayNameValid: Bool { Self.isDisplayNameValid(displayName ?? "") }
    public var isEmailValid: Bool { Self.isEmailValid(email) }
    public var isPasswordValid: Bool { Self.isPasswordValid(password) }
    public var hasPassword: Bool { Self.hasPassword(password) }
    public var hasDisplayName: Bool { Self.hasDisplayName(displayName ?? "") }

    /// LE PSEUDO QUI PARTIRA — tapé s'il l'a été, tiré de l'ADRESSE sinon
    /// (#6479, #7897 : « le pseudo rempli à partir de l'email »).
    ///
    /// `resoudreUsername` (`registration.service.ts`) emploie tel quel un
    /// pseudo fourni. Rend `""` quand la dérivation retombe sur le RECOURS
    /// (`user`) : l'envoyer garantirait une collision.
    public var effectiveUsername: String {
        let tape = (username ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !tape.isEmpty { return tape }
        let derive = RegistrationIdentity.pseudoRacine(displayName: nil, email: email)
        return derive == RegistrationIdentity.pseudoDeSecours ? "" : derive
    }

    /// Le nom affiché qui partira — tapé s'il l'a été, dérivé de l'adresse sinon.
    public var effectiveDisplayName: String {
        let tape = (displayName ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return tape.isEmpty ? RegistrationIdentity.displayNameDepuisEmail(email) : tape
    }

    /// L'IDENTITÉ EST DÉFINIE (#7897) — nom affiché ET pseudo existent et
    /// tiennent leurs bornes. Directive porteur : « c'est quand tout est
    /// défini qu'on active le champ mot de passe ».
    public var isIdentityDefined: Bool {
        isEmailValid
            && !effectiveDisplayName.isEmpty
            && Self.isDisplayNameValid(effectiveDisplayName)
            && !effectiveUsername.isEmpty
    }

    /// Un numéro FOURNI doit être plausible (#6479) ; un champ VIDE reste
    /// valide — il n'est pas requis. Troisième champ à porter cette forme,
    /// après le mot de passe et le nom affiché.
    public var isPhoneValid: Bool { PhonePlausibility.isPlausible(phoneDigits) }

    /// Le MOTIF du refus, pour que l'écran dise quoi corriger — « numéro
    /// invalide » n'apprend rien à qui a tapé le sien de travers.
    public var phoneRefusal: PhonePlausibility.Refusal? { PhonePlausibility.refusal(phoneDigits) }

    /// Le bouton s'active dès que l'ADRESSE est valide — et que le nom affiché,
    /// le mot de passe et le NUMÉRO, s'ils ont été tapés, tiennent leurs bornes
    /// (#6441, #6479).
    ///
    /// L'adresse est le SEUL champ requis, exactement comme le
    /// `required: ['email']` du schéma partagé : ni le nom, ni le téléphone, ni
    /// le mot de passe ne sont exigés par la passerelle. Rien ici ne dépend du
    /// réseau — aucun appel de disponibilité ne précède l'envoi.
    public var canSubmit: Bool {
        isDisplayNameValid && isEmailValid && isPasswordValid && isPhoneValid
    }

    // MARK: - Téléphone

    /// Les chiffres saisis, débarrassés de tout ce qui n'en est pas (espaces,
    /// points, parenthèses collées depuis un carnet d'adresses).
    public var normalizedPhoneDigits: String {
        phoneDigits.filter(\.isNumber)
    }

    public var hasPhone: Bool { !normalizedPhoneDigits.isEmpty }

    // MARK: - Composition de la charge

    /// La charge exacte de `POST /auth/register`.
    ///
    /// Sept clés au plus, et jamais `username` / `firstName` / `lastName` : la
    /// passerelle les dérive de `displayName`. Le couple téléphone est TOUT ou
    /// RIEN — un `phoneCountryCode` sans numéro décrirait un pays qui ne
    /// qualifie rien.
    ///
    /// Les chiffres partent TELS QUE TAPÉS, avec leur pays — jamais préfixés
    /// de l'indicatif. Un « 06 12 34 56 78 » français composé en `+33` +
    /// `0612345678` porte un préfixe national que l'E.164 ne connaît pas, et
    /// retirer ce zéro soi-même se trompe dès l'Italie, dont les fixes le
    /// GARDENT. La passerelle normalise avec `phoneCountryCode`
    /// (libphonenumber, `normalizePhoneWithCountry`) : c'est son site unique,
    /// et c'est exactement ce que le web v3 lui remet — le champ tel quel et
    /// l'ISO du sélecteur.
    public func registerRequest() -> RegisterRequest {
        let phone = hasPhone ? normalizedPhoneDigits : nil
        return RegisterRequest(
            // CE QUE L'ÉCRAN MONTRE EST CE QU'IL ENVOIE (#6479) — dérivé ou
            // tapé, peu importe : dès qu'une valeur existe, la passerelle n'a
            // plus à en inventer une. Les deux clés restent `nil` quand il n'y
            // a réellement rien, et `nil` — jamais `""`, que `minLength: 1`
            // refuserait.
            displayName: effectiveDisplayName.isEmpty ? nil : effectiveDisplayName,
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            // `nil`, jamais `""` (#6424) : la passerelle lit l'ABSENCE de la
            // clé pour créer un compte sans mot de passe. Une chaîne vide
            // serait une VALEUR, refusée par la borne de longueur — le
            // formulaire échouerait précisément dans le cas qu'il vient
            // d'ouvrir.
            password: hasPassword ? password : nil,
            phoneNumber: phone,
            phoneCountryCode: phone == nil ? nil : country.id,
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage,
            username: effectiveUsername.isEmpty ? nil : effectiveUsername
        )
    }

    // MARK: - Défauts déduits d'une locale

    /// Région → langue régionale (rang 2 du Prisme). Repris tel quel du wizard
    /// remplacé : la table est la seule chose qu'il avait de juste sur ce point.
    static let regionLanguageMap: [String: String] = [
        "CM": "fr", "FR": "fr", "BE": "fr", "CH": "fr", "CA": "fr", "SN": "fr", "CI": "fr", "CD": "fr", "MG": "fr",
        "US": "en", "GB": "en", "AU": "en", "NZ": "en", "IE": "en", "ZA": "en", "NG": "en", "GH": "en", "KE": "en",
        "ES": "es", "MX": "es", "AR": "es", "CO": "es", "CL": "es", "PE": "es",
        "DE": "de", "AT": "de",
        "IT": "it",
        "PT": "pt", "BR": "pt",
        "SA": "ar", "AE": "ar", "EG": "ar", "MA": "ar", "DZ": "ar", "TN": "ar",
        "CN": "zh", "TW": "zh", "HK": "zh",
        "JP": "ja",
        "KR": "ko",
        "RU": "ru",
        "TR": "tr",
        "NL": "nl",
        "PL": "pl",
        "SE": "sv",
        "IN": "hi",
        "TH": "th",
        "VN": "vi",
        "UA": "uk",
        "RO": "ro",
    ]

    /// Repli ultime quand la locale ne dit rien d'exploitable.
    public static let fallbackLanguage = "fr"

    /// La langue de l'appareil si Meeshy la sert, sinon `fr`.
    public static func defaultSystemLanguage(for locale: Locale) -> String {
        guard let code = locale.language.languageCode?.identifier.lowercased(),
              LanguageData.supportedCodeSet.contains(code) else { return fallbackLanguage }
        return code
    }

    /// La langue de la RÉGION, quand elle diffère du rang 1 ; sinon l'anglais —
    /// ou le français si le rang 1 est déjà l'anglais.
    ///
    /// Elle ne se montre pas : deux rangs suffisent au Prisme, et faire choisir
    /// le second coûterait un écran pour un réglage que personne ne demande.
    public static func defaultRegionalLanguage(for locale: Locale, systemLanguage: String) -> String {
        if let region = locale.region?.identifier.uppercased(),
           let regional = regionLanguageMap[region],
           LanguageData.supportedCodeSet.contains(regional),
           regional != systemLanguage {
            return regional
        }
        return systemLanguage != "en" ? "en" : fallbackLanguage
    }

    /// Le pays de l'appareil, à défaut le premier de la liste (la France, tête
    /// de `CountryPicker.countries` par ordre de priorité).
    public static func defaultCountry(for locale: Locale) -> CountryCode {
        let fallback = CountryPicker.countries[0]
        guard let region = locale.region?.identifier.uppercased() else { return fallback }
        return CountryPicker.countries.first { $0.id == region } ?? fallback
    }

    /// Une forme vierge dont les défauts SONT déjà justes : pays, langue lue,
    /// langue régionale. Rien à configurer avant de commencer à taper.
    public init(locale: Locale = .current) {
        let system = Self.defaultSystemLanguage(for: locale)
        self.username = nil
        self.displayName = nil
        self.email = ""
        self.phoneDigits = ""
        self.password = ""
        self.country = Self.defaultCountry(for: locale)
        self.systemLanguage = system
        self.regionalLanguage = Self.defaultRegionalLanguage(for: locale, systemLanguage: system)
    }

    /// Initialiseur complet — les suites l'emploient pour poser un état sans
    /// rejouer la saisie champ par champ.
    public init(
        username: String? = nil,
        displayName: String?,
        email: String,
        phoneDigits: String = "",
        password: String,
        country: CountryCode,
        systemLanguage: String,
        regionalLanguage: String
    ) {
        self.username = username
        self.displayName = displayName
        self.email = email
        self.phoneDigits = phoneDigits
        self.password = password
        self.country = country
        self.systemLanguage = systemLanguage
        self.regionalLanguage = regionalLanguage
    }

    // MARK: - Libellé de la langue lue

    /// « Français », « English »… — le nom NATIF de la langue de lecture, tel
    /// que la pastille l'affiche. Le nom natif, et non traduit : c'est celui que
    /// son locuteur reconnaît, quelle que soit la langue du reste de l'écran.
    public var systemLanguageNativeName: String {
        LanguageData.info(for: systemLanguage)?.nativeName ?? systemLanguage.uppercased()
    }

    public var systemLanguageFlag: String {
        LanguageData.info(for: systemLanguage)?.flag ?? "🌐"
    }
}
