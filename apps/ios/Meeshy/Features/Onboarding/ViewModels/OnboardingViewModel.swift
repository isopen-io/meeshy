//
//  OnboardingViewModel.swift
//  Meeshy
//
//  View model for onboarding flow
//  Minimum iOS 16+
//

import SwiftUI
import UserNotifications

@MainActor
final class OnboardingViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var currentStep: Int = 0
    @Published var displayName: String = ""
    @Published var selectedLanguage: String = "en"
    @Published var profileImage: UIImage?
    @Published var notificationsEnabled: Bool = false
    @Published var isLoading: Bool = false
    @Published var isOnboardingComplete: Bool = false

    // MARK: - Private Properties

    private let authManager = AuthenticationManager.shared

    // MARK: - Constants

    /// Onboarding now has only 1 step (permissions)
    /// Profile setup happens AFTER login, not during initial onboarding
    let totalSteps = 1
    let availableLanguages = [
        SupportedLanguage(code: "en", name: "English", flag: "🇬🇧", color: nil, translateText: nil),
        SupportedLanguage(code: "fr", name: "Français", flag: "🇫🇷", color: nil, translateText: nil),
        SupportedLanguage(code: "ru", name: "Русский", flag: "🇷🇺", color: nil, translateText: nil)
    ]

    // MARK: - Private Properties

    // private let authService = AuthService.shared // AuthService excluded for MVP

    // MARK: - Public Methods

    /// Move to next onboarding step
    func nextStep() {
        guard currentStep < totalSteps - 1 else {
            completeOnboarding()
            return
        }

        withAnimation(.easeInOut(duration: 0.3)) {
            currentStep += 1
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }

    /// Move to previous step
    func previousStep() {
        guard currentStep > 0 else { return }

        withAnimation(.easeInOut(duration: 0.3)) {
            currentStep -= 1
        }

        // Haptic feedback
        let generator = UIImpactFeedbackGenerator(style: .light)
        generator.impactOccurred()
    }

    /// Skip current step
    func skipStep() {
        nextStep()
    }

    /// Request notification permissions
    func requestNotificationPermission() async {
        do {
            let granted = try await UNUserNotificationCenter.current().requestAuthorization(
                options: [.alert, .badge, .sound]
            )

            notificationsEnabled = granted

            if granted {
                // Success haptic
                let generator = UINotificationFeedbackGenerator()
                generator.notificationOccurred(.success)
            }

        } catch {
            print("Notification permission error: \(error)")
        }
    }

    /// Complete onboarding and update user profile
    func completeOnboarding() {
        isLoading = true

        Task {
            // Update user profile with onboarding data
            await updateUserProfile()

            // Mark onboarding as complete
            UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")

            // Success haptic
            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            isLoading = false

            // Signal completion to dismiss the view
            isOnboardingComplete = true
        }
    }

    // MARK: - Private Methods

    private func updateUserProfile() async {
        guard authManager.currentUser != nil else { return }

        let userService = UserService.shared

        // 1. Upload avatar if provided
        if let image = profileImage {
            await uploadAvatar(image: image, userService: userService)
        }

        // 2. Update profile (display name + language)
        if !displayName.isEmpty || selectedLanguage != "en" {
            await updateProfileData(userService: userService)
        }
    }

    private func uploadAvatar(image: UIImage, userService: UserService) async {
        // Compress image to JPEG
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            print("[Onboarding] Failed to compress avatar image")
            return
        }

        do {
            let updatedUser = try await userService.uploadAvatar(imageData: imageData)
            // Update local user
            authManager.updateCurrentUser(updatedUser)
            print("[Onboarding] Avatar uploaded successfully")
        } catch {
            print("[Onboarding] Failed to upload avatar: \(error)")
        }
    }

    private func updateProfileData(userService: UserService) async {
        var request = UserProfileUpdateRequest()

        if !displayName.isEmpty {
            request.displayName = displayName
        }

        if selectedLanguage != "en" {
            request.systemLanguage = selectedLanguage
        }

        do {
            let updatedUser = try await userService.updateProfile(request: request)
            // Update local user
            authManager.updateCurrentUser(updatedUser)
            print("[Onboarding] Profile updated successfully")
        } catch {
            print("[Onboarding] Failed to update profile: \(error)")
        }
    }
}
