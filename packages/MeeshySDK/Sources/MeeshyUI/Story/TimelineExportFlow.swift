import SwiftUI
import Combine
import AVKit
import MeeshySDK

// MARK: - Timeline Export Flow
//
// Bouton export du transport timeline → MP4 local (watermark Meeshy + audio
// des lanes) → aperçu jouable + partage. L'export sert à PRÉVISUALISER le
// rendu final de la timeline — il ne publie rien.

/// Orchestrateur du flux d'export : committe la timeline dans la slide,
/// résout les URLs locales, lance `StoryExporter` et publie la progression.
@MainActor
final class TimelineExportController: ObservableObject {

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

    var isExporting: Bool {
        if case .exporting = phase { return true }
        return false
    }

    func start(composer: StoryComposerViewModel) {
        guard !isExporting else { return }
        if composer.timelineViewModel.isPlaying {
            composer.timelineViewModel.togglePlayback()
        }
        let slide = composer.exportableCurrentSlide()
        let mediaURLs = composer.collectMediaURLs(for: slide)
        let watermark = MeeshyExportWatermark.make()
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-timeline-\(UUID().uuidString).mp4")

        phase = .exporting(0)
        // Trampoline @Sendable → @MainActor : le closure progress de
        // StoryExporter est @Sendable et ne peut pas capturer `self`
        // (@MainActor, non-Sendable). Le box n'est invoqué QUE via le hop
        // Task { @MainActor } — même pattern que StoryVideoExportService.
        final class ProgressSinkBox: @unchecked Sendable {
            let sink: (Double) -> Void
            init(_ sink: @escaping (Double) -> Void) { self.sink = sink }
        }
        let box = ProgressSinkBox { [weak self] fraction in
            guard let self, self.isExporting else { return }
            self.phase = .exporting(fraction)
        }
        exportTask = Task { [weak self] in
            do {
                try await StoryExporter.export(
                    slide,
                    to: outputURL,
                    watermark: watermark,
                    audioResolver: { audio in mediaURLs[audio.id] },
                    progress: { @Sendable fraction in
                        Task { @MainActor in box.sink(fraction) }
                    }
                )
                guard !Task.isCancelled else { return }
                self?.phase = .finished(ExportedFile(url: outputURL))
            } catch {
                guard !Task.isCancelled else { return }
                self?.phase = .failed(error.localizedDescription)
            }
        }
    }

    /// Abandonne l'attente et rend la main. La session AVFoundation en vol
    /// peut finir d'écrire son fichier tmp orphelin — purgé par l'OS, bénin.
    func cancel() {
        exportTask?.cancel()
        exportTask = nil
        phase = .idle
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
        TimelineContainerSwitcher(
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
