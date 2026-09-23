import SwiftUI
import MapKit
import MeeshySDK
import UIKit

public struct LocationMessageView: View {
    let latitude: Double
    let longitude: Double
    let placeName: String?
    let address: String?
    let accentColor: String
    let onTapFullscreen: (() -> Void)?
    let thumbnailProvider: any LocationMapThumbnailProviding

    public init(latitude: Double, longitude: Double, placeName: String? = nil,
                address: String? = nil, accentColor: String = MeeshyColors.brandPrimaryHex,
                onTapFullscreen: (() -> Void)? = nil,
                thumbnailProvider: any LocationMapThumbnailProviding = LocationMapThumbnailProvider()) {
        self.latitude = latitude; self.longitude = longitude
        self.placeName = placeName; self.address = address
        self.accentColor = accentColor; self.onTapFullscreen = onTapFullscreen
        self.thumbnailProvider = thumbnailProvider
    }

    /// Rendu unique d'un lieu (Task 14, 2026-07-29) : message, post et
    /// commentaire partagent désormais tous `SharedPlace` comme véhicule, donc
    /// tous convergent vers cet initialiseur plutôt que de reconstruire leur
    /// propre notion de « position ». L'initialiseur historique par
    /// coordonnées brutes reste ci-dessus (public API du package) pour les
    /// consommateurs qui n'ont qu'une paire lat/lon sans `SharedPlace`.
    public init(place: SharedPlace,
                accentColor: String = MeeshyColors.brandPrimaryHex,
                onTapFullscreen: (() -> Void)? = nil,
                thumbnailProvider: any LocationMapThumbnailProviding = LocationMapThumbnailProvider()) {
        self.init(latitude: place.latitude, longitude: place.longitude,
                  placeName: place.name, address: place.address,
                  accentColor: accentColor, onTapFullscreen: onTapFullscreen,
                  thumbnailProvider: thumbnailProvider)
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    public var body: some View {
        LocationCardLayout {
            VStack(spacing: 0) {
                mapContent
                    .frame(height: LocationCardMetrics.mapHeight)
                    .frame(maxWidth: .infinity)
                    .clipped()
                    .allowsHitTesting(false)

                locationInfoBar
                    .frame(height: LocationCardMetrics.infoBarHeight)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: LocationCardMetrics.cornerRadius, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .clipShape(RoundedRectangle(cornerRadius: LocationCardMetrics.cornerRadius, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: LocationCardMetrics.cornerRadius, style: .continuous))
        .onTapGesture {
            onTapFullscreen?()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(String(localized: "location.a11y.label", defaultValue: "Position : \(placeName ?? String(localized: "location.shared", defaultValue: "Position partagée", bundle: .module))", bundle: .module))
        .accessibilityHint(String(localized: "location.a11y.hint", defaultValue: "Touchez pour ouvrir la carte en plein écran", bundle: .module))
        .accessibilityAction(named: Text(String(localized: "location.fullscreen.openInMaps", defaultValue: "Ouvrir dans Plans", bundle: .module))) {
            openInMaps()
        }
    }

    private var mapContent: some View {
        LocationMapThumbnailView(coordinate: coordinate, accentColor: accentColor,
                                 size: LocationCardMetrics.thumbnailSize, provider: thumbnailProvider)
    }

    private var infoLines: (title: String?, subtitle: String?) {
        LocationCardMetrics.infoLines(name: placeName, address: address)
    }

    private var locationInfoBar: some View {
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 1) {
                Text(infoLines.title ?? String(localized: "location.shared", defaultValue: "Position partagée", bundle: .module))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                if let subtitle = infoLines.subtitle {
                    Text(subtitle)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: openInMaps) {
                Image(systemName: "arrow.up.right.square")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))
                    .frame(width: LocationCardMetrics.infoBarHeight, height: LocationCardMetrics.infoBarHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(String(localized: "location.fullscreen.openInMaps", defaultValue: "Ouvrir dans Plans", bundle: .module))
        }
        .padding(.leading, 10)
    }

    private func openInMaps() {
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = infoLines.title
        item.openInMaps()
    }
}

// MARK: - Card geometry (#7598)

/// Géométrie de la carte d'un lieu — FIXE, connue avant la tuile et avant les
/// données. La hauteur ne dépend ni de la vignette (qui arrive après), ni de
/// la présence d'un nom ou d'une adresse (qui peuvent arriver avec l'écho
/// serveur) : une cellule mesurée une fois reste juste. La largeur se BORNE à
/// ce que le parent propose : un enfant plus large que son parent déborde un
/// `.frame(maxWidth:)` au lieu d'être contenu par lui.
public nonisolated enum LocationCardMetrics {
    public static let idealWidth: CGFloat = 260
    public static let mapHeight: CGFloat = 150
    public static let infoBarHeight: CGFloat = 44
    public static let cornerRadius: CGFloat = 14
    public static var height: CGFloat { mapHeight + infoBarHeight }
    static var thumbnailSize: CGSize { CGSize(width: idealWidth, height: mapHeight) }

    public static func size(proposedWidth: CGFloat?) -> CGSize {
        guard let proposedWidth, proposedWidth.isFinite, proposedWidth > 0 else {
            return CGSize(width: idealWidth, height: height)
        }
        return CGSize(width: min(idealWidth, proposedWidth), height: height)
    }

    /// Le nom, puis l'adresse — jamais la même valeur sur les deux lignes.
    public static func infoLines(name: String?, address: String?) -> (title: String?, subtitle: String?) {
        let cleanName = meaningful(name)
        let cleanAddress = meaningful(address)
        guard let cleanName else { return (cleanAddress, nil) }
        return (cleanName, cleanAddress == cleanName ? nil : cleanAddress)
    }

    private static func meaningful(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }
}

/// Pose la carte à la taille de `LocationCardMetrics` : le seul sous-arbre
/// reçoit exactement cette taille, quel que soit ce qu'il réclamerait.
private struct LocationCardLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        LocationCardMetrics.size(proposedWidth: proposal.width)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let size = LocationCardMetrics.size(proposedWidth: bounds.width)
        for subview in subviews {
            subview.place(at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(size))
        }
    }
}

// MARK: - Static Map Thumbnail

/// Vignette carte STATIQUE : placeholder déterministe (dégradé discret +
/// épingle) immédiatement, puis l'image `MKMapSnapshotter` du provider quand
/// elle arrive. Aucune `Map`/`MKMapView` vivante ici — la vignette est
/// non-interactive (`allowsHitTesting(false)`) et l'interaction vit dans
/// `LocationFullscreenView` ; une carte vivante rendait les snapshots tests
/// non déterministes (capture sync vs tuiles Metal async).
private struct LocationMapThumbnailView: View {
    let coordinate: CLLocationCoordinate2D
    let accentColor: String
    let size: CGSize
    let provider: any LocationMapThumbnailProviding

