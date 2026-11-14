import SwiftUI

/// **La frise du temps** : le temps d'une scène en pistes, une par objet, chacune
/// avec son contenu réel, et la fenêtre d'apparition de chaque objet qu'on y règle.
///
/// - Une règle graduée qui se touche (`onSeek`), une tête de lecture que SEULE
///   sa feuille lit (`PlayheadClock`) : ni les pistes, ni leurs contenus, ni la
///   règle ne se réévaluent quand la tête avance.
/// - Toucher une piste la choisit (`onSelect`) ; glisser sa barre la déplace,
///   tirer ses poignées la règle. L'aperçu est LOCAL, et `onWindowCommit` part
///   UNE fois au lâcher — jamais à l'annulation ni à la disparition doigt posé.
/// - Le bord qui bouge s'aimante (`SnapEngine`) à la tête, aux bords de la scène,
///   aux bords et aux images clés des autres pistes ; pincer zoome le temps
///   autour de la tête, jusqu'à `minimumVisibleSpan`.
/// - Le contenu d'une barre, ses mots et leurs temps sont à l'hôte. Le ton
///   (`\.meeshyGlassTone`) ne teinte que les encres. Aucun verre.
/// - Désactivée (`.disabled`) : contenu à 40 %, ni geste ni haptique.
public struct MeeshyTimelineFrise<Content: View, Transport: View, Empty: View>: View {
    let names: MeeshyTimelineFriseNames
    let tracks: [MeeshyTimelineFriseTrack]
    let rule: MeeshyTimelineFriseRule
    let selectedID: String?
    let clock: PlayheadClock?
    let timeText: (Double, MeeshyTimelineFriseTimeStyle) -> String
    let options: MeeshyTimelineFriseOptions
    let calls: MeeshyTimelineFriseCallbacks
    let content: (MeeshyTimelineFriseTrack) -> Content
    let transport: Transport
    let empty: Empty

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var tone
    @Environment(\.meeshyTimelineFriseForcedHeld) private var forcedHeld
    @Environment(\.meeshyTimelineFriseForcedViewport) private var forcedViewport
    @Environment(\.layoutDirection) private var interfaceDirection
    @State private var held: MeeshyTimelineFriseHeld?
    @State private var viewport: MeeshyTimelineFriseViewport?
    @State private var gestureViewport: MeeshyTimelineFriseViewport?
    @State private var isPinching = false
    @State private var showsFocus = false
    @FocusState private var focus: MeeshyTimelineFriseFocus?

    init(
        names: MeeshyTimelineFriseNames,
        tracks: [MeeshyTimelineFriseTrack],
        rule: MeeshyTimelineFriseRule,
        selectedID: String?,
        clock: PlayheadClock?,
        timeText: @escaping (Double, MeeshyTimelineFriseTimeStyle) -> String,
        options: MeeshyTimelineFriseOptions,
        calls: MeeshyTimelineFriseCallbacks,
        content: @escaping (MeeshyTimelineFriseTrack) -> Content,
        transport: Transport,
        empty: Empty
    ) {
        self.names = names
        self.tracks = tracks
        self.rule = rule
        self.selectedID = selectedID
        self.clock = clock
        self.timeText = timeText
        self.options = options
        self.calls = calls
        self.content = content
        self.transport = transport
        self.empty = empty
    }

    public var body: some View {
        let recipe = currentRecipe
        return VStack(alignment: .leading, spacing: MeeshyTimelineFriseRecipe.topLineGap) {
            topLine(recipe)
            timeArea(recipe)
        }
        .opacity(recipe.contentOpacity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(names.frise))
        .onDisappear(perform: cancelHeld)
    }

    // MARK: - État lu

    private var visible: MeeshyTimelineFriseViewport {
        (viewport ?? forcedViewport ?? .whole(rule.duration)).clamped(to: rule.duration, minimumSpan: options.minimumVisibleSpan)
    }

