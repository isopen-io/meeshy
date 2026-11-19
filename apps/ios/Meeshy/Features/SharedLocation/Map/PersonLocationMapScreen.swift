import SwiftUI
import MapKit
import CoreLocation
import MeeshySDK
import MeeshyUI

/// LA CARTE COMME ACTION (#18872, planches Carte-Personne et iPad-Split). « Carte », depuis la face Actions d'une fiche,
/// ouvre la carte des positions partagées sur cette personne : son avatar quitte la place de la fiche et devient
/// l'épingle (K29 puis K36), et la fiche devient la feuille basse (lieu, fraîcheur, temps restant, itinéraire,
/// partager la mienne). Sur iPad, la feuille et la carte se posent côte à côte.
///
/// Rien n'est plus fin que servi : l'épingle est la position que la passerelle m'a donnée, son disque le flou servi.
/// Le magasin des positions se peint dès l'ouverture (cache d'abord) ; le rattrapage du monde efface une fin manquée.
struct PersonLocationMapScreen: View {
    let userId: String
    let displayName: String
    var onWrite: (() -> Void)?
    var onCall: (() -> Void)?
    /// La fiche entière, posée à gauche de la carte sur iPad (planche iPad-Split) ; sans elle, la feuille de la carte.
    var profile: ProfileLocationMapRequest.Profile?

    @StateObject private var model = SharedLocationsMapViewModel()
    @StateObject private var places = LocationPlaceNamer()
    @ObservedObject private var sharing = SharedLocationSharingHolder.center()
    @ObservedObject private var asks = SharedLocationAskHolder.center()
    @State private var isOffline = NetworkMonitor.shared.isOffline
    @State private var viewport: LocationMapViewport?
    @State private var focus: LocationMapFocus?
    @State private var style: LocationMapStyle = .standard
    @State private var northToken = 0
    @State private var hasArrived = false
    @State private var me: SharedLocationFix?
    @State private var sharesMine = false
    @State private var showsHistory = false
    @State private var bloodHistoryOpen = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var pin: SharedLocationPin? { model.pin(for: userId) }
    private var ownShare: LocationMapOwnShare {
        LocationMapOwnShare.resolve(recipientIds: sharing.roster.pruned(now: Date()).recipients.map(\.userId),
                                    focusedUserId: userId)
    }

    var body: some View {
        MeeshyAvatarMorphScopeHost {
            Group {
                if sizeClass == .regular {
                    HStack(spacing: 0) {
                        if let profile {
                            profile()
                                .environment(\.profileLocationMap, nil)
                                .modifier(ProfileSheetEnvironment())
                                .frame(width: 400)
                        } else {
                            sidePanel.frame(width: 360)
                        }
                        Divider()
                        mapStage
                    }
                } else {
                    mapStage.meeshyAnchoredSheet(
                        isPresented: .constant(true), height: .content, isDragDismissEnabled: false,
                        closeLabel: nil, surface: .glass, outside: .passesThrough
                    ) { sheetContent }
                }
            }
        }
        .background { shortcuts }
        .meeshyHardwareKeyboardHost()
        .task { await appear() }
        .onReceive(NetworkMonitor.shared.isOfflinePublisher.receive(on: DispatchQueue.main)) { isOffline = $0 }
        .adaptiveOnChange(of: model.pins, initial: true) { _, pins in Task { await places.resolve(pins.filter { $0.id == userId }) } }
        .sheet(isPresented: $sharesMine) {
            ShareMyLocationSheet(recipients: [ShareMyLocationRecipient(userId: userId, name: displayName, circle: pin?.circle,
                                                                       avatarURL: pin?.avatarURL)])
        }
        .fullScreenCover(isPresented: $bloodHistoryOpen) {
            BloodLocationScreen(userId: userId, displayName: displayName)
        }
    }

    // MARK: - La carte

    private var mapStage: some View {
        ZStack(alignment: .top) {
            LocationMapCanvas(focus: focus, style: style, allowsRotation: true, northToken: northToken,
                              animatesNorth: !reduceMotion, onViewport: { viewport = $0 },
                              onRegionSettled: { model.regionChanged($0.bounds) })
                .ignoresSafeArea()
            trace
            LocationMapPinsLayer(viewport: viewport, pins: model.pins, selectedId: userId, travellingId: userId,
                                 hasArrived: hasArrived || reduceMotion, me: me, meShare: ownShare,
                                 focusedName: displayName, isOffline: isOffline)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            if !hasArrived, !reduceMotion, let pin { heroAvatar(pin) }
            chrome
            if sizeClass == .regular { legend }
        }
    }

    // MARK: - Le clavier (K55, planche iPad-Split)

    /// ⌘M referme la carte (on revient à la fiche) ; la légende le montre depuis la même valeur. ⌘↵ est porté par
    /// « Écrire » de la feuille (K32), qui montre sa touche sous son libellé.
    private var shortcuts: some View {
        Button(LocationMapCopy.close) { dismiss() }
            .meeshyKeyShortcut(ProfileKeyShortcuts.map)
            .opacity(0)
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
    }

