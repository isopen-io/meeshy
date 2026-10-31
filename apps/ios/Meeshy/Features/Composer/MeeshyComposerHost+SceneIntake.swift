import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

// **Ajouter un élément montre son chargement et retient le reste** (#13864,
// règle R5). La règle vit dans `ComposerSceneIntake` ; ce fichier la branche :
// l'ouverture d'un ajout par chaque porte, sa progression, sa fin dans la même
// image que la pose, l'annulation, l'échec et « Réessayer ».
@MainActor
extension MeeshyComposerHost {

    /// Faux tant qu'un ajout retient l'écran : un second ajout est impossible.
    var sceneIntakeAllowsAnother: Bool {
        ComposerSceneIntake.canStart(over: sceneIntake)
    }

    var sceneIntakeBlocks: Bool {
        sceneIntake?.blocksComposer ?? false
    }

    /// Ouvre un ajout, ou rend `nil` quand un autre retient déjà l'écran.
    func beginSceneIntake(_ kind: ComposerSceneIntake.Kind, total: Int, foundsScene: Bool,
                          retry: @escaping @MainActor () -> Void) -> UUID? {
        guard sceneIntakeAllowsAnother else { return nil }
        let ajout = ComposerSceneIntake.starting(kind: kind, total: total,
                                                 isOffline: NetworkMonitor.shared.isOffline,
                                                 foundsScene: foundsScene)
        sceneIntake = ajout
        sceneIntakeRetry = retry
        return ajout.id
    }

    /// Faux après ✕, un échec ou un ajout plus récent : son résultat ne se pose pas.
    func sceneIntakeIsCurrent(_ id: UUID) -> Bool {
        guard let sceneIntake, sceneIntake.id == id else { return false }
        return sceneIntake.isPreparing
    }

    func advanceSceneIntake(_ id: UUID, done: Int) {
        guard sceneIntakeIsCurrent(id) else { return }
        sceneIntake = sceneIntake?.advanced(done: done)
    }

    /// La fin libère tout dans la MÊME image que la pose : l'appelant pose juste
    /// après, sur le même tour du fil principal.
    func finishSceneIntake(_ id: UUID) {
        guard sceneIntake?.id == id else { return }
        sceneIntake = nil
        sceneIntakeTask = nil
        sceneIntakeRetry = nil
    }

    func failSceneIntake(_ id: UUID) {
        guard sceneIntakeIsCurrent(id) else { return }
        sceneIntake = sceneIntake?.failing()
        sceneIntakeTask = nil
    }

    func cancelSceneIntake() {
        sceneIntakeTask?.cancel()
        sceneIntakeTask = nil
        sceneIntake = nil
        sceneIntakeRetry = nil
        abandonRailPosing()
    }

    func retrySceneIntake() {
        let reprise = sceneIntakeRetry
        sceneIntake = nil
        sceneIntakeRetry = nil
        reprise?()
    }

    func dismissSceneIntakeFailure() {
        sceneIntake = nil
        sceneIntakeRetry = nil
    }

    /// L'espace réservé que la scène pose sur sa carte, `nil` quand rien n'entre.
    var sceneIntakeGhost: AnyView? {
        guard let sceneIntake else { return nil }
        return AnyView(ComposerSceneIntakeGhost(intake: sceneIntake,
                                                onCancel: { cancelSceneIntake() },
                                                onRetry: { retrySceneIntake() },
                                                onDismissFailure: { dismissSceneIntakeFailure() }))
    }

    // MARK: - Les portes qui ouvrent un ajout

    /// La photothèque : sa tâche est gardée pour que ✕ l'arrête.
    func startPhotoLibraryIntake(_ items: [PhotosPickerItem]) {
        guard sceneIntakeAllowsAnother else { return }
        sceneIntakeTask = Task { await ingestPhotoLibraryItems(items) }
    }

    func startFileImportIntake(_ result: Result<[URL], Error>) {
        sceneIntakeTask = Task { await ingestFileImporterResult(result) }
    }

    /// Un média qui fonde la scène la couvre de son espace réservé : une série,
    /// le choix d'ouverture, ou une composition encore vierge.
    func intakeFoundsScene(count: Int) -> Bool {
        ComposerScenePicking.foundsScenes(count: count, openingPick: openingPickFoundsScenes) || compositionIsEmpty
    }
}
