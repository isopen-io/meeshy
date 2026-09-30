import MapKit
import MeeshySDK
import SwiftUI

/// Les mesures partagées par la vue et le contrôleur : le bouton natif de
/// lecture est posé par le SYSTÈME à `NotificationExpandedLayout.playButtonFrame`,
/// et la vue lui réserve exactement cette place.
enum NotificationExpandedLayout {
    static let inset: CGFloat = 16
    static let playButtonSide: CGFloat = 44
    static let audioHeight: CGFloat = 76
    static let locationMapHeight: CGFloat = 190
    static let locationHeight: CGFloat = 262
    static let contactHeight: CGFloat = 132
    static let accent = Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)

    static var playButtonFrame: CGRect {
        CGRect(x: inset, y: (audioHeight - playButtonSide) / 2, width: playButtonSide, height: playButtonSide)
    }

    static func height(for content: NotificationExpandedContent) -> CGFloat {
        switch content {
        case .audio: return audioHeight
        case .location: return locationHeight
        case .contact: return contactHeight
        }
    }
}

// MARK: - Racine

/// La vue que le contrôleur monte : un cas, une carte.
struct NotificationExpandedRoot: View {
    let content: NotificationExpandedContent
    let player: NotificationAudioPlayer?
    let openInMaps: (URL) -> Void

    var body: some View {
        switch content {
        case .audio:
            if let player { NotificationAudioCard(player: player) }
        case .location(let place):
            NotificationLocationCard(place: place) {
                if let url = place.mapsURL { openInMaps(url) }
            }
        case .contact(let card):
            NotificationContactCardView(card: card)
        }
    }
}

// MARK: - Vocal

struct NotificationAudioCard: View {
    @ObservedObject var player: NotificationAudioPlayer

    var body: some View {
        HStack(spacing: 12) {
            // La place du bouton NATIF (`mediaPlayPauseButtonType`), que le
            // système dessine par-dessus cette vue.
            Color.clear
                .frame(width: NotificationExpandedLayout.playButtonSide, height: NotificationExpandedLayout.playButtonSide)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                ProgressView(value: NotificationPlaybackRate.progress(elapsed: player.elapsed, duration: player.duration))
                    .tint(NotificationExpandedLayout.accent)
                    .accessibilityLabel(Text(String(localized: "notification.expanded.progress", defaultValue: "Playback progress")))
                    .accessibilityValue(Text(NotificationPlaybackRate.clock(seconds: player.elapsed)))
                HStack {
                    Text(NotificationPlaybackRate.clock(seconds: player.elapsed))
                    Spacer()
                    Text(NotificationPlaybackRate.clock(seconds: player.duration))
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            }

            Button(action: player.cycleRate) {
                Text(NotificationPlaybackRate.label(for: player.rate))
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(NotificationExpandedLayout.accent)
                    .frame(minWidth: 44, minHeight: 44)
                    .background(NotificationExpandedLayout.accent.opacity(0.12), in: Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(String(localized: "notification.expanded.playbackRate", defaultValue: "Playback speed")))
            .accessibilityValue(Text(NotificationPlaybackRate.label(for: player.rate)))
        }
        .padding(.horizontal, NotificationExpandedLayout.inset)
        .frame(height: NotificationExpandedLayout.audioHeight)
    }
}

// MARK: - Position

struct NotificationLocationCard: View {
    let place: NotificationLocationDetail
    let openInMaps: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            NotificationMapView(latitude: place.latitude, longitude: place.longitude, title: place.name)
                .frame(height: NotificationExpandedLayout.locationMapHeight)

            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(place.name ?? String(localized: "notification.expanded.sharedLocation", defaultValue: "Shared location"))
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let address = place.address {
                        Text(address)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                .accessibilityElement(children: .combine)
                Spacer(minLength: 8)
                Button(action: openInMaps) {
                    Label(String(localized: "notification.expanded.openInMaps", defaultValue: "Open in Maps"), systemImage: "map.fill")
                        .font(.subheadline.weight(.semibold))
                        .padding(.horizontal, 12)
                        .frame(minHeight: 44)
                        .foregroundStyle(.white)
                        .background(NotificationExpandedLayout.accent, in: Capsule())
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, NotificationExpandedLayout.inset)
            .frame(maxHeight: .infinity)
        }
        .frame(height: NotificationExpandedLayout.locationHeight)
    }
}

/// Une carte INTERACTIVE — on s'y déplace, on zoome — épinglée sur le lieu.
struct NotificationMapView: UIViewRepresentable {
    let latitude: Double
    let longitude: Double
    let title: String?

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        let center = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        map.setRegion(MKCoordinateRegion(center: center, latitudinalMeters: 900, longitudinalMeters: 900), animated: false)
        let pin = MKPointAnnotation()
        pin.coordinate = center
        pin.title = title
        map.addAnnotation(pin)
        map.isRotateEnabled = false
        map.pointOfInterestFilter = .includingAll
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {}
}

// MARK: - Carte de visite

struct NotificationContactCardView: View {
    let card: NotificationContactCard

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            Text(initials)
                .font(.title2.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: 60, height: 60)
                .background(
                    LinearGradient(
                        colors: [NotificationExpandedLayout.accent,
                                 Color(red: 0x43 / 255, green: 0x38 / 255, blue: 0xCA / 255)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    in: Circle()
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 4) {
                Text(String(localized: "notification.expanded.contactCard", defaultValue: "Contact card"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Text(card.name)
                    .font(.headline)
                    .lineLimit(1)
                if let phone = card.phone {
                    Label(phone, systemImage: "phone.fill").font(.subheadline).lineLimit(1)
                }
                if let email = card.email {
                    Label(email, systemImage: "envelope.fill").font(.subheadline).lineLimit(1)
                }
            }
            .labelStyle(NotificationDetailLabelStyle())
            Spacer(minLength: 0)
        }
        .padding(.horizontal, NotificationExpandedLayout.inset)
        .frame(height: NotificationExpandedLayout.contactHeight)
        .accessibilityElement(children: .combine)
    }

    private var initials: String {
        let letters = card.name.split(separator: " ").prefix(2).compactMap(\.first)
        return letters.isEmpty ? "?" : String(letters).uppercased()
    }
}

private struct NotificationDetailLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            configuration.icon
                .font(.caption)
                .foregroundStyle(NotificationExpandedLayout.accent)
                .frame(width: 16)
            configuration.title
        }
    }
}