    /// En bas de la carte : la précision servie, puis les raccourcis (rien sans clavier).
    private var legend: some View {
        VStack {
            Spacer()
            HStack(alignment: .bottom, spacing: MeeshySpacing.md) {
                if let pin {
                    MeeshyBadge(.label(LocationMapCopy.precisionPill(pin.precision)), leading: .systemImage("circle.dashed"),
                                surface: .glass, size: .s36)
                }
                MeeshyKeyLegend(items: legendItems, container: .glassBar)
                Spacer()
                if profile != nil, pin != nil {
                    sheetContent
                        .padding(.top, MeeshySpacing.lg)
                        .frame(maxWidth: 380)
                        .meeshyGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl), tone: .deep)
                }
            }
            .padding(MeeshySpacing.lg)
        }
    }

    private var legendItems: [MeeshyKeyLegendItem] {
        let map = MeeshyKeyLegendItem(id: "map", combos: [ProfileKeyShortcuts.map], title: LocationMapCopy.mapShortcut)
        guard onWrite != nil, pin != nil else { return [map] }
        return [map, MeeshyKeyLegendItem(id: "write", combos: [ProfileKeyShortcuts.write], title: LocationMapCopy.write,
                                         startsGroup: true)]
    }

    @ViewBuilder
    private var trace: some View {
        if let viewport, let pin, let me, let meters = distanceMeters {
            let from = viewport.point(latitude: me.latitude, longitude: me.longitude)
            let to = viewport.point(latitude: pin.latitude, longitude: pin.longitude)
            MeeshyMapTrace(label: LocationMapCopy.walk(meters, locale: .current), points: [from, to], kind: .link,
                           tint: LocationMapTint.color(for: pin.circle)) {
                MeeshyBadge(.label(LocationMapCopy.walk(meters, locale: .current)), leading: .systemImage("figure.walk"),
                            surface: .glass, size: .s28)
            }
            .frame(width: CGFloat(viewport.width), height: CGFloat(viewport.height))
            .ignoresSafeArea()
            .allowsHitTesting(false)
        }
    }

    private func heroAvatar(_ pin: SharedLocationPin) -> some View {
        MeeshyAvatarMorph(id: LocationMapMorph.id(pin.id), size: MeeshyAvatarMorphSize.hero) {
            MeeshyAvatar(name: pin.name, context: .custom(CGFloat(MeeshyAvatarMorphSize.hero)),
                         accentColor: DynamicColorGenerator.colorForName(pin.name), avatarURL: pin.avatarURL,
                         presenceState: pin.presence)
        }
        .padding(.top, 120)
        .accessibilityHidden(true)
    }

    private var chrome: some View {
        HStack(alignment: .top) {
            MeeshyGlassButton(systemImage: sizeClass == .regular ? "xmark" : "chevron.down", label: LocationMapCopy.close,
                              size: .s44, action: { dismiss() })
            Spacer()
            VStack(spacing: MeeshySpacing.sm) {
                if let pin {
                    MeeshyBadge(.label(LocationMapCopy.view(pin.precision)), leading: .systemImage("eye"), surface: .glass,
                                size: .s36)
                }
                LocationTravelPill(me: me, places: places)
            }
            Spacer()
            VStack(spacing: MeeshySpacing.sm) {
                MeeshyGlassButton(systemImage: "square.3.layers.3d", label: LocationMapCopy.layers,
                                  kind: style == .hybrid ? .active : nil, size: .s44, action: { style = style.toggled })
                MeeshyGlassButton(systemImage: "scope", label: LocationMapCopy.recenter, size: .s44,
                                  action: { refocus(animated: true) })
                compass
            }
            .animation(MeeshyMotion.animation(.morph, reduce: reduceMotion), value: viewport?.isNorthUp ?? true)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    /// LA BOUSSOLE (#19622, planche Carte-Personne) : absente tant que la carte est au nord ; dès qu'elle tourne, son
    /// aiguille suit le cap, et la toucher remet le nord en haut (sans voyage sous Réduire les animations).
    @ViewBuilder
    private var compass: some View {
        if let viewport, !viewport.isNorthUp {
            MeeshyGlassButton(label: LocationMapCopy.northUp, size: .s44, action: { northToken += 1 }) {
                Image(systemName: "location.north.line")
                    .rotationEffect(.degrees(viewport.compassNeedleDegrees))
            }
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
        }
    }

    // MARK: - La feuille

    @ViewBuilder
    private var sheetContent: some View {
        if let pin {
            PersonLocationCard(pin: pin, place: places.name(for: pin), distanceMeters: distanceMeters, actions: actions(pin))
                .padding(.horizontal, MeeshySpacing.lg)
                .padding(.bottom, MeeshySpacing.lg)
        } else {
            let shareMine = MeeshyStateBlockAction(title: LocationMapCopy.shareMine, systemImage: "mappin.and.ellipse") {
                sharesMine = true
            }
            MeeshyStateBlock(
                kind: .empty,
                title: LocationMapCopy.notSharingTitle(name: displayName),
                message: LocationMapCopy.notSharingMessage,
                primary: askAgainAction ?? shareMine,
                secondary: askAgainAction == nil ? nil : shareMine,
                art: .glyph,
                size: .regular
            ) {
                Image(systemName: "location.slash")
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    private var sidePanel: some View {
        ScrollView {
            sheetContent.padding(.top, MeeshySpacing.xxl)
        }
    }

    private func actions(_ pin: SharedLocationPin) -> PersonLocationActions {
        PersonLocationActions(
            onWrite: onWrite.map { write in { dismiss(); write() } },
            onCall: onCall.map { call in { dismiss(); call() } },
            onShareMine: { sharesMine = true },
            onDirections: { Self.openDirections(to: pin) },
            onHistory: showsHistory && pin.circle == .blood ? { bloodHistoryOpen = true } : nil,
            onAskExtend: asks.canAsk(userId) ? { ask(.extend) } : nil,
            hasAskedExtend: asks.hasAsked(userId)
        )
    }

    private func ask(_ kind: SharedLocationRequestKind) {
        Task {
            let feedback = await asks.ask(userId, kind: kind)
            SharedLocationAskWording.show(feedback)
        }
    }

    /// « Lui demander » (planche Etat-Vide, vue 5) : seulement à qui a partagé avec moi il y a peu — la passerelle ne
    /// sert pas encore la demande à quelqu'un qui n'a jamais partagé (#19369).
    private var askAgainAction: MeeshyStateBlockAction? {
        guard model.ended.contains(where: { $0.id.lowercased() == userId.lowercased() }), asks.canAsk(userId) else { return nil }
        let asked = asks.hasAsked(userId)
        return MeeshyStateBlockAction(title: asked ? SharedLocationAskWording.asked : SharedLocationAskWording.askHim,
                                      systemImage: asked ? "checkmark" : "hand.wave") {
            guard !asked else { return }
            ask(.reask)
        }
    }

    // MARK: - Mouvement et données

    private var distanceMeters: Double? {
        guard let me, let pin else { return nil }
        return LocationMapRules.distanceMeters(fromLatitude: me.latitude, fromLongitude: me.longitude,
                                               toLatitude: pin.latitude, toLongitude: pin.longitude)
    }

    private func appear() async {
        me = LocationMapOwnPosition.lastKnown()
        refocus(animated: false)
        showsHistory = await LocationMapServices.bloodLocationEnabled()
        await model.appeared()
        refocus(animated: false)
        guard !hasArrived else { return }
        do { try await Task.sleep(for: .milliseconds(180)) } catch { return }
        withAnimation(MeeshyMotion.animation(.travel, reduce: reduceMotion)) { hasArrived = true }
    }

    private func refocus(animated: Bool) {
        let target: LocationMapSpot? = pin.map { (latitude: $0.latitude, longitude: $0.longitude, radiusMeters: $0.radiusMeters) }
        let mine: LocationMapSpot? = me.map { (latitude: $0.latitude, longitude: $0.longitude, radiusMeters: 0.0) }
        let spots: [LocationMapSpot] = [target, mine].compactMap { $0 }
        guard let region = LocationMapRegion.fitting(spots, margin: 1.8) else { return }
        focus = LocationMapFocus(region: region, token: (focus?.token ?? 0) + 1, animated: animated)
    }

    static func openDirections(to pin: SharedLocationPin) {
        let coordinate = CLLocationCoordinate2D(latitude: pin.latitude, longitude: pin.longitude)
        let item = MKMapItem(placemark: MKPlacemark(coordinate: coordinate))
        item.name = pin.name
        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeWalking])
    }
}

/// Ma position, telle que l'appareil la connaît DÉJÀ : jamais de demande d'autorisation depuis la carte (seul
/// « Partager ma position » la demande), jamais un relevé de plus d'une heure.
enum LocationMapOwnPosition {
    /// La permission est DÉJÀ accordée : la carte ne la demande jamais.
    static var isAuthorized: Bool {
        switch CLLocationManager().authorizationStatus {
        case .authorizedWhenInUse, .authorizedAlways: return true
        default: return false
        }
    }

    static func lastKnown(now: Date = Date()) -> SharedLocationFix? {
        guard isAuthorized else { return nil }
        let manager = CLLocationManager()
        guard let location = manager.location, now.timeIntervalSince(location.timestamp) < 3_600 else { return nil }
        return SharedLocationFix(latitude: location.coordinate.latitude, longitude: location.coordinate.longitude,
                                 accuracy: location.horizontalAccuracy)
    }
}

/// Les interrupteurs serveur que la carte lit : la position du Sang n'est proposée que si la passerelle l'ouvre.
enum LocationMapServices {
    static func bloodLocationEnabled() async -> Bool {
        (try? await RelationsService.shared.config())?.bloodLocationEnabled ?? false
    }
}
