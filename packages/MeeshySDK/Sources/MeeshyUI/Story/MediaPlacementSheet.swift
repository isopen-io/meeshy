import SwiftUI

public enum MediaPlacement: String, Sendable {
    case background = "background"
    case foreground = "foreground"
}

public enum AudioSource: Sendable {
    case library
    case record
}

// MARK: - MediaPlacementSheet

public struct MediaPlacementSheet: View {
    public let mediaType: String           // "image" | "video" | "audio"
    public let onSelect: (MediaPlacement) -> Void
    @Environment(\.dismiss) private var dismiss

    public init(mediaType: String, onSelect: @escaping (MediaPlacement) -> Void) {
        self.mediaType = mediaType; self.onSelect = onSelect
    }

    public var body: some View {
        VStack(spacing: 0) {
            Text("Où placer ce \(mediaType) ?")
                .font(.headline)
                .padding(.top, 20)
                .padding(.bottom, 16)

            HStack(spacing: 16) {
                placementButton(placement: .background,
                                icon: "rectangle.fill",
                                label: "Arrière-plan",
                                subtitle: "Remplit la slide")

                placementButton(placement: .foreground,
                                icon: "square.on.square",
                                label: "Premier plan",
                                subtitle: "Élément draggable")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .presentationDetents([.height(160)])
        .presentationDragIndicator(.visible)
    }

    private func placementButton(placement: MediaPlacement,
                                  icon: String, label: String, subtitle: String) -> some View {
        Button {
            onSelect(placement)
            dismiss()
        } label: {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 28))
                    .foregroundColor(.primary)
                Text(label)
                    .font(.subheadline).fontWeight(.semibold)
                Text(subtitle)
                    .font(.caption).foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(UIColor.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
        .accessibilityLabel("\(label) — \(subtitle)")
    }
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
            Text("Source audio")
                .font(.headline)
                .padding(.top, 20)
                .padding(.bottom, 16)

            HStack(spacing: 16) {
                sourceButton(source: .library,
                             icon: "folder.fill",
                             label: "Bibliothèque")

                sourceButton(source: .record,
                             icon: "mic.fill",
                             label: "Enregistrer")
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
