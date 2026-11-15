import SwiftUI

/// **La règle qui se touche** : 44 de haut autour de ses 18 dessinés. Toucher
/// ou glisser y pose la tête (`onSeek`, au plus une fois par instant), entre une
/// paire `editing(.playhead, true / false)`. Elle tient son propre geste : la
/// frise ne se réévalue pas pendant qu'un doigt la promène. Sans `onSeek`, elle
/// est dessinée, inerte et absente de l'arbre d'accessibilité. `Equatable`
/// pendant le glissé d'une barre : la règle ne se re-rend pas à chaque image.
struct MeeshyTimelineFriseRulerStrip: View, Equatable {
    let viewport: MeeshyTimelineFriseViewport
    let duration: Double
    let interaction: MeeshyTimelineFriseInteraction
    let recipe: MeeshyTimelineFriseRecipe
    let isDark: Bool
    let names: MeeshyTimelineFriseNames
    let timeText: (Double, MeeshyTimelineFriseTimeStyle) -> String
    let clock: PlayheadClock?
    let focus: FocusState<MeeshyTimelineFriseFocus?>.Binding
    let focusVisible: Binding<Bool>
    let isFrozen: Bool
    let play: ([MeeshyTimelineFriseEffect]) -> Void
    let zoom: (MeeshyTimelineFriseCommand) -> Void

    @ScaledMetric(relativeTo: .caption2) private var labelSize: CGFloat = MeeshyFont.captionSize
    @State private var scrubbed: Double?
    @State private var lastSought: Double = 0
    @GestureState private var isScrubbing = false

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.isFrozen && rhs.isFrozen && lhs.clock === rhs.clock && lhs.viewport == rhs.viewport
            && lhs.duration == rhs.duration && lhs.interaction == rhs.interaction && lhs.recipe == rhs.recipe
            && lhs.isDark == rhs.isDark && lhs.names == rhs.names
    }

    var body: some View {
        GeometryReader { proxy in
            canvas(width: proxy.size.width)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                .contentShape(Rectangle())
                .gesture(scrub(width: proxy.size.width), including: interaction.canSeek ? .all : .subviews)
        }
        .frame(height: MeeshyTimelineFriseRecipe.rulerHeight)
        .overlay { accessibilityLeaf }
        .overlay { focusRing }
        .modifier(MeeshyTimelineFriseKeys(target: .ruler, isEnabled: interaction.isEnabled && interaction.canSeek, focus: focus) { command in
            if !focusVisible.wrappedValue { focusVisible.wrappedValue = true }
            if command == .zoomIn || command == .zoomOut || command == .zoomReset {
                zoom(command)
            } else {
                play(interaction.playheadCommand(command, current: current))
            }
        })
        .adaptiveOnChange(of: isScrubbing) { _, active in
            if !active { finish() }
        }
        .onDisappear(perform: finish)
    }

    private func canvas(width: CGFloat) -> some View {
        let widest = MeeshyTimelineFriseRuler.estimatedLabelWidth(
            characters: timeText(viewport.end, .ruler).count, fontSize: labelSize
        )
        let ticks = MeeshyTimelineFriseRuler.ticks(
            in: viewport, width: width, labelGap: MeeshyTimelineFriseRuler.labelGap(widestLabel: widest)
        )
        return MeeshyTimelineFriseRulerCanvas(
            ticks: ticks,
            labels: ticks.map { $0.isMajor ? timeText($0.time, .ruler) : nil },
            viewport: viewport, duration: duration, labelSize: labelSize, recipe: recipe, isDark: isDark
        )
        .equatable()
    }

    @ViewBuilder
    private var accessibilityLeaf: some View {
        if interaction.canSeek {
            if let clock {
                PlayheadTimeReader(clock: clock) { time in adjustable(at: Double(time)) }
            } else {
                adjustable(at: lastSought)
            }
        }
    }

    private func adjustable(at time: Double) -> some View {
        Color.clear
            .allowsHitTesting(false)
            .accessibilityElement()
            .accessibilityLabel(Text(names.playhead))
            .accessibilityValue(Text(timeText(time, .spoken)))
            .accessibilityAdjustableAction { direction in
                let step = direction == .increment ? interaction.step : -interaction.step
                play(interaction.adjustPlayhead(from: time, to: time + step))
            }
    }

    @ViewBuilder
    private var focusRing: some View {
        if focusVisible.wrappedValue && focus.wrappedValue == .ruler {
            RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.radius, style: .continuous)
                .stroke(recipe.focusColor(isDark: isDark), lineWidth: MeeshyTimelineFriseRecipe.focusRingWidth)
                .allowsHitTesting(false)
        }
    }

    private var current: Double {
        clock.map { Double($0.time) } ?? lastSought
    }

    private func scrub(width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .updating($isScrubbing) { _, state, _ in state = true }
            .onChanged { value in
                guard width > 0 else { return }
                if focusVisible.wrappedValue { focusVisible.wrappedValue = false }
                let time = viewport.time(atFraction: Double(value.location.x / width))
                let step = MeeshyTimelineFriseRuler.majorStep(span: viewport.span, width: width)
                let effects = interaction.scrub(to: time, previous: scrubbed, majorStep: step)
                for case .seek(let sought) in effects {
                    scrubbed = sought
                    lastSought = sought
                }
                play(effects)
            }
            .onEnded { _ in finish() }
    }

    /// Le doigt se lève, le geste est annulé ou la règle disparaît : `(.playhead, false)`, une fois.
    private func finish() {
        let wasScrubbing = scrubbed != nil
        scrubbed = nil
        play(interaction.endScrub(wasScrubbing: wasScrubbing))
    }
}
