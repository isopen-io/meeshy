import Foundation
import os
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - StorySaveProgressMapper

/// Découpage de l'anneau affiché sur la ligne « Mes stories ».
///
/// Le bake MP4 occupe 0…90 %, l'écriture dans la photothèque les 10 %
/// restants. Sans ce découpage, l'anneau atteindrait 100 % à la fin du
/// bake — soit avant que la vidéo n'existe dans Photos — et l'utilisateur
/// croirait à tort que l'enregistrement est terminé.
enum StorySaveProgressMapper {

    /// Part de l'anneau attribuée au bake.
    static let bakeShare: Double = 0.9

    /// Mappe une fraction de bake `0…1` (bornée) sur `0…bakeShare`.
    static func bake(_ fraction: Double) -> Double {
        min(max(fraction, 0), 1) * bakeShare
    }
}

// MARK: - StoryPhotoSaveService

/// Sauvegardes de stories vers la photothèque actuellement en vol.
///
/// Singleton et NON `@StateObject` d'une vue : `MyStoriesView` est une sheet,
/// et sa fermeture détruirait un état de vue — le `Task` du bake garde
/// `[weak self]`, donc le résultat tardif partirait à la poubelle en silence.
/// L'anneau doit survivre à la fermeture de la sheet et à la navigation, donc
/// l'état vit ici. Même patron que `StoryPublishService.shared`.
///
/// Orchestration app-side (SDK purity) : le SDK bake, ce service décide de
/// l'enchaînement bake → Photos → toast et de ce qui s'affiche.
@MainActor
final class StoryPhotoSaveService: ObservableObject {

    static let shared = StoryPhotoSaveService()

    /// `storyId → progression 0…1`. L'absence de clé signifie « aucune
    /// sauvegarde en vol pour cette story » : c'est ce que la ligne lit pour
    /// choisir entre le glyphe `⋯` et l'anneau.
    @Published private(set) var jobs: [String: Double] = [:]

    private var tasks: [String: Task<Void, Never>] = [:]

    private let exporter: StoryVideoExportServiceProviding
    private let photoSaver: PhotoLibrarySaving
    private let toasts: FeedbackToastSurfacing
    private let preferredLanguages: @MainActor () -> [String]
    private let intro: @MainActor () async -> StoryExportIntroContent?

    init(
        exporter: StoryVideoExportServiceProviding? = nil,
        photoSaver: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
        toasts: FeedbackToastSurfacing? = nil,
        preferredLanguages: (@MainActor () -> [String])? = nil,
        intro: (@MainActor () async -> StoryExportIntroContent?)? = nil
    ) {
        // `StoryVideoExportService.shared` et `FeedbackToastManager.shared`
        // sont `@MainActor`-isolés : impossible en expression de valeur par
        // défaut, résolus ici.
        self.exporter = exporter ?? StoryVideoExportService.shared
        self.photoSaver = photoSaver
        self.toasts = toasts ?? FeedbackToastManager.shared
        self.preferredLanguages = preferredLanguages
            ?? { AuthManager.shared.currentUser?.preferredContentLanguages ?? [] }
        self.intro = intro ?? StoryExportIntroFactory.currentUser
    }

    // MARK: - Lecture

    /// Progression `0…1` de la sauvegarde en vol, `nil` si aucune.
    func progress(for storyId: String) -> Double? { jobs[storyId] }

    // MARK: - Actions

    /// Bake la story en MP4 puis l'écrit dans la photothèque, en publiant la
    /// progression sur `jobs[story.id]`. Idempotent : un second appel pendant
    /// qu'un job tourne pour la même story est ignoré (le menu reste
    /// atteignable via le long-press pendant l'export).
    func save(story: StoryItem) {
        guard jobs[story.id] == nil else { return }

        let available = StoryExportLanguageResolver.availableLanguages(story: story)
        let language = StoryExportLanguageResolver.defaultLanguage(
            available: available,
            preferred: preferredLanguages()
        )
        let languages: [String] = language.map { [$0] } ?? []
        let slide = story.toRenderableSlide(preferredLanguages: languages)
        let watermark = MeeshyExportWatermark.make(username: AuthManager.shared.currentUser?.username)
        let storyId = story.id

        jobs[storyId] = 0

        let task = Task { [weak self] in
            guard let self else { return }
            // Résolu DANS le Task (async) : l'identité (avatar / fond / mood) se
            // charge depuis le cache. `intro` est la closure injectée à l'init,
            // pas le singleton — l'injection en test reste honorée.
            let introContent = await self.intro()
            let url = await self.exporter.prepareExport(
                slide: slide,
                languages: languages,
                watermark: watermark,
                intro: introContent,
                onProgress: { [weak self] fraction in
                    guard let self, self.jobs[storyId] != nil else { return }
                    self.jobs[storyId] = StorySaveProgressMapper.bake(fraction)
                },
                onPhaseChange: nil
            )

            // Annulation pendant le bake : `AVAssetWriter` n'observe pas
            // `Task.isCancelled`, donc le MP4 peut arriver APRÈS le cancel.
            // On le nettoie sans rien afficher — `cancel(storyId:)` a déjà
            // retiré le job et posé son toast.
            guard !Task.isCancelled else {
                if let url { self.exporter.cleanupExport(at: url) }
                return
            }

            guard let url else {
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.failed",
                    defaultValue: "L'export de la story a échoué. Réessayez."
                ))
                return
            }

            self.jobs[storyId] = StorySaveProgressMapper.bakeShare

            do {
                try await self.photoSaver.saveVideo(at: url)
                self.jobs[storyId] = 1
                self.exporter.cleanupExport(at: url)
                self.finish(storyId: storyId)
                HapticFeedback.medium()
                self.toasts.showSuccess(String(
                    localized: "story.mine.save.success",
                    defaultValue: "Vidéo enregistrée dans Photos"
                ))
            } catch {
                Logger.stories.error(
                    "story save to photos failed for \(storyId, privacy: .public): \(error.localizedDescription, privacy: .public)")
                self.exporter.cleanupExport(at: url)
                self.finish(storyId: storyId)
                self.toasts.showError(String(
                    localized: "story.mine.save.photosDenied",
                    defaultValue: "Impossible d'enregistrer dans Photos. Vérifie l'autorisation Photos de Meeshy dans Réglages."
                ))
            }
        }
        tasks[storyId] = task
    }

    /// Annule la sauvegarde en vol : la ligne retrouve son `⋯` immédiatement.
    /// Le MP4 déjà baké (s'il arrive après coup) est nettoyé par le `Task`.
    func cancel(storyId: String) {
        guard jobs[storyId] != nil else { return }
        tasks[storyId]?.cancel()
        finish(storyId: storyId)
        toasts.showSuccess(String(
            localized: "story.mine.save.cancelled",
            defaultValue: "Export annulé"
        ))
    }

    // MARK: - Privé

    private func finish(storyId: String) {
        jobs[storyId] = nil
        tasks[storyId] = nil
    }
}
