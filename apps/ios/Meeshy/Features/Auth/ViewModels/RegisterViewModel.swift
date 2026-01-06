//
//  RegisterViewModel.swift
//  Meeshy
//
//  View model for user registration with complete validation
//  Minimum iOS 16+
//

import SwiftUI
import Combine

@MainActor
final class RegisterViewModel: ObservableObject {
    // MARK: - Published Properties

    // Form Fields
    @Published var firstName: String = ""
    @Published var lastName: String = ""
    @Published var username: String = ""
    @Published var email: String = ""
    @Published var password: String = ""
    @Published var confirmPassword: String = ""
    @Published var selectedCountry: Country? = Country.defaultCountry
    @Published var phoneNumber: String = ""  // Local number without country code
    @Published var primaryLanguage: String = ""    // Première langue parlée (device language)
    @Published var secondaryLanguage: String = ""  // Seconde langue parlée (region language)
    @Published var acceptedTerms: Bool = false

    // Username availability
    @Published var isUsernameAvailable: Bool?
    @Published var isCheckingUsername: Bool = false
    @Published var usernameSuggestions: [String] = []

    // Email availability
    @Published var isEmailAvailable: Bool?
    @Published var isCheckingEmail: Bool = false

    // Phone availability
    @Published var isPhoneAvailable: Bool?
    @Published var isCheckingPhone: Bool = false

    // Loading and Status
    @Published var isLoading: Bool = false
    @Published var errorMessage: String?
    @Published var registrationComplete: Bool = false

    // Redirect to login (when email/phone already exists)
    @Published var shouldRedirectToLogin: Bool = false
    @Published var redirectInfo: RegistrationRedirectInfo?

    // Field-specific errors
    @Published var firstNameError: String?
    @Published var lastNameError: String?
    @Published var usernameError: String?
    @Published var emailError: String?
    @Published var passwordError: String?
    @Published var confirmPasswordError: String?
    @Published var countryError: String?
    @Published var phoneNumberError: String?

    // MARK: - Private Properties

    private let authManager = AuthenticationManager.shared
    private var cancellables = Set<AnyCancellable>()
    private var usernameCheckTask: Task<Void, Never>?
    private var emailCheckTask: Task<Void, Never>?
    private var phoneCheckTask: Task<Void, Never>?

    // MARK: - Initialization

    init() {
        setupDefaultLanguages()
        setupValidation()
        setupCountryObserver()
    }

    /// Observe country changes to update secondary language
    private func setupCountryObserver() {
        $selectedCountry
            .dropFirst() // Skip initial value
            .sink { [weak self] country in
                guard let self = self, let country = country else { return }
                // Update secondary language based on country's primary language
                if let regionLanguageCode = country.languageCodes.first {
                    let languageCode = regionLanguageCode.components(separatedBy: "_").first ?? regionLanguageCode
                    // Only update if different from primary language
                    if languageCode != self.primaryLanguage {
                        self.secondaryLanguage = languageCode
                    }
                }
            }
            .store(in: &cancellables)
    }

    /// Setup default languages based on device settings
    private func setupDefaultLanguages() {
        // Get device's preferred language (first language)
        let deviceLanguage = Locale.current.language.languageCode?.identifier ?? "fr"
        primaryLanguage = deviceLanguage

        // Get region-based language (from selected country or device region)
        if let country = selectedCountry,
           let regionLanguageCode = country.languageCodes.first {
            // Extract language code from locale format (e.g., "fr_FR" -> "fr")
            let languageCode = regionLanguageCode.components(separatedBy: "_").first ?? regionLanguageCode
            secondaryLanguage = languageCode
        } else {
            // Fallback: use second language from device's preferred languages
            let preferredLanguages = Locale.preferredLanguages
            if preferredLanguages.count > 1 {
                // Extract language code from locale identifier (e.g., "en-US" -> "en")
                let secondLocale = preferredLanguages[1]
                let languageCode = Locale(identifier: secondLocale).language.languageCode?.identifier ?? "en"
                secondaryLanguage = languageCode
            } else {
                // Default to English if no second language available
                secondaryLanguage = primaryLanguage == "en" ? "fr" : "en"
            }
        }

        // Ensure primary and secondary are different if possible
        if primaryLanguage == secondaryLanguage {
            let preferredLanguages = Locale.preferredLanguages
            for localeId in preferredLanguages where localeId != primaryLanguage {
                let languageCode = Locale(identifier: localeId).language.languageCode?.identifier
                if let code = languageCode, code != primaryLanguage {
                    secondaryLanguage = code
                    break
                }
            }
        }
    }

