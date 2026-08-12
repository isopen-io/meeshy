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

    private static let thumbnailSize = CGSize(width: 260, height: 150)

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
        VStack(spacing: 0) {
            mapContent
                .frame(height: Self.thumbnailSize.height)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .allowsHitTesting(false)

            if placeName != nil || address != nil {
                locationInfoBar
            }
        }
        .frame(width: Self.thumbnailSize.width)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            onTapFullscreen?()
        }
        .accessibilityLabel(String(localized: "location.a11y.label", defaultValue: "Position : \(placeName ?? String(localized: "location.shared", defaultValue: "Position partagée", bundle: .module))", bundle: .module))
        .accessibilityHint(String(localized: "location.a11y.hint", defaultValue: "Touchez pour ouvrir la carte en plein écran", bundle: .module))
    }

    private var mapContent: some View {
        LocationMapThumbnailView(coordinate: coordinate, accentColor: accentColor,
                                 size: Self.thumbnailSize, provider: thumbnailProvider)
    }

    private var locationInfoBar: some View {
        HStack(spacing: 8) {
            Image(systemName: "mappin.and.ellipse")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: accentColor))

            VStack(alignment: .leading, spacing: 1) {
                if let name = placeName {
                    Text(name)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(.primary)
                        .lineLimit(1)
                }
                if let addr = address {
                    Text(addr)
                        .font(.system(size: 10))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            Image(systemName: "arrow.up.right.square")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Color(hex: accentColor).opacity(0.7))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
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
            } else {
                placeholder
            }
            LocationPinView(accentColor: accentColor, size: .small)
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
