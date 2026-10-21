import SwiftUI
import Combine
import PhotosUI
import MeeshySDK

public struct CommunitySettingsScreen<ViewModel: CommunitySettingsModeling>: View {
    @ObservedObject private var viewModel: ViewModel
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss

    @State private var avatarItem: PhotosPickerItem? = nil
    @State private var bannerItem: PhotosPickerItem? = nil

    public var onUpdated: ((MeeshyCommunity) -> Void)? = nil
    public var onDeleted: (() -> Void)? = nil
    public var onLeft: (() -> Void)? = nil
    /// Retour d'« Annuler » quand l'hôte n'est ni une pile ni une feuille — le panneau de droite de l'iPad,
    /// où `dismiss()` est un no-op. `nil` : `dismiss()`.
    public var onCancel: (() -> Void)? = nil

    // User-content palette: swatches the user picks to colour their own
    // community. Intentionally a vibrant spread (not the Indigo brand chrome) —
    // these are content choices, not UI chrome. Do not migrate to MeeshyColors.
    private let presetColors = [
        "FF2E63", "A855F7", "08D9D6", "FF6B6B",
        "4ECDC4", "45B7D1", "F59E0B", "10B981",
        "6366F1", "EC4899", "14B8A6", "F97316"
    ]

    public init(viewModel: ViewModel, onUpdated: ((MeeshyCommunity) -> Void)? = nil, onDeleted: (() -> Void)? = nil, onLeft: (() -> Void)? = nil, onCancel: (() -> Void)? = nil) {
        self.viewModel = viewModel
        self.onUpdated = onUpdated
        self.onDeleted = onDeleted
        self.onLeft = onLeft
        self.onCancel = onCancel
    }