    // MARK: - Public Methods

    /// Attempt user registration
    func register() async {
        guard validate() else { return }

        isLoading = true
        errorMessage = nil

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
                phoneCountryCode: selectedCountry?.code,  // ISO country code (e.g., "FR", "US", "CM")
                displayName: displayName.isEmpty ? nil : displayName,
                primaryLanguage: primaryLanguage,
                secondaryLanguage: secondaryLanguage
            )

            // Success haptic
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            registrationComplete = true

        } catch let meeshyError as MeeshyError {
            handleMeeshyError(meeshyError)
        } catch {
            handleError(error)
        }

        isLoading = false
    }

    /// Check username availability
    func checkUsernameAvailability(_ username: String) async -> Bool {
        // Cancel any existing check
        usernameCheckTask?.cancel()

        // Validate username format first
        guard isValidUsername(username) else {
            return false
        }

        isCheckingUsername = true

        do {
            // Call API to check username availability
            let response: APIResponse<AvailabilityCheckResponse> = try await APIClient.shared
                .request(AuthEndpoints.checkAvailability(username: username, email: nil, phoneNumber: nil))

            isCheckingUsername = false

            if let data = response.data, let available = data.usernameAvailable {
                if !available {
                    // Username is taken, generate suggestions locally
                    usernameSuggestions = generateLocalSuggestions(base: username)
                } else {
                    usernameSuggestions = []
                }
                return available
            } else {
                // If no data, assume unavailable
                return false
            }
        } catch {
            isCheckingUsername = false
            // On error, don't show as available
            return false
        }
    }

    /// Check email availability
    func checkEmailAvailability(_ email: String) async {
        isCheckingEmail = true
        isEmailAvailable = nil

        do {
            let response: APIResponse<AvailabilityCheckResponse> = try await APIClient.shared
                .request(AuthEndpoints.checkAvailability(username: nil, email: email, phoneNumber: nil))

            isCheckingEmail = false

            if let data = response.data, let available = data.emailAvailable {
                isEmailAvailable = available
                if !available {
                    emailError = "Cet email est déjà enregistré"
                    // Trigger redirect to login
                    redirectInfo = RegistrationRedirectInfo(
                        reason: .emailExists,
                        identifier: email,
                        message: "Un compte existe déjà avec cet email. Connectez-vous."
                    )
                    shouldRedirectToLogin = true
                } else {
                    emailError = nil
                }
            }
        } catch {
            isCheckingEmail = false
            // On error, assume available (will be caught at registration)
            isEmailAvailable = true
        }
    }

    /// Check phone availability
    func checkPhoneAvailability(_ formattedPhone: String) async {
        isCheckingPhone = true
        isPhoneAvailable = nil

        do {
            let response: APIResponse<AvailabilityCheckResponse> = try await APIClient.shared
                .request(AuthEndpoints.checkAvailability(username: nil, email: nil, phoneNumber: formattedPhone))

            isCheckingPhone = false

            if let data = response.data, let available = data.phoneNumberAvailable {
                isPhoneAvailable = available
                if !available {
                    phoneNumberError = "Ce numéro est déjà enregistré"
                    // Trigger redirect to login
                    redirectInfo = RegistrationRedirectInfo(
                        reason: .phoneExists,
                        identifier: formattedPhone,
                        message: "Un compte existe déjà avec ce numéro. Connectez-vous."
                    )
                    shouldRedirectToLogin = true
                } else {
                    phoneNumberError = nil
                }
            }
        } catch {
            isCheckingPhone = false
            // On error, assume available (will be caught at registration)
            isPhoneAvailable = true
        }
    }

    /// Generate local username suggestions
    private func generateLocalSuggestions(base: String) -> [String] {
        var suggestions: [String] = []
        let random1 = Int.random(in: 1...99)
        let random2 = Int.random(in: 100...999)
        let random3 = Int.random(in: 1...9)

        suggestions.append("\(base)\(random1)")
        suggestions.append("\(base)_\(random2)")
        suggestions.append("\(base)\(random3)")

        // Add year-based suggestion
        let year = Calendar.current.component(.year, from: Date())
        suggestions.append("\(base)\(year % 100)")

        return Array(suggestions.prefix(4))
    }

    /// Select a suggested username
    func selectSuggestedUsername(_ suggestion: String) {
        username = suggestion
        usernameSuggestions = []
        isUsernameAvailable = true
        usernameError = nil
    }

    /// Reset redirect state (called after handling redirect)
    func resetRedirectState() {
        shouldRedirectToLogin = false
        redirectInfo = nil
    }

    /// Clear all error messages
    func clearErrors() {
        errorMessage = nil
        firstNameError = nil
        lastNameError = nil
        usernameError = nil
        emailError = nil
        passwordError = nil
        confirmPasswordError = nil
        countryError = nil
        phoneNumberError = nil
    }

    // MARK: - Computed Properties

    var passwordStrength: PasswordStrength {
        PasswordStrength.calculate(for: password)
    }

    /// Formatted phone number with country code (e.g., "+33610424242")
    var formattedPhoneNumber: String? {
        guard let country = selectedCountry, !phoneNumber.isEmpty else {
            return nil
        }
        return country.formatPhoneNumber(phoneNumber)
    }

    var isFormValid: Bool {
        // All required fields must be filled
        !firstName.isEmpty &&
        !lastName.isEmpty &&
        !username.isEmpty &&
        isValidUsername(username) &&
        (isUsernameAvailable ?? false) &&
        !email.isEmpty &&
        isValidEmail(email) &&
        password.count >= 8 &&
        password == confirmPassword &&
        selectedCountry != nil &&  // Country is mandatory
        !phoneNumber.isEmpty &&    // Phone number is mandatory
        isValidLocalPhoneNumber(phoneNumber) &&
        acceptedTerms
    }

    /// Validate local phone number format (digits only, 6-15 characters)
    private func isValidLocalPhoneNumber(_ phoneNumber: String) -> Bool {
        let digitsOnly = phoneNumber.filter { $0.isNumber }
        return digitsOnly.count >= 6 && digitsOnly.count <= 15
    }

    // MARK: - Private Methods

    private func setupValidation() {
        // Real-time first name validation
        $firstName
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .sink { [weak self] firstName in
                guard let self = self else { return }
                if !firstName.isEmpty && firstName.count < 2 {
                    self.firstNameError = "First name must be at least 2 characters"
                } else {
                    self.firstNameError = nil
                }
            }
            .store(in: &cancellables)

        // Real-time last name validation
        $lastName
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .sink { [weak self] lastName in
                guard let self = self else { return }
                if !lastName.isEmpty && lastName.count < 2 {
                    self.lastNameError = "Last name must be at least 2 characters"
                } else {
                    self.lastNameError = nil
                }
            }
            .store(in: &cancellables)

        // Real-time username validation
        $username
            .debounce(for: 0.5, scheduler: DispatchQueue.main)
            .sink { [weak self] username in
                guard let self = self else { return }
                self.validateUsername(username)
            }
            .store(in: &cancellables)

        // Real-time email validation with availability check
        $email
            .debounce(for: 0.5, scheduler: DispatchQueue.main)
            .sink { [weak self] email in
                guard let self = self else { return }
                if email.isEmpty {
                    self.emailError = nil
                    self.isEmailAvailable = nil
                } else if !self.isValidEmail(email) {
                    self.emailError = "Veuillez entrer une adresse email valide"
                    self.isEmailAvailable = nil
                } else {
                    self.emailError = nil
                    // Check email availability
                    self.emailCheckTask?.cancel()
                    self.emailCheckTask = Task {
                        await self.checkEmailAvailability(email)
                    }
                }
            }
            .store(in: &cancellables)

        // Real-time password validation
        $password
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .sink { [weak self] password in
                guard let self = self else { return }
                if !password.isEmpty {
                    if password.count < 8 {
                        self.passwordError = "Password must be at least 8 characters"
                    } else if self.passwordStrength == .weak {
                        self.passwordError = "Password is too weak"
                    } else {
                        self.passwordError = nil
                    }

                    // Also check confirm password match
                    if !self.confirmPassword.isEmpty && password != self.confirmPassword {
                        self.confirmPasswordError = "Passwords don't match"
                    } else if !self.confirmPassword.isEmpty {
                        self.confirmPasswordError = nil
                    }
                } else {
                    self.passwordError = nil
                }
            }
            .store(in: &cancellables)

        // Real-time password match validation
        Publishers.CombineLatest($password, $confirmPassword)
            .debounce(for: 0.3, scheduler: DispatchQueue.main)
            .sink { [weak self] password, confirmPassword in
                guard let self = self else { return }
                if !confirmPassword.isEmpty {
                    if password != confirmPassword {
                        self.confirmPasswordError = "Passwords don't match"
                    } else {
                        self.confirmPasswordError = nil
                    }
                }
            }
            .store(in: &cancellables)

        // Phone number validation with availability check
        Publishers.CombineLatest($phoneNumber, $selectedCountry)
            .debounce(for: 0.5, scheduler: DispatchQueue.main)
            .sink { [weak self] phoneNumber, country in
                guard let self = self else { return }
                if phoneNumber.isEmpty {
                    self.phoneNumberError = nil
                    self.isPhoneAvailable = nil
                } else {
                    let digitsOnly = phoneNumber.filter { $0.isNumber }
                    if digitsOnly.count < 6 {
                        self.phoneNumberError = "Numéro de téléphone trop court"
                        self.isPhoneAvailable = nil
                    } else if digitsOnly.count > 15 {
                        self.phoneNumberError = "Numéro de téléphone trop long"
                        self.isPhoneAvailable = nil
                    } else {
                        self.phoneNumberError = nil
                        // Check phone availability with formatted number
                        if let country = country {
                            let formattedPhone = country.formatPhoneNumber(phoneNumber)
                            self.phoneCheckTask?.cancel()
                            self.phoneCheckTask = Task {
                                await self.checkPhoneAvailability(formattedPhone)
                            }
                        }
                    }
                }
            }
            .store(in: &cancellables)
    }

    private func validateUsername(_ username: String) {
        if username.isEmpty {
            usernameError = nil
            isUsernameAvailable = nil
            return
        }

        if username.count < 4 {
            usernameError = "Username must be at least 4 characters"
            isUsernameAvailable = nil
            return
        }

        if !isValidUsername(username) {
            usernameError = "Username can only contain letters, numbers, dashes, and underscores"
            isUsernameAvailable = nil
            return
        }

        usernameError = nil
        // Username availability will be checked separately via checkUsernameAvailability
    }

    private func validate() -> Bool {
        var isValid = true

        // Clear previous errors
        clearErrors()

        // First name validation
        let trimmedFirstName = firstName.trimmingCharacters(in: .whitespaces)
        if trimmedFirstName.isEmpty {
            firstNameError = "First name is required"
            isValid = false
        } else if trimmedFirstName.count < 2 {
            firstNameError = "First name must be at least 2 characters"
            isValid = false
        }

        // Last name validation
        let trimmedLastName = lastName.trimmingCharacters(in: .whitespaces)
        if trimmedLastName.isEmpty {
            lastNameError = "Last name is required"
            isValid = false
        } else if trimmedLastName.count < 2 {
            lastNameError = "Last name must be at least 2 characters"
            isValid = false
        }

        // Username validation
        let trimmedUsername = username.trimmingCharacters(in: .whitespaces)
        if trimmedUsername.isEmpty {
            usernameError = "Username is required"
            isValid = false
        } else if trimmedUsername.count < 4 {
            usernameError = "Username must be at least 4 characters"
            isValid = false
        } else if !isValidUsername(trimmedUsername) {
            usernameError = "Username can only contain letters, numbers, dashes, and underscores"
            isValid = false
        } else if isUsernameAvailable == false {
            usernameError = "This username is already taken"
            isValid = false
        } else if isUsernameAvailable == nil {
            usernameError = "Please wait for username availability check"
            isValid = false
        }

        // Email validation
        let trimmedEmail = email.trimmingCharacters(in: .whitespaces)
        if trimmedEmail.isEmpty {
            emailError = "Email is required"
            isValid = false
        } else if !isValidEmail(trimmedEmail) {
            emailError = "Please enter a valid email address"
            isValid = false
        }

        // Password validation
        if password.isEmpty {
            passwordError = "Password is required"
            isValid = false
        } else if password.count < 8 {
            passwordError = "Password must be at least 8 characters"
            isValid = false
        } else if passwordStrength == .weak {
            passwordError = "Password is too weak. Add uppercase, lowercase, and numbers"
            isValid = false
        }

        // Confirm password validation
        if confirmPassword.isEmpty {
            confirmPasswordError = "Please confirm your password"
            isValid = false
        } else if password != confirmPassword {
            confirmPasswordError = "Passwords don't match"
            isValid = false
        }

        // Country validation (mandatory)
        if selectedCountry == nil {
            countryError = "Please select your country"
            isValid = false
        } else {
            countryError = nil
        }

        // Phone number validation (mandatory)
        if phoneNumber.isEmpty {
            phoneNumberError = "Phone number is required"
            isValid = false
        } else {
            // Validate local phone number format (digits only, reasonable length)
            let digitsOnly = phoneNumber.filter { $0.isNumber }
            if digitsOnly.count < 6 {
                phoneNumberError = "Phone number is too short"
                isValid = false
            } else if digitsOnly.count > 15 {
                phoneNumberError = "Phone number is too long"
                isValid = false
            } else {
                phoneNumberError = nil
            }
        }

        // Terms acceptance
        if !acceptedTerms {
            errorMessage = "Please accept the Terms & Conditions to continue"
            isValid = false
        }

        // Shake animation on error
        if !isValid {
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.error)
        }

        return isValid
    }

    private func isValidEmail(_ email: String) -> Bool {
        let emailRegex = "[A-Z0-9a-z._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,64}"
        let emailPredicate = NSPredicate(format: "SELF MATCHES %@", emailRegex)
        return emailPredicate.evaluate(with: email)
    }

    private func isValidUsername(_ username: String) -> Bool {
        // Username must be 4+ characters and contain only letters, numbers, dashes, underscores
        guard username.count >= 4 else { return false }
        let usernameRegex = "^[a-zA-Z0-9_-]+$"
        let usernamePredicate = NSPredicate(format: "SELF MATCHES %@", usernameRegex)
        return usernamePredicate.evaluate(with: username)
    }

    private func isValidPhoneNumber(_ phoneNumber: String) -> Bool {
        // Basic validation: must start with + and contain only numbers after that
        let phoneRegex = "^\\+[1-9]\\d{1,14}$"
        let phonePredicate = NSPredicate(format: "SELF MATCHES %@", phoneRegex)
        return phonePredicate.evaluate(with: phoneNumber)
    }

    private func handleMeeshyError(_ error: MeeshyError) {
        switch error {
        case .auth(.invalidCredentials):
            errorMessage = "Invalid registration information"
        case .validation(.custom(let message)):
            errorMessage = message
        case .network(.noConnection):
            errorMessage = "No internet connection. Please check your network."
        case .network(.timeout):
            errorMessage = "Request timed out. Please try again."
        default:
            errorMessage = "Registration failed. Please try again."
        }

        // Error notification haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }

    private func handleError(_ error: Error) {
        // Check for common registration errors
        let errorString = error.localizedDescription.lowercased()

        if errorString.contains("email") && errorString.contains("exists") {
            errorMessage = "This email is already registered. Please sign in instead."
            emailError = "Email already in use"
        } else if errorString.contains("username") && errorString.contains("taken") {
            errorMessage = "This username is already taken. Please try another."
            usernameError = "Username already taken"
            isUsernameAvailable = false
        } else if errorString.contains("phone") && errorString.contains("exists") {
            errorMessage = "This phone number is already registered."
            phoneNumberError = "Phone number already in use"
        } else if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost:
                errorMessage = "No internet connection. Please check your network."
            case .timedOut:
                errorMessage = "Request timed out. Please try again."
            default:
                errorMessage = "Network error. Please try again."
            }
        } else {
            errorMessage = "Registration failed. Please try again."
        }

        // Error notification haptic
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
    }
}

