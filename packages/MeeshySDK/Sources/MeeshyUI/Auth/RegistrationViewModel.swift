import SwiftUI
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
        case .pseudo: return "C'est comment mon gars?"
        case .phone: return "Ton numero pour le kwatt!"
        case .email: return "Ton adresse la, c'est quoi?"
        case .identity: return "Dis-moi ton nom!"
        case .password: return "Mets un code beton!"
        case .language: return "Tu parles quoi meme?"
        case .profile: return "Montre-toi un peu!"
        case .recap: return "On est ensemble!"
        }
    }

    public var funSubtitle: String {
        switch self {
        case .pseudo:
            return "Choisis un nom de boss que tout Meeshy va connaitre! Sois creatif!"
        case .phone:
            return "Optionnel. Permet la recuperation du compte si tu perds ton mot de passe."
        case .email:
            return "Ton email c'est ta carte d'identite sur internet. On va pas te spam!"
        case .identity:
            return "Ton vrai nom pour que tes amis te reconnaissent. On est entre nous!"
        case .password:
            return "Faut que ce soit fort comme le ndole de maman! Minimum 8 caracteres!"
        case .language:
            return "Tous tes messages vont etre traduits dans cette langue. C'est la magie de Meeshy!"
        case .profile:
            return "Dis au monde qui tu es! C'est optionnel mais ca fait du bien."
        case .recap:
            return "Tu es dedans maintenant! Bienvenue dans la famille Meeshy!"
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

    // MARK: - Step

    @Published public var currentStep: RegistrationStep = .pseudo

    // MARK: - Form Fields

    @Published public var username = ""
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

    // MARK: - General State

    @Published public var isLoading = false
    @Published public var errorMessage: String?

    // MARK: - Private

    private var cancellables = Set<AnyCancellable>()
    private var usernameTask: Task<Void, Never>?
    private var emailTask: Task<Void, Never>?
    private var phoneTask: Task<Void, Never>?

    public let totalSteps = RegistrationStep.allCases.count

    // MARK: - Init

    public init() {
        detectCountry()
        setupValidationDebounce()
    }

    // MARK: - Country Detection

    private func detectCountry() {
        guard let regionCode = Locale.current.region?.identifier.uppercased() else { return }
        if let match = CountryPicker.countries.first(where: { $0.id == regionCode }) {
            selectedCountry = match
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
                guard let self, self.isUsernameValidLocally(value) else {
                    self?.usernameAvailable = nil
                    self?.usernameError = nil
                    self?.usernameSuggestions = []
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

    private func isUsernameValidLocally(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2, trimmed.count <= 16 else { return false }
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "_-"))
        return CharacterSet(charactersIn: trimmed).isSubset(of: allowed)
    }

    private func isEmailValidLocally(_ value: String) -> Bool {
        value.contains("@") && value.contains(".")
    }

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
                usernameError = result.available ? nil : "Ce pseudo est deja pris!"
            } catch {
                guard !Task.isCancelled else { return }
                usernameAvailable = true
                usernameError = "Verification non effectuee"
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

                emailAvailable = result.available
                emailError = result.available ? nil : "Cet email est deja utilise!"
            } catch {
                guard !Task.isCancelled else { return }
                emailAvailable = true
                emailError = "Verification non effectuee"
            }
        }
    }

    private func checkPhoneAvailability() {
        phoneTask?.cancel()
        let fullPhone = selectedCountry.dialCode + phoneNumber.filter { $0.isNumber }

        phoneTask = Task {
            isValidatingPhone = true
            defer { isValidatingPhone = false }

            do {
                let result = try await AuthService.shared.checkAvailability(phone: fullPhone)
                guard !Task.isCancelled else { return }

                phoneNumberValid = result.phoneNumberValid
                phoneAvailable = result.available
                if result.phoneNumberValid == false {
                    phoneError = "Ce numero semble invalide"
                } else if !result.available {
                    phoneError = "Ce numero est deja utilise!"
                } else {
                    phoneError = nil
                }
            } catch {
                guard !Task.isCancelled else { return }
                phoneAvailable = true
                phoneNumberValid = nil
                phoneError = "Verification non effectuee"
            }
        }
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
            return !firstName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                && !lastName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
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
            errorMessage = AuthManager.shared.errorMessage ?? "Erreur lors de l'inscription"
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
