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
        .adaptiveOnChange(of: locations.pins, initial: true) { _, pins in
            Task { await places.resolve(pins.filter { $0.id == request.userId }) }
        }
    }

    @ViewBuilder
    private func board(now: Date) -> some View {
        let pin = locations.pin(for: request.userId)
        if let board = ProfileLiveBoard.resolve(
            level: circle.toolGateLevel,
            place: pin.map { ProfileLiveSourceRules.place(of: $0, name: places.name(for: $0), fallback: request.displayName, now: now) },
            battery: ProfileLiveSourceRules.battery(battery, now: now),
            unreachableSince: unreachable?.unreachableSince,
            isOnline: request.isOnline,
            staleAge: request.staleAge,
            mood: request.mood
        ) {
            ProfileLiveBoardView(
                board: board, now: now, tint: request.tint,
                map: pin.map { ProfileWhereMiniature(pin: $0, height: CGFloat(MeeshyStatusTileRecipe.mediaMinHeight)) },
                onOpenMap: pin == nil ? nil : request.openMap
            )
        }
    }
}

/// Ce que la source remet au SDK, en valeurs : le lieu à la précision servie, et la batterie hors épisode retirée.
enum ProfileLiveSourceRules {
    static func place(of pin: SharedLocationPin, name: String?, fallback: String, now: Date) -> ProfileLiveBoard.Place {
        let detail = LocationMapCopy.whereDetail(pin.precision, window: SharedLocationWindow(deadline: pin.deadline, now: now))
        return ProfileLiveBoard.Place(name: name ?? fallback, detail: detail)
    }

    /// Un relevé n'existe qu'en épisode et jamais au-delà de son TTL : sinon, pas de tuile.
    static func battery(_ state: BatteryReaderState?, now: Date) -> ProfileLiveBoard.Battery? {
        guard let state, !state.isExpired(at: now) else { return nil }
        return ProfileLiveBoard.Battery(level: state.level, isCharging: state.charging)
    }
}
