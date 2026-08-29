import SwiftUI
import UIKit
import Combine
import MeeshySDK

// MARK: - Registration Step

public enum RegistrationStep: Int, CaseIterable, Identifiable {
    case pseudo = 0
    case phone = 1
    case email = 2
    case identity = 3
    case password = 4
    case language = 5
    case profile = 6
    case recap = 7

    public var id: Int { rawValue }

    public var funHeader: String {
        switch self {
        case .pseudo: return String(localized: "auth.registration.header.pseudo", defaultValue: "Un pseudo unique, comme toi", bundle: .module)
        case .phone: return String(localized: "auth.registration.header.phone", defaultValue: "Ton numéro, ta clé de secours", bundle: .module)
        case .email: return String(localized: "auth.registration.header.email", defaultValue: "Ton email, ton filet de sécurité", bundle: .module)
        case .identity: return String(localized: "auth.registration.header.identity", defaultValue: "Dis-nous qui tu es", bundle: .module)
        case .password: return String(localized: "auth.registration.header.password", defaultValue: "Mets un code béton!", bundle: .module)
        case .language: return String(localized: "auth.registration.header.language", defaultValue: "Parle ta langue, on traduit", bundle: .module)
        case .profile: return String(localized: "auth.registration.header.profile", defaultValue: "Montre-toi sous ton plus beau jour", bundle: .module)
        case .recap: return String(localized: "auth.registration.header.recap", defaultValue: "Le monde t'attend!", bundle: .module)
        }
    }

    public var funSubtitle: String {
        switch self {
        case .pseudo:
            return String(localized: "auth.registration.subtitle.pseudo", defaultValue: "Choisis le nom que le monde va retenir — de Douala à Paris, de São Paulo à Tokyo. Sois créatif!", bundle: .module)
        case .phone:
            return String(localized: "auth.registration.subtitle.phone", defaultValue: "Il vérifie que ton compte est unique, sécurise tes engagements et te le rend si tu perds l'accès. Jamais affiché publiquement.", bundle: .module)
        case .email:
            return String(localized: "auth.registration.subtitle.email", defaultValue: "Indispensable pour récupérer ton compte et confirmer tes engagements. Zéro spam, promis!", bundle: .module)
        case .identity:
            return String(localized: "auth.registration.subtitle.identity", defaultValue: "Ton vrai nom, c'est ce qui permet à tes proches de te retrouver — et de prouver que ton compte est bien à toi.", bundle: .module)
        case .password:
            return String(localized: "auth.registration.subtitle.password", defaultValue: "Faut que ce soit fort comme le ndolé de maman! Minimum 8 caractères!", bundle: .module)
        case .language:
            return String(localized: "auth.registration.subtitle.language", defaultValue: "Choisis ta langue, Meeshy traduit tout: tes amis du Sénégal, du Canada, du Brésil, du Japon ou d'Australie te liront dans la leur.", bundle: .module)
        case .profile:
            return String(localized: "auth.registration.subtitle.profile", defaultValue: "Une belle photo et une bannière soignée ouvrent toutes les portes: c'est comme ça qu'on rencontre la crème de la crème, ici et sur les 5 continents.", bundle: .module)
        case .recap:
            return String(localized: "auth.registration.subtitle.recap", defaultValue: "Tu y es! Des rencontres t'attendent sur les 5 continents. Bienvenue dans la famille Meeshy!", bundle: .module)
        }
    }

    public var iconName: String {
        switch self {
        case .pseudo: return "person.crop.circle.badge.plus"
        case .phone: return "phone.badge.checkmark"
        case .email: return "envelope.badge"
        case .identity: return "person.text.rectangle"
        case .password: return "lock.shield"
        case .language: return "globe.europe.africa"
        case .profile: return "camera.badge.ellipsis"
        case .recap: return "checkmark.seal.fill"
        }
    }

    public var accentColor: Color {
        switch self {
        case .pseudo: return Color(red: 0.4, green: 0.6, blue: 1.0)
        case .phone: return Color(red: 0.3, green: 0.7, blue: 0.9)
        case .email: return Color(red: 0.95, green: 0.5, blue: 0.2)
        case .identity: return Color(red: 0.8, green: 0.3, blue: 0.6)
        case .password: return Color(red: 0.6, green: 0.4, blue: 1.0)
        case .language: return Color(red: 0.2, green: 0.8, blue: 0.5)
        case .profile: return Color(red: 0.95, green: 0.6, blue: 0.1)
        case .recap: return Color(red: 0.0, green: 0.78, blue: 0.35)
        }
    }
}

