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

/// Ce que l'épingle dit de l'âge de la position : en direct (onde), posée, ou la dernière connue hors ligne (K36 `stale`,
/// grisée, disque pointillé) — l'appareil ne peut plus rien apprendre de neuf.
enum LocationMapPinFreshness: Equatable {
    case live
    case settled
    case lastKnown
}

/// Des personnes posées au même point (#19851 : la précision « ville » les arrondit toutes au même centre) s'écartent en
/// éventail autour de ce point : aucune n'en cache une autre, et chacune garde l'avatar et le cercle de SA personne. Le
/// groupement est glouton sur la distance à l'écran ; l'ordre des identifiants rend l'éventail stable d'un rendu à l'autre.
nonisolated enum LocationMapFan {
    static func spread(_ points: [(String, CGPoint)], minimumDistance: Double) -> [String: CGPoint] {
        let ordered = points.sorted { $0.0 < $1.0 }
        let groups = ordered.reduce(into: [[(String, CGPoint)]]()) { groups, entry in
            let index = groups.firstIndex { group in
                group.contains { distance($0.1, entry.1) < minimumDistance }
            }
            if let index { groups[index].append(entry) } else { groups.append([entry]) }
        }
        return groups.reduce(into: [String: CGPoint]()) { placed, group in
            guard group.count > 1 else {
                group.forEach { placed[$0.0] = $0.1 }
                return
            }
            let n = Double(group.count)
            let centreX: Double = group.reduce(0.0) { $0 + Double($1.1.x) } / n
            let centreY: Double = group.reduce(0.0) { $0 + Double($1.1.y) } / n
            let radius: Double = max(minimumDistance * 0.6, minimumDistance / (2 * sin(Double.pi / n)))
            for (index, entry) in group.enumerated() {
                let angle: Double = -Double.pi / 2 + 2 * Double.pi * Double(index) / n
                placed[entry.0] = CGPoint(x: centreX + radius * cos(angle), y: centreY + radius * sin(angle))
            }
        }
    }

    private static func distance(_ a: CGPoint, _ b: CGPoint) -> Double {
        let dx = Double(a.x - b.x)
        let dy = Double(a.y - b.y)
        return (dx * dx + dy * dy).squareRoot()
    }
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
    /// Hors ligne, chaque épingle servie n'est plus que la dernière position connue.
    var isOffline = false
    var onSelect: ((String) -> Void)?
    /// Un appui long sur l'avatar d'un Proche ou d'un Sang lui parle par talkie (#19885) ; `nil` : la carte n'en propose pas.
    var talkie: TalkieSender?
    /// La fin du dernier appui long (`.distantFuture` pendant qu'il dure) : le relâchement qui le termine n'ouvre pas la
    /// personne.
    @State private var heldAt: Date?

    var body: some View {
        if let viewport {
            ZStack {
                if let me, viewport.contains(latitude: me.latitude, longitude: me.longitude, margin: 40) {
                    ownPin.position(viewport.point(latitude: me.latitude, longitude: me.longitude))
                }
                let shown = visiblePins(in: viewport)
                let placed = LocationMapFan.spread(
                    shown.map { ($0.id, viewport.point(latitude: $0.latitude, longitude: $0.longitude)) },
                    minimumDistance: MeeshyMapPinRecipe.selectedDiameter + 4)
                ForEach(shown) { pin in
                    pinView(pin, viewport: viewport, at: placed[pin.id])
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

    private func pinView(_ pin: SharedLocationPin, viewport: LocationMapViewport, at fanned: CGPoint?) -> some View {
        let point = fanned ?? viewport.point(latitude: pin.latitude, longitude: pin.longitude)
        let precision = Self.precision(of: pin, viewport: viewport)
        let lift = precision.radius == 0 ? (MeeshyMapPinRecipe.defaultDiameter + MeeshyMapPinRecipe.tipSide) / 2 : 0
        let freshness = Self.freshness(of: pin, isOffline: isOffline)
        let label = Self.label(of: pin)
        return MeeshyMapPin(
            label: freshness == .lastKnown ? "\(label), \(LocationMapCopy.lastKnownPosition)" : label,
            tint: LocationMapTint.color(for: pin.circle),
            precision: precision,
            isLive: freshness == .live,
            isSelected: pin.id == selectedId,
            isStale: freshness == .lastKnown,
            onPress: onSelect.map { select in {
                guard !TalkieLongHold.justEnded(at: heldAt, now: Date()) else { return }
                select(pin.id)
            } },
            content: { LocationMapPinAvatar(pin: pin, travels: pin.id == travellingId, size: Self.diameter(pin.id == selectedId),
                                            showsLife: false) },
            badge: { pinLife(pin) },
            above: { EmptyView() },
            below: { EmptyView() }
        )
        .modifier(PinTalkie(sender: talkie, pin: pin, onHold: { holding in heldAt = holding ? .distantFuture : Date() }))
        .position(x: point.x, y: point.y - CGFloat(lift))
    }

    /// Le point de présence, et par-dessus l'avatar ce que vit la personne (#19885). L'épingle découpe son contenu en
    /// cercle : la vie se pose dans son badge, qui ne l'est pas, à la taille de l'avatar.
    private func pinLife(_ pin: SharedLocationPin) -> some View {
        let diameter = CGFloat(Self.diameter(pin.id == selectedId))
        return Color.clear
            .frame(width: diameter, height: diameter)
            .overlay(alignment: .bottomTrailing) { MeeshyMapPinPresenceDot(color: pin.presence?.dotColor) }
            .overlay(alignment: .bottomLeading) {
                if let motion = LocationMotionGlyph.drawn(pin.shownMotion()) { LocationMotionBadge(motion: motion) }
            }
            .modifier(PeerLiveOverlays(userId: pin.id, avatarSize: diameter))
            .offset(x: -2, y: -2)
            .allowsHitTesting(false)
    }

    private var ownPin: some View {
        MeeshyMapPin(label: LocationMapCopy.myPosition(meShare, name: focusedName), kind: .own) {
            MeeshyMapPinOwnContent()
        }
    }

    /// Le nom et la précision, puis ce que fait la personne quand son mouvement est frais et dessiné (#19887).
    static func label(of pin: SharedLocationPin, now: Date = Date()) -> String {
        let base = LocationMapCopy.pinLabel(name: pin.name, precision: pin.precision)
        guard let motion = LocationMotionGlyph.drawn(pin.shownMotion(now: now)) else { return base }
        return "\(base), \(LocationMotionGlyph.label(for: motion))"
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

    /// Hors ligne : la dernière position connue ; sinon en direct sous deux minutes, posée au-delà.
    static func freshness(of pin: SharedLocationPin, isOffline: Bool, now: Date = Date()) -> LocationMapPinFreshness {
        guard !isOffline else { return .lastKnown }
        return isLive(pin, now: now) ? .live : .settled
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
    /// Ce que vit la personne (écoute, batterie, appel…) posé sur l'avatar ; l'épingle le pose elle-même, hors découpe.
    var showsLife = true

    var body: some View {
        if travels {
            MeeshyAvatarMorph(id: LocationMapMorph.id(pin.id), size: size) { face }
        } else {
            face
        }
    }

    private var face: some View {
        MeeshyAvatar(name: pin.name, context: .custom(CGFloat(size)),
                     accentColor: DynamicColorGenerator.colorForName(pin.name), avatarURL: pin.avatarURL,
                     presenceState: pin.presence)
            .accessibilityHidden(true)
            .modifier(PeerLiveOverlays(userId: showsLife ? pin.id : nil, avatarSize: CGFloat(size)))
    }
}

/// Le talkie d'une épingle : seulement pour un Proche ou un Sang, et seulement quand la carte en tient un.
private struct PinTalkie: ViewModifier {
    let sender: TalkieSender?
    let pin: SharedLocationPin
    let onHold: (Bool) -> Void

    @ViewBuilder
    func body(content: Content) -> some View {
        if let sender, TalkieLongHold.offers(circle: pin.circle) {
            content.modifier(TalkieLongHoldModifier(sender: sender, userId: pin.id, displayName: pin.name, onHold: onHold))
        } else {
            content
        }
    }
}

/// L'épingle d'une personne en pause par son mode fantôme (K36 `ghost`, #19562) : pointillée, sans avatar, posée hors de
/// toute position — la passerelle n'en sert aucune. Son nom dit pourquoi.
struct LocationMapGhostPin: View {
    let ghost: SharedLocationGhostPin

    var body: some View {
        MeeshyMapPin(label: LocationMapCopy.ghostPinLabel(name: ghost.name), kind: .ghost) {
            EmptyView()
        }
    }
}
