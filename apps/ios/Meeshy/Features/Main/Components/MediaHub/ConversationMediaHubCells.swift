import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

// MARK: - Les cellules de l'écran « Médias, liens et documents » (#8103)
//
// Feuilles de liste : entrées PRIMITIVES, `Equatable`, aucun singleton observé.
// Une cellule ne télécharge rien d'elle-même — la vignette (thumbHash, puis
// miniature serveur) suffit en liste ; le plein format ne se sert que s'il est
// DÉJÀ sur disque (`autoLoad: false`). Les octets partent à l'ouverture.

/// Une tuile de la grille des médias.
struct MediaHubVisualTile: View, Equatable {
    let item: ConversationMediaHubItem
    let accessibilityText: String

    static func == (lhs: MediaHubVisualTile, rhs: MediaHubVisualTile) -> Bool {
        lhs.item == rhs.item && lhs.accessibilityText == rhs.accessibilityText
    }

    var body: some View {
        if let attachment = item.attachment {
            tile(attachment)
        }
    }

    private func tile(_ attachment: MessageAttachment) -> some View {
        let thumbnail = Self.thumbnailURL(of: attachment)
        let full = attachment.type == .image && !attachment.fileUrl.isEmpty ? attachment.fileUrl : nil
        let placeholderColor = Color(hex: attachment.thumbnailColor)
        return Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                ProgressiveCachedImage(
                    thumbHash: attachment.thumbHash,
                    thumbnailUrl: thumbnail,
                    fullUrl: full,
                    targetSize: CGSize(width: 180, height: 180)
                ) {
                    placeholderColor.opacity(0.35)
                }
                .aspectRatio(contentMode: .fill)
            }
            .overlay(alignment: .bottomLeading) {
                if attachment.type == .video {
                    HStack(spacing: 3) {
                        Image(systemName: "play.fill")
                        if let duration = attachment.duration, duration > 0 {
                            Text(Self.durationLabel(milliseconds: duration))
                                .monospacedDigit()
                        }
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(.black.opacity(0.45)))
                    .padding(5)
                }
            }
            .clipped()
            .contentShape(Rectangle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityText)
            .accessibilityAddTraits(.isButton)
    }

    /// La plus petite image qu'on puisse montrer sans télécharger le média :
    /// la miniature serveur, sinon la plus petite variante d'une image.
    static func thumbnailURL(of attachment: MessageAttachment) -> String? {
        if let thumbnail = attachment.thumbnailUrl, !thumbnail.isEmpty { return thumbnail }
        return attachment.imageVariants?.min(by: { $0.width < $1.width })?.url
    }

    static func durationLabel(milliseconds: Int) -> String {
        let seconds = max(0, milliseconds / 1000)
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}

/// La ligne d'un lieu partagé : nom, adresse, ouverture dans Plans.
struct MediaHubPlaceRow: View, Equatable {
    let place: SharedPlace
    let subtitle: String
    let accentHex: String
    let isDark: Bool

    var body: some View {
        Button(action: openInMaps) {
            HStack(spacing: 12) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Color(hex: accentHex))
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name ?? ConversationMediaHubCopy.placeFallback)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(isDark ? .white : MeeshyColors.indigo950)
                        .lineLimit(2)
                    Text(place.address ?? subtitle)
                        .font(.caption)
                        .foregroundColor(isDark ? .white.opacity(0.6) : MeeshyColors.indigo950.opacity(0.55))
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(ConversationMediaHubCopy.openPlace)
    }

    private func openInMaps() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: place.clLocationCoordinate))
        item.name = place.name
        item.openInMaps()
    }
}

/// La pastille d'un segment.
struct MediaHubSegmentChip: View, Equatable {
    let kind: ConversationMediaKind
    let isSelected: Bool
    let accentHex: String
    let isDark: Bool

    var body: some View {
        HStack(spacing: 5) {
            Image(systemName: ConversationMediaHubCopy.icon(kind))
                .font(.caption.weight(.semibold))
                .accessibilityHidden(true)
            Text(ConversationMediaHubCopy.kind(kind))
                .font(.subheadline.weight(isSelected ? .bold : .medium))
                .lineLimit(1)
        }
        .foregroundColor(isSelected ? .white : (isDark ? .white.opacity(0.75) : MeeshyColors.indigo950.opacity(0.7)))
        .padding(.horizontal, 12)
        .frame(minHeight: 44)
        .background(
            Capsule().fill(isSelected ? Color(hex: accentHex) : (isDark ? Color.white.opacity(0.06) : Color.black.opacity(0.04)))
        )
        .contentShape(Capsule())
    }
}

/// Un état dessiné — vide, hors ligne, erreur — avec son éventuelle action.
struct MediaHubStateView: View {
    let icon: String
    let message: String
    let isDark: Bool
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.largeTitle.weight(.light))
                .foregroundColor(isDark ? .white.opacity(0.3) : MeeshyColors.indigo950.opacity(0.25))
                .accessibilityHidden(true)
            Text(message)
                .font(.subheadline.weight(.medium))
                .multilineTextAlignment(.center)
                .foregroundColor(isDark ? .white.opacity(0.6) : MeeshyColors.indigo950.opacity(0.55))
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .frame(minHeight: 44)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.top, 48)
    }
}

/// Le squelette d'un segment encore vide.
struct MediaHubSkeleton: View {
    let kind: ConversationMediaKind

    var body: some View {
        Group {
            if kind == .visual {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 3), spacing: 2) {
                    ForEach(0..<9, id: \.self) { _ in
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .overlay { SkeletonShape(height: 400, cornerRadius: 0) }
                            .clipped()
                    }
                }
            } else {
                VStack(spacing: 12) {
                    ForEach(0..<5, id: \.self) { _ in
                        HStack(spacing: 12) {
                            SkeletonShape(width: 44, height: 44, cornerRadius: 10)
                            VStack(alignment: .leading, spacing: 6) {
                                SkeletonShape(height: 12)
                                SkeletonShape(width: 120, height: 10)
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ConversationMediaHubCopy.loading)
    }
}
