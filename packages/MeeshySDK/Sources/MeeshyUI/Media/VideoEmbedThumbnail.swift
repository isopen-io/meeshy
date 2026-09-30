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
                    .font(.system(size: MeeshyIconSize.xxl, weight: .bold))
                    .foregroundColor(.white)
                    .padding(18)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().stroke(accent.opacity(0.6), lineWidth: MeeshyBorder.emphasis))

                VStack {
                    Spacer()
                    HStack {
                        Text(providerLabel)
                            .font(.caption2.weight(.semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, MeeshySpacing.sm)
                            .padding(.vertical, MeeshySpacing.xs)
                            .background(.black.opacity(0.55), in: Capsule())
                        Spacer()
                    }
                    .padding(MeeshySpacing.sm)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.smPlus, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(String(localized: "media.embed.play_video", defaultValue: "Lire la vidéo \(providerLabel)", bundle: .module))
    }
}
