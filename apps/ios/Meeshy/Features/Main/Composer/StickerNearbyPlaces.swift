import CoreLocation
import MapKit
import SwiftUI
import MeeshySDK
import MeeshyUI
import os

/// **Les lieux ALENTOUR pour la palette de stickers** (#4579).
///
/// Vit côté APP, pas au SDK : une permission de localisation, un
/// `CLLocationManager` et une politique de rafraîchissement sont trois
/// décisions produit — le SDK ne fait que peindre ce qu'on lui rend. Même
/// doctrine que `StickerLibraryPaste` pour « Mes stickers ».
@MainActor
enum StickerNearbyPlaces {

    private static let log = Logger(subsystem: "me.meeshy.app", category: "sticker-nearby")

    /// Combien de lieux la palette propose. Cinq : au-delà, la rangée de
    /// capsules devient une liste à parcourir, et le chemin nominal (« le plus
    /// proche est déjà choisi ») perd son sens.
    static let maxPlaces = 5

    /// Le rayon de recherche. 400 m — la distance à laquelle « je suis ici »
    /// reste vrai : au-delà on propose un lieu où l'auteur n'est pas.
    static let radiusMeters: CLLocationDistance = 400

    /// Les lieux proches, du plus proche au plus lointain.
    ///
    /// Rend `[]` — jamais une erreur — quand la position est indisponible :
    /// l'onglet montre alors son état VIDE, qui dit « on a cherché, on n'a rien
    /// trouvé ». Ce n'est pas la même chose qu'une capacité absente, et c'est
    /// pourquoi l'absence, elle, se décide en amont (`stickerNearbyPlacesProvided`).
    /// - Parameter centre: le lieu AUTOUR duquel chercher (2026-09-05).
    ///   `nil` ⇒ la position de l'appareil.
    ///
    ///   Un centre CHOISI court-circuite `currentCoordinate()` — donc la
    ///   permission ET l'attente du premier point GPS. C'est ce qui rend la
    ///   section utile à l'intérieur d'un bâtiment, en avion, ou quand
    ///   l'auteur compose une story sur un lieu où il n'est pas.
    static func nearby(around centre: SharedPlace? = nil) async -> [SharedPlace] {
        let choisi = centre.map {
            CLLocationCoordinate2D(latitude: $0.latitude, longitude: $0.longitude)
        }
        // `??` est un AUTOCLOSURE : il n'accepte pas d'`await` à droite. La
        // forme explicite dit d'ailleurs mieux ce qui se passe — un centre
        // choisi n'interroge JAMAIS le GPS, donc ni permission ni attente.
        let position: CLLocationCoordinate2D
        if let choisi {
            position = choisi
        } else if let courante = await currentCoordinate() {
            position = courante
        } else {
            log.info("nearby: aucune position, onglet vide")
            return []
        }
        let requête = MKLocalPointsOfInterestRequest(center: position, radius: radiusMeters)
        do {
            let réponse = try await MKLocalSearch(request: requête).start()
            let origine = CLLocation(latitude: position.latitude, longitude: position.longitude)
            return réponse.mapItems
                .compactMap { place(from: $0) }
                .sorted { distance($0, from: origine) < distance($1, from: origine) }
                .prefix(maxPlaces)
                .map { $0 }
        } catch {
            log.error("nearby: recherche échouée \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    private static func distance(_ lieu: SharedPlace, from origine: CLLocation) -> CLLocationDistance {
        CLLocation(latitude: lieu.latitude, longitude: lieu.longitude).distance(from: origine)
    }

    /// Un `MKMapItem` sans coordonnée n'est pas un lieu — le laisser passer
    /// poserait une pastille au large de l'Afrique (0, 0).
    private static func place(from item: MKMapItem) -> SharedPlace? {
        let repère = item.placemark
        guard CLLocationCoordinate2DIsValid(repère.coordinate) else { return nil }
        let nom = item.name ?? repère.name
        let adresse = [repère.thoroughfare, repère.locality]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ")
        return SharedPlace(latitude: repère.coordinate.latitude,
                           longitude: repère.coordinate.longitude,
                           name: nom,
                           address: adresse.isEmpty ? nil : adresse,
                           category: item.pointOfInterestCategory?.rawValue)
    }

    // MARK: - La position

    /// Une position, ou `nil`. Demande l'autorisation si elle n'a jamais été
    /// posée — c'est le seul moment où la demander a du sens : l'auteur vient
    /// de taper l'onglet « Lieu ».
    private static func currentCoordinate() async -> CLLocationCoordinate2D? {
        await withCheckedContinuation { suite in
            let délégué = OneShotFix { position in suite.resume(returning: position) }
            délégué.start()
        }
    }

    /// **Un relevé UNIQUE, qui se retient lui-même.**
    ///
    /// `CLLocationManager` ne retient pas son délégué : sans la référence
    /// circulaire posée ici (`self.moi = self`), l'objet serait libéré avant le
    /// premier callback et la continuation ne reprendrait JAMAIS — la palette
    /// resterait figée sur son onglet. Elle est rompue dès que la réponse part.
    private final class OneShotFix: NSObject, CLLocationManagerDelegate {
        private let manager = CLLocationManager()
        private var suite: ((CLLocationCoordinate2D?) -> Void)?
        private var moi: OneShotFix?

        /// Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, une deinit
        /// synthétisée est ISOLÉE et double-libère sur iOS 26.1 (SE-0466,
        /// `MainActorDeinitSourceGuardTests`). Un corps vide n'a rien à
        /// toucher : la libération redevient non isolée.
        nonisolated deinit {}

        init(_ suite: @escaping (CLLocationCoordinate2D?) -> Void) {
            self.suite = suite
            super.init()
            manager.delegate = self
            manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        }

        func start() {
            moi = self
            switch manager.authorizationStatus {
            case .notDetermined:
                manager.requestWhenInUseAuthorization()
            case .denied, .restricted:
                terminer(nil)
            default:
                manager.requestLocation()
            }
        }

        private func terminer(_ position: CLLocationCoordinate2D?) {
            guard let suite else { return }
            self.suite = nil
            suite(position)
            moi = nil
        }

        func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
            switch manager.authorizationStatus {
            case .notDetermined: break
            case .denied, .restricted: terminer(nil)
            default: manager.requestLocation()
            }
        }

        func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
            terminer(locations.last?.coordinate)
        }

        func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
            terminer(nil)
        }
    }
}

// MARK: - Injection dans la palette (SDK)

extension View {
    /// Fournit à `StickerPickerView` les lieux alentour.
    ///
    /// **L'onglet « Lieu » n'est PAS servi quand l'autorisation est refusée**
    /// (loi 4 : un outil qu'on ne peut pas servir est absent, jamais grisé).
    /// `.notDetermined` en revanche l'ouvre : c'est en tapant l'onglet que
    /// l'auteur accorde la permission, et la retirer d'avance la rendrait
    /// impossible à accorder.
    func stickerNearbyPlacesProvided() -> some View {
        let statut = CLLocationManager().authorizationStatus
        let servable = statut != .denied && statut != .restricted
        return environment(\.stickerNearbyPlaces,
                           servable ? StickerNearbyPlacesProvider(
                               nearby: { centre in await StickerNearbyPlaces.nearby(around: centre) }
                           ) : nil)
    }
}
