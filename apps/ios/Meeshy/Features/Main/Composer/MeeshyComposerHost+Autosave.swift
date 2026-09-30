import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// **La sauvegarde automatique, branchée sur le meuble** (#8848). Le contrat
// (quand écrire, quoi reprendre, qui possède le brouillon) vit dans
// `ComposerAutosaveController` ; ce fichier ne fait que lui donner l'état du
// meuble et le lui rendre.

/// Les réglages scalaires du meuble dont un changement doit être sauvegardé.
/// Les médias et la scène se signalent par leurs propres `objectWillChange`.
nonisolated struct ComposerAutosaveSignature: Equatable {
    let text: String
    let background: String?
    let visibility: PostVisibility
    let visibilityUserIds: [String]
    let language: String
    let location: SharedPlace?
    let references: [ComposerReference]
    let format: ComposerFormat
}

extension MeeshyComposerHost {

    var autosaveOpening: ComposerAutosaveOpening {
        ComposerAutosaveOpening.decide(
            opensOnAtelier: mountedSurface == .scene,
            isHydrated: hydration != nil,
            resumesDraft: draftId != nil,
            isSeeded: mediaSeed != nil || moodSeed != nil,
            opensOnMood: selectedFormat == .status
        )
    }

    var autosaveSignature: ComposerAutosaveSignature {
        ComposerAutosaveSignature(text: documentText,
                                  background: documentBackground,
                                  visibility: composerVisibility,
                                  visibilityUserIds: composerVisibilityUserIds,
                                  language: documentLanguage,
                                  location: documentLocation,
                                  references: composerReferences,
                                  format: selectedFormat)
    }

    /// L'état à écrire — `nil` hors du meuble : l'atelier tient son propre
    /// brouillon, et une humeur n'est ni une story, ni un post, ni un réel.
    func autosaveState() -> ComposerAutosaveState? {
        guard mountedSurface == .document, selectedFormat != .status else { return nil }
        return ComposerAutosaveState(
            format: selectedFormat,
            text: documentText,
            background: documentBackground,
            visibility: composerVisibility.rawValue,
            visibilityUserIds: composerVisibilityUserIds,
            language: documentLanguage,
            location: documentLocation,
            references: composerReferences,
            editingPostId: viewModel.editingPostId,
            slides: viewModel.slides,
            currentSlideIndex: viewModel.currentSlideIndex,
            porters: mediaPorterStore.porters,
            images: viewModel.loadedImages,
            slideImages: viewModel.slideImages,
            videos: viewModel.loadedVideoURLs,
            audios: viewModel.loadedAudioURLs,
            stickerAnimations: viewModel.loadedStickerAnimations,
            adoptedLocalMedia: viewModel.adoptedLocalMedia
        )
    }

    /// Le compte ET l'environnement courants : un brouillon n'est jamais relu
    /// sous un autre couple que celui qui l'a écrit.
    var autosaveAccount: ComposerAutosaveAccount? {
        ComposerAutosaveAccount(userId: AuthManager.shared.currentUser?.id,
                                serverOrigin: MeeshyConfig.shared.persistedServerOrigin)
    }

    func bindAutosave() {
        guard let restored = autosave.bind(account: autosaveAccount, opening: autosaveOpening) else { return }
        guard let state = ComposerAutosaveCodec.state(from: restored) else {
            autosave.abandonRestoredDraft()
            return
        }
        applyAutosaved(state)
    }

    /// Les porteurs d'abord, la scène ensuite : `syncPostMediaIntoSlides`
    /// relit `mediaRoleByURL` au changement de `documentLocalMedia`, et un
    /// média qu'il n'y trouverait pas serait posé une seconde fois.
    func applyAutosaved(_ state: ComposerAutosaveState) {
        mediaPorterStore.porters = state.porters
        viewModel.restoreAutosavedComposition(slides: state.slides,
                                              currentSlideIndex: state.currentSlideIndex,
                                              slideImages: state.slideImages,
                                              images: state.images,
                                              videoURLs: state.videos,
                                              audioURLs: state.audios,
                                              stickerAnimations: state.stickerAnimations)
        documentText = state.text
        documentBackground = state.background
        composerVisibility = PostVisibility(rawValue: state.visibility) ?? composerVisibility
        composerVisibilityUserIds = state.visibilityUserIds
        documentLanguage = state.language
        documentLocation = state.location
        composerReferences = state.references
        // Le FORMAT n'est pas rendu : il se choisit à l'envoi (#6502), et le
        // format d'ouverture n'a aucun écrivain — la surface ne bouge pas sous
        // les doigts de l'auteur. La scène, elle, revient entière.
    }

    func scheduleAutosave() {
        autosave.schedule { autosaveState() }
    }

    func flushAutosave() {
        autosave.flushNow { autosaveState() }
    }

    /// Appelé par les deux sites où la publication est ACCEPTÉE (socle).
    func discardAutosavedDraft() {
        autosave.discard()
    }

    func withComposerAutosave<Content: View>(_ content: Content) -> some View {
        content
            .onAppear { bindAutosave() }
            .onReceive(viewModel.objectWillChange) { _ in scheduleAutosave() }
            .onReceive(mediaPorterStore.objectWillChange) { _ in scheduleAutosave() }
            .adaptiveOnChange(of: autosaveSignature) { _, _ in scheduleAutosave() }
            // Tuer l'app passe par l'arrière-plan : c'est la dernière fenêtre
            // où l'écriture n'attend pas l'accalmie.
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didEnterBackgroundNotification)) { _ in
                flushAutosave()
                autosave.waitForPendingWrites()
            }
            .onDisappear { flushAutosave() }
    }
}