    private var currentHeld: MeeshyTimelineFriseHeld? {
        guard let held = held ?? forcedHeld, !held.isIgnored else { return nil }
        return held
    }

    private var hasSelection: Bool {
        guard let selectedID else { return false }
        return tracks.contains { $0.id == selectedID }
    }

    private var currentRecipe: MeeshyTimelineFriseRecipe {
        MeeshyTimelineFriseRecipe.resolve(
            tone: tone, isEnabled: isEnabled, held: currentHeld?.part,
            isSnapped: currentHeld?.preview.isSnapped ?? false,
            isZoomed: visible.isZoomed(in: rule.duration), hasSelection: hasSelection
        )
    }

    var interaction: MeeshyTimelineFriseInteraction {
        MeeshyTimelineFriseInteraction(
            rule: rule, selectedID: selectedID, snapping: options.snapping, haptic: options.haptic,
            step: options.step, isEnabled: isEnabled, canEdit: calls.onWindowCommit != nil,
            canSeek: calls.onSeek != nil, canTouchKeyframes: calls.onKeyframe != nil
        )
    }

    private var canZoom: Bool { isEnabled && rule.duration > options.minimumVisibleSpan }

    private var isDark: Bool { colorScheme == .dark }

    private var playheadTime: Double? { clock.map { Double($0.time) } }

    // MARK: - La ligne du haut

