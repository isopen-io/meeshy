import SwiftUI
import MeeshySDK

/// Hosts the single unified timeline. LE conteneur racine (D3) — c'est ce que
/// `TimelineSheetContent` (`Story/TimelineExportFlow.swift`) présente en
/// réponse à `bandStateMachine.openTimeline`. Il dessine désormais LE plan
/// (`Plan2DView`, D1/D2) : vertical = empilement, borné par les trois plans ;
/// horizontal = durée. L'ancien conteneur mono-piste (`StoryTimelineView`,
/// gardé pour ses propres tests et ses helpers statiques réutilisés ailleurs)
/// n'est plus référencé ICI.
///
/// State (`selectedClipId`, `currentTime`, `zoomScale`) lives in
/// `TimelineViewModel`.
public struct StoryTimelineHost: View {

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.colorScheme) private var colorScheme

    private let previewSlot: (() -> AnyView)?
    /// Enregistrement de la story (export MP4) — rendu dans le transport,
    /// juste après la lecture (`TransportBar.onSave`). `nil` = pas de bouton.
    private let onExport: (() -> Void)?

    public init(viewModel: TimelineViewModel,
                onExport: (() -> Void)? = nil,
                @ViewBuilder previewSlot: @escaping () -> some View) {
        self.viewModel = viewModel
        self.onExport = onExport
        self.previewSlot = { AnyView(previewSlot()) }
    }

    public init(viewModel: TimelineViewModel,
                onExport: (() -> Void)? = nil) {
        self.viewModel = viewModel
        self.onExport = onExport
        self.previewSlot = nil
    }

    public var body: some View {
        // Glass material lives on the sheet itself
        // (`.presentationBackground(.ultraThinMaterial)`); doubling it here
        // would flatten the canvas blur. We leave this container transparent.
        container
            // Les deux signaux one-shot du view model (durée recalculée, story
            // mise en file faute de réseau) n'avaient AUCUN lecteur : ils
            // s'allumaient et s'éteignaient sans jamais atteindre l'écran.
            .overlay(alignment: .top) {
                TimelineBannerOverlay(viewModel: viewModel)
            }
            .animation(.snappy(duration: 0.25), value: viewModel.durationDidAutoAdjust?.to)
            .animation(.snappy(duration: 0.25), value: viewModel.showOfflineQueuedConfirmation)
    }

    // MARK: - Root layout

    private static let previewHeight: CGFloat = 220

    private var container: some View {
        VStack(spacing: 0) {
            if let previewSlot {
                previewSlot()
                    .frame(height: Self.previewHeight)
            }
            operationsBar
            transport
            plan2DRegion
        }
        .background(
            colorScheme == .dark
                ? MeeshyColors.indigo950.opacity(0.18)
                : MeeshyColors.indigo50.opacity(0.32)
        )
        // Surface d'édition complète : sélectionner un clip, un keyframe ou
        // une transition ouvre son inspecteur en SHEET (item 8, 2026-07-25).
        .timelineInspectorSheet(viewModel: viewModel)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "story.timeline.container", defaultValue: "Timeline", bundle: .module))
    }

    // MARK: - Chrome (identique à l'ancien conteneur mono-piste)

    private var operationsBar: some View {
        TimelineOperationsBar(
            canUndo: viewModel.canUndo,
            canRedo: viewModel.canRedo,
            isSnapEnabled: viewModel.isSnapEnabled,
            onUndo: { viewModel.undo() },
            onRedo: { viewModel.redo() },
            onSnapToggle: { viewModel.toggleSnap() },
            onSave: onExport,
            onExtendDuration: { viewModel.extendSlideDuration() }
        )
    }

    private var transport: some View {
        TransportBar(
            isPlaying: viewModel.isPlaying,
            currentTime: viewModel.currentTime,
            duration: viewModel.project.slideDuration,
            zoomScale: viewModel.zoomScale,
            isMuted: viewModel.isMuted,
            showsTimeReadout: true,
            // Historique, snap et enregistrement vivent dans la bande
            // d'opérations au-dessus — nil masque leurs clusters ici.
            canUndo: nil,
            canRedo: nil,
            isSnapEnabled: nil,
            onPlayToggle: { viewModel.togglePlayback() },
            onMuteToggle: { viewModel.toggleMute() },
            // Bornes partagées avec le pinch (`TimelineScrubArea.zoomRange`,
            // 5 % – 800 %) — le zoom pilote aussi lequel des deux paliers
            // (`.fit` / `.detail`) le plan dessine, cf. `plan2DRegion`.
            onZoomIn: { viewModel.zoomScale = min(
                TimelineScrubArea<AnyView>.zoomRange.upperBound,
                viewModel.zoomScale * 1.25) },
            onZoomOut: { viewModel.zoomScale = max(
                TimelineScrubArea<AnyView>.zoomRange.lowerBound,
                viewModel.zoomScale / 1.25) },
            onZoomReset: { viewModel.zoomScale = 1.0 },
            onUndo: {},
            onRedo: {},
            onSnapToggle: {},
            onSave: nil
        )
    }

    // MARK: - LE plan (D1/D2)

    /// Pistes du plan, dérivées du projet courant via l'adaptateur pur
    /// (Global Constraints — le plan lit le RUNTIME, jamais CanvasV3).
    private var plan2DTracks: [Plan2DTrack] {
        Plan2DLayout.tracks(from: Plan2DProjectAdapter.effects(from: viewModel.project),
                            slideDuration: Double(viewModel.project.slideDuration))
    }

    @ViewBuilder
    private var plan2DRegion: some View {
        let tracks = plan2DTracks
        if tracks.isEmpty {
            TimelineEmptyState(isDark: colorScheme == .dark)
                .padding(.vertical, 28)
                .padding(.horizontal, 16)
        } else {
            GeometryReader { proxy in
                ScrollView([.horizontal, .vertical], showsIndicators: true) {
                    Plan2DView(
                        tracks: tracks,
                        // `.detail` double l'échelle — piloté par le MÊME
                        // zoom que le transport (`TransportBar` zoom
                        // in/out/reset), pas un second état dupliqué.
                        zoom: viewModel.zoomScale > 1 ? .detail : .fit,
                        laneWidth: max(0, proxy.size.width - Plan2DView.labelColumnWidth),
                        slideDuration: Double(viewModel.project.slideDuration),
                        isDark: colorScheme == .dark,
                        // Tap ⇒ ouvre l'Inspector EXISTANT (S4) — la même
                        // intention qu'un double tap sur l'ancienne barre.
                        onSelectTrack: { viewModel.inspectClip(id: $0) },
                        onReorder: { id, index in
                            Self.applyReorder(id: id, toIndex: index, tracks: tracks, to: viewModel)
                        },
                        onTrimStart: { id, delta in
                            viewModel.trimClipStart(id: id, deltaTimeSeconds: Float(delta))
                        },
                        onTrimEnd: { id, delta in
                            viewModel.trimClipEnd(id: id, deltaTimeSeconds: Float(delta))
                        }
                    )
                    // Le playhead publie `currentTime` à 60 Hz pendant la
                    // lecture — sans `.equatable()`, chaque tick redessinerait
                    // le Canvas du plan alors que tracks/zoom n'ont pas bougé
                    // (même pattern que `VideoClipBar`/`AudioClipBar`/
                    // `TextClipBar` dans l'ancien conteneur mono-piste).
                    .equatable()
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    /// Traduit un dépôt `Plan2DView.onReorder` (D2, gelé) en mutations
    /// ViewModel, par famille :
    ///
    /// - média / texte : le z existant (`ClipTransform.zIndex`, via
    ///   `setClipTransform` — undoable) porte le nouveau rang.
    /// - média / audio : franchir un plan bascule `isBackground` (via
    ///   `setClipBackground` — undoable), et seulement s'il change vraiment
    ///   (éviter une entrée d'annulation sans effet).
    /// - audio / sticker : le ViewModel ne pilote PAS leur z aujourd'hui —
    ///   `clipTransform` ne les résout pas (`StoryAudioPlayerObject.transform`
    ///   est un no-op au Modèle, `StorySticker` rejette `.transform`) ; une
    ///   limitation EXISTANTE, hors ownership `Timeline/**`. Le
    ///   franchissement de plan reste néanmoins honoré pour l'audio.
    static func applyReorder(id: String, toIndex: Int, tracks: [Plan2DTrack],
                             to viewModel: TimelineViewModel) {
        guard let outcome = Plan2DReorderResolver.resolve(tracks: tracks, droppedTrackId: id, toIndex: toIndex),
              let kind = viewModel.clipKind(forId: id) else { return }
        if kind == .video || kind == .image || kind == .text {
            viewModel.setClipTransform(id: id, field: .zIndex(outcome.newZ))
        }
        if kind == .video || kind == .image || kind == .audio {
            let currentlyBackground = viewModel.project.mediaObjects.first(where: { $0.id == id })?.isBackground
                ?? viewModel.project.audioPlayerObjects.first(where: { $0.id == id })?.isBackground
                ?? false
            let shouldBeBackground = outcome.newPlane == .bg
            if currentlyBackground != shouldBeBackground {
                viewModel.setClipBackground(id: id, isBackground: shouldBeBackground)
            }
        }
    }
}
