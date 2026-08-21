import SwiftUI
import MeeshySDK

/// Hosts the single unified timeline. LE conteneur racine (D3) — c'est ce que
/// `TimelineSheetContent` (`Story/TimelineExportFlow.swift`) présente en
/// réponse à `bandStateMachine.openTimeline`. Il dessine désormais LE plan
/// (`Plan2DView`, D1/D2) : vertical = empilement, borné par les trois plans ;
/// horizontal = durée. L'ancien conteneur mono-piste (`StoryTimelineView`)
/// n'est PLUS le point d'entrée de production — grep `StoryTimelineView(`
/// hors ce fichier ne renvoie aucun site de production — mais il reste dans
/// l'arbre : ses PROPRES tests le montent (`StoryTimelineViewSnapshotTests`,
/// `StoryTimelineViewTests`, `StoryTimelineViewHoistOrderTests`) et TROIS
/// bancs transverses le montent réellement comme scène câblée pour exercer
/// d'autres composants — vérifié par `grep -n "StoryTimelineView("`, pas
/// seulement par le nom du fichier — (`StoryTimelineView_IsMutedReactiveTests`,
/// `TimelineInspectorHostRoutingTests`, `TimelineInspectorHost_IsMutedReactiveTests`).
/// `TransportBarTests`, `ClipInspector_StateSyncTests` et
/// `AudioTextDragDriftTests` ne font que le CITER dans un commentaire de
/// documentation — ils ne l'instancient pas et sa suppression ne les
/// casserait pas ; l'énoncé précédent de ce commentaire les comptait à tort
/// parmi les bancs cassés, corrigé ici. Son sort définitif (portage des 3
/// bancs réels vers `StoryTimelineHost`, ou suppression assumée) reste un
/// chantier séparé, pas silencieux : DIT ici plutôt que reformulé en fausse
/// réutilisation production.
///
/// La bascule compact/déployé de l'ancien conteneur (3 pistes visibles, un
/// bouton « déployer » pour le reste) N'A PAS d'équivalent ICI — le plan
/// affiche TOUJOURS l'intégralité des pistes, empilées par plan (c'est son
/// principe même : « l'ordre des pistes EST l'ordre à l'écran », D1) ;
/// scroller y substitue tronquer. Simplification ASSUMÉE, pas un oubli.
///
/// Le pinch-to-zoom et l'auto-scroll qui suit la tête de lecture pendant la
/// lecture (tous deux portés par `TimelineScrubArea` dans l'ancien
/// conteneur) N'ONT PAS non plus d'équivalent ICI — seuls les boutons +/−
/// du transport pilotent le zoom (cf. `transport`, mêmes bornes que
/// `TimelineScrubArea.zoomRange`, gestes non repris). Régression CONNUE,
/// disclosed, pas un oubli silencieux ; corollaire : au-delà d'un
/// `zoomScale` de 1.0, ces boutons ne changent plus le palier affiché
/// (`plan2DZoom` est binaire `.fit`/`.detail`), alors qu'ils continuent de
/// faire varier `zoomScale` en continu de 0,05 à 8,0.
///
/// Trois capacités que la barre de l'ancien conteneur portait sont RENDUES
/// ici, par réutilisation des composants et méthodes existants : le mute PAR
/// CLIP (bouton de la fiche d'édition, `TimelineViewModel.toggleClipMute` —
/// annulable), les ÉCHOS d'un fond qui boucle (`LoopRepeatOverlay`, tuilage
/// inchangé) et le DÉPLACEMENT temporel d'une piste au doigt (même session
/// `beginClipDrag`/`dragClipMoved`/`endClipDrag`, donc même parade
/// anti-dérive). Le déplacement passe par l'ARMEMENT du geste (appui court
/// puis glisser) : le glissement horizontal nu appartient au scroller du
/// plan, et une fois armé le geste est à deux axes — vertical = empilement,
/// horizontal = durée.
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
            // Bornes reprises de `TimelineScrubArea.zoomRange` (5 % – 800 %)
            // pour rester la MÊME plage que l'ancien conteneur — le zoom
            // pilote aussi lequel des deux paliers (`.fit` / `.detail`) le
            // plan dessine, cf. `plan2DRegion`. `TimelineScrubArea` elle-même
            // n'est PAS montée ici : ses gestes (pinch via
            // `MagnificationGesture`, auto-scroll qui suit la tête de
            // lecture pendant la lecture via `proxy.scrollTo`) restent
            // NON restaurés dans ce conteneur — seuls les boutons +/− du
            // transport pilotent le zoom. Régression connue et disclosed
            // (pas d'équivalent construit pour l'instant), pas un oubli.
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

    /// Zoom DEUX PALIERS du plan — piloté par le MÊME état que le transport
    /// (`TransportBar` zoom in/out/reset), pas un second état dupliqué.
    private var plan2DZoom: Plan2DZoom { viewModel.zoomScale > 1 ? .detail : .fit }

    @ViewBuilder
    private var plan2DRegion: some View {
        let tracks = plan2DTracks
        if tracks.isEmpty {
            TimelineEmptyState(isDark: colorScheme == .dark)
                .padding(.vertical, 28)
                .padding(.horizontal, 16)
        } else {
            GeometryReader { proxy in
                let laneWidth = max(0, proxy.size.width - Plan2DView.labelColumnWidth)
                let slideDuration = Double(viewModel.project.slideDuration)
                let zoom = plan2DZoom
                // Conversion PURE qui fait coïncider EXACTEMENT le repère
                // continu de RulerView/PlayheadView avec celui, à deux
                // paliers, que `Plan2DLayout.x` fait autorité sur les
                // barres/losanges du plan — sans elle, règle et barres
                // désynchroniseraient. Calculée UNE fois ici (plutôt que
                // dans un `GeometryReader` séparé, plus bas) pour que
                // `TransitionChromeLane`, hors du scroller horizontal,
                // partage EXACTEMENT le même repère qu'elles — sinon la
                // largeur de ses badges (1,2s fixes) ne représenterait pas
                // la même échelle temporelle que le reste du plan
                // (désynchronisation constatée, corrigée ici).
                let equivalentGeometry = Plan2DView.equivalentGeometry(
                    laneWidth: laneWidth, zoom: zoom, slideDuration: slideDuration)
                VStack(spacing: 0) {
                    // Chrome d'ouverture/fermeture (fondu/zoom/glissement/révélation
                    // configurés par `OpeningEffectChips`, hors timeline) — vivait
                    // hors du scroller horizontal dans l'ancien conteneur, reste
                    // hors de lui ici (même composant, réutilisé tel quel).
                    TransitionChromeLane(
                        openingEffect: viewModel.project.openingEffect,
                        closingEffect: viewModel.project.closingEffect,
                        slideDuration: viewModel.project.slideDuration,
                        geometry: equivalentGeometry,
                        isDark: colorScheme == .dark
                    )
                    ScrollView([.horizontal, .vertical], showsIndicators: true) {
                        VStack(alignment: .leading, spacing: 0) {
                            // Règle graduée + scrub (drag ET tap) — RÉUTILISE
                            // RulerView (geste déjà construit, testé) plutôt
                            // que de réinventer un scrub bespoke : sans elle,
                            // la tête de lecture ne bouge plus que pendant la
                            // lecture, et `addKeyframeAtPlayhead`/
                            // `splitSelectedAtPlayhead` opèrent à t≈0 en
                            // silence (régression constatée, corrigée ici).
                            RulerView(
                                totalDuration: viewModel.project.slideDuration,
                                geometry: equivalentGeometry,
                                isDark: colorScheme == .dark,
                                onTapTime: { viewModel.scrub(to: $0) },
                                onScrubBegan: { viewModel.beginScrub() },
                                onScrubEnded: { viewModel.endScrub() }
                            )
                            .equatable()
                            .frame(width: laneWidth * zoom.scale, alignment: .leading)
                            .padding(.leading, Plan2DView.labelColumnWidth)
                            Plan2DView(
                                tracks: tracks,
                                zoom: zoom,
                                laneWidth: laneWidth,
                                slideDuration: slideDuration,
                                isDark: colorScheme == .dark,
                                // Tap ⇒ ouvre l'Inspector EXISTANT (S4) — la
                                // même intention qu'un double tap sur
                                // l'ancienne barre.
                                onSelectTrack: { viewModel.inspectClip(id: $0) },
                                // Tap sur un losange AFFICHÉ ⇒ MÊME bus de
                                // sélection (`inspectClip` route par id —
                                // clip, keyframe ou transition,
                                // `TimelineInspectorHost.resolveSelectionKind`)
                                // — le losange ouvre son PROPRE
                                // `KeyframeInspector`.
                                onSelectKeyframe: { viewModel.inspectClip(id: $0) },
                                onReorder: { id, index in
                                    Self.applyReorder(id: id, toIndex: index, tracks: tracks, to: viewModel)
                                },
                                onTrimStart: { id, delta in
                                    viewModel.trimClipStart(id: id, deltaTimeSeconds: Float(delta))
                                },
                                onTrimEnd: { id, delta in
                                    viewModel.trimClipEnd(id: id, deltaTimeSeconds: Float(delta))
                                },
                                // Déplacement TEMPOREL au doigt, une fois le
                                // geste armé (le glissement nu appartient au
                                // scroller) : MÊME session de glissement que
                                // l'ancien conteneur — l'origine est capturée
                                // UNE fois par `beginClipDrag`, puis le temps
                                // se reconstruit depuis elle. Relire
                                // `startTime` à chaque frame dériverait
                                // (`applyClipPosition` l'a déjà muté).
                                onMove: { id, seconds in
                                    if viewModel.selection.activeDrag?.clipId != id {
                                        viewModel.beginClipDrag(clipId: id)
                                    }
                                    guard let drag = viewModel.selection.activeDrag else { return }
                                    viewModel.dragClipMoved(
                                        rawTime: drag.originalStartTime + Float(seconds),
                                        snapCandidates: [])
                                },
                                onMoveEnded: { _ in viewModel.endClipDrag() }
                            )
                            // Le playhead publie `currentTime` à 60 Hz pendant
                            // la lecture — sans `.equatable()`, chaque tick
                            // redessinerait le Canvas du plan alors que
                            // tracks/zoom n'ont pas bougé (même pattern que
                            // `VideoClipBar`/`AudioClipBar`/`TextClipBar`
                            // dans l'ancien conteneur mono-piste).
                            .equatable()
                            .overlay(alignment: .topLeading) {
                                transitionJunctionOverlay(tracks: tracks, laneWidth: laneWidth,
                                                          zoom: zoom, slideDuration: slideDuration)
                            }
                            .overlay(alignment: .topLeading) {
                                loopEchoOverlay(tracks: tracks, laneWidth: laneWidth,
                                                zoom: zoom, geometry: equivalentGeometry)
                            }
                        }
                        .overlay(alignment: .topLeading) {
                            playheadOverlay(geometry: equivalentGeometry, slideDuration: slideDuration)
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            }
            .frame(maxHeight: .infinity)
        }
    }

    /// Tête de lecture VISIBLE — même composant que l'ancien conteneur
    /// mono-piste (`PlayheadView`, drag-to-scrub déjà construit), décalée de
    /// `Plan2DView.labelColumnWidth` (même convention que
    /// `TimelineScrubArea.playheadLeadingInset`) pour atterrir exactement sur
    /// l'origine des barres du plan.
    private func playheadOverlay(geometry: TimelineGeometry, slideDuration: Double) -> some View {
        GeometryReader { proxy in
            PlayheadView(
                currentTime: viewModel.currentTime,
                totalDuration: Float(slideDuration),
                geometry: geometry,
                laneHeight: proxy.size.height,
                isDark: colorScheme == .dark,
                onScrub: { viewModel.scrub(to: $0) },
                onScrubBegan: { viewModel.beginScrub() },
                onScrubEnded: { viewModel.endScrub() }
            )
            .offset(x: Plan2DView.labelColumnWidth)
        }
    }

    /// Échos d'un fond qui BOUCLE — composant existant (`LoopRepeatOverlay`,
    /// tuilage déjà testé) reposé sur la rangée du plan qui porte le clip,
    /// avec le repère du plan (`equivalentGeometry`) pour que ses tuiles
    /// tombent sur les mêmes secondes que les barres.
    ///
    /// Teinte PAR PLAN (U15) : un écho appartient toujours au fond, il prend
    /// donc la couleur du fond — jamais la teinte par format
    /// (vert média / orange audio) de l'ancien conteneur, qui aurait
    /// réintroduit dans le plan une sémantique que le plan n'a pas.
    @ViewBuilder
    private func loopEchoOverlay(tracks: [Plan2DTrack], laneWidth: CGFloat,
                                 zoom: Plan2DZoom, geometry: TimelineGeometry) -> some View {
        ForEach(Self.loopEchoes(project: viewModel.project, tracks: tracks)) { echo in
            ZStack(alignment: .topLeading) {
                LoopRepeatOverlay(
                    nativeDuration: echo.nativeDuration,
                    clipStartTime: echo.clipStartTime,
                    slideDuration: viewModel.project.slideDuration,
                    tint: Plan2DView.color(for: .bg, isDark: colorScheme == .dark),
                    geometry: geometry,
                    laneHeight: TimelineMetrics.laneHeight
                )
            }
            .frame(width: laneWidth * zoom.scale, height: TimelineMetrics.laneHeight,
                   alignment: .topLeading)
            .offset(x: Plan2DView.labelColumnWidth,
                    y: CGFloat(echo.rowIndex) * TimelineMetrics.laneHeight)
        }
    }

    /// Jonctions inter-clips (crossfade) — chaque piste du plan porte UN
    /// objet, jamais plusieurs (contrairement à l'ancienne lane par
    /// catégorie) : le badge d'une jonction se pose donc sur la ligne du
    /// clip AVAL (`toClipId`). Nombre de vues borné par le nombre de clips
    /// média (pas par les keyframes) — MÊME pattern que l'ancien
    /// `LaneTransitionOverlays`, budget P15 non concerné (il vise les
    /// losanges, proportionnels aux keyframes, pas les jonctions).
    @ViewBuilder
    private func transitionJunctionOverlay(tracks: [Plan2DTrack], laneWidth: CGFloat,
                                           zoom: Plan2DZoom, slideDuration: Double) -> some View {
        let junctions = TransitionJunctionResolver.resolve(
            project: viewModel.project, slideDuration: Float(slideDuration))
        let frameWidth = Plan2DView.labelColumnWidth + laneWidth * zoom.scale
        ForEach(junctions) { junction in
            if let rowIndex = tracks.firstIndex(where: { $0.id == junction.toClipId }) {
                let anchorX = Plan2DLayout.x(forTime: Double(junction.anchorTime), zoom: zoom,
                                             laneWidth: laneWidth, slideDuration: slideDuration)
                    + Plan2DView.labelColumnWidth
                Group {
                    if let id = junction.existingTransitionId,
                       let kind = junction.existingKind,
                       let duration = junction.existingDuration {
                        TransitionBadge(
                            id: id, kind: kind, duration: duration,
                            isSelected: viewModel.selection.selectedClipId == id,
                            isDark: colorScheme == .dark,
                            anchorX: anchorX, laneHeight: TimelineMetrics.laneHeight,
                            onTap: { viewModel.inspectClip(id: id) },
                            onLongPress: { viewModel.inspectClip(id: id) },
                            // La durée s'édite au TransitionInspector — même
                            // raison que l'ancien conteneur (drag cumulatif
                            // par frame dériverait, pattern snowball).
                            onDurationDelta: { _ in }
                        )
                        .equatable()
                    } else {
                        TransitionCreationBadge(
                            junctionId: junction.id, anchorX: anchorX,
                            laneHeight: TimelineMetrics.laneHeight, isDark: colorScheme == .dark,
                            onCreate: {
                                if let id = viewModel.addTransition(
                                    fromClipId: junction.fromClipId, toClipId: junction.toClipId,
                                    kind: .crossfade, duration: 0.5) {
                                    viewModel.inspectClip(id: id)
                                }
                            }
                        )
                        .equatable()
                    }
                }
                .frame(width: frameWidth, height: TimelineMetrics.laneHeight, alignment: .topLeading)
                .offset(y: CGFloat(rowIndex) * TimelineMetrics.laneHeight)
            }
        }
    }

    // MARK: - Échos de boucle (fond vidéo/audio en boucle)

    /// Une piste de FOND qui boucle, et l'endroit où ses échos se dessinent.
    ///
    /// Un fond court joué en boucle remplit toute la slide à la lecture
    /// (`AVPlayerLooper`, `StoryBackgroundLayer`) : sans écho, sa piste
    /// s'arrête au bout de sa durée native et se lit comme « le fond
    /// disparaît » (retour user 2026-07-17, à l'origine de
    /// `LoopRepeatOverlay`).
    public struct LoopEcho: Equatable, Identifiable {
        public let trackId: String
        public let rowIndex: Int
        public let clipStartTime: Float
        public let nativeDuration: Float

        public var id: String { trackId }

        public init(trackId: String, rowIndex: Int, clipStartTime: Float, nativeDuration: Float) {
            self.trackId = trackId
            self.rowIndex = rowIndex
            self.clipStartTime = clipStartTime
            self.nativeDuration = nativeDuration
        }
    }

    /// Pistes du plan qui réclament des échos de boucle, avec leur rangée.
    /// PURE — la vue ne fait que dessiner ce que ceci calcule.
    static func loopEchoes(project: TimelineProject, tracks: [Plan2DTrack]) -> [LoopEcho] {
        let looping: [(id: String, start: Float, duration: Float?)] =
            project.mediaObjects
                .filter { $0.isBackground && $0.loop }
                .map { ($0.id, Float($0.startTime ?? 0), $0.duration.map { Float($0) }) }
            + project.audioPlayerObjects
                .filter { $0.isBackground == true && $0.loop == true }
                .map { ($0.id, $0.startTime ?? 0, $0.duration) }

        return looping.compactMap { clip in
            guard let row = tracks.firstIndex(where: { $0.id == clip.id }) else { return nil }
            return LoopEcho(
                trackId: clip.id,
                rowIndex: row,
                clipStartTime: clip.start,
                nativeDuration: TimelineGeometry.effectiveClipDuration(
                    startTime: clip.start, duration: clip.duration,
                    slideDuration: project.slideDuration))
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
