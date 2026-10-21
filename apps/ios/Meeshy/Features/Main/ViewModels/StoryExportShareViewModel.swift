import Foundation
import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportShareViewModel
//
// Drives the "Export to share" flow, for the author and, since #9953, for any
// reader (the author's handle then signs the watermark) :
//   - Take a `StoryItem` (published story) + an export language code
//   - Reconstruct a `StorySlide` honouring the Prisme Linguistique
//   - Bake an MP4 via `StoryVideoExportService`
//   - Surface the file URL so the view can present `UIActivityViewController`
//   - Clean up the temp file after the share sheet completes or is cancelled
//
// The export is NEVER uploaded to the Meeshy backend — stories publish RAW
// (assets + JSON effects). The MP4 is for partage hors-Meeshy (Photos,
// Messages, WhatsApp, AirDrop, etc.).

/// Lifecycle phase observed by the share UI.
enum StoryExportSharePhase: Equatable, Sendable {
    case idle
    case exporting
    case ready          // MP4 baked, share sheet should be presented
    case sharing        // Share sheet is on screen
    case failed(String)
}

@MainActor
final class StoryExportShareViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var phase: StoryExportSharePhase = .idle
    @Published private(set) var progress: Double = 0
    @Published private(set) var sharedURL: URL? = nil
    @Published var errorMessage: String? = nil

    /// Languages available for export. Computed from the story's
    /// `translations` and `originalLanguage` so the picker reflects what
    /// the backend actually carries.
    @Published private(set) var availableLanguages: [String] = []

    /// Language the next export will bake into. `nil` means "original
    /// source text" (the renderer falls back to the slide content when no
    /// translation matches).
    @Published var selectedLanguage: String? = nil

    private let exporter: StoryVideoExportServiceProviding
    private let logger = MeeshyLog.logger(.storyExportShare)
    private var exportTask: Task<Void, Never>?

    /// L'habillage de l'export — interlude, carte de fin, pseudo du filigrane —
    /// se résout par `StoryExportDressing` (#10536), le même site que
    /// l'enregistrement et la feuille de partage du système.
    ///
    /// Les identités sont INJECTABLES (`brandIntro` : l'utilisateur connecté ;
    /// `authorIntro` : l'auteur d'une story qu'un lecteur exporte) : les lire
    /// directement dans `AuthManager.shared` rendait l'export dépendant d'une
    /// session ambiante — sans session, le MP4 partait SANS interlude,
    /// silencieusement. C'est aussi ce qui rendait les tests verts en local
    /// (session résiduelle du simulateur) et rouges en CI (simulateur vierge).
    ///
    /// La résolution est BORNÉE par `introTimeout` — LA MÊME borne que les
    /// autres chemins d'export (`StoryPhotoSaveService`,
    /// `TimelineExportController.introTimeout`), domiciliée à côté du mécanisme
    /// lui-même : `BoundedAsyncResolution.defaultTimeout`.
    ///
    /// Revue finale (item 4) : « Partager » était le SEUL des trois chemins à
    /// attendre `brandIntro()` sans borne, et il le faisait avant même que
    /// `exportTask` existe — donc premier partage après installation + réseau
    /// lent = barre à 0 % pendant jusqu'à ~60 s, bouton « Annuler » sans effet
    /// (il annule `exportTask`, encore `nil`), et fermer la sheet ne stoppait
    /// pas le bake qui démarrait derrière.
    private let dressings: StoryExportDressingResolver

    init(exporter: StoryVideoExportServiceProviding? = nil,
         introTimeout: Duration = BoundedAsyncResolution.defaultTimeout,
         brandIntro: StoryExportDressingResolver.ViewerIntro? = nil,
         authorIntro: StoryExportDressingResolver.AuthorIntro? = nil) {
        // `StoryVideoExportService.shared` is `@MainActor`-isolated so it
        // can't be a default arg expression; resolve inside the body.
        self.exporter = exporter ?? StoryVideoExportService.shared
        self.dressings = StoryExportDressingResolver(viewerIntro: brandIntro, authorIntro: authorIntro,
                                                     timeout: introTimeout)
    }

    // MARK: - Public API

    /// Inspects the story and seeds `availableLanguages` from the
    /// `translations` array. The caller picks one (or leaves nil for
    /// "original") before `startExport`.
    func prepare(story: StoryItem) {
        let langs = StoryExportLanguageResolver.availableLanguages(story: story)
        availableLanguages = langs
        selectedLanguage = StoryExportLanguageResolver.defaultLanguage(
            available: langs,
            preferred: AuthManager.shared.currentUser?.preferredContentLanguages ?? []
        )
    }

    /// Bakes an MP4 from `story` honouring `selectedLanguage` (Prisme
    /// Linguistique). The story is reconstructed into a `StorySlide` via
    /// `toRenderableSlide(preferredLanguages:)` so text overlays + content
    /// resolve through the same pipeline the live viewer uses.
    ///
    /// - Parameter author: l'AUTEUR de la story. L'export d'une story porte
    ///   TOUJOURS son prélude et sa carte de fin (#10536) ; l'interlude
    ///   présente l'auteur, jamais le lecteur qui exporte la story d'un autre
    ///   (#9953). `nil` (« Mes stories ») : l'utilisateur connecté est l'auteur.
    /// - Returns: nothing — observe `phase` / `sharedURL` to drive the UI.
    func startExport(story: StoryItem, author: StoryExportAuthor? = nil) async {
        guard phase != .exporting && phase != .sharing else { return }
        let langs: [String] = selectedLanguage.map { [$0] } ?? []
        let slide = story.toRenderableSlide(preferredLanguages: langs)
        // Images des stickers (#4852) : `toRenderableSlide` hydrate l'URL des
        // audios depuis `story.media`, mais un `StorySticker` ne porte pas
        // d'URL — l'export peignait 🖼️. C'est ICI, seul point qui tient à la
        // fois la slide et `story.media`, que l'index `postMediaId → adresse`
        // se construit ; le bake le rapatrie comme un média de premier plan.
        let stickerImageSources = StoryExporter.stickerImageSources(
            for: slide.effects.stickerObjects, media: story.media)

        // Universal export — toutes les stories peuvent être bakées en
        // MP4 (texte/sticker/image static OU vidéo/audio/keyframes
        // animés). Le compositor synthétise un substrat transparent
        // pour les slides sans background vidéo (cf. StoryExporter B1
        // + StoryExporterStaticOnlyTests).
        phase = .exporting
        progress = 0
        errorMessage = nil

        // Le bake est wrappé dans un Task annulable : avant, dismisser le
        // sheet mid-export laissait l'AVAssetWriter tourner jusqu'au bout en
        // retenant le VM, puis posait `.ready` sur un sheet mort et orphelinait
        // le MP4 temporaire. Le bake lui-même n'observe pas l'annulation
        // (AVAssetWriter), mais le résultat tardif est nettoyé ici.
        exportTask?.cancel()
        let exporter = self.exporter
        // L'export est offert à tout lecteur (#9953) : l'auteur vient de la
        // story, pas de la session. C'est une STORY — prélude et carte de fin
        // sont dus, quel que soit celui qui exporte (#10536).
        let dressing = StoryExportDressing.forStory(of: author, viewer: .current)
        let dressings = self.dressings
        let task = Task { [weak self] in
            // Résolu DANS le Task (`exportTask` existe donc pendant l'attente,
            // et « Annuler » / la fermeture de la sheet ont enfin prise) et
            // BORNÉ dans le temps par le MÊME mécanisme que les autres
            // chemins — voir `StoryExportDressingResolver.plan(for:)`. Les
            // closures d'identité sont celles injectées à l'init, pas le
            // singleton : l'injection en test reste honorée.
            let plan = await dressings.plan(for: dressing)
            // Filigrane Meeshy animé (logo + « meeshy » + pseudo de l'AUTEUR),
            // baké sur chaque frame et alternant les coins toutes les 5 s.
            let watermark = MeeshyExportWatermark.make(username: plan.watermarkHandle)
            // Sheet fermée ou « Annuler » tapé pendant la résolution : ne pas
            // démarrer un bake derrière une surface déjà partie.
            guard !Task.isCancelled else { return }
            let url = await exporter.prepareExport(
                slide: slide,
                languages: langs,
                watermark: watermark,
                intro: plan.intro,
                inputs: StoryExportInputs(stickerImageSources: stickerImageSources),
                // **La carte de fin est DUE** (#7052) : on partage une STORY
                // publiée, et l'habillage `.story` la porte. L'exception —
                // l'œuvre seule d'un réel, d'un post, d'une scène de post — est
                // l'autre cas de `StoryExportDressing`, jamais un `false` posé ici.
                appendsBrandOutro: plan.appendsBrandOutro,
                onProgress: { [weak self] fraction in
                    self?.progress = fraction
                },
                onPhaseChange: nil
            )

            guard let self, !Task.isCancelled else {
                if let url { exporter.cleanupExport(at: url) }
                return
            }
            if let url {
                self.sharedURL = url
                self.phase = .ready
            } else {
                self.errorMessage = String(
                    localized: "story.export.share.failed",
                    defaultValue: "L'export de la story a échoué. Réessayez."
                )
                self.phase = .failed("exporterReturnedNil")
            }
        }
        exportTask = task
        await task.value
    }

    /// Called by the view when the `UIActivityViewController` is actually
    /// on screen so internal state reflects "share in progress".
    func markSharingPresented() {
        if phase == .ready {
            phase = .sharing
        }
    }

    /// Called by the view when the share sheet finishes (success OR
    /// cancellation). Cleans up the temp MP4 in both cases — the user
    /// already has the file in Photos/Messages if they completed the share,
    /// and a cancelled share means we don't need the file at all.
    func finishSharing(success: Bool) {
        if let url = sharedURL {
            exporter.cleanupExport(at: url)
            logger.debug("Cleaned up export temp at \(url.path, privacy: .public)")
        }
        sharedURL = nil
        phase = success ? .idle : .idle
        progress = 0
    }

    /// Resets all state. Used when the sheet is dismissed before the bake
    /// completes (user cancels the export itself).
    func cancel() {
        exportTask?.cancel()
        exportTask = nil
        if let url = sharedURL {
            exporter.cleanupExport(at: url)
        }
        sharedURL = nil
        phase = .idle
        progress = 0
        errorMessage = nil
    }
}
