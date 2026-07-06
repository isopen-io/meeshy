import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct DataStorageView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var showClearConfirm = false
    @State private var isClearing = false

    private let accentColor = "E67E22"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .alert(String(localized: "settings.data.storage.clear.title", defaultValue: "Vider le cache", bundle: .main), isPresented: $showClearConfirm) {
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) { }
            Button(String(localized: "settings.data.storage.clear.confirm", defaultValue: "Vider", bundle: .main), role: .destructive) {
                clearCache()
            }
        } message: {
            Text(String(localized: "settings.data.storage.clear.message", defaultValue: "Cela supprimera tous les medias mis en cache localement. Ils seront retelecharges si necessaire.", bundle: .main))
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
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel(String(localized: "common.back", defaultValue: "Retour", bundle: .main))

            Spacer()

            Text(String(localized: "settings.data.storage.title", defaultValue: "Stockage", bundle: .main))
                .font(MeeshyFont.relative(17, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            Color.clear.frame(width: 60, height: 24)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Scroll Content

    private var scrollContent: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 20) {
                cacheSection
                actionsSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Cache Section

    private var cacheSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "settings.data.storage.section.cache", defaultValue: "Cache media", bundle: .main), icon: "externaldrive.fill", color: accentColor)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    fieldIcon("folder.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "settings.data.storage.cache.title", defaultValue: "Cache media", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(theme.textPrimary)

                        Text(String(localized: "settings.data.storage.cache.subtitle", defaultValue: "Images, audio et videos mis en cache", bundle: .main))
                            .font(MeeshyFont.relative(12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)

                Text(String(localized: "settings.data.storage.cache.description", defaultValue: "Le cache permet de charger les medias plus rapidement et reduit la consommation de donnees. Les fichiers mis en cache sont automatiquement supprimes apres 7 jours.", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .foregroundColor(theme.textMuted)
                    .lineSpacing(3)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Actions Section

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "settings.data.storage.section.actions", defaultValue: "Actions", bundle: .main), icon: "gear", color: "6B7280")

            Button {
                HapticFeedback.medium()
                showClearConfirm = true
            } label: {
                HStack(spacing: 12) {
                    fieldIcon("trash.fill", color: "EF4444")

                    Text(String(localized: "settings.data.storage.action.clear", defaultValue: "Vider le cache", bundle: .main))
                        .font(MeeshyFont.relative(14, weight: .medium))
                        .foregroundColor(MeeshyColors.error)

                    Spacer()

                    if isClearing {
                        ProgressView()
                            .scaleEffect(0.7)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .disabled(isClearing)
            .background(sectionBackground(tint: "6B7280"))
            .accessibilityLabel(String(localized: "settings.data.storage.action.clear.label", defaultValue: "Vider le cache media", bundle: .main))
            .accessibilityHint(String(localized: "settings.data.storage.action.clear.hint", defaultValue: "Supprime tous les medias mis en cache localement", bundle: .main))
        }
    }

    // MARK: - Actions

    private func clearCache() {
        isClearing = true
        Task {
            await CacheCoordinator.shared.images.clearAll()
            await CacheCoordinator.shared.audio.clearAll()
            await CacheCoordinator.shared.video.clearAll()
            await CacheCoordinator.shared.thumbnails.clearAll()
            HapticFeedback.success()
            FeedbackToastManager.shared.showSuccess(String(localized: "settings.data.storage.toast.cleared", defaultValue: "Cache vide", bundle: .main))
            isClearing = false
        }
    }

    // MARK: - Helpers

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

    private func sectionBackground(tint: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lg)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lg)
                    .stroke(theme.border(tint: tint), lineWidth: 1)
            )
    }

    private func fieldIcon(_ name: String, color: String) -> some View {
        Image(systemName: name)
            .font(MeeshyFont.relative(14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }
}
