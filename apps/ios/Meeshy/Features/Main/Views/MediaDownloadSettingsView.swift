import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct MediaDownloadPreferences: Codable, Equatable, Sendable {
    var imagesOnWifi: Bool = true
    var imagesOnCellular: Bool = true
    var audioOnWifi: Bool = true
    var audioOnCellular: Bool = false
    var videoOnWifi: Bool = true
    var videoOnCellular: Bool = false
}

struct MediaDownloadSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var prefs: MediaDownloadPreferences

    private let accentColor = "E67E22"

    init() {
        let loaded = Self.loadPrefs()
        _prefs = State(initialValue: loaded)
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            VStack(spacing: 0) {
                header
                scrollContent
            }
        }
        .onChange(of: prefs) { _, newValue in
            Self.savePrefs(newValue)
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
            .accessibilityLabel("Retour")

            Spacer()

            Text("Telechargement auto")
                .font(.system(size: 17, weight: .bold))
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
                imagesSection
                audioSection
                videoSection
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Info Section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Information", icon: "info.circle.fill", color: "6B7280")

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    fieldIcon("arrow.down.circle.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Telechargement automatique")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(theme.textPrimary)

                        Text("Choisissez les types de medias a telecharger automatiquement selon votre connexion.")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                            .lineSpacing(2)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
            }
            .background(sectionBackground(tint: "6B7280"))
        }
    }

    // MARK: - Images Section

    private var imagesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Images", icon: "photo.fill", color: "4ECDC4")

            VStack(spacing: 0) {
                toggleRow(
                    icon: "wifi",
                    title: "Wi-Fi",
                    color: "4ECDC4",
                    isOn: $prefs.imagesOnWifi
                )
                .accessibilityLabel("Telecharger les images en Wi-Fi")
                .accessibilityValue(prefs.imagesOnWifi ? "active" : "desactive")

                toggleRow(
                    icon: "antenna.radiowaves.left.and.right",
                    title: "Donnees cellulaires",
                    color: "4ECDC4",
                    isOn: $prefs.imagesOnCellular
                )
                .accessibilityLabel("Telecharger les images en donnees cellulaires")
                .accessibilityValue(prefs.imagesOnCellular ? "active" : "desactive")
            }
            .background(sectionBackground(tint: "4ECDC4"))
        }
    }

    // MARK: - Audio Section

    private var audioSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Audio", icon: "waveform", color: "9B59B6")

            VStack(spacing: 0) {
                toggleRow(
                    icon: "wifi",
                    title: "Wi-Fi",
                    color: "9B59B6",
                    isOn: $prefs.audioOnWifi
                )
                .accessibilityLabel("Telecharger l'audio en Wi-Fi")
                .accessibilityValue(prefs.audioOnWifi ? "active" : "desactive")

                toggleRow(
                    icon: "antenna.radiowaves.left.and.right",
                    title: "Donnees cellulaires",
                    color: "9B59B6",
                    isOn: $prefs.audioOnCellular
                )
                .accessibilityLabel("Telecharger l'audio en donnees cellulaires")
                .accessibilityValue(prefs.audioOnCellular ? "active" : "desactive")
            }
            .background(sectionBackground(tint: "9B59B6"))
        }
    }

    // MARK: - Video Section

    private var videoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Video", icon: "play.rectangle.fill", color: "E74C3C")

            VStack(spacing: 0) {
                toggleRow(
                    icon: "wifi",
                    title: "Wi-Fi",
                    color: "E74C3C",
                    isOn: $prefs.videoOnWifi
                )
                .accessibilityLabel("Telecharger les videos en Wi-Fi")
                .accessibilityValue(prefs.videoOnWifi ? "active" : "desactive")

                toggleRow(
                    icon: "antenna.radiowaves.left.and.right",
                    title: "Donnees cellulaires",
                    color: "E74C3C",
                    isOn: $prefs.videoOnCellular
                )
                .accessibilityLabel("Telecharger les videos en donnees cellulaires")
                .accessibilityValue(prefs.videoOnCellular ? "active" : "desactive")
            }
            .background(sectionBackground(tint: "E74C3C"))
        }
    }

    // MARK: - Helpers

    private func toggleRow(
        icon: String,
        title: String,
        color: String,
        isOn: Binding<Bool>
    ) -> some View {
        HStack(spacing: 12) {
            fieldIcon(icon, color: color)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color(hex: accentColor))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

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
            .font(.system(size: 14, weight: .medium))
            .foregroundColor(Color(hex: color))
            .frame(width: 28, height: 28)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color(hex: color).opacity(0.12))
            )
    }

    // MARK: - Persistence

    private static let storageKey = "meeshy_media_download_prefs"

    private static func loadPrefs() -> MediaDownloadPreferences {
        guard let data = UserDefaults.standard.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(MediaDownloadPreferences.self, from: data) else {
            return MediaDownloadPreferences()
        }
        return decoded
    }

    private static func savePrefs(_ prefs: MediaDownloadPreferences) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
