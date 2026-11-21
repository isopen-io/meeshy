import Combine
import SwiftUI
import MeeshySDK
import MeeshyUI

/// « En direct · Entre Proches » sur la Vitrine d'une personne (#19416, planches `Autre-Vitrine`, `Etat-HorsLigne`) :
/// l'app lit ce que le serveur sert — le cercle commun (le même modèle que « Notre cercle »), la position partagée,
/// l'épisode de batterie et l'injoignabilité, tous cache d'abord — et le SDK dessine `ProfileLiveBoardView`.
///
/// Sous Proche, `ProfileLiveBoard.resolve` ne rend rien : ni titre, ni tuile. L'heure qui passe se relit toutes les
/// trente secondes, sans réseau.
struct ProfileLiveSource: View {
    let request: ProfileLiveRequest

    @StateObject private var circle: ProfileCircleViewModel
    @StateObject private var locations = SharedLocationsMapViewModel()
    @StateObject private var places = LocationPlaceNamer()
    @State private var battery: BatteryReaderState?
    @State private var unreachable: PhoneReachabilityState?

    init(request: ProfileLiveRequest) {
        self.request = request
        _circle = StateObject(wrappedValue: ProfileCircleModels.model(for: request.userId))
    }

    var body: some View {
        // Un `ZStack` et son ancre, jamais un `Group` vide : sans enfant, les tâches qui lisent ne démarreraient pas.
        ZStack {
            Color.clear.frame(height: 0).accessibilityHidden(true)
            TimelineView(.periodic(from: .now, by: 30)) { context in
                board(now: context.date)
            }
        }
        .task(id: request.userId) { await circle.load() }
        .task(id: request.userId) { await locations.appeared() }
        .task(id: request.userId) {
            battery = nil
            for await next in BatteryLiveState.stream(of: request.userId).values { battery = next }
        }
        .task(id: request.userId) {
            unreachable = nil
            for await next in PhoneReachabilityLiveState.stream(of: request.userId).values { unreachable = next }
        }
        .adaptiveOnChange(of: circle.offersBattery) { _, offered in if !offered { battery = nil } }
        .adaptiveOnChange(of: circle.offersPhoneReachability) { _, offered in if !offered { unreachable = nil } }
        .adaptiveOnChange(of: locations.pins, initial: true) { _, pins in
            Task { await places.resolve(pins.filter { $0.id == request.userId }) }
        }
    }

    /// Le bloc héros de carte (#20242) dès qu'une position m'est SERVIE, quel que soit le cercle (la passerelle a déjà
    /// jugé) : la dernière position connue et son heure. Le tableau « En direct » ne redit alors pas le lieu.
    @ViewBuilder
    private func board(now: Date) -> some View {
        let pin = locations.pin(for: request.userId)
        VStack(spacing: MeeshySpacing.lg) {
            if let pin {
                ProfileWhereHero(title: places.name(for: pin) ?? request.displayName,
                                 stamp: ProfileWhereStamp.of(pin.updatedAt, now: now), now: now,
                                 onTap: { request.openMap?() }) {
                    ProfileWhereMiniature(pin: pin, height: ProfileWhereHero<EmptyView>.height)
                }
            }
            liveBoard(now: now)
        }
    }

    /// Le lieu vit dans le bloc héros : le tableau ne porte que l'appareil et la présence.
    @ViewBuilder
    private func liveBoard(now: Date) -> some View {
        if let board = ProfileLiveBoard.resolve(
            level: circle.toolGateLevel,
            place: nil,
            battery: circle.offersBattery ? ProfileLiveSourceRules.battery(battery, now: now) : nil,
            unreachableSince: circle.offersPhoneReachability ? unreachable?.unreachableSince : nil,
            isOnline: request.isOnline,
            staleAge: request.staleAge,
            mood: request.mood
        ) {
            ProfileLiveBoardView(board: board, now: now, tint: request.tint, map: ProfileWhereMiniature?.none,
                                 onOpenMap: nil)
        }
    }
}

/// Ce que la source remet au SDK, en valeurs : la batterie hors épisode retirée.
enum ProfileLiveSourceRules {
    /// Un relevé n'existe qu'en épisode et jamais au-delà de son TTL : sinon, pas de tuile.
    static func battery(_ state: BatteryReaderState?, now: Date) -> ProfileLiveBoard.Battery? {
        guard let state, !state.isExpired(at: now) else { return nil }
        return ProfileLiveBoard.Battery(level: state.level, isCharging: state.charging)
    }
}
