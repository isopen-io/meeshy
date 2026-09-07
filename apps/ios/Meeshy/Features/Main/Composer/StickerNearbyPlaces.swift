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
        modifier(StickerNearbyPlacesInjection())
    }
}

/// **L'autorisation s'OBSERVE ; la lire une fois n'est pas la vérifier**
/// (#5407, retour porteur 2026-09-06 : « bien que la localisation soit activée,
/// ça indique d'activer la localisation »).
///
/// ## Le défaut
///
/// `stickerNearbyPlacesProvided()` lisait `CLLocationManager().authorizationStatus`
/// à la volée, dans une expression de `body`. La valeur est juste À CET INSTANT
/// — et rien ne la relit ensuite : SwiftUI ne réévalue un `body` que si un état
/// OBSERVÉ change, et un statut système n'en est pas un.
///
/// Un auteur qui refuse la position, puis l'accorde dans Réglages, revient donc
/// sur une palette qui sert encore `nil` : la section « Lieu » affiche « Active
/// la position » **pour toute la durée de la session**, sur une position
/// parfaitement active. Le message n'est pas faux par erreur de rédaction : il
/// rend fidèlement un fournisseur absent, et c'est le fournisseur qui est
/// périmé.
///
/// > **Une garde de permission qui ne s'abonne à rien fige la permission au
/// > premier rendu.** L'API qui DIT le changement existe et n'était pas
/// > branchée : `locationManagerDidChangeAuthorization(_:)`. La question à
/// > poser à toute lecture d'autorisation n'est pas « lit-elle la bonne
/// > propriété ? » mais **« que se passe-t-il quand la réponse change ? »**.
///
/// L'observateur est PARTAGÉ : un `CLLocationManager` par site de montage
/// paierait un objet système à chaque rendu de chaque porte du composer, pour
/// une réponse qui est la même partout.
private struct StickerNearbyPlacesInjection: ViewModifier {
    @ObservedObject private var autorisation = LocationAuthorizationObserver.shared

    func body(content: Content) -> some View {
        content.environment(
            \.stickerNearbyPlaces,
             autorisation.servesNearbyPlaces
             ? StickerNearbyPlacesProvider(
                 nearby: { centre in await StickerNearbyPlaces.nearby(around: centre) }
             )
             : nil
        )
    }
}

/// L'autorisation de localisation de l'app, SUIVIE — un seul manager pour tout
/// le processus, et une publication à chaque changement. Voir
/// `StickerNearbyPlacesInjection` pour ce que son absence coûtait.
@MainActor
final class LocationAuthorizationObserver: NSObject, ObservableObject {

    static let shared = LocationAuthorizationObserver()

    @Published private(set) var status: CLAuthorizationStatus

    private let manager = CLLocationManager()

    /// **L'onglet « Lieu » est servi partout SAUF sur un refus** (loi 4 : un
    /// outil qu'on ne peut pas servir est absent, jamais grisé).
    /// `.notDetermined` l'ouvre — c'est en y arrivant que l'auteur accorde la
    /// permission, et la retirer d'avance la rendrait impossible à accorder.
    var servesNearbyPlaces: Bool { Self.serves(status) }

    /// La règle PURE, à part de l'observateur : elle s'éprouve sans
    /// `CLLocationManager`, donc sans dépendre de l'état de la machine qui
    /// exécute le test — un statut système n'est pas injectable.
    nonisolated static func serves(_ status: CLAuthorizationStatus) -> Bool {
        switch status {
        case .denied, .restricted: return false
        case .notDetermined, .authorizedAlways, .authorizedWhenInUse: return true
        @unknown default: return true
        }
    }

    /// Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, une deinit synthétisée
    /// est ISOLÉE et double-libère sur iOS 26.1 (SE-0466). Corps vide ⇒ la
    /// libération redevient non isolée. Même raison que `OneShotFix`.
    nonisolated deinit {}

    private override init() {
        status = manager.authorizationStatus
        super.init()
        manager.delegate = self
    }
}

extension LocationAuthorizationObserver: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let nouveau = manager.authorizationStatus
        Task { @MainActor [weak self] in self?.status = nouveau }
    }
}
