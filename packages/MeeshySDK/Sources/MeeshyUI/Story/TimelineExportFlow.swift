import SwiftUI
import Combine
import AVKit
import os
import MeeshySDK

// MARK: - Timeline Export Flow
//
// Bouton export du transport timeline → MP4 local (watermark Meeshy + audio
// des lanes) → aperçu jouable + partage. L'export sert à PRÉVISUALISER le
// rendu final de la timeline — il ne publie rien.
//
// Task 9 (2026-07-26) : cet export bakait le filigrane SANS pseudo et
// n'ajoutait jamais l'interlude de marque — divergence avec les 3 autres
// chemins d'export de story (`StoryPhotoSaveService`,
// `StoryExportShareViewModel`, `StoryVideoExportService`). Fixé en appelant
// la MÊME fabrique d'identité (`StoryExportIntroFactory`, déplacée ici même
// dans le SDK) et en threadant `intro:` à travers le même enchaînement
// « bake, puis prépose l'interlude » que `StoryVideoExportService.
// prepareExport` — voir `SystemTimelineStoryExporter` ci-dessous.
//
// Revue finale (2026-07-26, item 1) : la CARTE DE FIN (`StoryExportOutro`)
// manquait encore sur ce chemin — la même story se terminait sur le logo
// Meeshy + signature sonore depuis « Mes stories », et sur sa dernière frame
// depuis le composer timeline. Elle est désormais appliquée ici, avec le même
// atome SDK, et INDÉPENDAMMENT de l'interlude.

private let timelineExportLogger = Logger(subsystem: "me.meeshy.app", category: "story-timeline-export")

// MARK: - Timeline story export seam (test injection)

/// Seam de test au-dessus de l'enchaînement « bake via `StoryExporter.export`,
/// puis prépose l'interlude de marque via `StoryExportIntro.prepend` ».
///
/// Miroir SDK-local de `StoryVideoExportServiceProviding`
/// (`apps/ios/Meeshy/Features/Main/Services/StoryVideoExportService.swift`) :
/// même FORME (protocole `@MainActor`, pas `Sendable` — les doubles de test
/// restent de simples classes `@MainActor`), jamais la même DÉPENDANCE — le
/// SDK ne peut pas importer le target app, donc ce protocole vit ici plutôt
/// que d'être réutilisé tel quel.
@MainActor
protocol TimelineStoryExporting {
    /// - Returns: l'URL du MP4 FINAL — l'interlude prépendu quand `intro`
    ///   n'est pas `nil`, et la carte de fin de marque TOUJOURS ajoutée
    ///   (elle ne dépend d'aucune identité).
    func export(
        slide: StorySlide,
        to outputURL: URL,
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?,
        progress: ((Double) -> Void)?
    ) async throws -> URL
}

/// Implémentation de production : bake via `StoryExporter.export`, prépose
/// l'interlude via `StoryExportIntro.prepend` quand `intro != nil`, puis
/// ajoute TOUJOURS la carte de fin via `StoryExportOutro.append` —
/// EXACTEMENT la séquence de `StoryVideoExportService.prepareExport`. Un
/// échec de l'un ou l'autre ne perd pas l'export : ce qui a déjà été composé
/// reste livrable (même dégradation gracieuse que les autres chemins).
struct SystemTimelineStoryExporter: TimelineStoryExporting {

    @MainActor
    func export(
        slide: StorySlide,
        to outputURL: URL,
        watermark: StoryExportWatermark?,
        intro: StoryExportIntroContent?,
        audioResolver: (@Sendable (StoryAudioPlayerObject) -> URL?)?,
        progress: ((Double) -> Void)?
    ) async throws -> URL {
        // Trampoline @MainActor → @Sendable : `StoryExporter.export` exige un
        // callback @Sendable, le nôtre capture potentiellement `self`/
        // `@Published` (non-Sendable). Même pattern que
        // `StoryVideoExportService.prepareExport`.
        final class ProgressSinkBox: @unchecked Sendable {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
            let sink: (Double) -> Void
            init(_ sink: @escaping (Double) -> Void) { self.sink = sink }
        }
        let progressTrampoline: (@Sendable (Double) -> Void)?
        if let progress {
            let box = ProgressSinkBox(progress)
            progressTrampoline = { @Sendable fraction in
                Task { @MainActor in box.sink(fraction) }
            }
        } else {
            progressTrampoline = nil
        }

        // Emballage de marque composé DANS le bake — même atome
        // (`StoryExportBranding`) que `StoryVideoExportService.prepareExport`,
        // sans quoi la même story se terminerait sur le logo Meeshy depuis
        // « Mes stories » et sur sa dernière frame depuis le composer timeline.
        //
        // La carte de fin est due INDÉPENDAMMENT de l'interlude (revue finale,
        // items 1 et 2) : elle ne dépend d'aucune identité, donc l'absence de
        // session — ou une résolution trop lente — ne doit pas la faire
        // disparaître. `makePlan` porte cet invariant.
        //
        // `outro: nil` = fermeture sur le LOGO SEUL, sans identité d'auteur :
        // c'est ce que ce chemin produisait déjà. Divergence volontaire avec le
        // partage / Photos, préservée telle quelle.
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)

