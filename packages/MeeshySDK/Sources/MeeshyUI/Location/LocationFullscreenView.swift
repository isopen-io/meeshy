import SwiftUI
import MapKit
import MeeshySDK

public struct LocationFullscreenView: View {
    @Environment(\.dismiss) private var dismiss

    let latitude: Double
    let longitude: Double
    let placeName: String?
    let address: String?
    let accentColor: String
    let senderName: String?

    @State private var isHybridMap = false

    public init(latitude: Double, longitude: Double, placeName: String? = nil,
                address: String? = nil, accentColor: String = "08D9D6",
                senderName: String? = nil) {
        self.latitude = latitude; self.longitude = longitude
        self.placeName = placeName; self.address = address
        self.accentColor = accentColor; self.senderName = senderName
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private var region: MKCoordinateRegion {
        MKCoordinateRegion(center: coordinate, latitudinalMeters: 1000, longitudinalMeters: 1000)
    }

    public var body: some View {
        ZStack(alignment: .top) {
            fullscreenMap
                .ignoresSafeArea()

            VStack(spacing: 0) {
                headerBar
                Spacer()
                bottomCard
            }
        }
    }

    @ViewBuilder
    private var fullscreenMap: some View {
        if #available(iOS 17.0, *) {
            FullscreenMapView17(coordinate: coordinate, region: region, accentColor: accentColor, placeName: placeName, isHybrid: isHybridMap)
        } else {
            FullscreenMapView16(coordinate: coordinate, region: region, accentColor: accentColor, isHybrid: isHybridMap)
        }
    }

    private var headerBar: some View {
        HStack {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }

            Spacer()

            Button {
                withAnimation {
                    isHybridMap.toggle()
                }
            } label: {
                Image(systemName: isHybridMap ? "map" : "map.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.black.opacity(0.5)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var bottomCard: some View {
        VStack(spacing: 12) {
            if let name = senderName {
                HStack(spacing: 6) {
                    Image(systemName: "person.fill")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: accentColor))
                    Text(name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(.primary)
                    Spacer()
                }
            }

            HStack(spacing: 8) {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Color(hex: accentColor))

                VStack(alignment: .leading, spacing: 2) {
                    Text(placeName ?? "Position partagee")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.primary)
                    if let addr = address {
                        Text(addr)
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                    Text(String(format: "%.5f, %.5f", latitude, longitude))
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundColor(.secondary.opacity(0.7))
                }

                Spacer()
            }

            HStack(spacing: 12) {
                Button {
                    openInMaps()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "map.fill")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Ouvrir dans Plans")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .fill(Color(hex: accentColor))
                    )
                }

                Button {
                    openDirections()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "arrow.triangle.turn.up.right.diamond.fill")
                            .font(.system(size: 13, weight: .semibold))
                        Text("Itineraire")
                            .font(.system(size: 13, weight: .semibold))
                    }
                    .foregroundColor(Color(hex: accentColor))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color(hex: accentColor), lineWidth: 1.5)
                    )
                }
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 20)
    }

    private func openInMaps() {
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = placeName ?? "Shared Location"
        mapItem.openInMaps()
    }

    private func openDirections() {
        let placemark = MKPlacemark(coordinate: coordinate)
        let mapItem = MKMapItem(placemark: placemark)
        mapItem.name = placeName ?? "Shared Location"
        mapItem.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDriving])
    }
}

// MARK: - iOS 17+ Fullscreen Map

@available(iOS 17.0, *)
private struct FullscreenMapView17: View {
    let coordinate: CLLocationCoordinate2D
    let region: MKCoordinateRegion
    let accentColor: String
    let placeName: String?
    let isHybrid: Bool

    @State private var mapPosition: MapCameraPosition

    init(coordinate: CLLocationCoordinate2D, region: MKCoordinateRegion, accentColor: String, placeName: String?, isHybrid: Bool) {
        self.coordinate = coordinate
        self.region = region
        self.accentColor = accentColor
        self.placeName = placeName
        self.isHybrid = isHybrid
        _mapPosition = State(initialValue: .region(region))
    }

    var body: some View {
        Map(position: $mapPosition) {
            Annotation(placeName ?? "", coordinate: coordinate) {
                LocationPinView(accentColor: accentColor, size: .large)
            }
        }
        .mapStyle(isHybrid ? .hybrid : .standard)
    }
}

// MARK: - iOS 16 Fallback Fullscreen Map

private struct FullscreenMapView16: View {
    let coordinate: CLLocationCoordinate2D
    let region: MKCoordinateRegion
    let accentColor: String
    let isHybrid: Bool

    var body: some View {
        Map(coordinateRegion: .constant(region), interactionModes: .all, annotationItems: [LocationAnnotationItem(coordinate: coordinate)]) { item in
            MapAnnotation(coordinate: item.coordinate) {
                LocationPinView(accentColor: accentColor, size: .large)
            }
        }
    }
}
