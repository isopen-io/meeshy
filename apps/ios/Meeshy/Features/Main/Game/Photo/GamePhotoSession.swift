import Foundation
import Combine
import UIKit
import MeeshySDK

/// Ce que le déroulé dit après un geste — un ton et une phrase, jamais un code.
struct PhotoNotice: Equatable {
    enum Tone: Equatable {
        case good
        case error
    }

    let tone: Tone
    let text: String
}

/// LE DÉROULÉ D'UNE PHOTO (#9382) — conception, partie VI :
///
///  1. Après la célébration, Mee propose : « On immortalise ? » — Selfie avec
///     nous, Carte seule, Plus tard.
///  2. Selfie : caméra avant, cadre du moment en surimpression.
///  3. Au déclenchement, Mee et Meo frappent l'emblème en place : « tchak », la
///     photo se fige.
///  4. Image 9:16 pour la story et 1:1 pour le profil : enregistrer dans Photos,
///     partager, ou garder au carnet.
///  5. « Plus tard » laisse le moment en attente 7 jours dans le carnet.
///
/// L'étape vit dans `GamePhotoFlow` (réducteur pur) ; cette classe y branche les
/// effets : la caméra, la composition, le carnet, la photothèque, le haptique.
/// Chacun est INJECTÉ (`.shared` / réel par défaut) pour que le déroulé se teste
/// sans objectif ni disque. Aucune image n'est envoyée au serveur.
@MainActor
final class GamePhotoSession: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var state: PhotoFlowState = .offer
    /// L'image figée pendant la frappe en place (selfie ou galerie) ; `nil` pour la carte seule.
    @Published private(set) var frozen: UIImage?
    /// L'emblème se pose : 0 → 1 pendant la frappe en place.
    @Published private(set) var strike: Double = 0
    @Published private(set) var composed: ComposedPhoto?
    @Published private(set) var notice: PhotoNotice?
    /// Le moment a été reporté (« plus tard ») : l'hôte referme la proposition.
    private(set) var wasDeferred = false

    let moment: PhotoMoment
    let camera: GamePhotoCameraProviding

    private let composer: GamePhotoComposing
    private let notebook: GamePhotoNotebooking
    private let library: PhotoLibrarySaving
    private let haptics: GameHapticsProviding
    private let now: () -> Date
    private let strikeDuration: UInt64

    init(
        moment: PhotoMoment,
        camera: GamePhotoCameraProviding = GamePhotoCamera(),
        composer: GamePhotoComposing = GamePhotoComposer(),
        notebook: GamePhotoNotebooking,
        library: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
        haptics: GameHapticsProviding = GameHaptics.shared,
        now: @escaping () -> Date = { Date() },
        strikeDuration: UInt64 = 1_200_000_000
    ) {
        self.moment = moment
        self.camera = camera
        self.composer = composer
        self.notebook = notebook
        self.library = library
        self.haptics = haptics
        self.now = now
        self.strikeDuration = strikeDuration
    }

    private func send(_ event: PhotoFlowEvent) {
        state = GamePhotoFlow.reduce(state, event)
    }

    // MARK: - Étape 1 : la proposition

    func chooseSelfie() async {
        send(.selfie)
        guard case .camera(.opening) = state else { return }
        if let failure = await camera.start() {
            send(.cameraFailed(failure))
        } else {
            send(.cameraReady)
        }
    }

    func chooseCard() async {
        camera.stop()
        send(.card)
        await strikeInPlace(source: nil, mode: .card)
    }

    func later() async {
        _ = await notebook.postpone(moment)
        wasDeferred = true
        camera.stop()
        send(.later)
    }

    func close() {
        camera.stop()
        send(.close)
    }

    // MARK: - Étape 2 et 3 : la prise et la frappe en place

    func shutter() async {
        guard case .camera(.live) = state else { return }
        guard let shot = await camera.capture() else {
            send(.cameraFailed(.unavailable))
            return
        }
        camera.stop()
        send(.shutter)
        await strikeInPlace(source: shot, mode: .selfie)
    }

    func useGalleryPhoto(_ data: Data) async {
        guard let image = UIImage(data: data) else { return }
        camera.stop()
        send(.gallery)
        await strikeInPlace(source: image, mode: .gallery)
    }

    private func strikeInPlace(source: UIImage?, mode: PhotoMode) async {
        guard case .striking = state else { return }
        frozen = source
        strike = 0
        haptics.play(GameHapticPattern.strike)
        strike = 1
        if strikeDuration > 0 {
            try? await Task.sleep(nanoseconds: strikeDuration)
        }
        guard let result = composer.compose(moment: moment, source: source, mode: mode, date: now()) else {
            send(.composeFailed)
            return
        }
        composed = result
        send(.composed)
    }

    // MARK: - Étape 4 : le résultat

    func keep() async {
        guard case .result = state, let composed else { return }
        let ok = await notebook.keep(moment, photo: composed.kept)
        send(.kept(ok))
        notice = ok
            ? PhotoNotice(tone: .good, text: String(localized: "game.photo.notice.kept", defaultValue: "Gardée au carnet de progression.", bundle: .main))
            : PhotoNotice(tone: .error, text: String(localized: "game.photo.notice.keep_failed", defaultValue: "Le carnet n’est pas disponible sur cet appareil : la photo n’a pas été gardée.", bundle: .main))
    }

    /// Enregistre dans Photos (autorisation en ajout seul) l'image du format choisi.
    func save(square: Bool) async {
        guard case .result = state, let composed else { return }
        do {
            try await library.saveImage(square ? composed.squareData : composed.storyData)
            notice = PhotoNotice(tone: .good, text: String(localized: "game.photo.notice.saved", defaultValue: "Image enregistrée dans Photos.", bundle: .main))
        } catch {
            notice = PhotoNotice(tone: .error, text: String(localized: "game.photo.notice.save_failed", defaultValue: "L’enregistrement n’a pas pu aboutir.", bundle: .main))
        }
    }

    func shared(completed: Bool) {
        guard completed else { return }
        notice = PhotoNotice(tone: .good, text: String(localized: "game.photo.notice.shared", defaultValue: "Image partagée.", bundle: .main))
    }
}
