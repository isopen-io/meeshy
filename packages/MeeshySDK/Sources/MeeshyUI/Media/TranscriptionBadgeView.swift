import SwiftUI
import MeeshySDK

public struct TranscriptionBadgeView: View {
    let transcriptionText: String
    let language: String?
    let confidence: Double?
    let isOnDevice: Bool
    let accentColor: String

    @State private var isExpanded = false

    public init(transcriptionText: String, language: String? = nil,
                confidence: Double? = nil, isOnDevice: Bool = false,
                accentColor: String = "08D9D6") {
        self.transcriptionText = transcriptionText
        self.language = language; self.confidence = confidence
        self.isOnDevice = isOnDevice; self.accentColor = accentColor
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            collapsedBadge
                .onTapGesture {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                        isExpanded.toggle()
                    }
                }

            if isExpanded {
                expandedContent
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .accessibilityLabel("Transcription: \(transcriptionText)")
        .accessibilityHint(isExpanded ? "Tap to collapse" : "Tap to expand")
    }

    private var collapsedBadge: some View {
        HStack(spacing: 5) {
            Image(systemName: isOnDevice ? "waveform" : "text.quote")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(Color(hex: accentColor).opacity(0.8))

            Text(isExpanded ? "Transcription" : previewText)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(.secondary)
                .lineLimit(1)

            Spacer(minLength: 0)

            Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                .font(.system(size: 8, weight: .bold))
                .foregroundColor(.secondary.opacity(0.6))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(Color(hex: accentColor).opacity(0.06))
        )
        .contentShape(Rectangle())
    }

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(transcriptionText)
                .font(.system(size: 12))
                .foregroundColor(.primary.opacity(0.9))
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                if let lang = language {
                    HStack(spacing: 3) {
                        Image(systemName: "globe")
                            .font(.system(size: 8))
                        Text(lang.uppercased())
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                    }
                    .foregroundColor(.secondary.opacity(0.7))
                }

                if let conf = confidence {
                    HStack(spacing: 3) {
                        Image(systemName: "sparkles")
                            .font(.system(size: 8))
                        Text("\(Int(conf * 100))%")
                            .font(.system(size: 8, weight: .bold, design: .monospaced))
                    }
                    .foregroundColor(.secondary.opacity(0.7))
                }

                if isOnDevice {
                    HStack(spacing: 3) {
                        Image(systemName: "iphone")
                            .font(.system(size: 8))
                        Text("On-device")
                            .font(.system(size: 8, weight: .medium))
                    }
                    .foregroundColor(Color(hex: accentColor).opacity(0.7))
                }

                Spacer()
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .padding(.top, 2)
    }

    private var previewText: String {
        let maxLength = 40
        if transcriptionText.count <= maxLength {
            return transcriptionText
        }
        return String(transcriptionText.prefix(maxLength)) + "..."
    }
}
