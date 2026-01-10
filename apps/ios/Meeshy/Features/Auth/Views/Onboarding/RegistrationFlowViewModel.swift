//
//  RegistrationFlowViewModel.swift
//  Meeshy
//
//  ViewModel for the multi-step registration flow
//  Manages state across all 5 registration steps
//  Note: Named differently from OnboardingViewModel to avoid conflict with permissions onboarding
//

import SwiftUI
import UIKit
import Combine
import Contacts

// MARK: - Registration Step

enum RegistrationStep: Int, CaseIterable {
    case identity = 0
    case contact = 1
    case languages = 2
    case profile = 3
    case complete = 4

    var title: String {
        switch self {
        case .identity: return "Bienvenue!"
        case .contact: return "Sécurité"
        case .languages: return "Langues"
        case .profile: return "Profil"
        case .complete: return "C'est parti!"
        }
    }

    var emoji: String {
        switch self {
        case .identity: return "👋"
        case .contact: return "🔐"
        case .languages: return "🌍"
        case .profile: return "📸"
        case .complete: return "🎉"
        }
    }

    var accentColor: Color {
        switch self {
        case .identity: return Color(hex: "007AFF") ?? .blue      // Blue
        case .contact: return Color(hex: "AF52DE") ?? .purple     // Purple
        case .languages: return Color(hex: "34C759") ?? .green    // Green
        case .profile: return Color(hex: "FF9500") ?? .orange     // Orange
        case .complete: return Color(hex: "FF2D55") ?? .pink      // Pink
        }
    }
}

// MARK: - Field Explanations (Camerounais Style!)

struct RegistrationFieldExplanation {
    let icon: String
    let title: String
    let explanation: String
    let tip: String?

    // Step 1: Identity
    static let firstName = RegistrationFieldExplanation(
        icon: "👤",
        title: "Prénom",
        explanation: "C'est comme ça que tes contacts te reconnaîtront sur Meeshy! Si tu t'appelles 'Jean-Pierre', on ne va pas t'appeler 'Monsieur X' non? 😄",
        tip: "Ton vrai prénom, pas ton surnom de quartier!"
    )

    static let lastName = RegistrationFieldExplanation(
        icon: "👥",
        title: "Nom de famille",
        explanation: "Pour que tes collègues puissent te retrouver facilement! Imagine ton boss qui te cherche... 'Jean' y'en a 50, mais 'Jean Kamga', c'est toi! 💼",
        tip: "Idéal pour un usage pro sur Meeshy"
    )

    static let username = RegistrationFieldExplanation(
        icon: "🔍",
        title: "Nom d'utilisateur",
        explanation: "Ton identifiant unique @username! C'est comme ton numéro de maillot, personne d'autre ne peut l'avoir. Choisis bien, c'est pour la vie! ⚽",
        tip: "Les gens peuvent te rechercher avec @tonpseudo"
    )

    // Step 2: Contact & Security
    static let phone = RegistrationFieldExplanation(
        icon: "📱",
        title: "Téléphone",
        explanation: "Pour sécuriser ton compte Meeshy et récupérer l'accès si tu oublies ton mot de passe. On ne va pas t'appeler pour te vendre des trucs, promis! 🤞",
        tip: "On t'envoie juste un code si tu perds l'accès"
    )

    static let email = RegistrationFieldExplanation(
        icon: "✉️",
        title: "Email",
        explanation: "Pour les notifications importantes de Meeshy uniquement! Si quelqu'un t'envoie un message urgent et que tu n'es pas en ligne. Pas de spam, on respecte ta boîte! 📬",
        tip: "Un email que tu consultes régulièrement"
    )

    static let password = RegistrationFieldExplanation(
        icon: "🔒",
        title: "Mot de passe",
        explanation: "La clé de tes conversations privées! Ne mets pas '123456' comme mot de passe hein, sinon même ton petit frère pourra lire tes messages! 🙈",
        tip: "Minimum 8 caractères, avec majuscules et chiffres"
    )

    // Step 3: Languages
    static let country = RegistrationFieldExplanation(
        icon: "🌍",
        title: "Pays",
        explanation: "Pour te connecter avec des utilisateurs de ta région! Que tu sois à Douala, Paris ou Montréal, on te trouve des gens du coin! 🏠",
        tip: "On détecte ton pays automatiquement"
    )

