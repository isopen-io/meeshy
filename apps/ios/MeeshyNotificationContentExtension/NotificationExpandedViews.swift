import MapKit
import MeeshySDK
import SwiftUI

/// Les mesures partagées par la vue et le contrôleur. Le lecteur suit
/// `NotificationPlayerGeometry` : le bouton natif est posé par le SYSTÈME au
/// cadre qu'elle calcule, et la vue dessine sa pastille autour.
enum NotificationExpandedLayout {
    static let player = NotificationPlayerGeometry.standard
    static let inset: CGFloat = player.inset
    static let locationMapHeight: CGFloat = 190
    static let locationHeight: CGFloat = 262
    static let contactHeight: CGFloat = 132
    static let accent = Color(red: 0x63 / 255, green: 0x66 / 255, blue: 0xF1 / 255)

    static func height(for content: NotificationExpandedContent) -> CGFloat {
        switch content {
        case .audio: return player.height
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
    let togglePlayback: () -> Void
    let openInMaps: (URL) -> Void

    var body: some View {
        switch content {
        case .audio:
            if let player { NotificationAudioCard(player: player, togglePlayback: togglePlayback) }
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

/// Une rangée, un axe : pastille de lecture · ligne de progression · pastille
/// de vitesse, toutes centrées sur `axisY`. Les deux pastilles ont le même
/// gabarit et la même teinte d'accent, comme la puce de vitesse des bulles
/// audio (`AudioPlayerView`).
struct NotificationAudioCard: View {
    @ObservedObject var player: NotificationAudioPlayer
    let togglePlayback: () -> Void
    private let geometry = NotificationExpandedLayout.player
    private let accent = NotificationExpandedLayout.accent

    var body: some View {
        HStack(spacing: 12) {
            // La pastille du bouton NATIF (`mediaPlayPauseButtonType`) : le
            // système dessine son glyphe au centre, à `nativeButtonFrame`. Le
            // glyphe est fin, la cible ne l'est pas : toute la pastille (44 pt)
            // joue et met en pause, et le contrôleur en informe le système.
            Button(action: togglePlayback) { pill }
                .buttonStyle(.plain)
                .accessibilityHidden(true)

            NotificationProgressTrack(
                progress: NotificationPlaybackRate.progress(elapsed: player.elapsed, duration: player.duration),
                elapsed: NotificationPlaybackRate.clock(seconds: player.elapsed),
                total: NotificationPlaybackRate.clock(seconds: player.duration),
                height: geometry.pillSide,
                accent: accent,
                seek: player.seek(toFraction:)
            )

            Button(action: player.cycleRate) {
                Text(NotificationPlaybackRate.label(for: player.rate))
                    .font(.footnote.weight(.bold).monospacedDigit())
                    .foregroundStyle(accent)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                    .frame(width: geometry.pillSide, height: geometry.pillSide)
                    .background(pill)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(String(localized: "notification.expanded.playbackRate", defaultValue: "Playback speed")))
            .accessibilityValue(Text(NotificationPlaybackRate.label(for: player.rate)))
        }
        .padding(.horizontal, geometry.inset)
        .frame(height: geometry.height)
    }

    private var pill: some View {
        Circle()
            .fill(accent.opacity(0.14))
            .frame(width: geometry.pillSide, height: geometry.pillSide)
    }
}

/// La ligne de progression, centrée sur l'axe de la rangée : partie jouée et
/// bouton à l'accent, temps en petit SOUS la ligne, alignés à ses bords. On
/// glisse le bouton (ou on touche la ligne) pour se déplacer dans le vocal.
struct NotificationProgressTrack: View {
    let progress: Double
    let elapsed: String
    let total: String
    let height: CGFloat
    let accent: Color
    let seek: (Double) -> Void

    private let lineHeight: CGFloat = 4
    private let knobSide: CGFloat = 14

    var body: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            let played = width * progress
            ZStack(alignment: .leading) {
                Capsule().fill(accent.opacity(0.18)).frame(height: lineHeight)
                Capsule().fill(accent).frame(width: max(lineHeight, played), height: lineHeight)
                Circle()
                    .fill(accent)
                    .overlay(Circle().stroke(Color.white, lineWidth: 2))
                    .frame(width: knobSide, height: knobSide)
                    .shadow(color: accent.opacity(0.35), radius: 3, y: 1)
                    .offset(x: min(max(0, played - knobSide / 2), width - knobSide))
            }
            .frame(width: width, height: height)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0).onChanged { value in
                seek(NotificationPlayerGeometry.seekFraction(x: value.location.x, trackWidth: width))
            })
            .overlay(alignment: .bottom) {
                HStack {
                    Text(elapsed)
                    Spacer()
                    Text(total)
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
                .offset(y: 2)
                .accessibilityHidden(true)
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel(Text(String(localized: "notification.expanded.progress", defaultValue: "Playback progress")))
        .accessibilityValue(Text(verbatim: "\(elapsed) / \(total)"))
        .accessibilityAdjustableAction { direction in
            let step = direction == .increment ? 0.1 : -0.1
            seek(min(1, max(0, progress + step)))
        }
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
