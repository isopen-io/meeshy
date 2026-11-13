import SwiftUI

/// **La piste de coupe** : désigne sur UNE piste, qui montre la source entière, la
/// plage qu'on garde. Deux poignées HORS de la plage (leur bord intérieur est la
/// borne), les zones écartées voilées, une tête de lecture, le début, la durée
/// gardée et la fin lisibles dessous.
///
/// - Le contenu (onde, vignettes) est celui de l'hôte, rogné à la piste sur un lit
///   sombre ; les textes aussi : la piste ne formate rien. Le ton (`\.meeshyGlassTone`)
///   ne teinte que le relevé.
/// - Glisser une poignée la suit dans la même image ; en butée elle s'arrête, elle
///   ne traverse ni ne pousse l'autre. Un appui long de 0,4 s ouvre la loupe de
///   précision. Toucher la piste y pose la tête (`onSeek`) ; un glissé vertical
///   reste à l'hôte.
/// - `onEditingChanged(part, true)` au début d'un geste ; `(part, false)` au lever,
///   à l'annulation, à la disparition doigt posé, et autour de chaque ajustement au
///   clavier ou au lecteur d'écran : l'hôte en fait UN pas d'annulation.
/// - Désactivée (`.disabled`) : contenu à 40 %, ni geste ni haptique.
public struct MeeshyTrimTrack<Content: View>: View {
    let names: MeeshyTrimTrackNames
    @Binding var range: ClosedRange<Double>
    let rule: MeeshyTrimTrackRule
    let timeText: (Double, MeeshyTrimTrackTimeStyle) -> String
    let keptText: String?
    let playhead: Double?
    let onSeek: ((Double) -> Void)?
    let selection: MeeshyTrimTrackSelection
    let height: MeeshyTrimTrackHeight
    let precision: MeeshyTrimTrackPrecision
    let step: Double
    let haptic: MeeshyTrimTrackHaptic
    let onEditingChanged: ((MeeshyTrimTrackPart, Bool) -> Void)?
    let content: Content

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.meeshyGlassTone) private var tone
    @Environment(\.meeshyTrimTrackForcesHeld) private var forcedHeld
    @Environment(\.meeshyTrimTrackForcesPrecise) private var forcesPrecise
    @State private var origin: Double?
    @State private var headOrigin: Double?
    @State private var editingPart: MeeshyTrimTrackPart?
    @State private var atStop = false
    @State private var ignoresDrag = false
    @State private var hoveredPart: MeeshyTrimTrackPart?
    @GestureState private var gesturePart: MeeshyTrimTrackPart?
    @GestureState private var preciseHeld: MeeshyTrimTrackPart?
    @FocusState private var focus: MeeshyTrimTrackPart?

    public init(
        _ names: MeeshyTrimTrackNames,
        range: Binding<ClosedRange<Double>>,
        duration: Double,
        minimumSpan: Double,
        maximumSpan: Double? = nil,
        timeText: @escaping (Double, MeeshyTrimTrackTimeStyle) -> String,
        keptText: String? = nil,
        playhead: Double? = nil,
        onSeek: ((Double) -> Void)? = nil,
        selection: MeeshyTrimTrackSelection = .kept,
        height: MeeshyTrimTrackHeight = .regular,
        precision: MeeshyTrimTrackPrecision = .loupe,
        step: Double = 0.1,
        haptic: MeeshyTrimTrackHaptic = .standard,
        onEditingChanged: ((MeeshyTrimTrackPart, Bool) -> Void)? = nil,
        @ViewBuilder content: () -> Content
    ) {
        assert(minimumSpan > 0, "MeeshyTrimTrack : la durée minimale est obligatoire et positive")
        self.names = names
        _range = range
        self.rule = MeeshyTrimTrackRule(duration: duration, minimumSpan: minimumSpan, maximumSpan: maximumSpan)
        self.timeText = timeText
        self.keptText = keptText
        self.playhead = playhead
        self.onSeek = onSeek
        self.selection = selection
        self.height = height
        self.precision = precision
        self.step = step
        self.haptic = haptic
        self.onEditingChanged = onEditingChanged
        self.content = content()
    }

    public var body: some View {
        let recipe = currentRecipe
        return VStack(alignment: .leading, spacing: MeeshyTrimTrackRecipe.readoutGap) {
            GeometryReader { proxy in stage(width: proxy.size.width, recipe: recipe) }
                .frame(height: MeeshyTrimTrackRecipe.height(height))
                .overlay(alignment: .top) { preciseCapsule(recipe) }
            readout(recipe)
        }
        .environment(\.layoutDirection, .leftToRight)
        .opacity(recipe.contentOpacity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(names.track))
        .accessibilityValue(Text(timeText(range.upperBound - range.lowerBound, .spoken)))
        .adaptiveOnChange(of: gesturePart ?? preciseHeld) { _, held in
            if held == nil { finish() }
        }
        .onDisappear(perform: finish)
    }

    private var interaction: MeeshyTrimTrackInteraction {
        MeeshyTrimTrackInteraction(
            rule: rule, selection: selection, haptic: haptic, step: step, isEnabled: isEnabled, canSeek: onSeek != nil
        )
    }

    private var currentRecipe: MeeshyTrimTrackRecipe {
        MeeshyTrimTrackRecipe.resolve(
            tone: tone, selection: selection, isEnabled: isEnabled,
            held: forcedHeld ?? gesturePart ?? preciseHeld,
            isPrecise: preciseHeld != nil || forcesPrecise
        )
    }

    private var settleAnimation: Animation? {
        gesturePart == nil && preciseHeld == nil ? .easeOut(duration: MeeshyTrimTrackRecipe.settleDuration) : nil
    }

    private func time(of part: MeeshyTrimTrackPart) -> Double {
        part == .start ? range.lowerBound : range.upperBound
    }

    // MARK: - Piste

    private func stage(width: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        let geometry = MeeshyTrimTrackGeometry(totalWidth: width, inset: MeeshyTrimTrackRecipe.handleWidth, duration: rule.duration)
        let stageHeight = MeeshyTrimTrackRecipe.height(height)
        return ZStack(alignment: .topLeading) {
            bed(geometry, height: stageHeight, recipe: recipe)
            veil(geometry, height: stageHeight, recipe: recipe)
            headLayer(geometry, height: stageHeight, recipe: recipe)
            handles(geometry, height: stageHeight, recipe: recipe)
            loupe(geometry, height: stageHeight, recipe: recipe)
        }
        .frame(width: width, height: stageHeight, alignment: .topLeading)
        .meeshyAnimation(settleAnimation, value: range)
    }

    /// Le lit sombre et le contenu de l'hôte, rognés à la piste ; toucher y pose la tête.
    private func bed(_ geometry: MeeshyTrimTrackGeometry, height stageHeight: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        let surface = ZStack {
            recipe.bedColor
            content
                .frame(width: geometry.width, height: stageHeight)
                .clipped()
                .accessibilityHidden(true)
        }
        .frame(width: geometry.width, height: stageHeight)
        .offset(x: geometry.inset)
        .frame(width: geometry.inset * 2 + geometry.width, height: stageHeight, alignment: .topLeading)
        .contentShape(Rectangle())
        return seekable(surface, geometry: geometry)
    }

    @ViewBuilder
    private func seekable<Surface: View>(_ view: Surface, geometry: MeeshyTrimTrackGeometry) -> some View {
        if onSeek == nil {
            view
        } else {
            view.gesture(tapGesture(geometry))
        }
    }

    @ViewBuilder
    private func veil(_ geometry: MeeshyTrimTrackGeometry, height stageHeight: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        if rule.canTrim {
            MeeshyTrimTrackVeilLayer(geometry: geometry, range: range, height: stageHeight, recipe: recipe).equatable()
        }
    }

    @ViewBuilder
    private func headLayer(_ geometry: MeeshyTrimTrackGeometry, height stageHeight: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        if let playhead {
            let shown = onSeek == nil ? playhead : rule.playhead(playhead, in: range, selection: selection)
            headElement(MeeshyTrimTrackHeadShape(height: stageHeight, recipe: recipe).equatable(), time: shown, geometry: geometry)
                .offset(x: geometry.x(for: shown) - MeeshyTrimTrackRecipe.hitWidth / 2)
        }
    }

    @ViewBuilder
    private func headElement<Face: View>(_ shape: Face, time shown: Double, geometry: MeeshyTrimTrackGeometry) -> some View {
        if onSeek == nil {
            shape.allowsHitTesting(false).accessibilityHidden(true)
        } else {
            shape
                .gesture(playheadGesture(geometry))
                .simultaneousGesture(playheadTap(geometry, current: shown))
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(names.playhead))
                .accessibilityValue(Text(timeText(shown, .spoken)))
                .accessibilityAdjustableAction { direction in
                    play(interaction.accessibilityAdjust(.playhead, up: direction == .increment, range: range, playhead: shown))
                }
                .accessibilitySortPriority(2)
                .modifier(MeeshyTrimTrackKeys(part: .playhead, isEnabled: isEnabled, focus: $focus) { command in
                    play(interaction.perform(command, on: .playhead, range: range, playhead: shown))
                })
        }
    }

    @ViewBuilder
    private func handles(_ geometry: MeeshyTrimTrackGeometry, height stageHeight: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        if rule.canTrim {
            handle(.start, geometry: geometry, height: stageHeight, recipe: recipe)
            handle(.end, geometry: geometry, height: stageHeight, recipe: recipe)
        }
    }

    private func handle(
        _ part: MeeshyTrimTrackPart,
        geometry: MeeshyTrimTrackGeometry,
        height stageHeight: CGFloat,
        recipe: MeeshyTrimTrackRecipe
    ) -> some View {
        let isStart = part == .start
        let edge = recipe.isPrecise && recipe.heldPart == part ? geometry.inset + geometry.width / 2 : geometry.x(for: time(of: part))
        let centre = isStart ? edge - MeeshyTrimTrackRecipe.handleWidth / 2 : edge + MeeshyTrimTrackRecipe.handleWidth / 2
        return handleGestures(
            MeeshyTrimTrackHandleShape(
                part: part, height: stageHeight, gripHeight: recipe.gripHeight(of: part, isHovered: hoveredPart == part),
                recipe: recipe, showsFocusRing: focus == part && isEnabled
            ).equatable(),
            part: part, geometry: geometry
        )
        .offset(x: centre - MeeshyTrimTrackRecipe.hitWidth / 2)
        .onHover { hoveredPart = $0 ? part : nil }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(isStart ? names.start : names.end))
        .accessibilityValue(Text(timeText(time(of: part), .spoken)))
        .accessibilityHint(Text(precision == .loupe ? names.precisionHint : ""))
        .accessibilityAdjustableAction { direction in
            play(interaction.accessibilityAdjust(part, up: direction == .increment, range: range, playhead: playhead ?? range.lowerBound))
        }
        .accessibilitySortPriority(isStart ? 3 : 1)
        .modifier(MeeshyTrimTrackKeys(part: part, isEnabled: isEnabled, focus: $focus) { command in
            play(interaction.perform(command, on: part, range: range, playhead: playhead ?? range.lowerBound))
        })
    }

    @ViewBuilder
    private func handleGestures<Face: View>(_ shape: Face, part: MeeshyTrimTrackPart, geometry: MeeshyTrimTrackGeometry) -> some View {
        if precision == .loupe {
            shape.gesture(preciseGesture(part, geometry).exclusively(before: coarseGesture(part, geometry)))
        } else {
            shape.gesture(coarseGesture(part, geometry))
        }
    }

    @ViewBuilder
    private func loupe(_ geometry: MeeshyTrimTrackGeometry, height stageHeight: CGFloat, recipe: MeeshyTrimTrackRecipe) -> some View {
        if recipe.isPrecise, let part = recipe.heldPart {
            MeeshyTrimTrackLoupeLayer(
                anchor: time(of: part), width: geometry.width, height: stageHeight,
                scale: rule.preciseScale(pointsPerSecond: geometry.pointsPerSecond), duration: rule.duration, recipe: recipe
            )
            .equatable()
            .offset(x: geometry.inset)
            .transition(.opacity)
        }
    }

    // MARK: - Dessus et dessous

    @ViewBuilder
    private func preciseCapsule(_ recipe: MeeshyTrimTrackRecipe) -> some View {
        if recipe.isPrecise, let part = recipe.heldPart {
            MeeshyTrimTrackPreciseCapsule(text: timeText(time(of: part), .precise), recipe: recipe)
                .equatable()
                .alignmentGuide(.top) { $0[.bottom] + MeeshySpacing.xs }
        }
    }

    @ViewBuilder
    private func readout(_ recipe: MeeshyTrimTrackRecipe) -> some View {
        if let keptText {
            MeeshyTrimTrackReadout(
                start: timeText(range.lowerBound, .clock), kept: keptText, end: timeText(range.upperBound, .clock),
                recipe: recipe, isDark: colorScheme == .dark
            )
            .equatable()
        }
    }

    // MARK: - Gestes

    private func coarseGesture(_ part: MeeshyTrimTrackPart, _ geometry: MeeshyTrimTrackGeometry) -> some Gesture {
        DragGesture(minimumDistance: MeeshyTrimTrackRecipe.dragThreshold, coordinateSpace: .global)
            .updating($gesturePart) { _, state, _ in state = part }
            .onChanged { value in
                if editingPart == nil, !ignoresDrag, abs(value.translation.height) > abs(value.translation.width) {
                    ignoresDrag = true
                }
                guard !ignoresDrag, geometry.pointsPerSecond > 0 else { return }
                let from = origin ?? time(of: part)
                origin = from
                follow(part, requested: from + Double(value.translation.width / geometry.pointsPerSecond))
            }
    }

    /// L'appui long ouvre la précision : le doigt AMÈNE l'instant sous un trait fixe, on ne le vise pas.
    private func preciseGesture(_ part: MeeshyTrimTrackPart, _ geometry: MeeshyTrimTrackGeometry) -> some Gesture {
        LongPressGesture(minimumDuration: MeeshyTrimTrackRecipe.holdDuration, maximumDistance: MeeshyTrimTrackRecipe.holdSlop)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .global))
            .updating($preciseHeld) { value, state, _ in
                guard case .second(true, _) = value else { return }
                state = part
            }
            .onChanged { value in
                guard case .second(true, let drag) = value, geometry.pointsPerSecond > 0 else { return }
                if origin == nil {
                    origin = time(of: part)
                    let effects = interaction.beginPrecision(part, isEditing: editingPart != nil)
                    if effects.contains(.editing(part, true)) { editingPart = part }
                    play(effects)
                }
                let scale = rule.preciseScale(pointsPerSecond: geometry.pointsPerSecond)
                follow(part, requested: rule.preciseTime(
                    anchor: origin ?? time(of: part), translation: drag?.translation.width ?? 0, pointsPerSecond: scale
                ))
            }
    }

    private func playheadGesture(_ geometry: MeeshyTrimTrackGeometry) -> some Gesture {
        DragGesture(minimumDistance: MeeshyTrimTrackRecipe.dragThreshold, coordinateSpace: .global)
            .updating($gesturePart) { _, state, _ in state = .playhead }
            .onChanged { value in
                guard geometry.pointsPerSecond > 0, let current = playhead else { return }
                let from = headOrigin ?? current
                headOrigin = from
                let effects = interaction.dragPlayhead(
                    to: from + Double(value.translation.width / geometry.pointsPerSecond),
                    range: range, current: current, isEditing: editingPart == .playhead
                )
                if effects.contains(.editing(.playhead, true)) { editingPart = .playhead }
                play(effects)
            }
    }

    private func playheadTap(_ geometry: MeeshyTrimTrackGeometry, current: Double) -> some Gesture {
        SpatialTapGesture(coordinateSpace: .local).onEnded { touch in
            guard geometry.pointsPerSecond > 0 else { return }
            let offset = Double((touch.location.x - MeeshyTrimTrackRecipe.hitWidth / 2) / geometry.pointsPerSecond)
            play(interaction.tap(at: current + offset, range: range))
        }
    }

    private func tapGesture(_ geometry: MeeshyTrimTrackGeometry) -> some Gesture {
        SpatialTapGesture(coordinateSpace: .local).onEnded { touch in
            play(interaction.tap(at: geometry.time(atX: touch.location.x), range: range))
        }
    }

    // MARK: - Effets

    private func follow(_ part: MeeshyTrimTrackPart, requested: Double) {
        let result = interaction.drag(part, to: requested, range: range, isEditing: editingPart != nil, wasAtStop: atStop)
        if result.effects.contains(.editing(part, true)) { editingPart = part }
        atStop = result.isAtStop
        play(result.effects)
    }

    /// Le doigt se lève, le geste est annulé ou la piste disparaît doigt posé : `(part, false)`, une fois.
    private func finish() {
        ignoresDrag = false
        origin = nil
        headOrigin = nil
        atStop = false
        guard let part = editingPart else { return }
        editingPart = nil
        play(interaction.release(part, isEditing: true))
    }

    private func play(_ effects: [MeeshyTrimTrackEffect]) {
        MeeshyTrimTrackEffects.play(effects, range: $range, onSeek: onSeek, onEditingChanged: onEditingChanged)
    }
}