        try await StoryExporter.export(
            slide,
            to: outputURL,
            watermark: watermark,
            // Volontairement `nil` : composer la marque dans le bake est
            // fonctionnellement équivalent mais mesuré 5 à 20× plus lent —
            // voir `tasks/todo-story-export-single-pass.md`.
            branding: nil,
            audioResolver: audioResolver,
            progress: progressTrampoline
        )

        // `outro: nil` = fermeture sur le LOGO SEUL, sans identité d'auteur :
        // divergence volontaire avec partage / Photos, préservée telle quelle.
        do {
            let finalURL = try await StoryExportBranding.wrap(
                storyURL: outputURL, intro: intro, outro: nil, renderSize: renderSize)
            removeTemporaryFile(at: outputURL, reason: "pré-emballage-de-marque")
            return finalURL
        } catch {
            timelineExportLogger.warning("emballage de marque ignoré pour \(slide.id, privacy: .public) — \(error.localizedDescription, privacy: .public)")
            return outputURL
        }
    }

    /// Purge d'un intermédiaire de composition. Échec non fatal (l'OS purge le
    /// dossier temporaire) mais journalisé pour que les fuites soient visibles.
    private func removeTemporaryFile(at url: URL, reason: String) {
        do {
            try FileManager.default.removeItem(at: url)
        } catch {
            timelineExportLogger.warning("cleanup du MP4 \(reason, privacy: .public) échoué à \(url.path, privacy: .public) — \(error.localizedDescription, privacy: .public)")
        }
    }
}

