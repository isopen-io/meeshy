import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct UploadProgressBar: View {
    let progress: UploadQueueProgress
    let accentColor: String

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }

    private var percentage: Int {
        min(Int(progress.globalPercentage), 100)
    }

    private var currentFileName: String? {
        progress.files.first(where: { $0.status == .uploading })?.fileName
    }

    private var isUploading: Bool { percentage < 100 }

    private var filesCountLabel: String {
        String(
            localized: "upload.progress.files-count",
            defaultValue: "\(progress.completedFiles)/\(progress.totalFiles) fichiers",
            bundle: .main
        )
    }

    private var accessibilityLabelText: String {
        String(
            localized: "upload.progress.a11y-label",
            defaultValue: "Envoi des fichiers",
            bundle: .main
        )
    }

    private var accessibilityValueText: String {
        let progressPhrase = String(
            localized: "upload.progress.a11y-value",
            defaultValue: "\(percentage) %, \(progress.completedFiles) fichiers sur \(progress.totalFiles) envoyés",
            bundle: .main
        )
        guard let name = currentFileName else { return progressPhrase }
        return "\(progressPhrase), \(name)"
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .rotationEffect(.degrees(percentage >= 100 ? 360 : 0))
                    .animation(.easeInOut(duration: 0.5), value: percentage)

                if let name = currentFileName {
                    Text(name)
                        .font(.caption2.weight(.medium))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer()

                Text("\(percentage)%")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold, design: .monospaced))
                    .foregroundColor(Color(hex: accentColor))
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3, dampingFraction: 0.8), value: percentage)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color(hex: accentColor).opacity(0.15))
                        .frame(height: 6)

                    RoundedRectangle(cornerRadius: 3)
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: accentColor).opacity(0.7)],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geo.size.width * progress.globalPercentage / 100, height: 6)
                        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: progress.globalPercentage)
                }
            }
            .frame(height: 6)

            HStack {
                Text(filesCountLabel)
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium))
                    .foregroundColor(theme.textMuted)
                Spacer()
                Text(formatBytes(progress.uploadedBytes) + " / " + formatBytes(progress.totalBytes))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .medium, design: .monospaced))
                    .foregroundColor(theme.textMuted)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(theme.surfaceGradient(tint: accentColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color(hex: accentColor).opacity(0.2), lineWidth: 1)
                )
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityLabelText)
        .accessibilityValue(accessibilityValueText)
        .accessibilityAddTraits(isUploading ? .updatesFrequently : [])
    }

    private func formatBytes(_ bytes: Int64) -> String {
        bytes.formatted(.byteCount(style: .file))
    }
}
