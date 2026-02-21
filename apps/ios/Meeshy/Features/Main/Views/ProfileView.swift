import SwiftUI
import MeeshySDK

struct ProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared

    @State private var displayName: String = ""
    @State private var bio: String = ""
    @State private var isEditing = false
    @State private var isSaving = false

    private let accentColor = "9B59B6"

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .onAppear {
            displayName = user?.displayName ?? user?.username ?? ""
            bio = user?.bio ?? ""
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Profil")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                HapticFeedback.light()
                if isEditing {
                    saveProfile()
                } else {
                    isEditing = true
                }
            } label: {
                Text(isEditing ? "Enregistrer" : "Modifier")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                avatarSection
                infoSection
                statsSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Avatar Section

    private var avatarSection: some View {
        VStack(spacing: 12) {
            MeeshyAvatar(
                name: user?.displayName ?? user?.username ?? "?",
                mode: .custom(90),
                accentColor: accentColor,
                secondaryColor: "4ECDC4",
                avatarURL: user?.avatar
            )

            if !isEditing {
                VStack(spacing: 4) {
                    Text(user?.displayName ?? user?.username ?? "Utilisateur")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(theme.textPrimary)

                    if let username = user?.username {
                        Text("@\(username)")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Color(hex: accentColor))
                    }
                }
            }
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                Text("INFORMATIONS")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: accentColor))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            VStack(spacing: 0) {
                profileField(
                    icon: "person.fill",
                    title: "Nom d'affichage",
                    value: $displayName,
                    placeholder: "Votre nom"
                )

                profileField(
                    icon: "text.quote",
                    title: "Bio",
                    value: $bio,
                    placeholder: "Parlez de vous..."
                )

                if let email = user?.email {
                    profileInfoRow(icon: "envelope.fill", title: "Email", value: email)
                }

                profileInfoRow(
                    icon: "calendar",
                    title: "Membre depuis",
                    value: user?.createdAt.flatMap { parseAndFormatDate($0) } ?? "—"
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: accentColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: accentColor), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Stats Section

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "4ECDC4"))
                Text("STATISTIQUES")
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundColor(Color(hex: "4ECDC4"))
                    .tracking(1.2)
            }
            .padding(.leading, 4)

            HStack(spacing: 12) {
                statCard(value: "—", label: "Messages", color: "FF6B6B")
                statCard(value: "—", label: "Conversations", color: "4ECDC4")
                statCard(value: "—", label: "Amis", color: "9B59B6")
            }
        }
    }

    // MARK: - Components

    private func profileField(
        icon: String,
        title: String,
        value: Binding<String>,
        placeholder: String
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: accentColor).opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                if isEditing {
                    TextField(placeholder, text: value)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                } else {
                    Text(value.wrappedValue.isEmpty ? placeholder : value.wrappedValue)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(value.wrappedValue.isEmpty ? theme.textMuted : theme.textPrimary)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func profileInfoRow(icon: String, title: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: accentColor).opacity(0.12))
                )

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func statCard(value: String, label: String, color: String) -> some View {
        VStack(spacing: 6) {
            Text(value)
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))

            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(theme.textMuted)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 16)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(theme.border(tint: color), lineWidth: 1)
                )
        )
    }

    // MARK: - Actions

    private func saveProfile() {
        isSaving = true
        Task {
            do {
                struct UpdateProfileBody: Encodable {
                    let displayName: String?
                    let bio: String?
                }
                let body = UpdateProfileBody(
                    displayName: displayName.isEmpty ? nil : displayName,
                    bio: bio.isEmpty ? nil : bio
                )
                let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.put(
                    endpoint: "/users/me",
                    body: body
                )
                HapticFeedback.success()
            } catch {
                HapticFeedback.error()
            }
            isSaving = false
            isEditing = false
        }
    }

    private func parseAndFormatDate(_ dateString: String) -> String? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = iso.date(from: dateString) else { return nil }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.locale = Locale(identifier: "fr_FR")
        return formatter.string(from: date)
    }
}
