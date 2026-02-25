import SwiftUI
import MapKit
import MeeshySDK

public struct LocationMessageView: View {
    let latitude: Double
    let longitude: Double
    let placeName: String?
    let address: String?
    let accentColor: String
    let onTapFullscreen: (() -> Void)?

    public init(latitude: Double, longitude: Double, placeName: String? = nil,
                address: String? = nil, accentColor: String = "08D9D6",
                onTapFullscreen: (() -> Void)? = nil) {
        self.latitude = latitude; self.longitude = longitude
        self.placeName = placeName; self.address = address
        self.accentColor = accentColor; self.onTapFullscreen = onTapFullscreen
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private var region: MKCoordinateRegion {
        MKCoordinateRegion(center: coordinate, latitudinalMeters: 500, longitudinalMeters: 500)
    }

    public var body: some View {
        VStack(spacing: 0) {
            mapContent
                .frame(height: 150)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .allowsHitTesting(false)

            if placeName != nil || address != nil {
                locationInfoBar
            }
        }
        .frame(width: 260)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color(.systemBackground).opacity(0.95))
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(Rectangle())
        .onTapGesture {
            onTapFullscreen?()
        }
        .accessibilityLabel("Location: \(placeName ?? "Shared location")")
        .accessibilityHint("Tap to open full map")
    }

    @ViewBuilder
    private var mapContent: some View {
        if #available(iOS 17.0, *) {
            LocationMapView17(coordinate: coordinate, region: region, accentColor: accentColor)
        } else {
            LocationMapView16(coordinate: coordinate, region: region, accentColor: accentColor)
        }
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

// MARK: - iOS 17+ Map

@available(iOS 17.0, *)
private struct LocationMapView17: View {
    let coordinate: CLLocationCoordinate2D
    let region: MKCoordinateRegion
    let accentColor: String

    @State private var mapPosition: MapCameraPosition

    init(coordinate: CLLocationCoordinate2D, region: MKCoordinateRegion, accentColor: String) {
        self.coordinate = coordinate
        self.region = region
        self.accentColor = accentColor
        _mapPosition = State(initialValue: .region(region))
    }

    var body: some View {
        Map(position: $mapPosition, interactionModes: []) {
            Annotation("", coordinate: coordinate) {
                LocationPinView(accentColor: accentColor, size: .small)
            }
        }
    }
}

// MARK: - iOS 16 Fallback Map

private struct LocationMapView16: View {
    let coordinate: CLLocationCoordinate2D
    let region: MKCoordinateRegion
    let accentColor: String

    var body: some View {
        Map(coordinateRegion: .constant(region), interactionModes: [], annotationItems: [LocationAnnotationItem(coordinate: coordinate)]) { item in
            MapAnnotation(coordinate: item.coordinate) {
                LocationPinView(accentColor: accentColor, size: .small)
            }
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
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}