// MARK: - Registration ViewModel

@MainActor
public final class RegistrationViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    // MARK: - Step

    @Published public var currentStep: RegistrationStep = .pseudo

    // MARK: - Form Fields

    /// Le `didSet` est le point d'étranglement UNIQUE : il attrape la frappe, le
    /// collage, l'adoption d'une suggestion et la restauration d'état. La garde de
    /// ré-entrance est obligatoire — sans elle, la réassignation relance `didSet`
    /// en boucle.
    @Published public var username = "" {
        didSet {
            let sanitized = Self.sanitizedUsername(username)
            guard sanitized != username else { return }
            username = sanitized
        }
    }
    @Published public var phoneNumber = ""
    @Published public var selectedCountry = CountryPicker.countries[0]
    @Published public var skipPhone = false
    @Published public var email = ""
    @Published public var firstName = ""
    @Published public var lastName = ""
    @Published public var password = ""
    @Published public var confirmPassword = ""
    @Published public var systemLanguage = "fr"
    @Published public var regionalLanguage = "fr"
    @Published public var bio = ""
    @Published public var profileImage: UIImage?
    @Published public var bannerImage: UIImage?
    @Published public var acceptTerms = false

    // MARK: - API Validation State

    @Published public var isValidatingUsername = false
    @Published public var usernameAvailable: Bool?
    @Published public var usernameError: String?
    @Published public var usernameSuggestions: [String] = []

    @Published public var isValidatingEmail = false
    @Published public var emailAvailable: Bool?
    @Published public var emailError: String?

    @Published public var isValidatingPhone = false
    @Published public var phoneAvailable: Bool?
    @Published public var phoneNumberValid: Bool?
    @Published public var phoneError: String?
    /// Renseigné quand le numéro appartient déjà à un compte : porte les
    /// indices de récupération (compte dormant + identité ressemblante).
    @Published public var phoneOwnership: PhoneOwnershipResponse?

    // MARK: - General State

    @Published public var isLoading = false
    @Published public var errorMessage: String?

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private var usernameTask: Task<Void, Never>?
    private var emailTask: Task<Void, Never>?
    /// Dernière signature (numéro + identité) sondée pour la récupération, afin
    /// de ne pas relancer une requête réseau identique.
    private var lastOwnershipProbe: String?
    private var phoneTask: Task<Void, Never>?

    public let totalSteps = RegistrationStep.allCases.count

    // MARK: - Init

    public init() {
        detectCountry()
        detectLanguages()
        setupValidationDebounce()
    }

    // MARK: - Country Detection

    private func detectCountry() {
        guard let regionCode = Locale.current.region?.identifier.uppercased() else { return }
        if let match = CountryPicker.countries.first(where: { $0.id == regionCode }) {
            selectedCountry = match
        }
    }

    // MARK: - Language Detection

    private static let regionLanguageMap: [String: String] = [
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

    private func detectLanguages() {
        let availableIds = Set(LanguageSelector.defaultLanguages.map(\.id))

        if let langCode = Locale.current.language.languageCode?.identifier.lowercased(),
           availableIds.contains(langCode) {
            systemLanguage = langCode
        } else {
            systemLanguage = "fr"
        }

        if let regionCode = Locale.current.region?.identifier.uppercased(),
           let regionLang = Self.regionLanguageMap[regionCode],
           availableIds.contains(regionLang),
           regionLang != systemLanguage {
            regionalLanguage = regionLang
        } else {
            regionalLanguage = systemLanguage != "en" ? "en" : "fr"
        }
    }

    // MARK: - Phone Placeholder

    public var phonePlaceholder: String {
        switch selectedCountry.dialCode {
        case "+237": return "6 99 99 99 99"
        case "+33": return "06 12 34 56 78"
        case "+1": return "555 123 4567"
        case "+44": return "07123 456789"
        case "+234": return "801 234 5678"
        case "+225": return "07 12 34 56 78"
        case "+221": return "77 123 45 67"
        case "+243": return "81 234 5678"
        case "+49": return "0151 1234 5678"
        default: return "123 456 789"
        }
    }

    // MARK: - Combine Debounce

    private func setupValidationDebounce() {
        $username
            .debounce(for: .seconds(1), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] value in
                guard let self else { return }
                guard self.isUsernameValidLocally(value) else {
                    self.usernameAvailable = nil
                    self.usernameSuggestions = []
                    // Le champ était muet ici : il posait `nil` et renonçait, si
                    // bien qu'un pseudo trop court n'affichait jamais pourquoi le
                    // bouton restait gris.
                    self.usernameError = value.isEmpty ? nil : String(
                        localized: "auth.registration.usernameFormat",
                        defaultValue: "2 à 16 caractères : lettres, chiffres, - et _",
                        bundle: .module
                    )
                    return
                }
                self.checkUsernameAvailability(value)
            }
            .store(in: &cancellables)

        $email
            .debounce(for: .seconds(1), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] value in
                guard let self, self.isEmailValidLocally(value) else {
                    self?.emailAvailable = nil
                    self?.emailError = nil
                    return
                }
                self.checkEmailAvailability(value)
            }
            .store(in: &cancellables)

        $phoneNumber
            .debounce(for: .seconds(1), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] value in
                guard let self else { return }
                let digits = value.filter { $0.isNumber }
                guard digits.count >= 8 else {
                    self.phoneAvailable = nil
                    self.phoneError = nil
                    return
                }
                self.checkPhoneAvailability()
            }
            .store(in: &cancellables)
    }

    // MARK: - Local Validation
    //
    // Chaque règle DOIT être le miroir exact de `AuthSchemas.register`
    // (packages/shared/utils/validation.ts) : l'utilisateur qui atteint le
    // récapitulatif doit déjà être conforme au backend — aucune étape validée
    // localement ne peut être refusée par le serveur.

    /// Miroir ASCII strict de `usernamePatternSource` (`^[a-zA-Z0-9_-]+$`,
    /// packages/shared/types/api-schemas.ts). Déclaré caractère par caractère et
    /// NON via `CharacterSet.alphanumerics`, qui est Unicode : il acceptait `josé`
    /// que le serveur refuse, et le compte se faisait rejeter à la soumission.
    static let usernameAllowed = CharacterSet(charactersIn:
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")

    /// Longueur maximale acceptée par `registerRequestSchema.username`.
    static let usernameMaxLength = 16

    /// Retire tout caractère hors charset et borne la longueur. Silencieux, comme
    /// le filtrage web (`UsernameField.tsx`) : la ligne d'aide sous le champ
    /// énonce la règle en permanence, donc la disparition d'un caractère n'est
    /// pas mystérieuse.
    static func sanitizedUsername(_ value: String) -> String {
        let kept = value.unicodeScalars.filter { usernameAllowed.contains($0) }
        return String(String.UnicodeScalarView(kept.prefix(usernameMaxLength)))
    }

    func isUsernameValidLocally(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2, trimmed.count <= Self.usernameMaxLength else { return false }
        return CharacterSet(charactersIn: trimmed).isSubset(of: Self.usernameAllowed)
    }

    private func isEmailValidLocally(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.range(of: #"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$"#, options: .regularExpression) != nil
    }

    /// Miroir du pattern serveur `personNamePatternSource`
    /// (`^(?=.*\p{L})[\p{L}\p{M}\s'’ʼ.-]+$`) : lettres (accents et marques
    /// combinantes inclus — `CharacterSet.letters` couvre L* et M*), espaces,
    /// apostrophes droite ET typographiques (le clavier iOS insère `’`),
    /// points et tirets ; au moins une lettre ; 50 caractères max.
    public func isNameValidLocally(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed.count <= 50 else { return false }
        guard trimmed.unicodeScalars.contains(where: { CharacterSet.letters.contains($0) }) else { return false }
        let allowed = CharacterSet.letters
            .union(.whitespaces)
            .union(CharacterSet(charactersIn: "'’ʼ.-"))
        return trimmed.unicodeScalars.allSatisfy { allowed.contains($0) }
    }

    /// Erreur affichable sous le champ nom/prénom — `nil` tant que le champ est
    /// vide (le bouton désactivé suffit) ou que la saisie est conforme.
    public func nameFieldError(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return isNameValidLocally(trimmed)
            ? nil
            : String(localized: "auth.registration.nameInvalid", defaultValue: "Lettres, espaces, apostrophes, points et tirets uniquement", bundle: .module)
    }

    public var firstNameError: String? { nameFieldError(firstName) }
    public var lastNameError: String? { nameFieldError(lastName) }

    // MARK: - API Validation

    private func checkUsernameAvailability(_ value: String) {
        usernameTask?.cancel()
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

        usernameTask = Task {
            isValidatingUsername = true
            defer { isValidatingUsername = false }

            do {
                let result = try await AuthService.shared.checkAvailability(username: trimmed)
                guard !Task.isCancelled else { return }

                usernameAvailable = result.available
                usernameSuggestions = result.suggestions ?? []
                usernameError = result.available ? nil : String(localized: "auth.registration.usernameTaken", defaultValue: "Ce pseudo est deja pris!", bundle: .module)
            } catch {
                guard !Task.isCancelled else { return }
                usernameAvailable = true
                usernameError = String(localized: "auth.registration.verificationFailed", defaultValue: "Verification non effectuee", bundle: .module)
            }
        }
    }

    private func checkEmailAvailability(_ value: String) {
        emailTask?.cancel()
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()

        emailTask = Task {
            isValidatingEmail = true
            defer { isValidatingEmail = false }

            do {
                let result = try await AuthService.shared.checkAvailability(email: trimmed)
                guard !Task.isCancelled else { return }

                // Le serveur ne dit plus si l'adresse appartient à un compte
                // (#4158) : il n'en juge que la FORME. C'est la soumission de
                // l'inscription qui tranchera, avec une réponse générique.
                emailAvailable = result.wellFormed
                emailError = result.wellFormed
                    ? nil
                    : String(localized: "auth.registration.emailInvalid", defaultValue: "Cette adresse ne semble pas valide", bundle: .module)
            } catch {
                guard !Task.isCancelled else { return }
                emailAvailable = true
                emailError = String(localized: "auth.registration.verificationFailed", defaultValue: "Verification non effectuee", bundle: .module)
            }
        }
    }

    private func checkPhoneAvailability() {
        phoneTask?.cancel()
        let fullPhone = selectedCountry.dialCode + phoneNumber.filter { $0.isNumber }
        let country = selectedCountry.id
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        let last = lastName.trimmingCharacters(in: .whitespacesAndNewlines)

        phoneTask = Task {
            isValidatingPhone = true
            defer { isValidatingPhone = false }

            do {
                let result = try await AuthService.shared.checkAvailability(phone: fullPhone)
                guard !Task.isCancelled else { return }

                phoneNumberValid = result.phoneNumberValid
                // Le serveur ne dit plus si le NUMÉRO appartient à un compte
                // (#4158) — le dire sans authentification était une
                // dé-anonymisation de numéro de téléphone.
                phoneAvailable = result.wellFormed
                if result.phoneNumberValid == false {
                    phoneError = String(localized: "auth.registration.phoneInvalid", defaultValue: "Ce numero semble invalide", bundle: .module)
                    phoneOwnership = nil
                } else {
                    // La RÉCUPÉRATION de compte survit sans l'oracle : elle passe
                    // par `/auth/phone-transfer/check`, qui n'ouvre sa réponse
                    // qu'à un appelant sachant déjà le vrai nom
                    // (`recoverySuggested`). On la sonde donc sur tout numéro
                    // BIEN FORMÉ, au lieu d'attendre un « déjà pris » que le
                    // serveur ne dit plus.
                    await probePhoneOwnership(fullPhone: fullPhone, country: country, firstName: first, lastName: last)
                    // `phoneOwnership` n'est PAS remis à nil ici : la sonde
                    // vient de le renseigner, et l'effacer annulerait le seul
                    // signal de récupération qui reste.
                    phoneError = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                phoneAvailable = true
                phoneNumberValid = nil
                phoneError = String(localized: "auth.registration.verificationFailed", defaultValue: "Verification non effectuee", bundle: .module)
                phoneOwnership = nil
            }
        }
    }

    private func probePhoneOwnership(fullPhone: String, country: String, firstName: String, lastName: String) async {
        // Ne re-sonde pas une signature identique (numéro + identité déjà connue).
        let signature = "\(fullPhone)|\(firstName)|\(lastName)"
        guard signature != lastOwnershipProbe else { return }

        do {
            let ownership = try await AuthService.shared.checkPhoneOwnership(
                phone: fullPhone,
                countryCode: country,
                firstName: firstName.isEmpty ? nil : firstName,
                lastName: lastName.isEmpty ? nil : lastName
            )
            guard !Task.isCancelled else { return }
            lastOwnershipProbe = signature
            phoneOwnership = ownership
        } catch {
            guard !Task.isCancelled else { return }
            phoneOwnership = nil
        }
    }

    /// Vrai quand le numéro saisi appartient à un compte dormant dont
    /// l'identité ressemble à celle déclarée — on propose la récupération.
    public var phoneRecoverySuggested: Bool {
        phoneOwnership?.recoverySuggested == true
    }

    /// Vrai dès que le numéro appartient à un compte existant (récupérable ou non).
    public var phoneBelongsToExistingAccount: Bool {
        phoneOwnership?.exists == true
    }

    // MARK: - Username Suggestion

    public func selectSuggestion(_ suggestion: String) {
        username = suggestion
        usernameAvailable = true
        usernameError = nil
        usernameSuggestions = []
    }

    // MARK: - Can Proceed

    public var canProceed: Bool {
        switch currentStep {
        case .pseudo:
            return isUsernameValidLocally(username) && usernameAvailable == true
        case .phone:
            let digits = phoneNumber.filter { $0.isNumber }
            return skipPhone || (digits.count >= 8 && phoneAvailable == true)
        case .email:
            return isEmailValidLocally(email) && emailAvailable == true
        case .identity:
            return isNameValidLocally(firstName) && isNameValidLocally(lastName)
        case .password:
            return password.count >= 8 && password == confirmPassword
        case .language:
            return !systemLanguage.isEmpty
        case .profile:
            return true
        case .recap:
            return acceptTerms
        }
    }

    // MARK: - Navigation

    public func nextStep() {
        guard canProceed else { return }
        let allSteps = RegistrationStep.allCases
        if let idx = allSteps.firstIndex(of: currentStep), idx < allSteps.count - 1 {
            withAnimation(.spring(response: 0.3)) {
                currentStep = allSteps[idx + 1]
            }
        }
    }

    public func previousStep() {
        let allSteps = RegistrationStep.allCases
        if let idx = allSteps.firstIndex(of: currentStep), idx > 0 {
            withAnimation(.spring(response: 0.3)) {
                currentStep = allSteps[idx - 1]
            }
        }
    }

    public func skipCurrentStep() {
        if currentStep == .phone {
            skipPhone = true
            phoneNumber = ""
        }
        nextStepForced()
    }

    private func nextStepForced() {
        let allSteps = RegistrationStep.allCases
        if let idx = allSteps.firstIndex(of: currentStep), idx < allSteps.count - 1 {
            withAnimation(.spring(response: 0.3)) {
                currentStep = allSteps[idx + 1]
            }
        }
    }

    // MARK: - Register

    public func register() async {
        isLoading = true
        errorMessage = nil

        let fullPhone = phoneNumber.isEmpty ? nil : selectedCountry.dialCode + phoneNumber.filter { $0.isNumber }

        let request = RegisterRequest(
            username: username.trimmingCharacters(in: .whitespacesAndNewlines),
            password: password,
            firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
            lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
            email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            phoneNumber: fullPhone,
            phoneCountryCode: phoneNumber.isEmpty ? nil : selectedCountry.id,
            systemLanguage: systemLanguage,
            regionalLanguage: regionalLanguage
        )

        await AuthManager.shared.register(request: request)
        isLoading = false

        if !AuthManager.shared.isAuthenticated {
            errorMessage = AuthManager.shared.errorMessage ?? String(localized: "auth.registration.registrationFailed", defaultValue: "Erreur lors de l'inscription", bundle: .module)
        }
    }

    // MARK: - Summary Items

    public var summaryItems: [(icon: String, label: String, value: String)] {
        var items: [(String, String, String)] = [
            ("at", "Utilisateur", username),
            ("envelope.fill", "Email", email),
            ("person.fill", "Nom", "\(firstName) \(lastName)"),
        ]
        if !phoneNumber.isEmpty {
            items.append(("phone.fill", "Telephone", "\(selectedCountry.dialCode) \(phoneNumber)"))
        }
        items.append(("globe", "Langues", "\(systemLanguage) / \(regionalLanguage)"))
        if !bio.isEmpty {
            items.append(("text.quote", "Bio", bio))
        }
        return items
    }
}
