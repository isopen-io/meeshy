import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct DataStorageView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @State private var cacheSize: Int = 0

    private let accentColor = MeeshyColors.brandPrimaryHex

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .task {
            await loadCacheSize()
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
                    Image(systemName: "chevron.backward")
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
                // Purge SÉLECTIVE (type × domaine). Vit dans MeeshyUI pour que
                // ses libellés soient servis par le catalogue du module —
                // `bundle: .module` — plutôt que par celui de l'app.
                SelectiveCachePurgeView()
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Cache Section

    private var cacheSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "settings.data.storage.section.cache", defaultValue: "Cache média", bundle: .main), icon: "externaldrive.fill", color: accentColor)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    fieldIcon("folder.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 8) {
                            Text(String(localized: "settings.data.storage.cache.title", defaultValue: "Cache média", bundle: .main))
                                .font(MeeshyFont.relative(14, weight: .medium))
                                .foregroundColor(theme.textPrimary)

                            Spacer()

                            Text(formatCacheSize(cacheSize))
                                .font(MeeshyFont.relative(14, weight: .semibold))
                                .foregroundColor(Color(hex: accentColor))
                        }

                        Text(String(localized: "settings.data.storage.cache.subtitle", defaultValue: "Images, audio et vidéos mis en cache", bundle: .main))
                            .font(MeeshyFont.relative(12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)

                Text(String(localized: "settings.data.storage.cache.description", defaultValue: "Le cache permet de charger les médias plus rapidement et réduit la consommation de données. Les fichiers mis en cache sont automatiquement supprimés après 7 jours.", bundle: .main))
                    .font(MeeshyFont.relative(13, weight: .regular))
                    .foregroundColor(theme.textMuted)
                    .lineSpacing(3)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Actions

    private func loadCacheSize() async {
        let imageSize = await CacheCoordinator.shared.images.estimatedDiskBytes()
        let audioSize = await CacheCoordinator.shared.audio.estimatedDiskBytes()
        let videoSize = await CacheCoordinator.shared.video.estimatedDiskBytes()
        let thumbnailSize = await CacheCoordinator.shared.thumbnails.estimatedDiskBytes()
        cacheSize = imageSize + audioSize + videoSize + thumbnailSize
    }

    private func formatCacheSize(_ bytes: Int) -> String {
        AudioPlayerView.formatBytes(Int64(bytes))
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
        RoundedRectangle(cornerRadius: 16)
            .fill(theme.surfaceGradient(tint: tint))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
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
