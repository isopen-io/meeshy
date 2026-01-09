//
//  ProfileViewModel.swift
//  Meeshy
//
//  Manages user profile state and operations
//  iOS 16+
//

import Foundation
import SwiftUI
import UIKit
import OSLog
import PhotosUI

@MainActor
final class ProfileViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var user: User?
    @Published var isLoading: Bool = false
    @Published var isEditingProfile: Bool = false
    @Published var isUploadingAvatar: Bool = false
    @Published var error: Error?

    // Edit fields
    @Published var editDisplayName: String = ""
    @Published var editBio: String = ""
    @Published var editPhoneNumber: String = ""

    // Statistics
    @Published var conversationCount: Int = 0
    @Published var messagesSent: Int = 0
    
    // Settings
    @Published var notificationsEnabled: Bool = true
    @Published var autoTranslate: Bool = false
    @Published var twoFactorEnabled: Bool = false
    @Published var showOnlineStatus: Bool = true
    @Published var sendReadReceipts: Bool = true
    @Published var profileVisibility: String = "everyone"
    @Published var blockedUsersCount: Int = 0
    @Published var appTheme: String = "system"
    @Published var storageUsed: Int = 0
    
    // Status
    @Published var isOnline: Bool = false
    @Published var isAway: Bool = false

    // MARK: - Private Properties

    private let logger = userLogger
    private let userService: UserService
    private let authManager: AuthenticationManager
    // private let conversationService: ConversationService // Temporarily disabled

    // MARK: - Initialization

    init(
        userService: UserService = UserService.shared,
        authManager: AuthenticationManager = AuthenticationManager.shared
        // conversationService: ConversationService = ConversationService.shared
    ) {
        self.userService = userService
        self.authManager = authManager
        // self.conversationService = conversationService

        // Load current user
        self.user = authManager.currentUser
        if let user = self.user {
            self.editDisplayName = user.displayName ?? ""
            self.editBio = user.bio ?? ""
            self.editPhoneNumber = user.phoneNumber ?? ""
        }
    }

    // MARK: - Profile Loading

    func loadProfile() async {
        guard !isLoading else { 
            profileLogger.info("⏭️ Skipping profile load - already loading")
            return
        }

        profileLogger.info("🔄 Starting to load user profile...")
        isLoading = true
        error = nil

        // First, try to use the current user from AuthenticationManager
        if let currentUser = authManager.currentUser {
            profileLogger.info("✅ Using current user from AuthenticationManager: \(currentUser.username)")
            self.user = currentUser
            self.editDisplayName = currentUser.displayName ?? ""
            self.editBio = currentUser.bio ?? ""
            self.editPhoneNumber = currentUser.phoneNumber ?? ""
            
            isLoading = false
            
            // Load statistics in background
            Task {
                await loadStatistics()
            }
            return
        }

        // If no current user, try to fetch from API
        do {
            // Fetch updated user profile
            let updatedUser = try await userService.getCurrentUser()
            self.user = updatedUser
            self.editDisplayName = updatedUser.displayName ?? ""
            self.editBio = updatedUser.bio ?? ""
            self.editPhoneNumber = updatedUser.phoneNumber ?? ""

            // Update auth manager
            authManager.updateCurrentUser(updatedUser)

            profileLogger.info("✅ Successfully loaded profile for user: \(updatedUser.username)")

            // Load statistics
            await loadStatistics()
        } catch {
            profileLogger.error("❌ Error loading profile: \(error)")
            self.error = error
            
            // TEMPORARY: Use mock data if service is not implemented
            // This prevents the app from crashing during development
            if (error as NSError).code == -1 {
                profileLogger.info("⚠️ Using mock profile data due to unimplemented service")
                useMockProfile()
            } else {
                profileLogger.info("⚠️ Using mock profile data due to unimplemented service error != 0")
                useMockProfile()
            }
        }

        isLoading = false
    }
    
    // MARK: - Mock Data (Temporary for Development)
    
    private func useMockProfile() {
        // Create a mock user if we don't have one from AuthService
        if self.user == nil {
            self.user = User(
                id: "mock-user-id",
                username: "demo_user",
                firstName: "Utilisateur",
                lastName: "Demo",
                bio: "Ceci est un profil de démonstration en attendant l'implémentation complète du backend.",
                email: "demo@meeshy.me",
                phoneNumber: "+33 6 12 34 56 78",
                displayName: "Utilisateur Demo",
                isOnline: true,
                lastActiveAt: Date(),
                systemLanguage: "fr",
                regionalLanguage: "fr",
                createdAt: Date(),
                updatedAt: Date()
            )
            
            self.editDisplayName = self.user?.displayName ?? ""
            self.editBio = self.user?.bio ?? ""
            self.editPhoneNumber = self.user?.phoneNumber ?? ""
        }
        
        // Mock statistics
        self.conversationCount = 3
        self.messagesSent = 42
    }

    func loadStatistics() async {
        do {
            // Fetch conversation count
            // Temporarily disabled - ConversationService may not be available
            // let conversations = try await conversationService.fetchConversations()
            // self.conversationCount = conversations.count
            self.conversationCount = 0 // Default value

            // Fetch messages sent count from API
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/me/statistics") else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }

            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            
            logger.info("📊 Fetching user statistics from: \(url.absoluteString)")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }

            if httpResponse.statusCode == 200 {
                let decoder = JSONDecoder()
                if let stats = try? decoder.decode(UserStatistics.self, from: data) {
                    self.messagesSent = stats.messagesSent
                    logger.info("Loaded user statistics: \(stats.messagesSent) messages sent")
                }
            } else if httpResponse.statusCode == 404 {
                // Endpoint not implemented yet
                self.messagesSent = 0
                logger.warn("Statistics endpoint not implemented")
            }
        } catch {
            logger.error("Error loading statistics: \(error)")
        }
    }

    // MARK: - Profile Updates

    func updateProfileFromEditFields() async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            var request = UserProfileUpdateRequest()
            request.displayName = editDisplayName.isEmpty ? nil : editDisplayName
            request.bio = editBio.isEmpty ? nil : editBio
            request.phoneNumber = editPhoneNumber.isEmpty ? nil : editPhoneNumber

            let updatedUser = try await userService.updateProfile(request: request)
            self.user = updatedUser
            authManager.updateCurrentUser(updatedUser)

            logger.info("Updated user profile")
            isLoading = false
            return true
        } catch {
            logger.error("Error updating profile: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }
    
    func updateProfile(request: UserProfileUpdateRequest) async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            let updatedUser = try await userService.updateProfile(request: request)
            self.user = updatedUser
            
            // Update local edit fields with the new values
            self.editDisplayName = updatedUser.displayName ?? ""
            self.editBio = updatedUser.bio ?? ""
            self.editPhoneNumber = updatedUser.phoneNumber ?? ""
            
            authManager.updateCurrentUser(updatedUser)

            logger.info("Updated user profile")
            isLoading = false
            return true
        } catch {
            logger.error("Error updating profile: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }

    func uploadAvatar(_ image: UIImage) async -> Bool {
        guard !isUploadingAvatar else { return false }

        isUploadingAvatar = true
        error = nil

        do {
            // Compress image
            guard let imageData = image.jpegData(compressionQuality: 0.7) else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to compress image"])
            }

            let updatedUser = try await userService.uploadAvatar(imageData: imageData)
            self.user = updatedUser
            authManager.updateCurrentUser(updatedUser)

            logger.info("Uploaded avatar")
            isUploadingAvatar = false
            return true
        } catch {
            logger.error("Error uploading avatar: \(error)")
            self.error = error
            isUploadingAvatar = false
            return false
        }
    }

    // MARK: - Settings

    func updateSettings(
        notificationsEnabled: Bool? = nil,
        translationEnabled: Bool? = nil,
        autoTranslateEnabled: Bool? = nil,
        preferredLanguage: String? = nil
    ) async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            var request = UserProfileUpdateRequest()
            // Note: notificationsEnabled and translationEnabled not in UserProfileUpdateRequest model
            request.autoTranslateEnabled = autoTranslateEnabled
            if let language = preferredLanguage {
                request.systemLanguage = language
            }

            let updatedUser = try await userService.updateProfile(request: request)
            self.user = updatedUser
            authManager.updateCurrentUser(updatedUser)

            logger.info("Updated user settings")
            isLoading = false
            return true
        } catch {
            logger.error("Error updating settings: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }

    // MARK: - Authentication

    func logout() async {
        do {
            try await authManager.logout()
            logger.info("User logged out")
        } catch {
            logger.error("Logout failed: \(error)")
        }
    }
    
    // MARK: - Password Management
    
    func changePassword(currentPassword: String, newPassword: String) async -> Bool {
        guard !isLoading else { return false }
        
        isLoading = true
        error = nil
        
        do {
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/me/password") else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }
            
            logger.info("🔐 Changing password at: \(url.absoluteString)")
            
            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }
            
            let body: [String: Any] = [
                "currentPassword": currentPassword,
                "newPassword": newPassword
            ]
            
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
            
            let (_, response) = try await URLSession.shared.data(for: request)
            
            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }
            
            if httpResponse.statusCode == 200 || httpResponse.statusCode == 204 {
                logger.info("Password changed successfully")
                isLoading = false
                return true
            } else if httpResponse.statusCode == 401 {
                throw NSError(domain: "ProfileViewModel", code: 401, userInfo: [NSLocalizedDescriptionKey: "Mot de passe actuel incorrect"])
            } else if httpResponse.statusCode == 404 {
                logger.warn("Change password endpoint not implemented")
                // For demo purposes, consider it successful
                isLoading = false
                return true
            } else {
                throw NSError(domain: "ProfileViewModel", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Erreur lors du changement de mot de passe"])
            }
        } catch {
            logger.error("Error changing password: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }
    
    func changeEmail(newEmail: String, password: String) async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/me/email") else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }

            logger.info("📧 Changing email at: \(url.absoluteString)")

            var request = URLRequest(url: url)
            request.httpMethod = "PUT"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let body: [String: Any] = [
                "email": newEmail,
                "password": password
            ]

            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }

            if httpResponse.statusCode == 200 {
                // Try to decode updated user
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds

                if let updatedUser = try? decoder.decode(User.self, from: data) {
                    self.user = updatedUser
                    authManager.updateCurrentUser(updatedUser)
                }

                logger.info("Email changed successfully")
                isLoading = false
                return true
            } else if httpResponse.statusCode == 401 {
                throw NSError(domain: "ProfileViewModel", code: 401, userInfo: [NSLocalizedDescriptionKey: "Mot de passe incorrect"])
            } else if httpResponse.statusCode == 409 {
                throw NSError(domain: "ProfileViewModel", code: 409, userInfo: [NSLocalizedDescriptionKey: "Cet email est déjà utilisé"])
            } else if httpResponse.statusCode == 404 {
                logger.warn("Change email endpoint not implemented")
                // For demo purposes, consider it successful
                isLoading = false
                return true
            } else {
                throw NSError(domain: "ProfileViewModel", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Erreur lors du changement d'email"])
            }
        } catch {
            logger.error("Error changing email: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }

    // MARK: - Phone Number Change

    /// Temporary storage for phone change verification
    private static var pendingPhoneChange: String?

    func changePhoneNumber(newPhone: String, password: String) async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/me/phone/request") else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }

            logger.info("📱 Requesting phone change at: \(url.absoluteString)")

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let body: [String: Any] = [
                "phoneNumber": newPhone,
                "password": password
            ]

            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                // Store pending phone for verification
                ProfileViewModel.pendingPhoneChange = newPhone
                logger.info("Phone change verification code sent")
                isLoading = false
                return true
            } else if httpResponse.statusCode == 401 {
                throw NSError(domain: "ProfileViewModel", code: 401, userInfo: [NSLocalizedDescriptionKey: "Mot de passe incorrect"])
            } else if httpResponse.statusCode == 409 {
                throw NSError(domain: "ProfileViewModel", code: 409, userInfo: [NSLocalizedDescriptionKey: "Ce numéro est déjà utilisé"])
            } else if httpResponse.statusCode == 404 {
                logger.warn("Change phone endpoint not implemented")
                // For demo purposes, store the pending phone and return success
                ProfileViewModel.pendingPhoneChange = newPhone
                isLoading = false
                return true
            } else {
                throw NSError(domain: "ProfileViewModel", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Erreur lors du changement de numéro"])
            }
        } catch {
            logger.error("Error requesting phone change: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }

    func verifyPhoneChangeCode(code: String) async -> Bool {
        guard !isLoading else { return false }

        isLoading = true
        error = nil

        do {
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/me/phone/verify") else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }

            logger.info("📱 Verifying phone change code at: \(url.absoluteString)")

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let body: [String: Any] = [
                "code": code
            ]

            request.httpBody = try? JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "ProfileViewModel", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }

            if httpResponse.statusCode == 200 {
                // Try to decode updated user
                let decoder = JSONDecoder()
                decoder.dateDecodingStrategy = .iso8601WithFractionalSeconds

                if let updatedUser = try? decoder.decode(User.self, from: data) {
                    self.user = updatedUser
                    self.editPhoneNumber = updatedUser.phoneNumber ?? ""
                    authManager.updateCurrentUser(updatedUser)
                } else if let pendingPhone = ProfileViewModel.pendingPhoneChange {
                    // Update local state if we can't decode the response
                    self.editPhoneNumber = pendingPhone
                }

                ProfileViewModel.pendingPhoneChange = nil
                logger.info("Phone number changed successfully")
                isLoading = false
                return true
            } else if httpResponse.statusCode == 400 {
                throw NSError(domain: "ProfileViewModel", code: 400, userInfo: [NSLocalizedDescriptionKey: "Code de vérification invalide"])
            } else if httpResponse.statusCode == 410 {
                throw NSError(domain: "ProfileViewModel", code: 410, userInfo: [NSLocalizedDescriptionKey: "Code expiré, veuillez en demander un nouveau"])
            } else if httpResponse.statusCode == 404 {
                logger.warn("Verify phone endpoint not implemented")
                // For demo purposes, update the phone number locally
                if let pendingPhone = ProfileViewModel.pendingPhoneChange {
                    self.editPhoneNumber = pendingPhone
                }
                ProfileViewModel.pendingPhoneChange = nil
                isLoading = false
                return true
            } else {
                throw NSError(domain: "ProfileViewModel", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Erreur lors de la vérification"])
            }
        } catch {
            logger.error("Error verifying phone change: \(error)")
            self.error = error
            isLoading = false
            return false
        }
    }

    // MARK: - Edit Mode

    func startEditing() {
        if let user = user {
            editDisplayName = user.displayName ?? ""
            editBio = user.bio ?? ""
            editPhoneNumber = user.phoneNumber ?? ""
        }
        isEditingProfile = true
    }

    func cancelEditing() {
        isEditingProfile = false
    }

    func hasChanges() -> Bool {
        guard let user = user else { return false }

        return editDisplayName != (user.displayName ?? "") ||
               editBio != (user.bio ?? "") ||
               editPhoneNumber != (user.phoneNumber ?? "")
    }
    
    // MARK: - Avatar Update from PhotosPicker
    
    func updateAvatar(from item: PhotosPickerItem) async {
        guard !isUploadingAvatar else { return }
        
        isUploadingAvatar = true
        
        do {
            // Load image data from PhotosPickerItem
            guard let data = try await item.loadTransferable(type: Data.self) else {
                logger.error("Failed to load image data from PhotosPickerItem")
                isUploadingAvatar = false
                return
            }
            
            // Update avatar with the loaded data
            let updatedUser = try await userService.uploadAvatar(imageData: data)
            self.user = updatedUser
            authManager.updateCurrentUser(updatedUser)
            
            logger.info("Avatar updated successfully")
        } catch {
            logger.error("Error updating avatar: \(error)")
            self.error = error
        }
        
        isUploadingAvatar = false
    }
    
    // MARK: - Status Management
    
    func toggleOnlineStatus() async {
        isOnline.toggle()
        // TODO: Update online status on server
        logger.info("Online status toggled: \(self.isOnline)")
    }
    
    func toggleAwayStatus() async {
        isAway.toggle()
        // TODO: Update away status on server
        logger.info("Away status toggled: \(self.isAway)")
    }
    
    // MARK: - Two-Factor Authentication
    
    func updateTwoFactorAuth(enabled: Bool) async {
        twoFactorEnabled = enabled
        // TODO: Update 2FA on server
        logger.info("Two-factor authentication toggled: \(enabled)")
    }
}

// MARK: - Other User Profile ViewModel

@MainActor
final class UserProfileViewModel: ObservableObject {
    // MARK: - Published Properties

    @Published var user: User?
    @Published var isLoading: Bool = false
    @Published var error: Error?

    // MARK: - Private Properties

    private let userService: UserService
    private let authManager: AuthenticationManager
    private let userId: String
    private let logger = Logger(subsystem: "com.meeshy.ios", category: "UserProfileViewModel")

    // MARK: - Initialization

    init(userId: String, userService: UserService = UserService.shared, authManager: AuthenticationManager = AuthenticationManager.shared) {
        self.userId = userId
        self.userService = userService
        self.authManager = authManager
    }

    // MARK: - Data Loading

    func loadUser() async {
        guard !isLoading else { 
            logger.info("⏭️ Skipping user load - already loading")
            return 
        }

        logger.info("🔄 Starting to load user profile for: \(self.userId)")
        isLoading = true
        error = nil

        do {
            let fetchedUser = try await userService.getUser(userId: userId)
            self.user = fetchedUser
            logger.info("✅ Successfully loaded user: \(fetchedUser.username) (ID: \(self.userId))")
        } catch {
            logger.error("❌ Error loading user \(self.userId): \(error)")
            self.error = error
        }

        isLoading = false
    }

    // MARK: - Actions

    func blockUser() async {
        guard let userId = user?.id else { return }

        do {
            let baseURL = APIConfiguration.shared.currentBaseURL
            guard let url = URL(string: "\(baseURL)/api/users/\(userId)/block") else {
                logger.error("Invalid URL for blocking user")
                return
            }
            
            logger.info("🚫 Blocking user \(userId) at: \(url.absoluteString)")

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                logger.error("Invalid response when blocking user")
                return
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                logger.info("User blocked successfully: \(userId)")
            } else if httpResponse.statusCode == 404 {
                logger.info("Block user endpoint not implemented")
            } else {
                logger.error("Failed to block user: \(httpResponse.statusCode)")
            }
        } catch {
            logger.error("Error blocking user: \(error)")
            self.error = error
        }
    }

    /*
    func unblockUser() async {
        guard let userId = user?.id else { return }

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/\(userId)/unblock") else {
                throw APIError.invalidURL
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                logger.info("User unblocked successfully: \(userId)")
                // Update local state
                if var currentUser = user {
                    currentUser.isBlocked = false
                    self.user = currentUser
                }
            } else if httpResponse.statusCode == 404 {
                logger.warn("Unblock user endpoint not implemented")
            } else {
                throw APIError.serverError("Failed to unblock user: \(httpResponse.statusCode)")
            }
        } catch {
            logger.error("Error unblocking user: \(error)")
            self.error = error
        }
    }

    func reportUser(reason: String, description: String) async {
        guard let userId = user?.id else { return }

        do {
            guard let url = URL(string: "\(APIConfiguration.shared.currentBaseURL)/users/\(userId)/report") else {
                throw APIError.invalidURL
            }

            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            if let token = authManager.accessToken {
                request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            }

            let reportData: [String: Any] = [
                "reason": reason,
                "description": description,
                "timestamp": ISO8601DateFormatter().string(from: Date())
            ]

            request.httpBody = try? JSONSerialization.data(withJSONObject: reportData)

            let (_, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                logger.info("User reported successfully: \(userId)")
            } else if httpResponse.statusCode == 404 {
                logger.warn("Report user endpoint not implemented")
            } else {
                throw APIError.serverError("Failed to report user: \(httpResponse.statusCode)")
            }
        } catch {
            logger.error("Error reporting user: \(error)")
            self.error = error
        }
    }
    */
}

// MARK: - User Statistics Model

struct UserStatistics: Codable {
    let messagesSent: Int
    let conversationsCount: Int?
    let callsMade: Int?
    let callsReceived: Int?
}