    @Environment(\.colorScheme) private var colorScheme
    @State private var thumbnail: UIImage?

    var body: some View {
        ZStack {
            if let thumbnail {
                Image(uiImage: thumbnail)
                    .resizable()
                    .scaledToFill()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
            } else {
                placeholder
            }
            // La POINTE de l'épingle désigne le lieu, pas le centre du disque.
            LocationPinView(accentColor: accentColor, size: .small)
                .alignmentGuide(VerticalAlignment.center) { $0[.bottom] + LocationPinSize.small.triangleOffset }
        }
        .task(id: colorScheme) {
            thumbnail = await provider.thumbnail(coordinate: coordinate, size: size,
                                                 isDark: colorScheme == .dark)
        }
    }

    private var placeholder: some View {
        ZStack {
            Color(.secondarySystemBackground)
            LinearGradient(
                colors: [Color(hex: accentColor).opacity(0.18),
                         Color(hex: accentColor).opacity(0.05)],
                startPoint: .topLeading, endPoint: .bottomTrailing
            )
        }
    }
}

// MARK: - Shared Pin View

enum LocationPinSize {
    case small
    case large

    var iconSize: CGFloat {
        switch self {
        case .small: return 14
        case .large: return 18
        }
    }

    var frameSize: CGFloat {
        switch self {
        case .small: return 28
        case .large: return 40
        }
    }

    var triangleSize: CGFloat {
        switch self {
        case .small: return 8
        case .large: return 10
        }
    }

    var triangleOffset: CGFloat {
        switch self {
        case .small: return -3
        case .large: return -4
        }
    }
}

struct LocationPinView: View {
    let accentColor: String
    let size: LocationPinSize

    var body: some View {
        VStack(spacing: 0) {
            Image(systemName: "location.fill")
                .font(.system(size: size.iconSize, weight: .bold))
                .foregroundColor(.white)
                .frame(width: size.frameSize, height: size.frameSize)
                .background(Circle().fill(Color(hex: accentColor)))
                .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 4, y: 2)

            Image(systemName: "triangle.fill")
                .font(.system(size: size.triangleSize))
                .foregroundColor(Color(hex: accentColor))
                .rotationEffect(.degrees(180))
                .offset(y: size.triangleOffset)
        }
    }
}

// MARK: - Annotation Item for iOS 16

struct LocationAnnotationItem: Identifiable {
    let coordinate: CLLocationCoordinate2D
    var id: String { "\(coordinate.latitude),\(coordinate.longitude)" }
}
