import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA POSITION D'UN SANG (#18872, planche Carte-Sang), derrière `services.bloodLocation` : le chemin de la fenêtre
/// choisie (K54 en `history`, ses arrêts à l'heure près), la tête de lecture (K02 + glissière), trente jours en
/// barres (K50 `strip`), les fenêtres en tuiles (K04), et ce qui me concerne : ma position, mon fantôme (K06), qui a lu
/// la mienne. Rien n'est plus fin que servi ; un fantôme sert une réponse vide, et l'écran dit alors « rien ».
struct BloodLocationScreen: View {
    let userId: String
    let displayName: String

    @StateObject private var model: BloodLocationModel
    @StateObject private var people = SharedLocationsMapViewModel()
    @StateObject private var places = LocationPlaceNamer()
    @State private var isOffline = NetworkMonitor.shared.isOffline
    @ObservedObject private var sharing: SharedLocationSharingCenter
    @State private var viewport: LocationMapViewport?
    @State private var focus: LocationMapFocus?
    @State private var isPlaying = false
    @State private var sharesMine = false
    @State private var me: SharedLocationFix?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(userId: String, displayName: String, sharing: SharedLocationSharingCenter = SharedLocationSharingHolder.center()) {
        self.userId = userId
        self.displayName = displayName
        _model = StateObject(wrappedValue: BloodLocationModel(userId: userId))
        _sharing = ObservedObject(wrappedValue: sharing)
    }

    private var recipientIds: [String] { sharing.roster.pruned(now: Date()).recipients.map(\.userId) }
    private var ownShare: LocationMapOwnShare { LocationMapOwnShare.resolve(recipientIds: recipientIds, focusedUserId: userId) }

    private var tint: Color { LocationMapTint.color(for: .blood) }

    var body: some View {
        ZStack(alignment: .top) {
            LocationMapCanvas(focus: focus, onViewport: { viewport = $0 })
                .ignoresSafeArea()
            traceLayer
            LocationMapPinsLayer(viewport: viewport, pins: people.pins.filter { $0.id == userId },
                                 me: me, meShare: ownShare, focusedName: displayName, isOffline: isOffline)
                .ignoresSafeArea()
                .allowsHitTesting(false)
            ghostPin
            chrome
        }
        .meeshyAnchoredSheet(isPresented: .constant(true), height: .detents([0.5, 0.9], initial: 0),
                             isDragDismissEnabled: false, closeLabel: nil, surface: .dark, outside: .passesThrough) {
            ScrollView { BloodLocationSheet(model: model, displayName: displayName, tint: tint,
                                            isPlaying: $isPlaying, onShareMine: { sharesMine = true },
                                            ownShare: ownShare, seenByCount: recipientIds.count,
                                            onStoppedReceiving: { dismiss() }) }
        }
        .task {
            me = LocationMapOwnPosition.lastKnown()
            await people.appeared()
            await model.load()
            refocus()
        }
        .adaptiveOnChange(of: model.range) { _, _ in refocus() }
        .onReceive(NetworkMonitor.shared.isOfflinePublisher.receive(on: DispatchQueue.main)) { isOffline = $0 }
        .task(id: isPlaying) { await play() }
        .sheet(isPresented: $sharesMine) {
            ShareMyLocationSheet(recipients: [ShareMyLocationRecipient(userId: userId, name: displayName, circle: .blood)])
        }
    }

    @ViewBuilder
    private var traceLayer: some View {
        let shown = model.shown
        if let viewport, shown.count >= 2 {
            let points = shown.map { viewport.point(latitude: $0.latitude, longitude: $0.longitude) }
            MeeshyMapTrace(label: BloodLocationCopy.traceLabel(name: displayName), points: points, kind: .history,
                           tint: tint, progress: model.progress,
                           stops: model.stops.map { index in
                               MeeshyMapTraceStop(id: "\(index)", pointIndex: index,
                                                  value: shown[index].recordedAt.formatted(date: .omitted, time: .shortened),
                                                  title: BloodLocationCopy.stop)
                           },
                           isAnimated: !reduceMotion)
                .frame(width: CGFloat(viewport.width), height: CGFloat(viewport.height))
                .ignoresSafeArea()
        }
    }

    private var chrome: some View {
        VStack(spacing: MeeshySpacing.md) {
            HStack {
                MeeshyGlassButton(systemImage: "chevron.backward", label: LocationMapCopy.back, size: .s44, action: { dismiss() })
                Spacer()
                MeeshyBadge(.label(BloodLocationCopy.title(name: displayName)), leading: .systemImage("drop.fill"),
                            surface: .glass, tint: tint, size: .s36)
                Spacer()
                MeeshyGlassButton(systemImage: "theatermasks", label: BloodLocationCopy.ghostTitle,
                                  value: model.isGhost ? BloodLocationCopy.on : BloodLocationCopy.off,
                                  kind: model.isGhost ? .active : nil, size: .s44,
                                  action: { Task { await model.setGhost(!model.isGhost) } })
            }
            proximity
            LocationTravelPill(me: me, places: places)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.top, MeeshySpacing.sm)
    }

    /// En pause par son fantôme (#19562) : l'épingle K36 `ghost`, pointillée, au milieu de la carte — aucune position
    /// n'est servie, elle n'est posée nulle part.
    @ViewBuilder
    private var ghostPin: some View {
        if let ghost = people.ghost(for: userId) {
            LocationMapGhostPin(ghost: ghost)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .allowsHitTesting(false)
        }
    }

    @ViewBuilder
    private var proximity: some View {
        if people.ghost(for: userId) != nil {
            MeeshyNote(LocationMapCopy.ghostPaused, lead: .systemImage("theatermasks"))
        } else if let pin = people.pin(for: userId), let me {
            let meters = LocationMapRules.distanceMeters(fromLatitude: me.latitude, fromLongitude: me.longitude,
                                                         toLatitude: pin.latitude, toLongitude: pin.longitude)
            MeeshyNote(BloodLocationCopy.isNear(name: displayName, distance: LocationMapCopy.distance(meters, locale: locale)),
                       form: .live, kind: .ok, lead: .pulse)
        }
    }

    private func refocus() {
        let spots: [LocationMapSpot] = model.shown.map { (latitude: $0.latitude, longitude: $0.longitude, radiusMeters: 0.0) }
        guard let region = LocationMapRegion.fitting(spots, margin: 1.6) else { return }
        focus = LocationMapFocus(region: region, token: (focus?.token ?? 0) + 1)
    }

    /// La lecture parcourt la fenêtre en huit secondes, puis s'arrête au bout.
    private func play() async {
        guard isPlaying else { return }
        if model.progress >= 1 { model.progress = 0 }
        while isPlaying, model.progress < 1 {
            do { try await Task.sleep(for: .milliseconds(100)) } catch { return }
            model.progress = min(1, model.progress + 0.0125)
        }
        isPlaying = false
    }
}
