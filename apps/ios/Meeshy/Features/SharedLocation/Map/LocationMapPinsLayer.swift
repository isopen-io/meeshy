import SwiftUI
import MeeshySDK
import MeeshyUI

/// La teinte d'une épingle : le cercle servi (Ami, Proche, Sang), un indigo neutre quand il n'est pas servi.
enum LocationMapTint {
    static func color(for circle: RelationLevel?) -> Color {
        circle.map(CircleLevelColor.color(for:)) ?? MeeshyColors.indigo500
    }
}

/// L'identité de voyage d'un avatar sur la carte (K29) : la même chaîne pour la fiche et pour l'épingle.
enum LocationMapMorph {
    static func id(_ userId: String) -> String { "locationMap.avatar.\(userId)" }
}

/// LES ÉPINGLES AU-DESSUS DE LA CARTE (#18872) : chaque personne est son avatar (K36) posé là où la carte montre sa
/// position SERVIE, entourée du flou servi à l'échelle de la carte ; la mienne est une petite épingle « own ». Rien ne
/// se dessine hors champ, et rien ne se dessine avant que la carte ait dit ce qu'elle montre.
struct LocationMapPinsLayer: View {
    let viewport: LocationMapViewport?
    let pins: [SharedLocationPin]
    var selectedId: String?
    /// La personne dont l'avatar voyage depuis la fiche : son épingle n'apparaît qu'à l'arrivée.
    var travellingId: String?
    var hasArrived = true
    var me: SharedLocationFix?
    /// Ce que dit mon épingle : ma position part-elle, et vers la personne regardée ?
    var meShare: LocationMapOwnShare = .notShared
    var focusedName: String?
    var onSelect: ((String) -> Void)?

    var body: some View {
        if let viewport {
            ZStack {
                if let me, viewport.contains(latitude: me.latitude, longitude: me.longitude, margin: 40) {
                    ownPin.position(viewport.point(latitude: me.latitude, longitude: me.longitude))
                }
                ForEach(visiblePins(in: viewport)) { pin in
                    pinView(pin, viewport: viewport)
                }
            }
            .frame(width: CGFloat(viewport.width), height: CGFloat(viewport.height))
        }
    }

    private func visiblePins(in viewport: LocationMapViewport) -> [SharedLocationPin] {
        pins.filter { pin in
            let margin = viewport.points(forMeters: pin.radiusMeters) + 60
            return viewport.contains(latitude: pin.latitude, longitude: pin.longitude, margin: margin)
                && (pin.id != travellingId || hasArrived)
        }
    }

    private func pinView(_ pin: SharedLocationPin, viewport: LocationMapViewport) -> some View {
        let point = viewport.point(latitude: pin.latitude, longitude: pin.longitude)
        let precision = Self.precision(of: pin, viewport: viewport)
        let lift = precision.radius == 0 ? (MeeshyMapPinRecipe.defaultDiameter + MeeshyMapPinRecipe.tipSide) / 2 : 0
        let isLive = Self.isLive(pin)
        return MeeshyMapPin(
            label: LocationMapCopy.pinLabel(name: pin.name, precision: pin.precision),
            tint: LocationMapTint.color(for: pin.circle),
            precision: precision,
            isLive: isLive,
            isSelected: pin.id == selectedId,
            onPress: onSelect.map { select in { select(pin.id) } },
            content: { LocationMapPinAvatar(pin: pin, travels: pin.id == travellingId, size: Self.diameter(pin.id == selectedId)) },
            badge: { presenceDot(pin.presence) },
            above: { EmptyView() },
            below: { EmptyView() }
        )
        .position(x: point.x, y: point.y - CGFloat(lift))
    }

    @ViewBuilder
    private func presenceDot(_ presence: PresenceState?) -> some View {
        if let presence {
            Circle()
                .fill(presence.dotColor)
                .frame(width: 14, height: 14)
                .overlay(Circle().strokeBorder(Color.black.opacity(MeeshyOpacity.medium), lineWidth: 2))
                .accessibilityHidden(true)
        }
    }

    private var ownPin: some View {
        MeeshyMapPin(label: LocationMapCopy.myPosition(meShare, name: focusedName), kind: .own) {
            ZStack {
                MeeshyColors.brandPrimary
                Image(systemName: "person.fill")
                    .font(MeeshyFont.relative(MeeshyIconSize.sm, weight: .bold))
                    .foregroundStyle(Color.white)
            }
        }
    }

    /// Le flou à l'échelle de la carte : sous 32 points, l'épingle porte une pointe au lieu d'un disque.
    static func precision(of pin: SharedLocationPin, viewport: LocationMapViewport) -> MeeshyMapPinPrecision {
        guard pin.precision != .exact else { return .exact }
        let radius = viewport.points(forMeters: pin.radiusMeters)
        guard radius >= MeeshyMapPinRecipe.discMinimumRadius else { return .exact }
        return pin.precision == .city ? .wide(radius: min(radius, 2_000)) : .area(radius: min(radius, 2_000))
    }

    static func diameter(_ isSelected: Bool) -> Double {
        isSelected ? MeeshyMapPinRecipe.selectedDiameter : MeeshyMapPinRecipe.defaultDiameter
    }

    /// En direct : mise à jour depuis moins de deux minutes.
    static func isLive(_ pin: SharedLocationPin, now: Date = Date()) -> Bool {
        if case .live = SharedLocationFreshness(updatedAt: pin.updatedAt, now: now) { return true }
        return false
    }
}

/// L'avatar posé dans une épingle : la photo servie, sinon les initiales sur la teinte du cercle. Il voyage (K29) quand
/// il arrive de la fiche.
struct LocationMapPinAvatar: View {
    let pin: SharedLocationPin
    var travels = false
    var size: Double = MeeshyMapPinRecipe.defaultDiameter

    var body: some View {
        if travels {
            MeeshyAvatarMorph(id: LocationMapMorph.id(pin.id), size: size) { face }
        } else {
            face
        }
    }

    private var face: some View {
        MeeshyAvatar(name: pin.name, context: .custom(CGFloat(size)),
                     accentColor: DynamicColorGenerator.colorForName(pin.name), avatarURL: pin.avatarURL)
            .accessibilityHidden(true)
    }
}
