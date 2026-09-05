import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

/// **Ce que le `⋯` du composer emporte hors de Meeshy** (#4996, directive
/// porteur 2026-09-03 : « dans les options (…) ce qu'il faut c'est sauvegarder
/// (en photothèque), transférer et tout effacer »).
///
/// ## Le défaut : trois maillons vivants, aucune chaîne
///
/// Tout existait déjà, et rien ne se touchait :
/// - `StoryComposerViewModel.exportableCurrentSlide()` (SDK) compose la slide
///   exportable — timeline committée, URLs de vidéo résolues en fichiers
///   locaux, fond image du composer injecté en média éphémère — et **n'avait
///   AUCUN consommateur dans le dépôt** ;
/// - `StoryVideoExportService.prepareExport(slide:…)` la bake, et n'était
///   appelée que depuis une `StoryItem` déjà PUBLIÉE ;
/// - `PhotoLibraryManagerAdapter` sait écrire un MP4 dans Photos.
///
/// L'auteur ne pouvait donc emporter sa composition qu'APRÈS l'avoir publiée —
/// et le `⋯` du composer, lui, n'offrait que des réglages de fond.
///
/// ## Ce que ce contrôleur N'est pas
///
/// Ce n'est pas un second chemin de PUBLICATION. Le MP4 ne touche jamais le
/// backend : c'est la doctrine « RAW publish + author-only export »
/// (`apps/ios/CLAUDE.md`), et `StoryViewModel.runStoryUpload` a l'interdiction
/// explicite d'appeler `prepareExport`. Ici on est de l'autre côté de cette
/// frontière — un partage hors-Meeshy, jamais un envoi.
///
/// ## Pourquoi un contrôleur plutôt que deux fonctions dans le meuble
///
/// Parce qu'un bake dure des secondes, peut échouer, et doit survivre à ce que
/// l'écran fait pendant ce temps. Un `Task` détaché depuis un `body` n'aurait
/// ni progression lisible, ni annulation, ni nettoyage du fichier temporaire —
/// les trois choses que `StoryExportShareViewModel` a dû apprendre, et que ce
/// type reprend plutôt que de les réapprendre.
@MainActor
final class ComposerSceneExportController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// **Ce que l'auteur a demandé** — porté par le contrôleur plutôt que
    /// déduit à l'arrivée : le bake est le MÊME pour les deux, seule la
    /// destination change, et la relire d'un drapeau posé ailleurs serait une
    /// seconde vérité.
    enum Destination: Equatable, Sendable {
        case photoLibrary
        case share
    }

    /// `nil` ⇒ aucun export en vol. Non-`nil` ⇒ la fraction bakée, `0…1`.
    @Published private(set) var progress: Double?

    /// Le MP4 prêt à passer à `ShareSheet`. `nil` partout ailleurs — y compris
    /// après une sauvegarde en photothèque, qui n'a rien à présenter.
    ///
    /// **Un type plutôt qu'une `URL` nue** : `sheet(item:)` exige
    /// `Identifiable`, et une URL n'a pas d'identité pour SwiftUI. Le wrapper
    /// dit aussi ce que la valeur EST — un fichier prêt à partir — là où une
    /// URL seule se confondrait, à la relecture, avec la source d'un média.
    @Published var sharedFile: ComposerExportedFile?

    private let exporter: StoryVideoExportServiceProviding
    private let photoSaver: PhotoLibrarySaving
    private let toasts: FeedbackToastSurfacing
    private let brandIntro: @MainActor @Sendable () async -> StoryExportIntroContent?
    private let introTimeout: Duration
    private let logger = Logger(subsystem: "me.meeshy.app", category: "composer-scene-export")
    private var task: Task<Void, Never>?

    init(exporter: StoryVideoExportServiceProviding? = nil,
         photoSaver: PhotoLibrarySaving = PhotoLibraryManagerAdapter(),
         toasts: FeedbackToastSurfacing? = nil,
         introTimeout: Duration = BoundedAsyncResolution.defaultTimeout,
         brandIntro: (@MainActor @Sendable () async -> StoryExportIntroContent?)? = nil) {
        // `StoryVideoExportService.shared` et `FeedbackToastManager.shared`
        // sont `@MainActor`-isolés : impossible en expression de valeur par
        // défaut, résolus ici — même contrainte que `StoryPhotoSaveService`.
        self.exporter = exporter ?? StoryVideoExportService.shared
        self.toasts = toasts ?? FeedbackToastManager.shared
        self.photoSaver = photoSaver
        self.introTimeout = introTimeout
        self.brandIntro = brandIntro ?? StoryExportIntroFactory.currentUser
    }

    var isExporting: Bool { progress != nil }

    /// Bake la scène courante et la remet à `destination`.
    ///
    /// **Un seul export à la fois** : deux bakes concurrents se disputeraient
    /// l'encodeur et produiraient deux fichiers dont un serait orphelin. Le
    /// second appel est IGNORÉ plutôt que mis en file — l'auteur qui retape
    /// « Enregistrer » pendant un bake veut le même résultat, pas deux.
    func export(_ destination: Destination, slide: StorySlide) {
        guard !isExporting else { return }
        progress = 0
        let exporter = self.exporter
        let intro = self.brandIntro
        let timeout = self.introTimeout
        // Filigrane Meeshy animé — l'export du composer est auteur-only par
        // construction : `currentUser` EST l'auteur de ce qu'on compose.
        let watermark = MeeshyExportWatermark.make(username: AuthManager.shared.currentUser?.username)
        task = Task { [weak self] in
            let identite = await BoundedAsyncResolution.resolve(intro, timeout: timeout)
            guard !Task.isCancelled else { return }
            let url = await exporter.prepareExport(
                slide: slide,
                // **Aucune langue demandée, et c'est une RÉPONSE.** Le Prisme
                // s'exerce à la LECTURE, sur du contenu publié : à la
                // composition, aucune traduction n'existe encore, et en
                // réclamer une ferait rendre au renderer un repli plutôt que le
                // texte que l'auteur vient de frapper.
                languages: [],
                watermark: watermark,
                intro: identite,
                // Vide : les images de stickers s'apparient depuis les MÉDIAS
                // d'une story publiée (`StoryExporter.stickerImageSources`), que
                // le composer n'a pas — ses stickers vivent encore dans la
                // slide. Passer un dictionnaire vide dit la vérité ; en
                // fabriquer un depuis une source absente ferait croire à un
                // relais.
                stickerImageSources: [:],
                onProgress: { [weak self] fraction in self?.progress = fraction },
                onPhaseChange: nil
            )
            guard let self, !Task.isCancelled else {
                if let url { exporter.cleanupExport(at: url) }
                return
            }
            await self.deliver(url, to: destination)
        }
    }

    /// Ce que devient le fichier baké. **Le nettoyage est ici et nulle part
    /// ailleurs pour la photothèque** : une fois la copie faite, le
    /// temporaire n'a plus de lecteur, et le laisser derrière remplit le
    /// conteneur d'un MP4 par sauvegarde.
    ///
    /// Pour le PARTAGE il survit jusqu'à la fermeture de la feuille
    /// (`finishSharing`) : `UIActivityViewController` lit le fichier
    /// PENDANT la présentation, et le supprimer avant lui donnerait une
    /// feuille qui échoue sur chaque destination.
    private func deliver(_ url: URL?, to destination: Destination) async {
        progress = nil
        guard let url else {
            toasts.showError(ComposerExportCopy.failed)
            return
        }
        switch destination {
        case .share:
            sharedFile = ComposerExportedFile(url: url)
        case .photoLibrary:
            do {
                try await photoSaver.saveVideo(at: url)
                toasts.showSuccess(ComposerExportCopy.saved)
            } catch {
                logger.error("sauvegarde photothèque échouée — \(error.localizedDescription, privacy: .public)")
                toasts.showError(error.localizedDescription)
            }
            exporter.cleanupExport(at: url)
        }
    }

    /// La feuille de partage s'est refermée — menée à terme ou non. Le
    /// temporaire part dans les DEUX cas : partagé, le fichier vit désormais
    /// chez le destinataire ; annulé, personne n'en veut.
    func finishSharing() {
        if let fichier = sharedFile { exporter.cleanupExport(at: fichier.url) }
        sharedFile = nil
    }

    /// L'écran se ferme pendant un bake. `AVAssetWriter` n'observe pas
    /// l'annulation — c'est le RÉSULTAT tardif que ce chemin jette, et c'est
    /// tout ce qu'on peut faire.
    func cancel() {
        task?.cancel()
        task = nil
        progress = nil
        if let fichier = sharedFile { exporter.cleanupExport(at: fichier.url) }
        sharedFile = nil
    }
}

/// Le MP4 baké, prêt pour `ShareSheet`. Son identité EST son adresse : deux
/// bakes ne partagent jamais la même, et le contrôleur n'en tient qu'un à la
/// fois.
nonisolated struct ComposerExportedFile: Identifiable, Equatable {
    let url: URL
    var id: URL { url }
}

/// Les libellés de l'export, résolus par le catalogue `.main`. Écrits ici
/// plutôt qu'en littéraux dans le contrôleur : une chaîne posée en ligne
/// échappe au cliquet de complétude et n'est jamais traduite.
nonisolated enum ComposerExportCopy {

    static var saved: String {
        String(localized: "composer.export.saved",
               defaultValue: "Enregistré dans la photothèque", bundle: .main)
    }

    static var failed: String {
        String(localized: "composer.export.failed",
               defaultValue: "L'export a échoué. Réessayez.", bundle: .main)
    }

    static var inProgress: String {
        String(localized: "composer.export.inProgress",
               defaultValue: "Export en cours…", bundle: .main)
    }
}
