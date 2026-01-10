//
//  NewRegistrationViewModel.swift
//  Meeshy
//
//  v4 - ViewModel avec 8 étapes et validation API
//  Style Meeshy avec humour local et icons SF Symbols
//

import SwiftUI
import Combine
import UIKit

// MARK: - Registration Step (8 étapes)

enum NewRegistrationStep: Int, CaseIterable, Identifiable {
    case pseudo = 0        // 1. Pseudo avec validation API
    case phone = 1         // 2. Téléphone (obligatoire)
    case email = 2         // 3. Email avec validation API
    case identity = 3      // 4. Prénom + Nom
    case password = 4      // 5. Mot de passe + Confirmation
    case language = 5      // 6. Langue principale
    case profile = 6       // 7. Profil optionnel (photo, banner, bio)
    case complete = 7      // 8. Récapitulatif

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .pseudo: return "Pseudo"
        case .phone: return "Téléphone"
        case .email: return "Email"
        case .identity: return "Identité"
        case .password: return "Mot de passe"
        case .language: return "Langue"
        case .profile: return "Profil"
        case .complete: return "C'est parti!"
        }
    }

    // MARK: - Headers avec style Meeshy

    var funHeader: String {
        switch self {
        case .pseudo:
            return "C'est comment mon gars?"
        case .phone:
            return "Ton numéro pour le kwatt!"
        case .email:
            return "Ton adresse là, c'est quoi?"
        case .identity:
            return "Dis-moi ton nom!"
        case .password:
            return "Mets un code béton!"
        case .language:
            return "Tu parles quoi même?"
        case .profile:
            return "Montre-toi un peu!"
        case .complete:
            return "On est ensemble!"
        }
    }

    var funSubtitle: String {
        switch self {
        case .pseudo:
            return "Choisis un nom de boss que tout Meeshy va connaître! Sois créatif, pas de ngomna ici!"
        case .phone:
            return "On va t'envoyer un code pour vérifier que c'est bien toi. C'est obligatoire mon frère!"
        case .email:
            return "Ton email c'est ta carte d'identité sur internet. On va pas te spam, on est pas des escrocs!"
        case .identity:
            return "Ton vrai nom pour que tes amis te reconnaissent. On est entre nous sur Meeshy!"
        case .password:
            return "Faut que ce soit fort comme le ndolé de maman! Minimum 8 caractères, sinon c'est faible!"
        case .language:
            return "Tous tes messages vont être traduits dans cette langue là. C'est la magie de Meeshy!"
        case .profile:
            return "Mets ta plus belle photo et dis au monde qui tu es! C'est optionnel mais ça fait du bien."
        case .complete:
            return "Tu es dedans maintenant! Bienvenue dans la famille Meeshy, on va faire les choses en grand!"
        }
    }

    var iconName: String {
        switch self {
        case .pseudo: return "person.crop.circle.badge.plus"
        case .phone: return "phone.badge.checkmark"
        case .email: return "envelope.badge"
        case .identity: return "person.text.rectangle"
        case .password: return "lock.shield"
        case .language: return "globe.europe.africa"
        case .profile: return "camera.badge.ellipsis"
        case .complete: return "checkmark.seal.fill"
        }
    }

    var accentColor: Color {
        switch self {
        case .pseudo: return Color(red: 0.4, green: 0.6, blue: 1.0)      // Bleu
        case .phone: return Color(red: 0.3, green: 0.7, blue: 0.9)       // Cyan
        case .email: return Color(red: 0.95, green: 0.5, blue: 0.2)      // Orange
        case .identity: return Color(red: 0.8, green: 0.3, blue: 0.6)    // Rose
        case .password: return Color(red: 0.6, green: 0.4, blue: 1.0)    // Violet
        case .language: return Color(red: 0.2, green: 0.8, blue: 0.5)    // Vert
        case .profile: return Color(red: 0.95, green: 0.6, blue: 0.1)    // Or
        case .complete: return Color(red: 0.0, green: 0.78, blue: 0.35)  // Vert Meeshy
        }
    }

    var motivationalQuote: String {
        switch self {
        case .pseudo:
            return "\"Un nom, c'est une identité. Choisis bien!\" - Sagesse Meeshy"
        case .phone:
            return "\"Le téléphone rapproche ceux qui sont loin.\" - Proverbe moderne"
        case .email:
            return "\"La communication, c'est la base de tout.\" - Les anciens"
        case .identity:
            return "\"Ton nom, c'est ton histoire.\" - Sagesse africaine"
        case .password:
            return "\"Ce qui est bien gardé dure longtemps.\" - Les sages"
        case .language:
            return "\"Qui parle plusieurs langues vit plusieurs vies.\" - Proverbe africain"
        case .profile:
            return "\"Une image vaut mille mots.\" - Dicton universel"
        case .complete:
            return "\"Ensemble, on est plus forts!\" - Ubuntu"
        }
    }
}

