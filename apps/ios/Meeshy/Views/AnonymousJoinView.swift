//
//  AnonymousJoinView.swift
//  Meeshy
//
//  View for joining a conversation via share link
//  Supports anonymous join, login, and registration
//  iOS 16+
//

import SwiftUI

// MARK: - Join Mode

enum JoinMode: String, CaseIterable {
    case welcome
    case anonymous
    case login
    case register
}

// MARK: - Anonymous Join View

struct AnonymousJoinView: View {
    // MARK: - Properties

    let linkId: String
    let onJoinSuccess: ((String) -> Void)?  // Callback with conversationId

    @StateObject private var linkService = AnonymousLinkService.shared
    @StateObject private var authManager = AuthenticationManager.shared
    @Environment(\.dismiss) private var dismiss

    // State
    @State private var joinMode: JoinMode = .welcome
    @State private var linkInfo: LinkInfoResponse?
    @State private var isLoadingLink = true
    @State private var linkError: String?

    // Anonymous form
    @State private var firstName = ""
    @State private var lastName = ""
    @State private var username = ""
    @State private var email = ""
    @State private var birthday = Date()
    @State private var showBirthdayPicker = false
    @State private var selectedLanguage = "fr"

    // Username validation
    @State private var usernameStatus: UsernameStatus = .idle
    @State private var usernameCheckTask: Task<Void, Never>?