    public var body: some View {
        ZStack {
            theme.backgroundPrimary.ignoresSafeArea()

            VStack(spacing: 0) {
                settingsHeader

                ScrollView {
                    VStack(spacing: 20) {
                        visualSection
                        editSection
                        privacySection
                        dangerSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.vertical, 16)
                }
            }
        }
        .alert(String(localized: "community.settings.error.title", defaultValue: "Erreur", bundle: .module), isPresented: $viewModel.showError) {
            Button(String(localized: "common.ok", defaultValue: "OK", bundle: .module)) {}
        } message: {
            Text(viewModel.errorMessage ?? String(localized: "community.settings.error.default", defaultValue: "Une erreur s'est produite", bundle: .module))
        }
        .alert(String(localized: "community.settings.delete.confirm.title", defaultValue: "Supprimer la communauté", bundle: .module), isPresented: $viewModel.showDeleteConfirm) {
            Button(String(localized: "community.settings.delete.button", defaultValue: "Supprimer", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.deleteCommunity()
                    onDeleted?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "community.settings.delete.confirm.message", defaultValue: "Cette action est irréversible. Tous les membres, canaux et messages seront supprimés définitivement.", bundle: .module))
        }
        .alert(String(localized: "community.settings.leave.confirm.title", defaultValue: "Quitter la communauté", bundle: .module), isPresented: $viewModel.showLeaveConfirm) {
            Button(String(localized: "community.settings.leave.button", defaultValue: "Quitter", bundle: .module), role: .destructive) {
                Task {
                    await viewModel.leaveCommunity()
                    onLeft?()
                    dismiss()
                }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module), role: .cancel) {}
        } message: {
            Text(String(localized: "community.settings.leave.confirm.message", defaultValue: "Vous n'aurez plus accès aux canaux et messages de cette communauté.", bundle: .module))
        }
        .entityImagePickerFlow(pickerItem: $avatarItem, context: .avatar, maxSizeKB: 500) { data in
            Task { await viewModel.uploadCompressedAvatar(data) }
        }
        .entityImagePickerFlow(pickerItem: $bannerItem, context: .banner, maxSizeKB: 800) { data in
            Task { await viewModel.uploadCompressedBanner(data) }
        }
    }

    // MARK: - Header

    private var settingsHeader: some View {
        HStack {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .module)) {
                if let onCancel { onCancel() } else { dismiss() }
            }
                .font(.system(size: 16, design: .rounded))
                .foregroundColor(theme.textSecondary)

            Spacer()

            Text(String(localized: "community.settings.title", defaultValue: "Réglages", bundle: .module))
                .font(MeeshyFont.relative(16, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Button {
                Task {
                    let updated = await viewModel.save()
                    if let updated {
                        onUpdated?(updated)
                        dismiss()
                    }
                }
            } label: {
                if viewModel.isSaving {
                    ProgressView()
                        .scaleEffect(0.8)
                        .tint(MeeshyColors.indigo500)
                } else {
                    Text(String(localized: "common.save", defaultValue: "Enregistrer", bundle: .module))
                        .font(MeeshyFont.relative(16, weight: .semibold, design: .rounded))
                        .foregroundColor(viewModel.hasChanges ? MeeshyColors.indigo500 : theme.textMuted)
                }
            }
            .disabled(!viewModel.hasChanges || viewModel.isSaving)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .background(theme.backgroundPrimary)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(theme.textMuted.opacity(0.2))
                .frame(height: 0.5)
        }
    }

    // MARK: - Visual Section

    // MARK: - Visual Section (Hero Banner + Avatar)

    private var visualSection: some View {
        // Valeurs `@MainActor` (bundle localisé, couleurs theme/viewModel) hissées
        // hors des closures de label `PhotosPicker` (inférées `@Sendable`) en
        // constantes Sendable — voir `ConversationSettingsView.visualSection`.
        let bannerEditLabel = String(localized: "community.settings.banner.edit", defaultValue: "Modifier", bundle: .module)
        let avatarPencilColor = Color(hex: viewModel.localColor)
        let avatarPencilBackground = theme.backgroundPrimary
        return VStack(spacing: 16) {
            VStack(spacing: 0) {
                bannerBlock(editLabel: bannerEditLabel)
                avatarBlock(pencilColor: avatarPencilColor, pencilBackground: avatarPencilBackground)

                Text(viewModel.name)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundColor(theme.textPrimary)
                    .padding(.top, 8)
            }

            colorPickerCard

            emojiField
        }
    }

    private func bannerBlock(editLabel: String) -> some View {
        ZStack(alignment: .bottomTrailing) {
            communityBannerView
                .frame(height: 120)
                .clipShape(RoundedRectangle(cornerRadius: 16))

            PhotosPicker(selection: $bannerItem, matching: .images) {
                Label(editLabel, systemImage: "photo.fill")
                    .font(MeeshyFont.relative(11, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Capsule().fill(Color.black.opacity(0.5)))
            }
            .disabled(viewModel.isUploadingBanner)
            .padding(8)

            if viewModel.isUploadingBanner {
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.black.opacity(0.4))
                    .frame(height: 120)
                    .overlay(ProgressView().tint(.white))
            }
        }
    }

    private func avatarBlock(pencilColor: Color, pencilBackground: Color) -> some View {
        ZStack(alignment: .bottomTrailing) {
            MeeshyAvatar(
                name: viewModel.name,
                context: .profileSheet,
                kind: .entity,
                accentColor: viewModel.localColor,
                avatarURL: viewModel.avatarUrl.isEmpty ? nil : viewModel.avatarUrl
            )
            .overlay(
                Circle()
                    .stroke(theme.backgroundPrimary, lineWidth: 4)
            )

            PhotosPicker(selection: $avatarItem, matching: .images) {
                Image(systemName: "pencil.circle.fill")
                    .font(.system(size: 28))
                    .foregroundColor(pencilColor)
                    .background(Circle().fill(pencilBackground))
            }
            .disabled(viewModel.isUploadingAvatar)
            .offset(x: 4, y: 4)

            if viewModel.isUploadingAvatar {
                Circle()
                    .fill(Color.black.opacity(0.4))
                    .frame(width: 80, height: 80)
                    .overlay(ProgressView().tint(.white))
            }
        }
        .offset(y: -40)
        .padding(.bottom, -40)
    }

    private var colorPickerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(String(localized: "community.settings.color", defaultValue: "Couleur", bundle: .module))
                .font(MeeshyFont.relative(12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 6), spacing: 10) {
                ForEach(presetColors, id: \.self) { hex in
                    colorSwatch(hex: hex)
                }
            }
        }
        .padding(14)
        .background(theme.backgroundSecondary.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private var emojiField: some View {
        settingsField(label: "Emoji") {
            TextField("🏘️", text: $viewModel.localEmoji)
                .font(.system(size: 22))
                .foregroundColor(theme.textPrimary)
                .adaptiveOnChange(of: viewModel.localEmoji) { _, newValue in
                    let trimmed = String(newValue.unicodeScalars.prefix(2))
                    if trimmed != newValue { viewModel.localEmoji = trimmed }
                }
        }
    }

    @ViewBuilder
    private var communityBannerView: some View {
        if !viewModel.bannerUrl.isEmpty {
            // CachedAsyncImage (DiskCacheStore persistant) plutôt qu'AsyncImage :
            // la bannière n'est téléchargée qu'une fois par installation.
            // showsStatusOverlays: false — echec silencieux vers le gradient
            // deja fourni ; pas de bouton retry sur une banniere decorative.
            CachedAsyncImage(url: viewModel.bannerUrl, showsStatusOverlays: false) {
                communityBannerPlaceholder
            }
            .scaledToFill()
        } else {
            communityBannerPlaceholder
        }
    }

    private var communityBannerPlaceholder: some View {
        LinearGradient(
            colors: [Color(hex: viewModel.localColor).opacity(0.6), Color(hex: viewModel.localColor).opacity(0.2)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func colorSwatch(hex: String) -> some View {
        let isSelected = viewModel.localColor == hex
        return Circle()
            .fill(Color(hex: hex))
            .frame(width: 38, height: 38)
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            .overlay {
                Circle()
                    .stroke(Color.white.opacity(isSelected ? 0.6 : 0), lineWidth: 2)
                    .padding(2)
            }
            .scaleEffect(isSelected ? 1.1 : 1.0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: isSelected)
            .onTapGesture { viewModel.localColor = hex }
    }

    // MARK: - Edit Section

    private var editSection: some View {
        VStack(spacing: 16) {
            sectionHeader(String(localized: "community.settings.section.info", defaultValue: "Infos", bundle: .module))

            VStack(spacing: 12) {
                settingsField(label: String(localized: "community.settings.field.name", defaultValue: "Nom", bundle: .module)) {
                    TextField(String(localized: "community.settings.field.name.placeholder", defaultValue: "Nom de la communauté", bundle: .module), text: $viewModel.name)
                        .font(MeeshyFont.relative(16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                }

                settingsField(label: String(localized: "community.settings.field.description", defaultValue: "Description", bundle: .module)) {
                    TextField(String(localized: "community.settings.field.description", defaultValue: "Description", bundle: .module), text: $viewModel.descriptionText, axis: .vertical)
                        .font(MeeshyFont.relative(16, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(3...6)
                }
            }
        }
    }

    // MARK: - Privacy Section

    private var privacySection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "community.settings.section.privacy", defaultValue: "Confidentialité", bundle: .module))

            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(String(localized: "community.settings.privacy.title", defaultValue: "Communauté privée", bundle: .module))
                        .font(MeeshyFont.relative(15, weight: .semibold, design: .rounded))
                        .foregroundColor(theme.textPrimary)
                    Text(viewModel.isPrivate ? String(localized: "community.settings.privacy.byInvitation", defaultValue: "Sur invitation", bundle: .module) : String(localized: "community.settings.privacy.openToAll", defaultValue: "Ouverte à tous", bundle: .module))
                        .font(MeeshyFont.relative(12))
                        .foregroundColor(theme.textSecondary)
                }
                Spacer()
                Toggle("", isOn: $viewModel.isPrivate)
                    .tint(MeeshyColors.indigo500)
                    .labelsHidden()
            }
            .padding(14)
            .background(theme.backgroundSecondary.opacity(0.5))
            .clipShape(RoundedRectangle(cornerRadius: 12))
        }
    }

    // MARK: - Danger Section

    private var dangerSection: some View {
        VStack(spacing: 12) {
            sectionHeader(String(localized: "community.settings.section.danger", defaultValue: "Zone dangereuse", bundle: .module))

            if viewModel.isCreator {
                Button {
                    viewModel.showDeleteConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "trash.fill")
                        Text(String(localized: "community.settings.delete.label", defaultValue: "Supprimer la communauté", bundle: .module))
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.red)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.red.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            } else {
                Button {
                    viewModel.showLeaveConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "arrow.forward.square.fill")
                        Text(String(localized: "community.settings.leave.label", defaultValue: "Quitter la communauté", bundle: .module))
                    }
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(.orange)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color.orange.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
            }
        }
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(13, weight: .bold, design: .rounded))
            .foregroundColor(theme.textMuted)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func settingsField<Content: View>(label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(MeeshyFont.relative(12, weight: .semibold, design: .rounded))
                .foregroundColor(theme.textSecondary)
            content()
                .textFieldStyle(.plain)
                .padding(12)
                .background(theme.backgroundSecondary.opacity(0.5))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
    }
}
