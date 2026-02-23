import SwiftUI
import MeeshySDK
import MeeshyUI

struct UploadProgressBar: View {
    let progress: UploadQueueProgress
    let accentColor: String

    @ObservedObject private var theme = ThemeManager.shared

    private var percentage: Int {
        min(Int(progress.globalPercentage), 100)
    }

    private var currentFileName: String? {
        progress.files.first(where: { $0.status == .uploading })?.fileName
    }

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .rotationEffect(.degrees(percentage >= 100 ? 360 : 0))
                    .animation(.easeInOut(duration: 0.5), value: percentage)

                if let name = currentFileName {
                    Text(name)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }

                Spacer()

                Text("\(percentage)%")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
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
                Text("\(progress.completedFiles)/\(progress.totalFiles) fichiers")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textMuted)
                Spacer()
                Text(formatBytes(progress.uploadedBytes) + " / " + formatBytes(progress.totalBytes))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
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
    }

    private func formatBytes(_ bytes: Int64) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return String(format: "%.0f KB", Double(bytes) / 1024) }
        return String(format: "%.1f MB", Double(bytes) / (1024 * 1024))
    }
}
