import SwiftUI

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

    public init(onSelect: @escaping (AudioSource) -> Void) {
        self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 0) {
            Text(String(localized: "story.audioSource.title", defaultValue: "Source audio", bundle: .module))
                .font(.headline)
                .padding(.top, 20)
                .padding(.bottom, 16)

            HStack(spacing: 16) {
                sourceButton(source: .library,
                             icon: "folder.fill",
                             label: String(localized: "story.audioSource.library", defaultValue: "Bibliothèque", bundle: .module))

                sourceButton(source: .record,
                             icon: "mic.fill",
                             label: String(localized: "story.audioSource.record", defaultValue: "Enregistrer", bundle: .module))
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .presentationDetents([.height(160)])
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
                    .foregroundColor(.primary)
                Text(label)
                    .font(.subheadline).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(UIColor.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityLabel(label)
    }
}