/// Orchestrateur du flux d'export : committe la timeline dans la slide,
/// résout les URLs locales, lance `StoryExporter` et publie la progression.
@MainActor
final class TimelineExportController: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    enum Phase: Equatable {
        case idle
        case exporting(Double)
        case finished(ExportedFile)
        case failed(String)
    }

    struct ExportedFile: Identifiable, Equatable {
        let url: URL
        var id: String { url.absoluteString }
    }

    @Published var phase: Phase = .idle

    private var exportTask: Task<Void, Never>?
    private let exporter: TimelineStoryExporting
    /// La timeline jouait-elle quand `start()` l'a mise en pause pour lancer
    /// le bake — capturé AVANT la pause, jamais relu depuis le ViewModel une
    /// fois l'export en cours. Sans ce flag, aucune sortie (fin, échec,
    /// annulation) ne pouvait distinguer « il faut relancer » de « la
    /// timeline était déjà à l'arrêt ».
    private var wasPlayingBeforeExport = false
    /// Référence FAIBLE vers la timeline mise en pause — sert uniquement à
    /// la reprise en sortie d'export, jamais retenue au-delà (le composer en
    /// reste seul propriétaire).
    private weak var pausedTimelineViewModel: TimelineViewModel?
    /// Pseudo gravé dans le filigrane. Injectable — revue round 2 (Finding 2) :
    /// lire `AuthManager.shared` directement au site d'appel rendait cette
    /// valeur INcontrôlable en test, contrairement à `introProvider`. Par
    /// défaut : la même lecture qu'avant (`AuthManager.shared.currentUser?.
    /// username`), juste indirectée pour rester testable.
    private let usernameProvider: @MainActor @Sendable () -> String?
    /// Identité gravée sur le préambule de marque. Injectable — même patron
    /// que `StoryPhotoSaveService.intro` — pour que les tests contrôlent
    /// l'identité résolue sans dépendre de `AuthManager.shared` ambiant.
    /// Par défaut : LA MÊME fabrique que les 3 autres chemins d'export
    /// (`StoryExportIntroFactory.currentUser`) — pas de décision dupliquée.
    private let introProvider: @MainActor @Sendable () async -> StoryExportIntroContent?
    /// Borne dure sur la résolution de `introProvider` — voir
    /// `BoundedAsyncResolution.resolve` pour le pourquoi. Revue round 2
    /// (Finding 4) : avant ce fix, `introProvider()` était attendu SANS
    /// limite, alors qu'une identité non cachée (avatar/fond réseau) peut
    /// prendre jusqu'à ~60 s (timeout `URLSession` par défaut) — la barre de
    /// progression serait restée à 0 % tout ce temps au premier export après
    /// installation. Même mécanisme que `StoryPhotoSaveService.introTimeout`,
    /// pas un nouveau inventé.
    private let introTimeout: Duration

    var isExporting: Bool {
        if case .exporting = phase { return true }
        return false
    }

    init(exporter: TimelineStoryExporting = SystemTimelineStoryExporter(),
         usernameProvider: (@MainActor @Sendable () -> String?)? = nil,
         introProvider: (@MainActor @Sendable () async -> StoryExportIntroContent?)? = nil,
         introTimeout: Duration = BoundedAsyncResolution.defaultTimeout) {
        self.exporter = exporter
        self.usernameProvider = usernameProvider ?? { AuthManager.shared.currentUser?.username }
        self.introProvider = introProvider ?? StoryExportIntroFactory.currentUser
        self.introTimeout = introTimeout
    }

    func start(composer: StoryComposerViewModel) {
        guard !isExporting else { return }
        let timelineViewModel = composer.timelineViewModel
        wasPlayingBeforeExport = timelineViewModel.isPlaying
        if wasPlayingBeforeExport {
            timelineViewModel.togglePlayback()
        }
        pausedTimelineViewModel = timelineViewModel
        let slide = composer.exportableCurrentSlide()
        let mediaURLs = composer.collectMediaURLs(for: slide)
        // Filigrane Meeshy animé (logo + « meeshy » + pseudo de l'auteur) —
        // MÊME appel que les 3 autres chemins d'export (Task 9 : avant ce
        // fix, ce chemin appelait `.make()` SANS `username:`, filigrane
        // amputé du pseudo).
        let watermark = MeeshyExportWatermark.make(username: usernameProvider())
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-timeline-\(UUID().uuidString).mp4")

        phase = .exporting(0)
        let exporter = self.exporter
        let introProvider = self.introProvider
        let introTimeout = self.introTimeout
        exportTask = Task { [weak self] in
            // Résolue DANS le Task (async), BORNÉE dans le temps — voir
            // `BoundedAsyncResolution.resolve` et la doc de `introTimeout`.
            // `introProvider` est la closure injectée à l'init, pas le
            // singleton — l'injection en test reste honorée (même patron que
            // `StoryPhotoSaveService`).
            let introContent = await BoundedAsyncResolution.resolve(introProvider, timeout: introTimeout)
            // « Annuler » tapé pendant la résolution d'identité (jusqu'à
            // `introTimeout`, soit 4 s sur une installation fraîche) : ne pas
            // démarrer un export de 10 à 60 s derrière une surface déjà
            // partie. `cancel()` a rendu la main et reposé `phase` sur
            // `.idle` — sans cette garde, l'export partait quand même et son
            // résultat était jeté à l'arrivée par le `guard !Task.isCancelled`
            // d'après-export, après avoir chauffé l'appareil pour rien.
            //
            // `Task.isCancelled` est ici la BONNE garde (contrairement à
            // `StoryPhotoSaveService`, qui a un jeton de génération) : la
            // seule annulation de ce chemin est `exportTask?.cancel()`.
            // Alignement sur `StoryExportShareViewModel.startExport`.
            guard !Task.isCancelled else { return }
            do {
                let finalURL = try await exporter.export(
                    slide: slide,
                    to: outputURL,
                    watermark: watermark,
                    intro: introContent,
                    audioResolver: { audio in mediaURLs[audio.id] },
                    progress: { [weak self] fraction in
                        guard let self, self.isExporting else { return }
                        self.phase = .exporting(fraction)
                    }
                )
                guard !Task.isCancelled else { return }
                self?.phase = .finished(ExportedFile(url: finalURL))
                self?.resumePlaybackIfNeeded()
            } catch {
                guard !Task.isCancelled else { return }
                self?.phase = .failed(error.localizedDescription)
                self?.resumePlaybackIfNeeded()
            }
        }
    }

    /// Abandonne l'attente et rend la main. La session AVFoundation en vol
    /// peut finir d'écrire son fichier tmp orphelin — purgé par l'OS, bénin.
    func cancel() {
        exportTask?.cancel()
        exportTask = nil
        phase = .idle
        resumePlaybackIfNeeded()
    }

    /// Relance la lecture coupée par `start()`, si (et seulement si) elle
    /// jouait avant la pause — via la MÊME bascule (`togglePlayback()`) que
    /// celle qui l'a arrêtée, jamais un `play()` direct qui court-circuiterait
    /// l'état publié (`isPlaying`) du ViewModel. Appelée sur les TROIS sorties
    /// possibles de l'export (fin, échec, annulation) : avant ce fix, aucune
    /// ne relançait la lecture, laissant la timeline muette derrière l'aperçu
    /// plein écran ou après un « Annuler ».
    private func resumePlaybackIfNeeded() {
        guard wasPlayingBeforeExport, let timelineViewModel = pausedTimelineViewModel else { return }
        wasPlayingBeforeExport = false
        pausedTimelineViewModel = nil
        timelineViewModel.togglePlayback()
    }

    /// Ferme l'aperçu : le MP4 temporaire est supprimé (il a été partagé ou
    /// abandonné — la source de vérité reste la story, pas l'export).
    func acknowledgeFinished() {
        if case .finished(let file) = phase {
            try? FileManager.default.removeItem(at: file.url)
        }
        phase = .idle
    }

    func acknowledgeFailure() {
        phase = .idle
    }
}

