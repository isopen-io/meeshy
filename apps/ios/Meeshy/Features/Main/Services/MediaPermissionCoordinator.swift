import Foundation
import UIKit
import MeeshySDK

// MARK: - MediaPermissionKind

/// Les accès matériel/contenu que l'app demande. Sert à choisir le libellé de
/// refus : un message générique (« accès refusé ») n'apprend pas à l'utilisateur
/// quelle ligne activer dans les Réglages.
/// La localisation n'y figure pas : `CLLocationManager` demande sa permission
/// via un delegate rattaché à l'instance qui fera ensuite le relevé, donc
/// `LocationPickerModel` reste propriétaire de ce cycle. Il partage en revanche
/// `openSettings()` et `locationDeniedMessage`.
enum MediaPermissionKind: String, CaseIterable, Sendable {
    case microphone
    case camera
    case photoLibraryRead
    case photoLibraryAdd

    var currentState: MediaPermissionState {
        switch self {
        case .microphone: return .microphone
        case .camera: return .camera
        case .photoLibraryRead: return .photoLibraryRead
        case .photoLibraryAdd: return .photoLibraryAdd
        }
    }

    nonisolated func request() async -> MediaPermissionState {
        switch self {
        case .microphone: return await DevicePermissions.requestMicrophone()
        case .camera: return await DevicePermissions.requestCamera()
        case .photoLibraryRead: return await DevicePermissions.requestPhotoLibraryRead()
        case .photoLibraryAdd: return await DevicePermissions.requestPhotoLibraryAdd()
        }
    }
}

// MARK: - MediaPermissionCoordinator

/// Porte unique par laquelle passe toute demande d'accès caméra / micro /
/// photothèque / localisation.
///
/// Elle existe parce que les call sites divergeaient : certains ne demandaient
/// rien (l'API système promptait alors en plein milieu de l'opération et
/// l'utilisateur obtenait un enregistrement muet), d'autres faisaient un
/// `guard … else { return }` muet sur le refus (écran caméra noir, strip photos
/// vide, sans la moindre explication). Le coordinateur garantit les trois
/// règles : demander AVANT d'agir, ne prompter qu'une fois, et rendre tout refus
/// définitif actionnable via les Réglages.
///
/// C'est de l'orchestration UX produit (décide *quand* demander, parle au
/// `FeedbackToastManager` nommé Meeshy) → app-side, cf. la règle SDK Purity.
/// Les primitives TCC pures vivent dans `MeeshySDK.DevicePermissions`.
@MainActor
enum MediaPermissionCoordinator {

    // MARK: - API

    /// Garantit l'accès micro avant d'activer une session d'enregistrement ou
    /// de démarrer un appel.
    @discardableResult
    static func ensureMicrophone(announcesRefusal: Bool = true) async -> Bool {
        await ensure(.microphone, announcesRefusal: announcesRefusal)
    }

    /// Garantit l'accès caméra avant d'ouvrir une session de capture ou de
    /// publier une piste vidéo d'appel.
    @discardableResult
    static func ensureCamera(announcesRefusal: Bool = true) async -> Bool {
        await ensure(.camera, announcesRefusal: announcesRefusal)
    }

    /// Accès en lecture à la photothèque (parcours in-app des médias récents).
    /// Inutile pour `PhotosPicker`/`PHPickerViewController`, qui tournent
    /// hors-process et ne consomment aucune permission.
    @discardableResult
    static func ensurePhotoLibraryRead(announcesRefusal: Bool = true) async -> Bool {
        await ensure(.photoLibraryRead, announcesRefusal: announcesRefusal)
    }

    /// Accès en écriture seule — enregistrer une capture ou une pièce jointe.
    @discardableResult
    static func ensurePhotoLibraryAdd(announcesRefusal: Bool = true) async -> Bool {
        await ensure(.photoLibraryAdd, announcesRefusal: announcesRefusal)
    }

    private static func ensure(_ kind: MediaPermissionKind, announcesRefusal: Bool) async -> Bool {
        await resolve(
            kind: kind,
            state: kind.currentState,
            requesting: { await kind.request() },
            toasts: FeedbackToastManager.shared,
            announcesRefusal: announcesRefusal
        )
    }

    // MARK: - Decision (testable seam)

    /// Cœur de décision, isolé de TCC pour être testable : reçoit l'état courant
    /// et la fermeture de demande.
    ///
    /// - `isUsable` → on procède immédiatement (chemin nominal : aucun aller-retour).
    /// - `canPrompt` → on demande une fois, puis on ré-évalue.
    /// - refus définitif → on ne re-prompte jamais (le système n'afficherait
    ///   plus rien) et on renvoie vers les Réglages.
    ///
    /// `announcesRefusal: false` pour les appelants qui gèrent eux-mêmes la
    /// dégradation (appel vidéo qui retombe en audio, sauvegarde photothèque
    /// facultative) : deux messages pour un seul geste utilisateur, c'est du
    /// bruit.
    @discardableResult
    static func resolve(
        kind: MediaPermissionKind,
        state: MediaPermissionState,
        requesting: () async -> MediaPermissionState,
        toasts: FeedbackToastSurfacing,
        announcesRefusal: Bool = true
    ) async -> Bool {
        if state.isUsable { return true }

        let resolved = state.canPrompt ? await requesting() : state
        if resolved.isUsable { return true }

        if announcesRefusal {
            toasts.showError(deniedMessage(for: kind)) { openSettings() }
        }
        return false
    }

    // MARK: - Messaging

    static func deniedMessage(for kind: MediaPermissionKind) -> String {
        switch kind {
        case .microphone:
            return String(localized: "permission.microphone.denied",
                          defaultValue: "Micro refusé — toucher pour ouvrir les Réglages",
                          bundle: .main)
        case .camera:
            return String(localized: "permission.camera.denied",
                          defaultValue: "Caméra refusée — toucher pour ouvrir les Réglages",
                          bundle: .main)
        case .photoLibraryRead:
            return String(localized: "permission.photoLibrary.read.denied",
                          defaultValue: "Accès aux photos refusé — toucher pour ouvrir les Réglages",
                          bundle: .main)
        case .photoLibraryAdd:
            return String(localized: "permission.photoLibrary.add.denied",
                          defaultValue: "Enregistrement dans Photos refusé — toucher pour ouvrir les Réglages",
                          bundle: .main)
        }
    }

    /// Rendu par `LocationPickerView` dans un bandeau (pas un toast) : le picker
    /// reste utilisable en sélection manuelle sur la carte.
    static var locationDeniedMessage: String {
        String(localized: "permission.location.denied",
               defaultValue: "Localisation refusée — autorisez-la dans les Réglages",
               bundle: .main)
    }

    /// Ouvre la fiche Réglages de l'app. Même geste que les quatre redirections
    /// déjà présentes dans `CallManager`, désormais centralisé ici.
    static func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }
}
