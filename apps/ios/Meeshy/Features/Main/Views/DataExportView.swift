import SwiftUI
import MeeshySDK
import MeeshyUI

struct DataExportView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var theme = ThemeManager.shared

    @State private var exportMessages = true
    @State private var exportMedia = true
    @State private var exportContacts = true

    private let accentColor = "3498DB"

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
                        .font(.system(size: 14, weight: .semibold))
                    Text("Retour")
                        .font(.system(size: 15, weight: .medium))
                }
                .foregroundColor(Color(hex: accentColor))
            }
            .accessibilityLabel("Retour")

            Spacer()

            Text("Exporter")
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
                explanationCard
                optionsSection
                exportButton
                Spacer().frame(height: 40)
            }
            .padding(.horizontal, 16)
            .padding(.top, 16)
        }
    }

    // MARK: - Explanation Card

    private var explanationCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 10) {
                Image(systemName: "square.and.arrow.up.fill")
                    .font(.system(size: 20))
                    .foregroundColor(Color(hex: accentColor))

                Text("Exportez une copie de vos donnees")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(theme.textPrimary)
            }

            Text("Vous recevrez un fichier contenant les donnees selectionnees ci-dessous. Cette fonctionnalite vous permet de conserver une copie personnelle de vos informations.")
                .font(.system(size: 13, weight: .regular))
                .foregroundColor(theme.textMuted)
                .lineSpacing(3)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(theme.border(tint: accentColor), lineWidth: 1)
                )
        )
    }

    // MARK: - Options Section

    private var optionsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionHeader(title: "Donnees a exporter", icon: "square.and.arrow.up.fill", color: accentColor)

            VStack(spacing: 0) {
                exportToggle(icon: "message.fill", title: "Messages", isOn: $exportMessages, color: accentColor)
                exportToggle(icon: "photo.fill", title: "Medias", isOn: $exportMedia, color: "9B59B6")
                exportToggle(icon: "person.2.fill", title: "Contacts", isOn: $exportContacts, color: "4ECDC4")
            }
            .background(sectionBackground(tint: accentColor))
        }
    }

    // MARK: - Export Button

    private var exportButton: some View {
        VStack(spacing: 8) {
            Button { } label: {
                HStack(spacing: 8) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Exporter mes donnees")
                        .font(.system(size: 15, weight: .bold))
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(Color(hex: accentColor).opacity(0.3))
                )
            }
            .disabled(true)
            .accessibilityLabel("Exporter mes donnees")
            .accessibilityHint("Fonctionnalite bientot disponible")

            Text("Bientot disponible")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: accentColor))
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

    private func exportToggle(icon: String, title: String, isOn: Binding<Bool>, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Color(hex: color))
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color(hex: color).opacity(0.12))
                )
                .accessibilityHidden(true)

            Text(title)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(theme.textPrimary)

            Spacer()

            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(Color(hex: accentColor))
                .accessibilityLabel(title)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }
}
