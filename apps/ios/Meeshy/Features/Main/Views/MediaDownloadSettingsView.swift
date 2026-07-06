import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MediaDownloadPreferences is now defined in MeeshySDK
// (packages/MeeshySDK/Sources/MeeshySDK/Networking/MediaDownloadPreferences.swift).
// The store that persists it lives in MeeshyUI
// (MediaDownloadPreferencesStore.shared) and handles migration from the
// previous 6-booleans format automatically on first load.

struct MediaDownloadSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    @ObservedObject private var store = MediaDownloadPreferencesStore.shared

    private let accentColor = "E67E22"

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
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

            Text(String(localized: "settings.media.download.title", defaultValue: "Telechargement auto", bundle: .main))
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
                infoSection
                policyPicker(
                    title: String(localized: "settings.media.download.images", defaultValue: "Images", bundle: .main), icon: "photo.fill", color: MeeshyColors.brandPrimaryHex,
                    binding: $store.preferences.image
                )
                policyPicker(
                    title: String(localized: "settings.media.download.audio", defaultValue: "Audio", bundle: .main), icon: "waveform", color: MeeshyColors.indigo600Hex,
                    binding: $store.preferences.audio
                )
                policyPicker(
                    title: String(localized: "settings.media.download.audio_translation", defaultValue: "Traductions audio", bundle: .main), icon: "character.bubble.fill", color: "F39C12",
                    binding: $store.preferences.audioTranslation
                )
                policyPicker(
                    title: String(localized: "settings.media.download.video", defaultValue: "Video", bundle: .main), icon: "play.rectangle.fill", color: "E74C3C",
                    binding: $store.preferences.video
                )
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: String(localized: "settings.media.download.info_header", defaultValue: "Information", bundle: .main), icon: "info.circle.fill", color: "6B7280")

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    fieldIcon("arrow.down.circle.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(String(localized: "settings.media.download.auto_title", defaultValue: "Telechargement automatique", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .medium))
                            .foregroundColor(theme.textPrimary)

                        Text(String(localized: "settings.media.download.auto_subtitle", defaultValue: "Choisissez quand telecharger automatiquement chaque type de media selon votre connexion.", bundle: .main))
                            .font(MeeshyFont.relative(12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                            .lineSpacing(2)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
            }
            .background(sectionBackground(tint: "6B7280"))
        }
    }

    // MARK: - Policy picker section

    @ViewBuilder
    private func policyPicker(
        title: String,
        icon: String,
        color: String,
        binding: Binding<AutoDownloadPolicy>
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: title, icon: icon, color: color)

            VStack(spacing: 0) {
                ForEach(Array(AutoDownloadPolicy.allCases.enumerated()), id: \.element) { index, policy in
                    Button {
                        HapticFeedback.light()
                        binding.wrappedValue = policy
                    } label: {
                        HStack(spacing: 12) {
                            fieldIcon(policyIcon(policy), color: color)
                            Text(policy.shortLabel)
                                .font(MeeshyFont.relative(14, weight: .medium))
                                .foregroundColor(theme.textPrimary)
                            Spacer()
                            if binding.wrappedValue == policy {
                                Image(systemName: "checkmark")
                                    .font(MeeshyFont.relative(14, weight: .bold))
                                    .foregroundColor(Color(hex: accentColor))
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title), \(policy.shortLabel)")
                    .accessibilityAddTraits(binding.wrappedValue == policy ? .isSelected : [])

                    if index != AutoDownloadPolicy.allCases.count - 1 {
                        Divider().padding(.leading, 54)
                    }
                }
            }
            .background(sectionBackground(tint: color))
        }
    }

    private func policyIcon(_ policy: AutoDownloadPolicy) -> String {
        switch policy {
        case .always:              return "infinity"
        case .wifiAndGoodCellular: return "antenna.radiowaves.left.and.right"
        case .wifiOnly:            return "wifi"
        case .never:               return "xmark.octagon"
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
