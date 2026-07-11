import SwiftUI
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
        exportTask = Task { [weak self] in
            do {
                try await StoryExporter.export(
                    slide,
                    to: outputURL,
                    watermark: watermark,
                    audioResolver: { audio in mediaURLs[audio.id] },
                    progress: { fraction in
                        Task { @MainActor [weak self] in
                            guard let self, self.isExporting else { return }
                            self.phase = .exporting(fraction)
                        }
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

    var body: some View {
        TimelineContainerSwitcher(
            viewModel: composer.timelineViewModel,
            onExport: { exportController.start(composer: composer) }
        )
        .overlay { exportProgressOverlay }
        .sheet(item: finishedFileBinding, onDismiss: {
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
struct TimelineExportPreviewSheet: View {

    let url: URL
    @Environment(\.dismiss) private var dismiss
    @State private var player: AVPlayer
    @State private var loopObserver: NSObjectProtocol?

    init(url: URL) {
        self.url = url
        _player = State(initialValue: AVPlayer(url: url))
    }

    var body: some View {
        NavigationStack {
            VideoPlayer(player: player)
                .background(Color.black)
                .navigationTitle(String(localized: "story.timeline.export.previewTitle",
                                        defaultValue: "Aperçu de l'export", bundle: .module))
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        Button(String(localized: "story.composer.done",
                                      defaultValue: "OK", bundle: .module)) {
                            dismiss()
                        }
                        .tint(MeeshyColors.indigo500)
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: url) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .tint(MeeshyColors.indigo500)
                    }
                }
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
}
