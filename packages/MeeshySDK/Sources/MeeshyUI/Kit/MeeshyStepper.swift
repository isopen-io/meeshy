import SwiftUI
import MeeshySDK

/// **Le pas-à-pas (K53)** : une valeur qui avance par crans se règle ou se suit sur une
/// seule échelle discrète. Trois formes, une loi de bornes : des boutons qui comptent
/// (l'appui long accélère), une piste de 2 à 5 arrêts, des jalons en lecture seule.
///
/// Agnostique : un entier, deux bornes, des arrêts et des mots déjà traduits. Le sens
/// d'un cran (rayon en mètres, quota restant, date d'une étape) vient de l'hôte. La
/// valeur ne glisse pas, elle saute d'un cran au suivant ; elle est remise par l'hôte
/// (`onChange` reçoit la valeur déjà bornée) et jamais gardée ici.
public struct MeeshyStepper: View {
    private let value: Int
    private let range: ClosedRange<Int>
    private let label: String
    private let spokenValue: String?
    private let kind: MeeshyStepperKind
    private let size: MeeshyStepperSize
    private let step: Int
    private let stepLadder: [MeeshyStepperRule.Rung]
    private let repeatsOnHold: Bool
    private let stops: [MeeshyStepperStop]
    private let decrementLabel: String
    private let incrementLabel: String
    private let tint: Color?
    private let onChange: (Int) -> Void
    private let onBound: (() -> Void)?

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.locale) private var locale

    public init(value: Int,
                range: ClosedRange<Int> = 0...0,
                label: String,
                spokenValue: String? = nil,
                kind: MeeshyStepperKind = .buttons,
                size: MeeshyStepperSize = .regular,
                step: Int = 1,
                stepLadder: [MeeshyStepperRule.Rung] = [],
                repeatsOnHold: Bool = true,
                stops: [MeeshyStepperStop] = [],
                decrementLabel: String = "",
                incrementLabel: String = "",
                tint: Color? = nil,
                onChange: @escaping (Int) -> Void = { _ in },
                onBound: (() -> Void)? = nil) {
        self.value = value
        self.range = range
        self.label = label
        self.spokenValue = spokenValue
        self.kind = kind
        self.size = size
        self.step = step
        self.stepLadder = stepLadder
        self.repeatsOnHold = repeatsOnHold
        self.stops = stops
        self.decrementLabel = decrementLabel
        self.incrementLabel = incrementLabel
        self.tint = tint
        self.onChange = onChange
        self.onBound = onBound
    }

    private var accent: Color { tint ?? .accentColor }
    private var glassTone: MeeshyGlassTone { colorScheme == .dark ? .deep : .onLight }

    public var body: some View {
        let recipe = MeeshyStepperRecipe.resolve(kind: kind, size: size, value: value, range: range, stopCount: stops.count,
                                                 isPressed: false, isEnabled: isEnabled, layoutDirection: layoutDirection,
                                                 reduceMotion: reduceMotion)
        if recipe.isRendered {
            switch kind {
            case .buttons: buttons(recipe: recipe)
            case .track: track(recipe: recipe)
            case .milestones: milestones(recipe: recipe)
            }
        }
    }

    private func advance(by delta: Int) {
        let amount = MeeshyStepperRule.step(forValue: value, base: step, ladder: stepLadder)
        let result = MeeshyStepperRule.next(value: value, delta: delta, range: range, step: amount)
        if result.hitBound { onBound?() }
        if result.value != value { onChange(result.value) }
    }

    // MARK: - Boutons

    private func buttons(recipe: MeeshyStepperRecipe) -> some View {
        HStack(spacing: recipe.capsuleGap) {
            disc(systemImage: "minus", label: decrementLabel, delta: -1, opacity: recipe.minusOpacity, recipe: recipe, isGlass: false)
            Text(verbatim: MeeshyCircleScaleRecipe.countText(value, locale: locale))
                .meeshyScaledFont(recipe.valueSize, weight: .heavy)
                .monospacedDigit()
                .frame(minWidth: recipe.valueMinWidth)
                .accessibilityLabel(label)
                .accessibilityValue(MeeshyStepperWords.spokenValue(spoken: spokenValue, value: value, stopTitle: nil, locale: locale))
            disc(systemImage: "plus", label: incrementLabel, delta: 1, opacity: recipe.plusOpacity, recipe: recipe, isGlass: true)
        }
        .padding(recipe.capsuleInset)
        .frame(minHeight: recipe.capsuleHeight)
        .background(Capsule().fill(Color.secondary.opacity(MeeshyOpacity.subtle)))
        .overlay(Capsule().stroke(Color.secondary.opacity(MeeshyOpacity.light), lineWidth: 1))
    }

    @ViewBuilder
    private func disc(systemImage: String, label: String, delta: Int, opacity: Double,
                      recipe: MeeshyStepperRecipe, isGlass: Bool) -> some View {
        let diameter = CGFloat(recipe.discDiameter)
        let face = Image(systemName: systemImage)
            .meeshyScaledFont(diameter * 0.4, weight: .bold)
            .foregroundStyle(isGlass ? Color.primary : Color.secondary)
            .frame(width: diameter, height: diameter)
        Group {
            if isGlass {
                face.meeshyGlass(in: Circle(), tone: glassTone, isInteractive: true)
            } else {
                face.background(Circle().fill(Color.secondary.opacity(MeeshyOpacity.light)))
            }
        }
        .frame(minWidth: CGFloat(recipe.tapTarget), minHeight: CGFloat(recipe.tapTarget))
        .contentShape(Circle())
        .opacity(opacity)
        .modifier(MeeshyStepperHold(isActive: recipe.acceptsGesture && opacity == 1, repeats: repeatsOnHold,
                                    onStep: { advance(by: delta) }))
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(label)
        .accessibilityAction { if recipe.acceptsGesture { advance(by: delta) } }
    }

    // MARK: - Piste

    private func track(recipe: MeeshyStepperRecipe) -> some View {
        VStack(spacing: 0) {
            ZStack(alignment: .top) {
                GeometryReader { proxy in
                    let inset = proxy.size.width / CGFloat(stops.count) / 2
                    let length = max(proxy.size.width - inset * 2, 0)
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.secondary.opacity(MeeshyOpacity.light))
                        Capsule().fill(LinearGradient(colors: [Color.secondary.opacity(MeeshyOpacity.light), accent],
                                                      startPoint: .leading, endPoint: .trailing))
                            .frame(width: length * CGFloat(recipe.fillFraction))
                    }
                    .frame(width: length, height: CGFloat(recipe.trackHeight))
                    .padding(.leading, inset)
                    .offset(y: CGFloat(recipe.markCellSize) / 2 - CGFloat(recipe.trackHeight) / 2)
                }
                .frame(height: CGFloat(recipe.markCellSize))
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
                        mark(index: index, stop: stop, recipe: recipe)
                    }
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func mark(index: Int, stop: MeeshyStepperStop, recipe: MeeshyStepperRecipe) -> some View {
        let isSelected = index == recipe.selectedIndex
        let diameter = MeeshyStepperRecipe.markDiameter(requested: stop.markSize)
        return Button {
            if recipe.acceptsGesture, index != value { onChange(index) }
        } label: {
            VStack(spacing: recipe.markLabelGap) {
                ZStack {
                    Circle().fill(isSelected ? accent.opacity(MeeshyOpacity.light) : Color.secondary.opacity(MeeshyOpacity.light))
                    Circle().stroke(isSelected ? accent : Color.secondary.opacity(MeeshyOpacity.medium), lineWidth: isSelected ? 2 : 1)
                }
                .frame(width: CGFloat(diameter), height: CGFloat(diameter))
                .frame(height: CGFloat(recipe.markCellSize))
                Text(verbatim: stop.title)
                    .meeshyScaledFont(13.5, weight: isSelected ? .heavy : .semibold)
                    .foregroundStyle(isSelected ? Color.primary : Color.secondary)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(stop.title)
        .accessibilityValue(MeeshyStepperWords.stopPosition(index: index, of: stops.count, locale: locale))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    // MARK: - Jalons

    private func milestones(recipe: MeeshyStepperRecipe) -> some View {
        let diameter = CGFloat(recipe.discDiameter)
        return ZStack(alignment: .top) {
            GeometryReader { proxy in
                let inset = proxy.size.width / CGFloat(stops.count) / 2
                let length = max(proxy.size.width - inset * 2, 0)
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.secondary.opacity(MeeshyOpacity.light))
                    Capsule().fill(accent).frame(width: length * CGFloat(recipe.fillFraction))
                }
                .frame(width: length, height: CGFloat(recipe.milestoneTraceHeight))
                .padding(.leading, inset)
                .offset(y: CGFloat(recipe.milestoneTraceInset))
            }
            .frame(height: diameter)
            HStack(alignment: .top, spacing: 0) {
                ForEach(Array(stops.enumerated()), id: \.element.id) { index, stop in
                    milestone(index: index, stop: stop, recipe: recipe, diameter: diameter)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private func milestone(index: Int, stop: MeeshyStepperStop, recipe: MeeshyStepperRecipe, diameter: CGFloat) -> some View {
        let state = MeeshyStepperMilestoneState.state(index: index, current: recipe.selectedIndex)
        let isCurrent = state == .current
        return VStack(spacing: MeeshySpacing.xs) {
            Image(systemName: stop.systemImage ?? "circle.fill")
                .meeshyScaledFont(diameter * 0.5)
                .foregroundStyle(isCurrent ? MeeshyColors.indigo950 : (state == .done ? accent : Color.secondary))
                .frame(width: diameter, height: diameter)
                .background(Circle().fill(isCurrent ? accent : Color.secondary.opacity(MeeshyOpacity.subtle)))
                .overlay(Circle().stroke(state == .todo ? Color.secondary.opacity(MeeshyOpacity.medium) : accent, lineWidth: 1.5))
            Text(verbatim: stop.title)
                .meeshyScaledFont(MeeshyFont.smallSize, weight: .bold)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            if let caption = stop.caption {
                Text(verbatim: caption)
                    .meeshyScaledFont(MeeshyFont.footnoteSize)
                    .foregroundStyle(Color.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(stop.title)
        .accessibilityValue(MeeshyStepperWords.milestoneState(state, locale: locale))
    }
}

/// L'appui d'un bouton qui compte : un pas au toucher, puis, tenu, la cadence accélère
/// jusqu'à un plancher. Aucun pas de plus au relâcher d'un appui long.
///
/// La cadence n'appelle jamais `onStep` elle-même : elle avance `ticks`, et la vue
/// relit `onStep` à chaque battement. La fermeture capturée au doigt posé figerait la
/// valeur de départ, et chaque pas repartirait d'elle. Le geste annulé (`isTouching`
/// rendu à faux sans relâcher), la butée (`isActive` éteint) et le départ de la vue
/// arrêtent la cadence.
struct MeeshyStepperHold: ViewModifier {
    let isActive: Bool
    let repeats: Bool
    let onStep: () -> Void

    @State private var law = MeeshyStepperHoldLaw()
    @State private var holdTask: Task<Void, Never>?
    @State private var ticks = 0
    @GestureState private var isTouching = false

    func body(content: Content) -> some View {
        content.gesture(
            DragGesture(minimumDistance: 0)
                .updating($isTouching) { _, touching, _ in touching = true }
                .onChanged { _ in begin() }
                .onEnded { _ in end() }
        )
        .adaptiveOnChange(of: ticks) { _, _ in
            if law.repeatTick(isActive: isActive) { onStep() } else { stopCadence() }
        }
        .adaptiveOnChange(of: isTouching) { _, touching in if !touching { cancel() } }
        .adaptiveOnChange(of: isActive) { _, active in if !active { cancel() } }
        .onDisappear { cancel() }
    }

    private func begin() {
        guard law.press(isActive: isActive), repeats else { return }
        holdTask = Task { @MainActor in
            var tick = 0
            while !Task.isCancelled {
                do { try await Task.sleep(for: .milliseconds(MeeshyStepperRecipe.holdDelayMilliseconds(tick: tick))) } catch { return }
                guard !Task.isCancelled else { return }
                ticks &+= 1
                tick += 1
            }
        }
    }

    private func end() {
        stopCadence()
        if law.release(isActive: isActive) { onStep() }
    }

    private func cancel() {
        stopCadence()
        law.cancel()
    }

    private func stopCadence() {
        holdTask?.cancel()
        holdTask = nil
    }
}
