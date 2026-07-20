import SwiftUI

/// Vignette façade pour un embed vidéo : image + overlay play + badge provider.
/// Atome agnostique : ne dépend d'aucun singleton Meeshy, ne résout aucune URL produit.
public struct VideoEmbedThumbnail: View {
    public let thumbnailURLString: String
    public let providerLabel: String
    public let accent: Color
    public let onTap: () -> Void

    public init(thumbnailURLString: String,
                providerLabel: String,
                accent: Color,
                onTap: @escaping () -> Void) {
        self.thumbnailURLString = thumbnailURLString
        self.providerLabel = providerLabel
        self.accent = accent
        self.onTap = onTap
    }

    public var body: some View {
        Button(action: onTap) {
            ZStack {
                CachedAsyncImage(url: thumbnailURLString,
                                 targetSize: CGSize(width: 640, height: 360)) {
                    Color.black.opacity(0.2)
                }
                .aspectRatio(16.0 / 9.0, contentMode: .fill)

                Color.black.opacity(0.18)

                Image(systemName: "play.fill")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(.white)
                    .padding(18)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(accent.opacity(0.6), lineWidth: 1.5))

                VStack {
                    Spacer()
                    HStack {
                        Text(providerLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.55), in: Capsule())
                        Spacer()
                    }
                    .padding(8)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Lire la vidéo \(providerLabel)")
    }
}