// MARK: - New Registration ViewModel

@MainActor
final class NewRegistrationViewModel: ObservableObject {

    // MARK: - Published Properties

    @Published var currentStep: NewRegistrationStep = .pseudo
    @Published var isLoading = false
    @Published var isValidatingAPI = false
    @Published var errorMessage: String?
    @Published var showError = false

    // Step 1: Pseudo
    @Published var username: String = ""
    @Published var usernameError: String?
    @Published var usernameAvailable: Bool?
    @Published var usernameSuggestions: [String] = []

    // Step 2: Phone (obligatoire)
    @Published var phoneCountryCode: String = "+237" // Cameroun par défaut
    @Published var phoneNumber: String = ""
    @Published var phoneError: String?
    @Published var phoneAvailable: Bool?

    // Step 3: Email
    @Published var email: String = ""
    @Published var emailError: String?
    @Published var emailAvailable: Bool?

    // Step 4: Identity
    @Published var firstName: String = ""
    @Published var lastName: String = ""
    @Published var firstNameError: String?
    @Published var lastNameError: String?

    // Step 5: Password (les 2 champs dans la même vue)
    @Published var password: String = ""
    @Published var confirmPassword: String = ""
    @Published var passwordError: String?
    @Published var confirmPasswordError: String?
    @Published var showConfirmField: Bool = false

    // Step 6: Language
    @Published var primaryLanguage: String = "fr"

    // Step 7: Profile (optionnel)
    @Published var profilePhoto: UIImage?
    @Published var bannerPhoto: UIImage?
    @Published var bio: String = ""
    @Published var displayName: String = ""

    // Registration complete
    @Published var registrationComplete = false
    @Published var acceptedTerms = false

    // MARK: - Cancellables
    private var cancellables = Set<AnyCancellable>()
    private var validationTask: Task<Void, Never>?

    // MARK: - Init

    init() {
        setupPasswordValidation()
    }