    /// L'emplacement `transport` et l'invite muette, en haut à droite tant qu'on
    /// n'a pas zoomé ; ni l'un ni l'autre ⇒ pas de ligne. L'invite cède sa
    /// place avant `transport` quand la police grandit.
    @ViewBuilder
    private func topLine(_ recipe: MeeshyTimelineFriseRecipe) -> some View {
        let hint = recipe.isZoomed || !canZoom ? nil : names.zoomHint
        let hasTransport = Transport.self != EmptyView.self
        if hasTransport || hint != nil {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: MeeshyTimelineFriseRecipe.topLineGap) {
                    transport
                    Spacer(minLength: 0)
                    if let hint {
                        MeeshyTimelineFriseZoomHint(text: hint, recipe: recipe, isDark: isDark).equatable()
                    }
                }
                HStack(spacing: MeeshyTimelineFriseRecipe.topLineGap) {
                    transport
                    Spacer(minLength: 0)
                }
            }
        }
    }

    // MARK: - Règle, pistes, tête

    private func timeArea(_ recipe: MeeshyTimelineFriseRecipe) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ruler(recipe).padding(.leading, MeeshyTimelineFriseRecipe.timeInset)
            rows(recipe)
        }
        .overlay(alignment: .topLeading) { overlays(recipe) }
        .simultaneousGesture(pinch, including: canZoom ? .all : .subviews)
        .accessibilityZoomAction { action in
            guard canZoom else { return }
            zoom(action.direction == .zoomIn ? .zoomIn : .zoomOut)
        }
        .background { followObserver }
        .meeshyAnimation(.easeOut(duration: MeeshyTimelineFriseRecipe.selectionFade), value: selectedID)
        .meeshyAnimation(.easeOut(duration: MeeshyTimelineFriseRecipe.snapFade), value: recipe.isSnapped)
        .meeshyAnimation(settleAnimation, value: tracks.map(\.range))
        .environment(\.layoutDirection, .leftToRight)
    }

    private var settleAnimation: Animation? {
        held == nil && !isPinching ? .easeOut(duration: MeeshyTimelineFriseRecipe.settleDuration) : nil
    }

    private func ruler(_ recipe: MeeshyTimelineFriseRecipe) -> some View {
        MeeshyTimelineFriseRulerStrip(
            viewport: visible, duration: rule.duration, interaction: interaction, recipe: recipe, isDark: isDark,
            names: names, timeText: timeText, clock: clock, focus: $focus, focusVisible: $showsFocus,
            isFrozen: held != nil, play: play, zoom: zoom
        )
        .equatable()
        .accessibilityHidden(calls.onSeek == nil)
    }

    @ViewBuilder
    private func rows(_ recipe: MeeshyTimelineFriseRecipe) -> some View {
        if tracks.isEmpty {
            empty.environment(\.layoutDirection, interfaceDirection)
        } else {
            ForEach(tracks) { track in
                MeeshyTimelineFriseRow(
                    model: rowModel(track, recipe: recipe), names: names, focus: $focus, calls: rowCalls, content: content
                )
                .equatable()
            }
        }
    }

    private func rowModel(_ track: MeeshyTimelineFriseTrack, recipe: MeeshyTimelineFriseRecipe) -> MeeshyTimelineFriseRowModel {
        let held = currentHeld?.trackID == track.id ? currentHeld : nil
        let shown = held?.preview.range ?? track.range
        return MeeshyTimelineFriseRowModel(
            track: track, shown: shown, viewport: visible, recipe: recipe, isSelected: track.id == selectedID,
            isAdjustable: interaction.isAdjustable(track), heldPart: held?.part,
            isFrozen: self.held != nil || isPinching, isEnabled: isEnabled, isDark: isDark,
            canTouchKeyframes: calls.onKeyframe != nil, showsFocus: showsFocus,
            accessibilityValue: spokenValue(track),
            keyframeNames: track.keyframes.map { timeText($0.time, .spoken) }
        )
    }

    /// « début – fin », puis le détail de l'hôte.
    private func spokenValue(_ track: MeeshyTimelineFriseTrack) -> String {
        let window = spoken(track.range)
        guard let detail = track.detail, !detail.isEmpty else { return window }
        return window + ", " + detail
    }

    private func spoken(_ range: ClosedRange<Double>) -> String {
        timeText(range.lowerBound, .spoken) + " – " + timeText(range.upperBound, .spoken)
    }

    /// La ligne et l'étiquette d'accroche, puis la tête, au-dessus de tout et
    /// sans jamais intercepter un toucher.
    private func overlays(_ recipe: MeeshyTimelineFriseRecipe) -> some View {
        GeometryReader { proxy in
            let laneWidth = max(0, proxy.size.width - MeeshyTimelineFriseRecipe.timeInset)
            ZStack(alignment: .topLeading) {
                snapGuide(recipe, laneWidth: laneWidth, height: proxy.size.height)
                playheadLeaf(recipe, laneWidth: laneWidth, height: proxy.size.height)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private func snapGuide(_ recipe: MeeshyTimelineFriseRecipe, laneWidth: CGFloat, height: CGFloat) -> some View {
        if recipe.isSnapped, let time = currentHeld?.preview.snappedTime, visible.isShowing(time) {
            let x = MeeshyTimelineFriseRecipe.timeInset + CGFloat(visible.fraction(time)) * laneWidth
            MeeshyTimelineFriseSnapLine(height: height, recipe: recipe, isDark: isDark)
                .equatable()
                .offset(x: x - MeeshyTimelineFriseRecipe.snapLineWidth / 2)
                .transition(.opacity)
            let text = timeText(time, .snap)
            if !text.isEmpty {
                MeeshyTimelineFriseSnapLabel(text: text, recipe: recipe)
                    .equatable()
                    .alignmentGuide(.leading) { dimensions in
                        dimensions.width / 2 - min(max(x, dimensions.width / 2), MeeshyTimelineFriseRecipe.timeInset + laneWidth - dimensions.width / 2)
                    }
                    .transition(.opacity)
            }
        }
    }

    @ViewBuilder
    private func playheadLeaf(_ recipe: MeeshyTimelineFriseRecipe, laneWidth: CGFloat, height: CGFloat) -> some View {
        if let clock {
            let top = (MeeshyTimelineFriseRecipe.rulerHeight - MeeshyTimelineFriseRecipe.rulerDrawnHeight) / 2
                - MeeshyTimelineFriseRecipe.playheadOverflow
            let shape = MeeshyTimelineFrisePlayheadShape(height: height - top, recipe: recipe)
            let shown = visible
            PlayheadTimeReader(clock: clock) { time in
                let place = shown.fraction(Double(time))
                if place >= 0, place <= 1 {
                    shape.equatable()
                        .offset(x: MeeshyTimelineFriseRecipe.timeInset + CGFloat(place) * laneWidth
                                    - MeeshyTimelineFriseRecipe.playheadCap / 2, y: top)
                }
            }
        }
    }

    /// Zoomée, la page tourne quand la tête sort de la fenêtre — d'un coup,
    /// sans transition. Seul cet observateur sans pixel lit l'horloge pour elle.
    @ViewBuilder
    private var followObserver: some View {
        if let clock, options.followsPlayhead, viewport != nil {
            PlayheadChangeObserver(clock: clock) { time in turnPage(to: Double(time)) }
        }
    }
}

// MARK: - Gestes et effets

extension MeeshyTimelineFrise {
    private var hostCalls: MeeshyTimelineFriseHostCalls {
        MeeshyTimelineFriseHostCalls(
            onSelect: calls.onSelect, onSeek: calls.onSeek, onWindowCommit: calls.onWindowCommit,
            onKeyframe: calls.onKeyframe, onEditingChanged: calls.onEditingChanged,
            announce: { _, range in MeeshyTimelineFriseEffects.post(spoken(range)) }
        )
    }

    func play(_ effects: [MeeshyTimelineFriseEffect]) {
        guard !effects.isEmpty else { return }
        MeeshyTimelineFriseEffects.play(effects, calls: hostCalls)
    }

    private var rowCalls: MeeshyTimelineFriseRowCalls {
        MeeshyTimelineFriseRowCalls(
            tap: { track, time, density in
                touched()
                play(interaction.tap(track, at: time, pointsPerSecond: density))
            },
            dragChanged: dragChanged,
            dragEnded: dragEnded,
            dragReset: dragReset,
            pan: pan,
            panEnded: { gestureViewport = nil },
            activate: { play(interaction.activate($0)) },
            nudge: { track, step in play(interaction.nudge(track, step)) },
            keyframe: { track, key in play([.keyframe(track.id, key.id)]) },
            command: command
        )
    }

    /// Le doigt glisse une barre ou une poignée : un glissé d'abord vertical est
    /// rendu à l'hôte, un pincement l'emporte toujours — et le doigt qui reste
    /// après lui ne devient jamais un glissé —, sinon l'aperçu aimanté.
    private func dragChanged(_ track: MeeshyTimelineFriseTrack, part: MeeshyTimelineFrisePart, translation: CGSize, width: CGFloat) {
        guard interaction.isAdjustable(track) else { return }
        touched()
        if isPinching {
            if held == nil { held = ignoredHold(track, part: part) }
            return
        }
        if let held, held.trackID == track.id, held.isIgnored { return }
        if held?.trackID != track.id {
            guard abs(translation.width) >= abs(translation.height) else {
                held = ignoredHold(track, part: part)
                return
            }
            play(interaction.beginDrag(track, part: part))
        }
        let delta = width > 0 ? Double(translation.width / width) * visible.span : 0
        let step = interaction.drag(
            track, part: part, by: delta,
            candidates: rule.candidates(tracks: tracks, excluding: track.id, playhead: playheadTime),
            tolerance: MeeshyTimelineFriseRule.tolerance(span: visible.span, width: width),
            wasSnapped: held?.preview.isSnapped ?? false
        )
        held = MeeshyTimelineFriseHeld(trackID: track.id, part: part, preview: step.preview, isIgnored: false)
        play(step.effects)
    }

    private func ignoredHold(_ track: MeeshyTimelineFriseTrack, part: MeeshyTimelineFrisePart) -> MeeshyTimelineFriseHeld {
        MeeshyTimelineFriseHeld(trackID: track.id, part: part, preview: .init(range: track.range, snappedTime: nil), isIgnored: true)
    }

    /// Un toucher éteint l'anneau du clavier : il ne se montre qu'au clavier.
    private func touched() {
        if showsFocus { showsFocus = false }
    }

    /// Le doigt se lève : la fenêtre part une fois, au lâcher.
    private func dragEnded(_ track: MeeshyTimelineFriseTrack) {
        guard let current = held, current.trackID == track.id else { return }
        held = nil
        guard !current.isIgnored else { return }
        play(interaction.release(track, part: current.part, preview: current.preview.range))
    }

    /// Le geste est retombé sans lâcher (annulé par le système) : rien n'est
    /// écrit. Lu au tour suivant, après un éventuel `onEnded` du même geste.
    private func dragReset(_ track: MeeshyTimelineFriseTrack) {
        Task { @MainActor in
            guard let current = held, current.trackID == track.id else { return }
            held = nil
            if !current.isIgnored { play(interaction.cancel(current.part)) }
        }
    }

    /// La frise disparaît doigt posé, ou un pincement prend la main.
    private func cancelHeld() {
        guard let current = held else { return }
        held = isPinching ? MeeshyTimelineFriseHeld(
            trackID: current.trackID, part: current.part, preview: current.preview, isIgnored: true
        ) : nil
        if !current.isIgnored { play(interaction.cancel(current.part)) }
    }

    private func pan(_ translation: CGFloat, width: CGFloat) {
        guard viewport != nil, width > 0, held == nil, !isPinching else { return }
        let origin = gestureViewport ?? visible
        gestureViewport = origin
        viewport = origin.panned(by: Double(translation / width), duration: rule.duration, minimumSpan: options.minimumVisibleSpan)
    }

    /// **Pincer zoome autour de la tête**, comme un éditeur vidéo ; revenu à la
    /// durée entière, le zoom s'annule.
    private var pinch: some Gesture {
        MagnificationGesture()
            .onChanged { scale in
                if !isPinching {
                    isPinching = true
                    cancelHeld()
                }
                let origin = gestureViewport ?? visible
                gestureViewport = origin
                viewport = origin.zoomed(
                    by: Double(scale), around: playheadTime ?? (origin.start + origin.span / 2),
                    duration: rule.duration, minimumSpan: options.minimumVisibleSpan
                )
            }
            .onEnded { _ in
                gestureViewport = nil
                isPinching = false
                if let current = viewport, !current.isZoomed(in: rule.duration) { viewport = nil }
            }
    }

    /// `+`, `−`, `0` au clavier, et le zoom du lecteur d'écran.
    func zoom(_ command: MeeshyTimelineFriseCommand) {
        guard canZoom else { return }
        let anchor = playheadTime ?? (visible.start + visible.span / 2)
        let next: MeeshyTimelineFriseViewport
        switch command {
        case .zoomIn: next = visible.zoomed(by: 2, around: anchor, duration: rule.duration, minimumSpan: options.minimumVisibleSpan)
        case .zoomOut: next = visible.zoomed(by: 0.5, around: anchor, duration: rule.duration, minimumSpan: options.minimumVisibleSpan)
        default: next = .whole(rule.duration)
        }
        viewport = next.isZoomed(in: rule.duration) ? next : nil
    }

    private func command(_ track: MeeshyTimelineFriseTrack, part: MeeshyTimelineFrisePart, command: MeeshyTimelineFriseCommand) {
        if !showsFocus { showsFocus = true }
        switch command {
        case .zoomIn, .zoomOut, .zoomReset: zoom(command)
        default: play(interaction.trackCommand(command, on: track, part: part))
        }
    }

    private func turnPage(to time: Double) {
        guard held == nil, !isPinching, let current = viewport, !current.isShowing(time) else { return }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            viewport = current.showing(time, duration: rule.duration, minimumSpan: options.minimumVisibleSpan)
        }
    }
}
