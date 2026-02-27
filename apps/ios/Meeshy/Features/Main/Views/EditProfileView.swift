import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared
    @ObservedObject private var authManager = AuthManager.shared

    @State private var displayName: String = ""
    @State private var bio: String = ""
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var selectedImageData: Data?
    @State private var avatarPreviewImage: Image?
    @State private var isSaving = false
    @State private var isUploadingAvatar = false
    @State private var errorMessage: String?
    @State private var showSuccess = false

    private let accentColor = "08D9D6"
    private let bioMaxLength = 300

    private var user: MeeshyUser? { authManager.currentUser }

    private var hasChanges: Bool {
        let nameChanged = displayName != (user?.displayName ?? user?.username ?? "")
        let bioChanged = bio != (user?.bio ?? "")
        let avatarChanged = selectedImageData != nil
        return nameChanged || bioChanged || avatarChanged
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }

            if showSuccess {
                successOverlay
            }
        }
        .onAppear {
            displayName = user?.displayName ?? user?.username ?? ""
            bio = user?.bio ?? ""
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            loadSelectedPhoto(newItem)
        }
    }

    // MARK: - Header

    private var header: some View {
        HStack {
            Button {
                HapticFeedback.light()
                dismiss()
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }

            Spacer()

            Text("Modifier le profil")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 24) {
                avatarSection
                fieldsSection
                readOnlySection
                saveButton

                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Avatar Section

    private var avatarSection: some View {
        VStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                if let avatarPreviewImage {
                    avatarPreviewImage
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(Color(hex: accentColor).opacity(0.4), lineWidth: 2)
                        )
                } else {
                    MeeshyAvatar(
                        name: user?.displayName ?? user?.username ?? "?",
                        mode: .custom(100),
                        accentColor: accentColor,
                        secondaryColor: "4ECDC4",
                        avatarURL: user?.avatar
                    )
                }

                PhotosPicker(
                    selection: $selectedPhotoItem,
                    matching: .images,
                    photoLibrary: .shared()
                ) {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 30, height: 30)
                        .background(
                            Circle()
                                .fill(Color(hex: accentColor))
                        )
                        .overlay(
                            Circle()
                                .stroke(theme.backgroundPrimary, lineWidth: 2)
                        )
                }
            }

            if isUploadingAvatar {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(Color(hex: accentColor))
                    Text("Envoi de la photo...")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Fields Section

    private var fieldsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Informations", icon: "pencil.circle.fill", color: accentColor)

            VStack(spacing: 0) {
                editableField(
                    icon: "person.fill",
                    title: "Nom d'affichage",
                    text: $displayName,
                    placeholder: "Votre nom"
                )

                bioField
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

    private var bioField: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "text.quote")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: accentColor))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: accentColor).opacity(0.12))
                )
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text("Bio")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField("Parlez de vous...", text: $bio, axis: .vertical)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(3...6)
                    .onChange(of: bio) { _, newValue in
                        if newValue.count > bioMaxLength {
                            bio = String(newValue.prefix(bioMaxLength))
                        }
                    }

                HStack {
                    Spacer()
                    Text("\(bio.count)/\(bioMaxLength)")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(bio.count >= bioMaxLength ? Color(hex: "EF4444") : theme.textMuted)
                }
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: - Read-Only Section

    private var readOnlySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Compte", icon: "lock.fill", color: "9B59B6")

            VStack(spacing: 0) {
                if let email = user?.email {
                    readOnlyRow(icon: "envelope.fill", title: "Email", value: email, color: "9B59B6")
                }

                if let phone = user?.phoneNumber {
                    readOnlyRow(icon: "phone.fill", title: "Telephone", value: phone, color: "9B59B6")
                }

                readOnlyRow(
                    icon: "at",
                    title: "Nom d'utilisateur",
                    value: "@\(user?.username ?? "—")",
                    color: "9B59B6"
                )
            }
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(theme.surfaceGradient(tint: "9B59B6"))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(theme.border(tint: "9B59B6"), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        VStack(spacing: 8) {
            if let errorMessage {
                Text(errorMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "EF4444"))
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            Button {
                HapticFeedback.medium()
                saveProfile()
            } label: {
                HStack(spacing: 8) {
                    if isSaving {
                        ProgressView()
                            .scaleEffect(0.8)
                            .tint(.white)
                    }
                    Text("Sauvegarder")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(
                            hasChanges && !isSaving
                                ? Color(hex: accentColor)
                                : Color(hex: accentColor).opacity(0.4)
                        )
                )
            }
            .disabled(!hasChanges || isSaving)
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 48))
                .foregroundColor(Color(hex: "4ADE80"))

            Text("Profil mis a jour")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 20)
                        .stroke(Color(hex: "4ADE80").opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Reusable Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(.system(size: 11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func editableField(
        icon: String,
        title: String,
        text: Binding<String>,
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

                TextField(placeholder, text: text)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }

            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    private func readOnlyRow(icon: String, title: String, value: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
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

    // MARK: - Actions

    private func loadSelectedPhoto(_ item: PhotosPickerItem?) {
        guard let item else { return }
        Task {
            guard let data = try? await item.loadTransferable(type: Data.self) else { return }
            selectedImageData = data
            if let uiImage = UIImage(data: data) {
                avatarPreviewImage = Image(uiImage: uiImage)
            }
        }
    }

    private func saveProfile() {
        isSaving = true
        errorMessage = nil

        Task { [weak authManager] in
            do {
                if let imageData = selectedImageData {
                    isUploadingAvatar = true
                    let avatarURL = try await uploadAvatar(imageData)
                    isUploadingAvatar = false

                    struct AvatarBody: Encodable {
                        let avatar: String
                    }
                    let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.request(
                        endpoint: "/users/me/avatar",
                        method: "PATCH",
                        body: try JSONEncoder().encode(AvatarBody(avatar: avatarURL))
                    )
                }

                struct UpdateProfileBody: Encodable {
                    let displayName: String?
                    let bio: String?
                }
                let body = UpdateProfileBody(
                    displayName: displayName.isEmpty ? nil : displayName,
                    bio: bio
                )
                let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.patch(
                    endpoint: "/users/me",
                    body: body
                )

                await authManager?.checkExistingSession()

                HapticFeedback.success()
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                    showSuccess = true
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
                dismiss()
            } catch let error as MeeshyError {
                HapticFeedback.error()
                errorMessage = error.errorDescription
                isUploadingAvatar = false
            } catch let error as APIError {
                HapticFeedback.error()
                errorMessage = error.errorDescription
                isUploadingAvatar = false
            } catch {
                HapticFeedback.error()
                errorMessage = "Une erreur est survenue"
                isUploadingAvatar = false
            }
            isSaving = false
        }
    }

    private func uploadAvatar(_ imageData: Data) async throws -> String {
        let compressed = compressImage(imageData, maxSizeKB: 500)

        let boundary = UUID().uuidString
        var body = Data()

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"files\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(compressed)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        guard let url = URL(string: "\(APIClient.shared.baseURL)/attachments/upload") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        if let token = APIClient.shared.authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = body

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.serverError(
                (response as? HTTPURLResponse)?.statusCode ?? 500,
                "Echec de l'envoi de l'avatar"
            )
        }

        struct UploadResponse: Decodable {
            let success: Bool
            let data: UploadData
        }
        struct UploadData: Decodable {
            let attachments: [UploadedAttachment]
        }
        struct UploadedAttachment: Decodable {
            let url: String
        }

        let decoded = try JSONDecoder().decode(UploadResponse.self, from: data)
        guard let avatarURL = decoded.data.attachments.first?.url else {
            throw APIError.noData
        }
        return avatarURL
    }

    private func compressImage(_ data: Data, maxSizeKB: Int) -> Data {
        guard let image = UIImage(data: data) else { return data }
        var compression: CGFloat = 0.8
        var compressed = image.jpegData(compressionQuality: compression) ?? data
        while compressed.count > maxSizeKB * 1024, compression > 0.1 {
            compression -= 0.1
            compressed = image.jpegData(compressionQuality: compression) ?? data
        }
        return compressed
    }
}