    private func setupPasswordValidation() {
        // Afficher le champ de confirmation quand le mot de passe est valide
        $password
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .sink { [weak self] pwd in
                guard let self = self else { return }
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    self.showConfirmField = pwd.count >= 8
                }
            }
            .store(in: &cancellables)
    }

    // MARK: - Computed Properties

    var progress: Double {
        Double(currentStep.rawValue) / Double(NewRegistrationStep.allCases.count - 1)
    }

    var canProceed: Bool {
        switch currentStep {
        case .pseudo:
            return isUsernameValid && usernameAvailable == true
        case .phone:
            return isPhoneValid && phoneAvailable == true
        case .email:
            return isEmailValid && emailAvailable == true
        case .identity:
            return isFirstNameValid && isLastNameValid
        case .password:
            return isPasswordValid && isConfirmPasswordValid
        case .language:
            return !primaryLanguage.isEmpty
        case .profile:
            return true // Optionnel
        case .complete:
            return acceptedTerms
        }
    }

    var isUsernameValid: Bool {
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.count >= 3 && trimmed.count <= 30 && !trimmed.contains(" ")
    }

    var isPhoneValid: Bool {
        let digits = phoneNumber.filter { $0.isNumber }
        return digits.count >= 8 && digits.count <= 15
    }

    var isEmailValid: Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let predicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return predicate.evaluate(with: email)
    }

    var isFirstNameValid: Bool {
        firstName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    var isLastNameValid: Bool {
        lastName.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    var isPasswordValid: Bool {
        password.count >= 8
    }

    var isConfirmPasswordValid: Bool {
        !confirmPassword.isEmpty && confirmPassword == password
    }

    var passwordStrength: PasswordStrength {
        PasswordStrength.calculate(for: password)
    }

    var fullPhoneNumber: String {
        phoneCountryCode + phoneNumber.filter { $0.isNumber }
    }

    // MARK: - Available Languages

    let availableLanguages: [(code: String, name: String, flag: String)] = [
        ("fr", "Français", "🇫🇷"),
        ("en", "English", "🇬🇧"),
        ("es", "Español", "🇪🇸"),
        ("de", "Deutsch", "🇩🇪"),
        ("pt", "Português", "🇵🇹"),
        ("ar", "العربية", "🇸🇦"),
        ("zh", "中文", "🇨🇳"),
        ("sw", "Kiswahili", "🇰🇪"),
        ("ha", "Hausa", "🇳🇬"),
        ("yo", "Yorùbá", "🇳🇬"),
        ("ig", "Igbo", "🇳🇬"),
        ("am", "አማርኛ", "🇪🇹"),
        ("it", "Italiano", "🇮🇹"),
        ("ja", "日本語", "🇯🇵"),
        ("ko", "한국어", "🇰🇷"),
        ("ru", "Русский", "🇷🇺"),
        ("hi", "हिन्दी", "🇮🇳"),
        ("tr", "Türkçe", "🇹🇷"),
        ("nl", "Nederlands", "🇳🇱"),
        ("pl", "Polski", "🇵🇱"),
    ]

    // MARK: - Country Codes

    let countryCodes: [(code: String, country: String, flag: String)] = [
        ("+237", "Cameroun", "🇨🇲"),
        ("+33", "France", "🇫🇷"),
        ("+1", "USA/Canada", "🇺🇸"),
        ("+44", "UK", "🇬🇧"),
        ("+234", "Nigeria", "🇳🇬"),
        ("+225", "Côte d'Ivoire", "🇨🇮"),
        ("+221", "Sénégal", "🇸🇳"),
        ("+243", "RD Congo", "🇨🇩"),
        ("+242", "Congo", "🇨🇬"),
        ("+241", "Gabon", "🇬🇦"),
        ("+235", "Tchad", "🇹🇩"),
        ("+226", "Burkina Faso", "🇧🇫"),
        ("+223", "Mali", "🇲🇱"),
        ("+227", "Niger", "🇳🇪"),
        ("+228", "Togo", "🇹🇬"),
        ("+229", "Bénin", "🇧🇯"),
        ("+32", "Belgique", "🇧🇪"),
        ("+41", "Suisse", "🇨🇭"),
        ("+49", "Allemagne", "🇩🇪"),
        ("+34", "Espagne", "🇪🇸"),
    ]

    // MARK: - Navigation

    func goToStep(_ step: NewRegistrationStep) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
            currentStep = step
        }
    }

    func nextStep() {
        guard canProceed else { return }

        let allSteps = NewRegistrationStep.allCases
        if let currentIndex = allSteps.firstIndex(of: currentStep),
           currentIndex < allSteps.count - 1 {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                currentStep = allSteps[currentIndex + 1]
            }
        }
    }

    func previousStep() {
        let allSteps = NewRegistrationStep.allCases
        if let currentIndex = allSteps.firstIndex(of: currentStep),
           currentIndex > 0 {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                currentStep = allSteps[currentIndex - 1]
            }
        }
    }

    // MARK: - API Validation

    /// Valide le pseudo via l'API et récupère des suggestions si pris
    func checkUsernameAvailability() {
        validationTask?.cancel()

        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        guard isUsernameValid else {
            usernameAvailable = nil
            usernameSuggestions = []
            return
        }

        validationTask = Task {
            isValidatingAPI = true
            defer { isValidatingAPI = false }

            do {
                // Appel API pour vérifier la disponibilité
                let result = try await APIService.shared.checkUsernameAvailability(username: trimmed)

                guard !Task.isCancelled else { return }

                usernameAvailable = result.available
                usernameSuggestions = result.suggestions ?? []

                if !result.available {
                    usernameError = "Ce pseudo est déjà pris! Choisis parmi les suggestions."
                } else {
                    usernameError = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                // En cas d'erreur réseau, on permet de continuer mais avec warning
                usernameAvailable = true
                usernameError = nil
                print("⚠️ Username check failed: \(error)")
            }
        }
    }

    /// Valide le téléphone via l'API
    func checkPhoneAvailability() {
        validationTask?.cancel()

        guard isPhoneValid else {
            phoneAvailable = nil
            return
        }

        validationTask = Task {
            isValidatingAPI = true
            defer { isValidatingAPI = false }

            do {
                let result = try await APIService.shared.checkPhoneAvailability(phone: fullPhoneNumber)

                guard !Task.isCancelled else { return }

                phoneAvailable = result.available

                if !result.available {
                    phoneError = "Ce numéro est déjà utilisé! Tu as peut-être déjà un compte?"
                } else {
                    phoneError = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                phoneAvailable = true
                phoneError = nil
                print("⚠️ Phone check failed: \(error)")
            }
        }
    }

    /// Valide l'email via l'API
    func checkEmailAvailability() {
        validationTask?.cancel()

        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard isEmailValid else {
            emailAvailable = nil
            return
        }

        validationTask = Task {
            isValidatingAPI = true
            defer { isValidatingAPI = false }

            do {
                let result = try await APIService.shared.checkEmailAvailability(email: trimmed)

                guard !Task.isCancelled else { return }

                emailAvailable = result.available

                if !result.available {
                    emailError = "Cet email est déjà utilisé! Connecte-toi plutôt!"
                } else {
                    emailError = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                emailAvailable = true
                emailError = nil
                print("⚠️ Email check failed: \(error)")
            }
        }
    }

    // MARK: - Local Validation

    func validateUsername() {
        let trimmed = username.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            usernameError = "Hé mon gars, mets ton pseudo!"
            usernameAvailable = nil
        } else if trimmed.count < 3 {
            usernameError = "C'est trop court ça! Minimum 3 caractères"
            usernameAvailable = nil
        } else if trimmed.count > 30 {
            usernameError = "Trop long! Maximum 30 caractères"
            usernameAvailable = nil
        } else if trimmed.contains(" ") {
            usernameError = "Pas d'espaces mon frère!"
            usernameAvailable = nil
        } else {
            usernameError = nil
            // Déclencher la vérification API
            checkUsernameAvailability()
        }
    }

    func validatePhone() {
        let digits = phoneNumber.filter { $0.isNumber }
        if digits.isEmpty {
            phoneError = "Mets ton numéro là!"
            phoneAvailable = nil
        } else if digits.count < 8 {
            phoneError = "Numéro trop court!"
            phoneAvailable = nil
        } else if digits.count > 15 {
            phoneError = "Numéro trop long!"
            phoneAvailable = nil
        } else {
            phoneError = nil
            checkPhoneAvailability()
        }
    }

    func validateEmail() {
        if email.isEmpty {
            emailError = "Il faut ton email là!"
            emailAvailable = nil
        } else if !isEmailValid {
            emailError = "Ça ressemble pas à un email ça!"
            emailAvailable = nil
        } else {
            emailError = nil
            checkEmailAvailability()
        }
    }

    func validateFirstName() {
        let trimmed = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            firstNameError = "Ton prénom c'est quoi?"
        } else if trimmed.count < 2 {
            firstNameError = "Prénom trop court!"
        } else {
            firstNameError = nil
        }
    }

    func validateLastName() {
        let trimmed = lastName.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            lastNameError = "Et ton nom de famille?"
        } else if trimmed.count < 2 {
            lastNameError = "Nom trop court!"
        } else {
            lastNameError = nil
        }
    }

    func validatePassword() {
        if password.isEmpty {
            passwordError = "Mets un mot de passe!"
        } else if password.count < 8 {
            passwordError = "Trop faible! Minimum 8 caractères"
        } else {
            passwordError = nil
        }
    }

    func validateConfirmPassword() {
        if confirmPassword.isEmpty {
            confirmPasswordError = "Confirme ton mot de passe!"
        } else if confirmPassword != password {
            confirmPasswordError = "Ça match pas! Vérifie bien"
        } else {
            confirmPasswordError = nil
        }
    }

    // MARK: - Username Suggestion Selection

    func selectSuggestion(_ suggestion: String) {
        username = suggestion
        usernameAvailable = true
        usernameError = nil
        usernameSuggestions = []
    }

    // MARK: - Registration

    func register() async {
        isLoading = true
        errorMessage = nil

        // Determine secondary language
        let secondaryLanguage = primaryLanguage == "en" ? "fr" : "en"

        // Generate display name if not set
        let finalDisplayName = displayName.isEmpty
            ? "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)
            : displayName

        do {
            // Call API to register user
            _ = try await AuthenticationManager.shared.register(
                username: username.trimmingCharacters(in: .whitespacesAndNewlines),
                email: email.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
                password: password,
                firstName: firstName.trimmingCharacters(in: .whitespacesAndNewlines),
                lastName: lastName.trimmingCharacters(in: .whitespacesAndNewlines),
                phoneNumber: phoneNumber.filter { $0.isNumber },
                phoneCountryCode: phoneCountryCode,
                displayName: finalDisplayName,
                primaryLanguage: primaryLanguage,
                secondaryLanguage: secondaryLanguage
            )

            // TODO: Upload profile photo and banner if set
            // if let photo = profilePhoto { ... }
            // if let banner = bannerPhoto { ... }

            withAnimation {
                registrationComplete = true
            }

        } catch let error as MeeshyError {
            errorMessage = error.localizedDescription
            showError = true
        } catch {
            errorMessage = "Aïe! Un problème est survenu. Réessaie!"
            showError = true
        }

        isLoading = false
    }

    // MARK: - Summary Data

    var summaryItems: [(icon: String, label: String, value: String)] {
        var items: [(String, String, String)] = [
            ("person.fill", "Pseudo", "@\(username)"),
            ("phone.fill", "Téléphone", fullPhoneNumber),
            ("envelope.fill", "Email", email),
            ("person.text.rectangle.fill", "Nom", "\(firstName) \(lastName)"),
            ("globe", "Langue", availableLanguages.first { $0.code == primaryLanguage }?.name ?? primaryLanguage)
        ]

        if !bio.isEmpty {
            items.append(("text.quote", "Bio", bio))
        }

        return items
    }
}

// MARK: - PasswordStrength Extensions

extension PasswordStrength {
    var progress: Double {
        Double(level) / 4.0
    }

    var label: String {
        switch self {
        case .weak: return "Faible"
        case .fair: return "Moyen"
        case .good: return "Bon"
        case .strong: return "Fort!"
        }
    }

    var strengthIcon: String {
        switch self {
        case .weak: return "exclamationmark.triangle"
        case .fair: return "minus.circle"
        case .good: return "checkmark.circle"
        case .strong: return "checkmark.seal.fill"
        }
    }
}