    static let primaryLanguage = RegistrationFieldExplanation(
        icon: "💬",
        title: "Langue principale",
        explanation: "La langue dans laquelle tu veux parler sur Meeshy! Si tu parles Français, on traduira automatiquement les messages en Anglais que tu reçois! C'est magique non? ✨",
        tip: "Meeshy traduit automatiquement pour toi"
    )

    static let secondaryLanguage = RegistrationFieldExplanation(
        icon: "🔄",
        title: "Langue secondaire",
        explanation: "Ta deuxième langue préférée! Si ton correspondant parle Anglais et toi Français, Meeshy fait le pont! Plus besoin de Google Translate! 🌉",
        tip: "Utile pour les conversations internationales"
    )

    // Step 4: Profile
    static let photo = RegistrationFieldExplanation(
        icon: "📸",
        title: "Photo de profil",
        explanation: "Pour que tes contacts te reconnaissent! Une vraie photo c'est mieux qu'un avatar. Montre ton plus beau sourire! 😁",
        tip: "Optionnel, mais ça aide pour la confiance"
    )

    static let bio = RegistrationFieldExplanation(
        icon: "✍️",
        title: "Bio",
        explanation: "Quelques mots pour te présenter! 'Entrepreneur à Yaoundé' ou 'Étudiante en médecine'. Les gens aiment savoir à qui ils parlent! 💡",
        tip: "Court et sympa, 150 caractères max"
    )
}

// MARK: - ViewModel

@MainActor
class RegistrationFlowViewModel: ObservableObject {
    // MARK: - Navigation State
    @Published var currentStep: RegistrationStep = .identity
    @Published var isNavigatingForward = true

    // MARK: - Step 1: Identity
    @Published var firstName: String = ""
    @Published var lastName: String = ""
    @Published var username: String = ""
    @Published var isCheckingUsername = false
    @Published var isUsernameAvailable: Bool? = nil
    @Published var usernameSuggestions: [String] = []

    // MARK: - Step 2: Contact & Security
    @Published var phoneNumber: String = ""
    @Published var selectedCountryForPhone: Country?
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var isPhoneVerified = false
    @Published var showOTPSheet = false
    @Published var otpCode: String = ""

    // MARK: - Step 3: Languages
    @Published var selectedCountry: Country?
    @Published var primaryLanguage: SupportedLanguage?
    @Published var secondaryLanguage: SupportedLanguage?

    // MARK: - Step 4: Profile
    @Published var profileImage: UIImage?
    @Published var bio: String = ""
    @Published var showImagePicker = false
    @Published var showCamera = false

    // MARK: - Step 5: Complete
    @Published var hasAcceptedTerms = false
    @Published var isRegistering = false
    @Published var registrationError: String?
    @Published var showConfetti = false

    // MARK: - Validation States
    @Published var firstNameError: String?
    @Published var lastNameError: String?
    @Published var usernameError: String?
    @Published var phoneError: String?
    @Published var emailError: String?
    @Published var passwordError: String?

    // MARK: - Services
    private let authManager = AuthenticationManager.shared
    private var cancellables = Set<AnyCancellable>()
    private var usernameCheckTask: Task<Void, Never>?

    // MARK: - Available Languages
    var availableLanguages: [SupportedLanguage] {
        LanguageHelper.supportedLanguages
    }

    // MARK: - Computed Properties

    var canProceedFromStep1: Bool {
        !firstName.trimmingCharacters(in: .whitespaces).isEmpty &&
        firstName.count >= 2 &&
        !lastName.trimmingCharacters(in: .whitespaces).isEmpty &&
        lastName.count >= 2 &&
        !username.trimmingCharacters(in: .whitespaces).isEmpty &&
        username.count >= 4 &&
        isUsernameAvailable == true
    }

    var canProceedFromStep2: Bool {
        !phoneNumber.isEmpty &&
        phoneNumber.count >= 6 &&
        !email.isEmpty &&
        isValidEmail(email) &&
        !password.isEmpty &&
        password.count >= 8
    }

