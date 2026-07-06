import SwiftUI
import MeeshySDK

// MediaPlacement enum kept for backward compat with existing stories in DB
public enum MediaPlacement: String, Sendable {
    case background = "background"
    case foreground = "foreground"
}

public enum AudioSource: Sendable {
    case library
    case record
}

// MARK: - AudioSourceSheet

public struct AudioSourceSheet: View {
    public let onSelect: (AudioSource) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme

    public init(onSelect: @escaping (AudioSource) -> Void) {
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 16) {
            HStack {
                Image(systemName: "waveform")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(String(localized: "story.audioSource.title", defaultValue: "Source audio", bundle: .module))
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
                Spacer()
            }

            HStack(spacing: 16) {
                sourceButton(source: .library,
                             icon: "folder.fill",
                             label: String(localized: "story.audioSource.library", defaultValue: "Bibliothèque", bundle: .module))

                sourceButton(source: .record,
                             icon: "mic.fill",
                             label: String(localized: "story.audioSource.record", defaultValue: "Enregistrer", bundle: .module))
            }
        }
        .padding(16)
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
        .presentationDetents([.height(180)])
        .presentationDragIndicator(.visible)
    }

    private func sourceButton(source: AudioSource, icon: String, label: String) -> some View {
        Button {
            onSelect(source)
            dismiss()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundStyle(MeeshyColors.brandGradient)
                Text(label)
                    .font(.subheadline).fontWeight(.semibold)
                    .foregroundColor(colorScheme == .dark ? .white : MeeshyColors.indigo950)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
        }
        .pressable()
        .accessibilityLabel(label)
    }
}