    // Loading states
    @State private var isJoining = false
    @State private var errorMessage: String?

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ZStack {
                backgroundGradient

                if isLoadingLink {
                    loadingView
                } else if let error = linkError {
                    errorView(message: error)
                } else if let info = linkInfo {
                    if info.link.requireAccount && !authManager.isAuthenticated {
                        // Account required - show login/register only
                        accountRequiredView(info: info)
                    } else {
                        mainContentView(info: info)
                    }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundColor(.white.opacity(0.8))
                            .font(.title2)
                    }
                }
            }
        }
        .task {
            await loadLinkInfo()
        }
    }

    // MARK: - Background

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [
                Color.meeshyPrimary,
                Color.meeshyPrimary.opacity(0.8),
                Color(red: 0.1, green: 0.1, blue: 0.2)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 20) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                .scaleEffect(1.5)

            Text("Chargement du lien...")
                .foregroundColor(.white.opacity(0.8))
        }
    }

    // MARK: - Error View

    private func errorView(message: String) -> some View {
        VStack(spacing: 24) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundColor(.orange)

            Text("Lien invalide")
                .font(.title2.bold())
                .foregroundColor(.white)

            Text(message)
                .font(.body)
                .foregroundColor(.white.opacity(0.8))
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)

            Button("Fermer") {
                dismiss()
            }
            .buttonStyle(SecondaryButtonStyle())
            .padding(.top, 16)
        }
    }

    // MARK: - Account Required View

    private func accountRequiredView(info: LinkInfoResponse) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                conversationHeader(info: info)

                VStack(spacing: 16) {
                    Image(systemName: "person.badge.key.fill")
                        .font(.system(size: 50))
                        .foregroundColor(.white.opacity(0.8))

                    Text("Compte requis")
                        .font(.title2.bold())
                        .foregroundColor(.white)

                    Text("Cette conversation nécessite un compte Meeshy pour y accéder.")
                        .font(.body)
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                }
                .padding(.vertical, 24)

                VStack(spacing: 12) {
                    Button("Se connecter") {
                        joinMode = .login
                    }
                    .buttonStyle(PrimaryButtonStyle())

                    Button("Créer un compte") {
                        joinMode = .register
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
                .padding(.horizontal, 32)
            }
            .padding(.vertical, 40)
        }
        .sheet(isPresented: .init(
            get: { joinMode == .login },
            set: { if !$0 { joinMode = .welcome } }
        )) {
            LoginView()
        }
        .sheet(isPresented: .init(
            get: { joinMode == .register },
            set: { if !$0 { joinMode = .welcome } }
        )) {
            // TODO: Add RegisterView when available
            Text("Register View")
        }
    }

    // MARK: - Main Content View

    private func mainContentView(info: LinkInfoResponse) -> some View {
        ScrollView {
            VStack(spacing: 24) {
                conversationHeader(info: info)

                switch joinMode {
                case .welcome:
                    welcomeOptions(info: info)
                case .anonymous:
                    anonymousForm(info: info)
                case .login:
                    EmptyView() // Handled by sheet
                case .register:
                    EmptyView() // Handled by sheet
                }
            }
            .padding(.vertical, 40)
        }
        .sheet(isPresented: .init(
            get: { joinMode == .login },
            set: { if !$0 { joinMode = .welcome } }
        )) {
            LoginView()
        }
    }

    // MARK: - Conversation Header

    private func conversationHeader(info: LinkInfoResponse) -> some View {
        VStack(spacing: 16) {
            // Conversation image or icon
            if let imageUrl = info.conversation?.image, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { image in
                    image
                        .resizable()
                        .scaledToFill()
                } placeholder: {
                    conversationPlaceholderIcon
                }
                .frame(width: 100, height: 100)
                .clipShape(Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.3), lineWidth: 2))
            } else {
                conversationPlaceholderIcon
            }

            VStack(spacing: 8) {
                Text(info.conversation?.title ?? "Conversation")
                    .font(.title2.bold())
                    .foregroundColor(.white)

                if let description = info.conversation?.description {
                    Text(description)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.8))
                        .multilineTextAlignment(.center)
                        .lineLimit(2)
                }

                if let creator = info.creator {
                    Text("Invité par \(creator.displayName ?? creator.username)")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.6))
                }

                if let memberCount = info.conversation?.memberCount, memberCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "person.2.fill")
                        Text("\(memberCount) participants")
                    }
                    .font(.caption)
                    .foregroundColor(.white.opacity(0.6))
                }
            }
        }
        .padding(.horizontal, 32)
    }

    private var conversationPlaceholderIcon: some View {
        ZStack {
            Circle()
                .fill(Color.white.opacity(0.2))
                .frame(width: 100, height: 100)

            AnimatedLogoView(color: .white, lineWidth: 5)
                .frame(width: 60, height: 60)
        }
    }

    // MARK: - Welcome Options

    private func welcomeOptions(info: LinkInfoResponse) -> some View {
        VStack(spacing: 16) {
            Text("Comment souhaitez-vous rejoindre ?")
                .font(.headline)
                .foregroundColor(.white)
                .padding(.top, 24)

            VStack(spacing: 12) {
                // Anonymous join button (only if account not required)
                if !info.link.requireAccount {
                    Button(action: { joinMode = .anonymous }) {
                        HStack {
                            Image(systemName: "person.crop.circle.badge.questionmark")
                            Text("Rejoindre anonymement")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                }

                // Login button
                if info.link.requireAccount {
                    Button(action: { joinMode = .login }) {
                        HStack {
                            Image(systemName: "person.circle.fill")
                            Text("Se connecter")
                        }
                    }
                    .buttonStyle(PrimaryButtonStyle())
                } else {
                    Button(action: { joinMode = .login }) {
                        HStack {
                            Image(systemName: "person.circle.fill")
                            Text("Se connecter")
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }

                // Register button
                Button(action: { joinMode = .register }) {
                    HStack {
                        Image(systemName: "person.badge.plus")
                        Text("Créer un compte")
                    }
                }
                .buttonStyle(SecondaryButtonStyle())
            }
            .padding(.horizontal, 32)

            // Permissions info
            permissionsInfo(info: info)
        }
    }

    // MARK: - Permissions Info

    private func permissionsInfo(info: LinkInfoResponse) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Ce que vous pourrez faire:")
                .font(.caption.bold())
                .foregroundColor(.white.opacity(0.7))

            HStack(spacing: 16) {
                permissionBadge(
                    icon: "message.fill",
                    label: "Messages",
                    enabled: info.link.allowAnonymousMessages
                )
                permissionBadge(
                    icon: "doc.fill",
                    label: "Fichiers",
                    enabled: info.link.allowAnonymousFiles
                )
                permissionBadge(
                    icon: "photo.fill",
                    label: "Images",
                    enabled: info.link.allowAnonymousImages
                )
            }
        }
        .padding()
        .background(Color.white.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal, 32)
        .padding(.top, 24)
    }

    private func permissionBadge(icon: String, label: String, enabled: Bool) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .foregroundColor(enabled ? .green : .gray)
            Text(label)
                .font(.caption2)
                .foregroundColor(.white.opacity(0.7))
        }
    }

    // MARK: - Anonymous Form

    private func anonymousForm(info: LinkInfoResponse) -> some View {
        VStack(spacing: 20) {
            Text("Présentez-vous")
                .font(.headline)
                .foregroundColor(.white)
                .padding(.top, 16)

            VStack(spacing: 16) {
                // First Name (required)
                FormTextField(
                    placeholder: "Prénom *",
                    text: $firstName,
                    icon: "person.fill"
                )

                // Last Name (required)
                FormTextField(
                    placeholder: "Nom *",
                    text: $lastName,
                    icon: "person.fill"
                )

                // Username (optional or required based on link)
                VStack(alignment: .leading, spacing: 4) {
                    FormTextField(
                        placeholder: info.link.requireNickname ? "Nom d'utilisateur *" : "Nom d'utilisateur (optionnel)",
                        text: $username,
                        icon: "at"
                    )
                    .onChange(of: username) { _, newValue in
                        validateUsername(newValue)
                    }

                    // Username status indicator
                    if !username.isEmpty {
                        HStack(spacing: 4) {
                            switch usernameStatus {
                            case .idle:
                                EmptyView()
                            case .checking:
                                ProgressView()
                                    .scaleEffect(0.7)
                                Text("Vérification...")
                            case .available:
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                Text("Disponible")
                            case .taken(let suggestion):
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.red)
                                if let suggestion = suggestion {
                                    Text("Pris. Suggestion: \(suggestion)")
                                } else {
                                    Text("Déjà pris")
                                }
                            }
                        }
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))
                        .padding(.leading, 8)
                    }
                }

                // Email (optional or required based on link)
                if info.link.requireEmail {
                    FormTextField(
                        placeholder: "Email *",
                        text: $email,
                        icon: "envelope.fill",
                        keyboardType: .emailAddress
                    )
                }

                // Birthday (optional or required based on link)
                if info.link.requireBirthday {
                    Button(action: { showBirthdayPicker = true }) {
                        HStack {
                            Image(systemName: "calendar")
                                .foregroundColor(.white.opacity(0.6))
                            Text(birthday == Date() ? "Date de naissance *" : formattedBirthday)
                                .foregroundColor(.white)
                            Spacer()
                        }
                        .padding()
                        .background(Color.white.opacity(0.15))
                        .cornerRadius(12)
                    }
                }

                // Language picker
                VStack(alignment: .leading, spacing: 8) {
                    Text("Votre langue")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.7))

                    Picker("Langue", selection: $selectedLanguage) {
                        ForEach(LanguageHelper.supportedLanguages) { language in
                            Text("\(language.flag) \(language.name)")
                                .tag(language.code)
                        }
                    }
                    .pickerStyle(.menu)
                    .padding()
                    .background(Color.white.opacity(0.15))
                    .cornerRadius(12)
                    .tint(.white)
                }
            }
            .padding(.horizontal, 32)

            // Error message
            if let error = errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .padding(.horizontal, 32)
            }

            // Join button
            Button(action: { Task { await joinAnonymously() } }) {
                if isJoining {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                } else {
                    Text("Rejoindre")
                        .fontWeight(.semibold)
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!isAnonymousFormValid(info: info) || isJoining)
            .padding(.horizontal, 32)
            .padding(.top, 8)

            // Back button
            Button("Retour") {
                joinMode = .welcome
            }
            .foregroundColor(.white.opacity(0.7))
            .padding(.top, 8)
        }
        .sheet(isPresented: $showBirthdayPicker) {
            DatePicker(
                "Date de naissance",
                selection: $birthday,
                displayedComponents: .date
            )
            .datePickerStyle(.wheel)
            .labelsHidden()
            .presentationDetents([.medium])
        }
    }

    // MARK: - Form Validation

    private func isAnonymousFormValid(info: LinkInfoResponse) -> Bool {
        // Required fields
        guard !firstName.trimmingCharacters(in: .whitespaces).isEmpty,
              !lastName.trimmingCharacters(in: .whitespaces).isEmpty else {
            return false
        }

        // Username required check
        if info.link.requireNickname && username.trimmingCharacters(in: .whitespaces).isEmpty {
            return false
        }

        // Username availability check
        if !username.isEmpty {
            switch usernameStatus {
            case .checking, .taken:
                return false
            default:
                break
            }
        }

        // Email required check
        if info.link.requireEmail && email.trimmingCharacters(in: .whitespaces).isEmpty {
            return false
        }

        return true
    }

    private var formattedBirthday: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: birthday)
    }

    // MARK: - Actions

    private func loadLinkInfo() async {
        isLoadingLink = true
        linkError = nil

        do {
            linkInfo = try await linkService.fetchLinkInfo(linkId: linkId)
        } catch let error as AnonymousLinkError {
            linkError = error.localizedDescription
        } catch {
            linkError = error.localizedDescription
        }

        isLoadingLink = false
    }

    private func validateUsername(_ value: String) {
        // Cancel previous task
        usernameCheckTask?.cancel()

        guard !value.trimmingCharacters(in: .whitespaces).isEmpty else {
            usernameStatus = .idle
            return
        }

        usernameStatus = .checking

        usernameCheckTask = Task {
            // Debounce
            try? await Task.sleep(nanoseconds: 500_000_000) // 500ms

            guard !Task.isCancelled else { return }

            do {
                let result = try await linkService.checkUsername(value)
                await MainActor.run {
                    if result.available {
                        usernameStatus = .available
                    } else {
                        usernameStatus = .taken(suggestion: result.suggestedUsername)
                    }
                }
            } catch {
                await MainActor.run {
                    usernameStatus = .idle
                }
            }
        }
    }

    private func joinAnonymously() async {
        guard let info = linkInfo else { return }

        isJoining = true
        errorMessage = nil

        do {
            let response = try await linkService.joinAnonymously(
                linkId: linkId,
                firstName: firstName.trimmingCharacters(in: .whitespaces),
                lastName: lastName.trimmingCharacters(in: .whitespaces),
                username: username.isEmpty ? nil : username.trimmingCharacters(in: .whitespaces),
                email: info.link.requireEmail ? email.trimmingCharacters(in: .whitespaces) : nil,
                birthday: info.link.requireBirthday ? birthday : nil,
                language: selectedLanguage
            )

            // Also login anonymously with AuthManager
            try await authManager.loginAnonymous(
                linkId: linkId,
                firstName: firstName,
                lastName: lastName,
                language: selectedLanguage
            )

            // Success - notify and dismiss
            onJoinSuccess?(response.conversation.id)
            dismiss()

        } catch let error as AnonymousLinkError {
            errorMessage = error.localizedDescription
        } catch {
            errorMessage = error.localizedDescription
        }

        isJoining = false
    }

    // MARK: - Init

    init(linkId: String, onJoinSuccess: ((String) -> Void)? = nil) {
        self.linkId = linkId
        self.onJoinSuccess = onJoinSuccess
    }
}

// MARK: - Username Status

enum UsernameStatus {
    case idle
    case checking
    case available
    case taken(suggestion: String?)
}

// MARK: - Form Text Field

struct FormTextField: View {
    let placeholder: String
    @Binding var text: String
    var icon: String? = nil
    var keyboardType: UIKeyboardType = .default

    var body: some View {
        HStack(spacing: 12) {
            if let icon = icon {
                Image(systemName: icon)
                    .foregroundColor(.white.opacity(0.6))
                    .frame(width: 24)
            }

            TextField(placeholder, text: $text)
                .foregroundColor(.white)
                .keyboardType(keyboardType)
                .autocapitalization(.none)
                .disableAutocorrection(true)
        }
        .padding()
        .background(Color.white.opacity(0.15))
        .cornerRadius(12)
    }
}

// MARK: - Button Styles

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(isEnabled ? Color.white.opacity(0.3) : Color.gray.opacity(0.3))
            .foregroundColor(.white)
            .cornerRadius(12)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .background(Color.clear)
            .foregroundColor(.white)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.5), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
    }
}

// MARK: - Preview

#Preview {
    AnonymousJoinView(linkId: "test_link_id")
}