    var canProceedFromStep3: Bool {
        selectedCountry != nil && primaryLanguage != nil
    }

    var canProceedFromStep4: Bool {
        true // Profile photo and bio are optional
    }

    var canComplete: Bool {
        hasAcceptedTerms
    }

    var passwordStrength: RegistrationPasswordStrength {
        RegistrationPasswordStrength.calculate(for: password)
    }

    var formattedPhoneNumber: String {
        guard let country = selectedCountryForPhone else {
            return phoneNumber
        }
        return country.formatPhoneNumber(phoneNumber)
    }

    // MARK: - Initialization

    init() {
        setupValidation()
        prefillFromDevice()
    }

    // MARK: - Pre-fill from Device

    private func prefillFromDevice() {
        // Pre-fill country from locale
        if let regionCode = Locale.current.region?.identifier {
            selectedCountry = Country.allCountries.first { $0.code == regionCode }
            selectedCountryForPhone = selectedCountry
        } else {
            selectedCountry = Country.france
            selectedCountryForPhone = Country.france
        }

        // Pre-fill language from locale
        if let languageCode = Locale.preferredLanguages.first?.prefix(2) {
            primaryLanguage = LanguageHelper.supportedLanguages.first { $0.code == String(languageCode) }

            // Default secondary to English if primary isn't English
            if primaryLanguage?.code != "en" {
                secondaryLanguage = LanguageHelper.supportedLanguages.first { $0.code == "en" }
            } else {
                secondaryLanguage = LanguageHelper.supportedLanguages.first { $0.code == "fr" }
            }
        } else {
            // Default to French/English
            primaryLanguage = LanguageHelper.supportedLanguages.first { $0.code == "fr" }
            secondaryLanguage = LanguageHelper.supportedLanguages.first { $0.code == "en" }
        }

        // Try to get phone number from contacts (requires permission)
        Task {
            await prefillPhoneNumber()
        }
    }

    private func prefillPhoneNumber() async {
        let store = CNContactStore()

        // Check authorization
        let status = CNContactStore.authorizationStatus(for: .contacts)
        guard status == .authorized else {
            // Request authorization
            do {
                let granted = try await store.requestAccess(for: .contacts)
                guard granted else { return }
            } catch {
                return
            }
            return
        }

        // Note: unifiedMeContactWithKeys is not available on iOS
        // For now, we just rely on locale-based auto-detection
        // Users will need to enter their phone number manually
    }

    // MARK: - Validation Setup

    private func setupValidation() {
        // Username validation with debounce
        $username
            .debounce(for: .milliseconds(500), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] username in
                self?.validateUsername(username)
            }
            .store(in: &cancellables)

