import SwiftUI
import Combine
import PhotosUI
import MeeshySDK
import MeeshyUI

struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    @EnvironmentObject private var authManager: AuthManager

    @StateObject private var viewModel: EditProfileViewModel

    @State private var selectedPhotoItem: PhotosPickerItem?

    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    private let accentColor = "818CF8"

    init(viewModel: EditProfileViewModel = EditProfileViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    private var user: MeeshyUser? { authManager.currentUser }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }

            if viewModel.showSuccess {
                successOverlay
            }
        }
        .adaptiveOnChange(of: selectedPhotoItem) { _, newItem in
            Task { await viewModel.loadSelectedPhoto(newItem) }
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
                        .font(MeeshyFont.relative(14, weight: .semibold))
                    Text(String(localized: "common.back", defaultValue: "Retour", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .medium))
                }
                .foregroundColor(MeeshyColors.indigo400)
            }

            Spacer()

            Text(String(localized: "profile.edit.title", defaultValue: "Modifier le profil", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
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
                if let preview = viewModel.avatarPreviewImage {
                    preview
                        .resizable()
                        .scaledToFill()
                        .frame(width: 100, height: 100)
                        .clipShape(Circle())
                        .overlay(
                            Circle()
                                .stroke(MeeshyColors.indigo400.opacity(0.4), lineWidth: 2)
                        )
                } else {
                    MeeshyAvatar(
                        name: user?.displayName ?? user?.username ?? "?",
                        context: .profileEdit,
                        accentColor: accentColor,
                        secondaryColor: "6366F1",
                        avatarURL: user?.avatar
                    )
                }

                let bgPrimary = theme.backgroundPrimary
                PhotosPicker(
                    selection: $selectedPhotoItem,
                    matching: .images,
                    photoLibrary: .shared()
                ) {
                    Image(systemName: "camera.fill")
                        .font(MeeshyFont.relative(12, weight: .bold))
                        .foregroundColor(.white)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(MeeshyColors.indigo400))
                        .overlay(Circle().stroke(bgPrimary, lineWidth: 2))
                }
            }

            if viewModel.isUploadingAvatar {
                HStack(spacing: 6) {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(MeeshyColors.indigo400)
                    Text(String(localized: "profile.edit.uploading_photo", defaultValue: "Envoi de la photo...", bundle: .main))
                        .font(MeeshyFont.relative(12, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }
        }
    }

    // MARK: - Fields Section

    private var fieldsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(
                title: String(localized: "profile.edit.section.info", defaultValue: "Informations", bundle: .main),
                icon: "pencil.circle.fill", color: accentColor
            )

            VStack(spacing: 0) {
                editableField(
                    icon: "person.fill",
                    title: String(localized: "profile.edit.field.display_name", defaultValue: "Nom d'affichage", bundle: .main),
                    text: $viewModel.displayName,
                    placeholder: String(localized: "profile.edit.field.display_name.placeholder", defaultValue: "Votre nom", bundle: .main)
                )

                bioField
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: accentColor))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.border(tint: accentColor), lineWidth: 1)
                    )
            )
        }
    }

    private var bioField: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "text.quote")
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(MeeshyColors.indigo400.opacity(0.12))
                )
                .padding(.top, 2)

            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "profile.edit.field.bio", defaultValue: "Bio", bundle: .main))
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField(
                    String(localized: "profile.edit.field.bio.placeholder", defaultValue: "Parlez de vous...", bundle: .main),
                    text: $viewModel.bio,
                    axis: .vertical
                )
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)
                .lineLimit(3...6)
                .adaptiveOnChange(of: viewModel.bio) { _, newValue in
                    if newValue.count > viewModel.bioMaxLength {
                        viewModel.bio = String(newValue.prefix(viewModel.bioMaxLength))
                    }
                }

                HStack {
                    Spacer()
                    Text("\(viewModel.bio.count)/\(viewModel.bioMaxLength)")
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(
                            viewModel.bio.count >= viewModel.bioMaxLength
                                ? MeeshyColors.error
                                : theme.textMuted
                        )
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
            sectionHeader(
                title: String(localized: "profile.edit.section.account", defaultValue: "Compte", bundle: .main),
                icon: "lock.fill", color: "4338CA"
            )

            VStack(spacing: 0) {
                if let email = user?.email {
                    readOnlyRow(
                        icon: "envelope.fill",
                        title: String(localized: "profile.edit.field.email", defaultValue: "Email", bundle: .main),
                        value: email, color: "4338CA"
                    )
                }

                if let phone = user?.phoneNumber {
                    readOnlyRow(
                        icon: "phone.fill",
                        title: String(localized: "profile.edit.field.phone", defaultValue: "Telephone", bundle: .main),
                        value: phone, color: "4338CA"
                    )
                }

                readOnlyRow(
                    icon: "at",
                    title: String(localized: "profile.edit.field.username", defaultValue: "Nom d'utilisateur", bundle: .main),
                    value: "@\(user?.username ?? "—")",
                    color: "4338CA"
                )
            }
            .background(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .fill(theme.surfaceGradient(tint: "4338CA"))
                    .overlay(
                        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                            .stroke(theme.border(tint: "4338CA"), lineWidth: 1)
                    )
            )
        }
    }

    // MARK: - Save Button

    private var saveButton: some View {
        VStack(spacing: 8) {
            if let errorMessage = viewModel.errorMessage {
                Text(errorMessage)
                    .font(MeeshyFont.relative(12, weight: .medium))
                    .foregroundColor(MeeshyColors.error)
                    .multilineTextAlignment(.center)
                    .transition(.opacity)
            }

            Button {
                HapticFeedback.medium()
                Task {
                    await viewModel.saveProfile { dismiss() }
                }
            } label: {
                HStack(spacing: 8) {
                    if viewModel.isSaving {
                        ProgressView()
                            .scaleEffect(0.8)
                            .tint(.white)
                    }
                    Text(String(localized: "common.save", defaultValue: "Sauvegarder", bundle: .main))
                        .font(MeeshyFont.relative(15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                        .fill(
                            viewModel.hasChanges && !viewModel.isSaving
                                ? MeeshyColors.indigo400
                                : MeeshyColors.indigo400.opacity(0.4)
                        )
                )
            }
            .disabled(!viewModel.hasChanges || viewModel.isSaving)
        }
    }

    // MARK: - Success Overlay

    private var successOverlay: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(MeeshyFont.relative(48))
                .foregroundColor(MeeshyColors.success)

            Text(String(localized: "profile.edit.success", defaultValue: "Profil mis a jour", bundle: .main))
                .font(MeeshyFont.relative(16, weight: .semibold))
                .foregroundColor(theme.textPrimary)
        }
        .padding(32)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xl)
                        .stroke(MeeshyColors.success.opacity(0.3), lineWidth: 1)
                )
        )
        .transition(.scale.combined(with: .opacity))
    }

    // MARK: - Reusable Components

    private func sectionHeader(title: String, icon: String, color: String) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundColor(Color(hex: color))
            Text(title.uppercased())
                .font(MeeshyFont.relative(11, weight: .bold, design: .rounded))
                .foregroundColor(Color(hex: color))
                .tracking(1.2)
        }
        .padding(.leading, 4)
    }

    private func editableField(
        icon: String, title: String,
        text: Binding<String>, placeholder: String
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(MeeshyColors.indigo400)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(MeeshyColors.indigo400.opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(MeeshyFont.relative(11, weight: .medium))
                    .foregroundColor(theme.textMuted)

                TextField(placeholder, text: text)
                    .font(MeeshyFont.relative(14, weight: .medium))
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
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )

            Text(title)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Text(value)
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(theme.textMuted)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
