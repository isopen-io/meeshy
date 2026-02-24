import SwiftUI
import MeeshySDK
import MeeshyUI

struct DataStorageView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

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
        .alert("Vider le cache", isPresented: $showClearConfirm) {
            Button("Annuler", role: .cancel) { }
            Button("Vider", role: .destructive) {
                clearCache()
            }
        } message: {
            Text("Cela supprimera tous les medias mis en cache localement. Ils seront retelecharges si necessaire.")
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

            Text("Stockage")
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
            sectionHeader(title: "Cache media", icon: "externaldrive.fill", color: accentColor)

            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    fieldIcon("folder.fill", color: accentColor)

                    VStack(alignment: .leading, spacing: 2) {
                        Text("Cache media")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(theme.textPrimary)

                        Text("Images, audio et videos mis en cache")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundColor(theme.textMuted)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)

                Text("Le cache permet de charger les medias plus rapidement et reduit la consommation de donnees. Les fichiers mis en cache sont automatiquement supprimes apres 7 jours.")
                    .font(.system(size: 13, weight: .regular))
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
            sectionHeader(title: "Actions", icon: "gear", color: "6B7280")

            Button {
                HapticFeedback.medium()
                showClearConfirm = true
            } label: {
                HStack(spacing: 12) {
                    fieldIcon("trash.fill", color: "EF4444")

                    Text("Vider le cache")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Color(hex: "EF4444"))

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
            .accessibilityLabel("Vider le cache media")
            .accessibilityHint("Supprime tous les medias mis en cache localement")
        }
    }

    // MARK: - Actions

    private func clearCache() {
        isClearing = true
        Task {
            await MediaCacheManager.shared.clearAll()
            HapticFeedback.success()
            ToastManager.shared.showSuccess("Cache vide")
            isClearing = false
        }
    }

    // MARK: - Helpers

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
}