        // Email validation
        $email
            .debounce(for: .milliseconds(300), scheduler: RunLoop.main)
            .removeDuplicates()
            .sink { [weak self] email in
                self?.validateEmail(email)
            }
            .store(in: &cancellables)
    }

    // MARK: - Validation Methods

    private func validateUsername(_ username: String) {
        guard !username.isEmpty else {
            isUsernameAvailable = nil
            usernameError = nil
            return
        }

        // Check format
        let usernameRegex = "^[a-zA-Z0-9_-]{4,}$"
        guard username.range(of: usernameRegex, options: .regularExpression) != nil else {
            usernameError = "4+ caractères, lettres, chiffres, - et _ uniquement"
            isUsernameAvailable = false
            return
        }

        usernameError = nil

        // Check availability
        usernameCheckTask?.cancel()
        usernameCheckTask = Task {
            isCheckingUsername = true
            do {
                // TODO: Implement username availability check API
                // For now, assume username is available if it passes validation
                try await Task.sleep(nanoseconds: 300_000_000) // Simulate network delay
                if !Task.isCancelled {
                    isUsernameAvailable = true
                }
            } catch {
                if !Task.isCancelled {
                    isUsernameAvailable = nil
                }
            }
            isCheckingUsername = false
        }
    }

    private func validateEmail(_ email: String) {
        guard !email.isEmpty else {
            emailError = nil
            return
        }

        if !isValidEmail(email) {
            emailError = "Email invalide"
        } else {
            emailError = nil
        }
    }

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        return email.range(of: emailRegex, options: .regularExpression) != nil
    }

    // MARK: - Navigation

    func nextStep() {
        guard let nextIndex = RegistrationStep(rawValue: currentStep.rawValue + 1) else { return }
        isNavigatingForward = true
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            currentStep = nextIndex
        }
        HapticFeedback.light.trigger()
    }

    func previousStep() {
        guard let prevIndex = RegistrationStep(rawValue: currentStep.rawValue - 1) else { return }
        isNavigatingForward = false
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            currentStep = prevIndex
        }
        HapticFeedback.light.trigger()
    }

    func goToStep(_ step: RegistrationStep) {
        isNavigatingForward = step.rawValue > currentStep.rawValue
        withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {
            currentStep = step
        }
    }

    // MARK: - OTP Verification

    func sendOTP() async {
        // TODO: Implement OTP sending via API
        showOTPSheet = true
    }

    func verifyOTP() async -> Bool {
        // TODO: Implement OTP verification via API
        guard otpCode.count == 6 else { return false }

        // Simulate verification
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        isPhoneVerified = true
        showOTPSheet = false
        HapticFeedback.success.trigger()
        return true
    }

    // MARK: - Registration

    func completeRegistration() async -> Bool {
        isRegistering = true
        registrationError = nil

        do {
            // Create display name from first and last name
            let displayName = "\(firstName) \(lastName)".trimmingCharacters(in: .whitespaces)

            // Call AuthenticationManager.register with all required fields
            _ = try await authManager.register(
                username: username.trimmingCharacters(in: .whitespaces),
                email: email.trimmingCharacters(in: .whitespaces),
                password: password,
                firstName: firstName.trimmingCharacters(in: .whitespaces),
                lastName: lastName.trimmingCharacters(in: .whitespaces),
                phoneNumber: formattedPhoneNumber,
                phoneCountryCode: selectedCountry?.code,
                displayName: displayName.isEmpty ? nil : displayName,
                primaryLanguage: primaryLanguage?.code ?? "fr",
                secondaryLanguage: secondaryLanguage?.code ?? "en"
            )

            // Success!
            showConfetti = true
            HapticFeedback.success.trigger()

            // Wait for confetti animation
            try? await Task.sleep(nanoseconds: 2_000_000_000)

            isRegistering = false
            return true

        } catch let error as MeeshyError {
            registrationError = error.localizedDescription
            isRegistering = false
            HapticFeedback.error.trigger()
            return false
        } catch {
            registrationError = "Une erreur est survenue"
            isRegistering = false
            HapticFeedback.error.trigger()
            return false
        }
    }

    // MARK: - Username Suggestions

    func selectSuggestion(_ suggestion: String) {
        username = suggestion
        HapticFeedback.selection.trigger()
    }
}

// MARK: - Onboarding Password Strength (renamed to avoid conflict)

enum RegistrationPasswordStrength: Int {
    case weak = 1
    case fair = 2
    case good = 3
    case strong = 4

    var color: Color {
        switch self {
        case .weak: return .red
        case .fair: return .orange
        case .good: return .yellow
        case .strong: return .green
        }
    }

    var label: String {
        switch self {
        case .weak: return "Faible"
        case .fair: return "Moyen"
        case .good: return "Bon"
        case .strong: return "Fort"
        }
    }

    var emoji: String {
        switch self {
        case .weak: return "😰"
        case .fair: return "😐"
        case .good: return "😊"
        case .strong: return "💪"
        }
    }

    static func calculate(for password: String) -> RegistrationPasswordStrength {
        var score = 0

        if password.count >= 8 { score += 1 }
        if password.contains(where: { $0.isUppercase }) { score += 1 }
        if password.contains(where: { $0.isLowercase }) { score += 1 }
        if password.contains(where: { $0.isNumber }) { score += 1 }
        if password.contains(where: { "!@#$%^&*()_+-=[]{}|;':\",./<>?".contains($0) }) { score += 1 }

        switch score {
        case 0...2: return .weak
        case 3: return .fair
        case 4: return .good
        default: return .strong
        }
    }
}

// Note: Color(hex:) extension is already defined in SettingsManager.swift