/// Contenu de la sheet timeline du composer : switcher Quick/Pro + flux
/// d'export (overlay de progression, aperçu partageable, alerte d'échec).
struct TimelineSheetContent: View {

    let composer: StoryComposerViewModel
    @StateObject private var exportController = TimelineExportController()

    /// L'export terminé se présente en PLEIN ÉCRAN — la vidéo se consulte
    /// comme n'importe quelle vidéo : lecture immersive, Enregistrer dans
    /// Photos, Partager (retour user 2026-07-11). Pin testé par
    /// `TimelineExportPreviewTests`.
    static let presentsFinishedExportFullscreen = true

    var body: some View {
        StoryTimelineHost(
            viewModel: composer.timelineViewModel,
            onExport: { exportController.start(composer: composer) }
        )
        .overlay { exportProgressOverlay }
        .fullScreenCover(item: finishedFileBinding, onDismiss: {
            exportController.acknowledgeFinished()
        }) { file in
            TimelineExportPreviewSheet(url: file.url)
        }
        .alert(
            String(localized: "story.timeline.export.failedTitle",
                   defaultValue: "Export impossible", bundle: .module),
            isPresented: failureBinding
        ) {
            Button(String(localized: "story.composer.ok", defaultValue: "OK",
                          bundle: .module)) {
                exportController.acknowledgeFailure()
            }
        } message: {
            if case .failed(let reason) = exportController.phase {
                Text(reason)
            }
        }
    }

    private var finishedFileBinding: Binding<TimelineExportController.ExportedFile?> {
        Binding(
            get: {
                if case .finished(let file) = exportController.phase { return file }
                return nil
            },
            set: { if $0 == nil { exportController.acknowledgeFinished() } }
        )
    }

    private var failureBinding: Binding<Bool> {
        Binding(
            get: {
                if case .failed = exportController.phase { return true }
                return false
            },
            set: { if !$0 { exportController.acknowledgeFailure() } }
        )
    }

    @ViewBuilder
    private var exportProgressOverlay: some View {
        if case .exporting(let fraction) = exportController.phase {
            ZStack {
                Color.black.opacity(0.45).ignoresSafeArea()
                VStack(spacing: 16) {
                    ProgressView(value: max(0, min(1, fraction)))
                        .progressViewStyle(.linear)
                        .tint(MeeshyColors.indigo400)
                        .frame(width: 210)
                    Text(String(localized: "story.timeline.export.exporting",
                                defaultValue: "Export de la vidéo…", bundle: .module))
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(.primary)
                    Button(String(localized: "story.composer.cancelAction",
                                  defaultValue: "Annuler", bundle: .module)) {
                        exportController.cancel()
                    }
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(MeeshyColors.indigo500)
                }
                .padding(26)
                .background(
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(.ultraThinMaterial)
                )
            }
            .transition(.opacity)
        }
    }
}

