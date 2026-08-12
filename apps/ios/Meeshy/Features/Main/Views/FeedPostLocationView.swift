import SwiftUI
import MapKit
import MeeshySDK
import MeeshyUI

/// Surfaces « position » d'un post ou d'un réel du feed (constat user
/// 2026-07-30 : la position d'un post était décodée puis JETÉE au passage
/// domaine — aucune carte, aucun indicateur nulle part).
///
/// Deux rendus, même véhicule `SharedPlace` que message/commentaire/story :
/// - `FeedPostLocationSticker` — pill compacte (pin + nom), même langage
///   visuel que la pastille de story (`StoryLocationLayer` : pin `error`,
///   fond `indigo50`, texte `indigo900`), cliquable → plein écran.
/// - `FeedPostLocationMapCard` — carte statique pleine largeur pour un post
///   « position seule » : le texte du post s'affiche EN OVERLAY sur la carte
///   et le sticker reste posé dessus pour ouvrir le lieu (directive user
///   2026-07-30). Vignette via `LocationMapThumbnailProviding` — JAMAIS de
///   MKMapView vivante dans une cellule de liste (précédent
///   LocationMessageView, flake Metal résolu par la vignette statique).
struct FeedPostLocationSticker: View {
    let place: SharedPlace
    let onTap: () -> Void

    var body: some View {
        Button {
            HapticFeedback.light()
            onTap()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "mappin.circle.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.error)
                Text(displayLabel)
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo900)
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Capsule().fill(MeeshyColors.indigo50.opacity(0.94)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(displayLabel)
        .accessibilityHint(String(
            localized: "feed.location.open.hint",
            defaultValue: "Ouvre le lieu sur la carte",
            bundle: .main
        ))
    }

    private var displayLabel: String {
        if let name = place.name, !name.isEmpty { return name }
        if let address = place.address, !address.isEmpty { return address }
        return String(localized: "feed.location.shared", defaultValue: "Position partagée", bundle: .main)
    }
}

struct FeedPostLocationMapCard: View {
    let place: SharedPlace
    /// Texte du post posé en overlay bas sur la carte (post « position
    /// seule ») — déjà résolu par le Prisme (`displayContent`/équivalent).
    let overlayText: String?
    let onOpen: () -> Void
    var thumbnailProvider: any LocationMapThumbnailProviding = LocationMapThumbnailProvider()

    @Environment(\.colorScheme) private var colorScheme
    @State private var thumbnail: UIImage?

    private static let cardHeight: CGFloat = 190

    var body: some View {
        // La vignette (640 pt de large) vit en OVERLAY d'une base flexible :
        // en enfant direct, son `.scaledToFill()` gonflait la largeur de la
        // carte au-delà du conteneur dès que celui-ci était plus étroit que
        // 640 pt (volet feed iPad : tout le post débordait hors écran).
        Color.clear
            .frame(height: Self.cardHeight)
            .frame(maxWidth: .infinity)
            .overlay { mapLayer }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(alignment: .bottomLeading) {
                if let overlayText, !overlayText.isEmpty {
                    textScrim(overlayText)
                }
            }
            .overlay(alignment: .topLeading) {
                FeedPostLocationSticker(place: place, onTap: onOpen)
                    .padding(10)
            }
            .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .onTapGesture {
                HapticFeedback.light()
                onOpen()
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(String(
                localized: "feed.location.open.hint",
                defaultValue: "Ouvre le lieu sur la carte",
                bundle: .main
            ))
            .task(id: colorScheme) {
                thumbnail = await thumbnailProvider.thumbnail(
                    coordinate: place.clLocationCoordinate,
                    size: CGSize(width: 640, height: Self.cardHeight),
                    isDark: colorScheme == .dark
                )
            }
    }

    @ViewBuilder
    private var mapLayer: some View {
        if let thumbnail {
            Image(uiImage: thumbnail)
                .resizable()
                .scaledToFill()
        } else {
            // Placeholder shimmer-free : fond teinté + pin — la vignette
            // arrive du cache NSCache en un aller sur les cellules déjà vues.
            ZStack {
                MeeshyColors.indigo100.opacity(colorScheme == .dark ? 0.15 : 1)
                Image(systemName: "mappin.and.ellipse")
                    .font(.title2)
                    .foregroundColor(MeeshyColors.indigo400)
            }
        }
    }

    private func textScrim(_ text: String) -> some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .foregroundColor(.white)
            .lineLimit(4)
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [.black.opacity(0), .black.opacity(0.55)],
                    startPoint: .top, endPoint: .bottom
                )
            )
    }
}