/// Aperçu plein cadre du MP4 exporté + partage système. « Voir à quoi ça
/// ressemble » : lecture immédiate en boucle de l'export watermarké.
/// Visionneuse PLEIN ÉCRAN de la vidéo exportée — même langage visuel que
/// `ImageViewerView` (X en haut à gauche, actions en haut à droite sur
/// pastilles translucides) : lecture native en boucle, Enregistrer dans
/// Photos avec états, Partager standard.
struct TimelineExportPreviewSheet: View {

    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer
    @State private var loopObserver: NSObjectProtocol?
    @State private var saveState: SaveState = .idle

    internal enum SaveState { case idle, saving, saved, failed }

    init(url: URL) {
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    /// Icône du bouton Enregistrer par état ; `nil` = ProgressView (saving).
    /// Pure — testée sans monter la vue (`TimelineExportPreviewTests`).
    static func saveIconName(for state: SaveState) -> String? {
        switch state {
        case .idle:   return "arrow.down.to.line"
        case .saving: return nil
        case .saved:  return "checkmark"
        case .failed: return "xmark"
        }
    }

    /// La vidéo déjà dans Photos ne se ré-enregistre pas ; un échec reste
    /// réessayable.
    static func isSaveDisabled(_ state: SaveState) -> Bool {
        state == .saving || state == .saved
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VideoPlayer(player: player)
                .ignoresSafeArea()
            controlsOverlay
        }
        .onAppear {
            loopObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: player.currentItem,
                queue: .main
            ) { [weak player] _ in
                player?.seek(to: .zero)
                player?.play()
            }
            player.play()
        }
        .onDisappear {
            if let loopObserver {
                NotificationCenter.default.removeObserver(loopObserver)
            }
            loopObserver = nil
            player.pause()
        }
    }

    private var controlsOverlay: some View {
        VStack {
            HStack(spacing: 8) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundColor(.white.opacity(0.85))
                        .padding()
                }
                .accessibilityLabel(String(localized: "story.timeline.export.preview.close",
                                           defaultValue: "Fermer", bundle: .module))

                Spacer()

                saveButton

                ShareLink(item: url) {
                    Image(systemName: "square.and.arrow.up")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.2)))
                }
                .accessibilityLabel(String(localized: "story.timeline.export.preview.share",
                                           defaultValue: "Partager la vidéo", bundle: .module))
                .padding(.trailing, 16)
            }
            Spacer()
        }
    }

    private var saveButton: some View {
        Button { saveToPhotos() } label: {
            Group {
                if let icon = Self.saveIconName(for: saveState) {
                    Image(systemName: icon)
                } else {
                    ProgressView().tint(.white)
                }
            }
            .font(.system(size: 18, weight: .semibold))
            .foregroundColor(.white.opacity(0.9))
            .frame(width: 40, height: 40)
            .background(Circle().fill(Color.white.opacity(0.2)))
        }
        .disabled(Self.isSaveDisabled(saveState))
        .accessibilityLabel(String(localized: saveState == .saved
            ? "story.timeline.export.preview.saved"
            : "story.timeline.export.preview.save",
            defaultValue: saveState == .saved
                ? "Enregistrée dans Photos" : "Enregistrer dans Photos",
            bundle: .module))
    }

    /// Le MP4 est un fichier temporaire LOCAL (purgé au dismiss) — pas de
    /// cascade cache/téléchargement, on l'enregistre directement.
    /// `MainActor.run` par cohérence avec le pattern éprouvé des renderers
    /// (pièges d'isolation Swift 6).
    private func saveToPhotos() {
        saveState = .saving
        HapticFeedback.light()
        let fileURL = url
        Task {
            let ok = await PhotoLibraryManager.shared.saveVideo(at: fileURL)
            await MainActor.run {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    saveState = ok ? .saved : .failed
                }
                if ok {
                    HapticFeedback.success()
                } else {
                    HapticFeedback.error()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                        withAnimation { saveState = .idle }
                    }
                }
            }
        }
    }
}
