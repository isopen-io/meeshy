import SwiftUI

/// Les rappels d'une rangée vers la frise : la frise tient l'état du geste et
/// joue les effets, la rangée ne fait que dessiner et lire le doigt.
struct MeeshyTimelineFriseRowCalls {
    let tap: (MeeshyTimelineFriseTrack, Double, CGFloat) -> Void
    let dragChanged: (MeeshyTimelineFriseTrack, MeeshyTimelineFrisePart, CGSize, CGFloat) -> Void
    let dragEnded: (MeeshyTimelineFriseTrack) -> Void
    let dragReset: (MeeshyTimelineFriseTrack) -> Void
    let pan: (CGFloat, CGFloat) -> Void
    let panEnded: () -> Void
    let activate: (MeeshyTimelineFriseTrack) -> Void
    let nudge: (MeeshyTimelineFriseTrack, MeeshyTimelineFriseNudge) -> Void
    let keyframe: (MeeshyTimelineFriseTrack, MeeshyTimelineFriseKey) -> Void
    let command: (MeeshyTimelineFriseTrack, MeeshyTimelineFrisePart, MeeshyTimelineFriseCommand) -> Void
}

/// Ce qu'une rangée dessine : sa piste, la fenêtre montrée (l'aperçu local
/// pendant un geste), et ce que la sélection et le geste lui accordent.
struct MeeshyTimelineFriseRowModel {
    let track: MeeshyTimelineFriseTrack
    let shown: ClosedRange<Double>
    let viewport: MeeshyTimelineFriseViewport
    let recipe: MeeshyTimelineFriseRecipe
    let isSelected: Bool
    let isAdjustable: Bool
    let heldPart: MeeshyTimelineFrisePart?
    let isFrozen: Bool
    let isEnabled: Bool
    let isDark: Bool
    let canTouchKeyframes: Bool
    let accessibilityValue: String
    let keyframeNames: [String]
}

/// **Une rangée de 44** : le couloir d'icône, puis le lit de la piste, sa barre
/// au contenu de l'hôte, et — choisie — ses poignées et ses losanges. Un seul
/// élément d'accessibilité, ses six pas nommés.
struct MeeshyTimelineFriseRow<Content: View>: View {
    let model: MeeshyTimelineFriseRowModel
    let names: MeeshyTimelineFriseNames
    let focus: FocusState<MeeshyTimelineFriseFocus?>.Binding
    let calls: MeeshyTimelineFriseRowCalls
    let content: (MeeshyTimelineFriseTrack) -> Content

    @GestureState private var dragging = false

    private var track: MeeshyTimelineFriseTrack { model.track }
    private var recipe: MeeshyTimelineFriseRecipe { model.recipe }
    private var barHeight: CGFloat { MeeshyTimelineFriseRecipe.barHeight(track.height) }

    var body: some View {
        HStack(spacing: MeeshyTimelineFriseRecipe.laneGap) {
            Image(systemName: track.systemImage)
                .font(.system(size: MeeshyTimelineFriseRecipe.iconSize, weight: .semibold))
                .foregroundStyle(recipe.iconColor(isDark: model.isDark))
                .frame(width: MeeshyTimelineFriseRecipe.laneWidth)
                .accessibilityHidden(true)
            GeometryReader { proxy in lane(width: proxy.size.width) }
        }
        .frame(height: MeeshyTimelineFriseRecipe.rowHeight)
        .overlay { focusRing }
        .adaptiveOnChange(of: dragging) { _, isDragging in
            if !isDragging { calls.dragReset(track) }
        }
        .modifier(MeeshyTimelineFriseKeys(target: .track(track.id), isEnabled: model.isEnabled, focus: focus) { command in
            calls.command(track, .move, command)
        })
        .modifier(accessibility)
    }

    private var accessibility: MeeshyTimelineFriseRowAccessibility {
        MeeshyTimelineFriseRowAccessibility(
            name: track.name, value: model.accessibilityValue, isSelected: model.isSelected,
            nudges: model.isAdjustable ? MeeshyTimelineFriseNudge.allCases : [], names: names,
            keyframes: model.isSelected && model.canTouchKeyframes ? Array(zip(track.keyframes, model.keyframeNames)) : [],
            activate: { calls.activate(track) },
            nudge: { calls.nudge(track, $0) },
            keyframe: { calls.keyframe(track, $0) }
        )
    }

    @ViewBuilder
    private var focusRing: some View {
        if focus.wrappedValue == .track(track.id) {
            RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.radius, style: .continuous)
                .stroke(recipe.focusColor(isDark: model.isDark), lineWidth: MeeshyTimelineFriseRecipe.focusRingWidth)
                .allowsHitTesting(false)
        }
    }

    // MARK: - Le lit, la barre, les poignées, les losanges

    private func lane(width: CGFloat) -> some View {
        let start = x(model.shown.lowerBound, width)
        let barWidth = max(MeeshyTimelineFriseRecipe.handleWidth / 2, x(model.shown.upperBound, width) - start)
        return ZStack(alignment: .topLeading) {
            bed(width: width)
            bar(width: barWidth)
                .offset(x: start, y: (MeeshyTimelineFriseRecipe.rowHeight - barHeight) / 2)
                .gesture(drag(.move, width: width))
                .simultaneousGesture(SpatialTapGesture(coordinateSpace: .local).onEnded { touch in
                    calls.tap(track, time(start + touch.location.x, width), pointsPerSecond(width))
                })
            if model.isSelected { keyframes(width: width, barStart: start) }
            if model.isSelected && model.isAdjustable { handles(width: width, start: start, barWidth: barWidth) }
        }
        .frame(width: width, height: MeeshyTimelineFriseRecipe.rowHeight, alignment: .topLeading)
        .mask { Rectangle().padding(.vertical, -MeeshyTimelineFriseRecipe.haloRadius) }
    }

    private func bed(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.radius, style: .continuous)
            .fill(recipe.bedColor(isDark: model.isDark))
            .frame(width: width, height: barHeight)
            .frame(height: MeeshyTimelineFriseRecipe.rowHeight)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: MeeshyTimelineFriseRecipe.panThreshold)
                .onChanged { value in calls.pan(value.translation.width, width) }
                .onEnded { _ in calls.panEnded() })
            .simultaneousGesture(SpatialTapGesture(coordinateSpace: .local).onEnded { touch in
                calls.tap(track, time(touch.location.x, width), pointsPerSecond(width))
            })
    }

    private func bar(width: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyTimelineFriseRecipe.radius, style: .continuous)
        return ZStack {
            MeeshyTimelineFriseBarContent(track: track, isFrozen: model.isFrozen, content: content)
                .equatable()
                .frame(width: width, height: barHeight)
                .clipShape(shape)
            MeeshyTimelineFriseBarChrome(isSelected: model.isSelected, recipe: recipe).equatable()
        }
        .frame(width: width, height: barHeight)
        .opacity(recipe.barOpacity(isSelected: model.isSelected))
        .contentShape(shape)
    }

    @ViewBuilder
    private func keyframes(width: CGFloat, barStart: CGFloat) -> some View {
        let shift = model.shown.lowerBound - track.range.lowerBound
        ForEach(track.keyframes) { key in
            let place = model.viewport.fraction(key.time + shift)
            if place >= 0, place <= 1 {
                MeeshyTimelineFriseKeyMark(recipe: recipe)
                    .equatable()
                    .offset(
                        x: CGFloat(place) * width - MeeshyTimelineFriseRecipe.keyframeSize / 2,
                        y: (MeeshyTimelineFriseRecipe.rowHeight - MeeshyTimelineFriseRecipe.keyframeSize) / 2
                    )
                    .opacity(recipe.keyframeOpacity)
            }
        }
    }

    @ViewBuilder
    private func handles(width: CGFloat, start: CGFloat, barWidth: CGFloat) -> some View {
        let zone = MeeshyTimelineFriseRule.handleZone(barWidth: barWidth)
        handle(.start, width: width, zone: zone)
            .offset(x: start - zone.outside)
        handle(.end, width: width, zone: zone)
            .offset(x: start + barWidth - zone.inside)
    }

    private func handle(_ part: MeeshyTimelineFrisePart, width: CGFloat, zone: (inside: CGFloat, outside: CGFloat)) -> some View {
        let isStart = part == .start
        return MeeshyTimelineFriseHandleShape(
            height: barHeight, recipe: recipe,
            showsFocusRing: focus.wrappedValue == .handle(track.id, part), isDark: model.isDark
        )
        .equatable()
        .padding(isStart ? .leading : .trailing, zone.outside)
        .frame(width: zone.inside + zone.outside, height: MeeshyTimelineFriseRecipe.rowHeight, alignment: isStart ? .leading : .trailing)
        .contentShape(Rectangle())
        .gesture(drag(part, width: width))
        .modifier(MeeshyTimelineFriseKeys(target: .handle(track.id, part), isEnabled: model.isEnabled, focus: focus) { command in
            calls.command(track, part, command)
        })
    }

    // MARK: - Gestes

    private func drag(_ part: MeeshyTimelineFrisePart, width: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: MeeshyTimelineFriseRecipe.dragThreshold, coordinateSpace: .global)
            .updating($dragging) { _, state, _ in state = true }
            .onChanged { value in calls.dragChanged(track, part, value.translation, width) }
            .onEnded { _ in calls.dragEnded(track) }
    }

    private func x(_ seconds: Double, _ width: CGFloat) -> CGFloat {
        CGFloat(model.viewport.fraction(seconds)) * width
    }

    private func time(_ x: CGFloat, _ width: CGFloat) -> Double {
        guard width > 0 else { return model.viewport.start }
        return model.viewport.time(atFraction: Double(x / width))
    }

    private func pointsPerSecond(_ width: CGFloat) -> CGFloat {
        model.viewport.span > 0 ? width / CGFloat(model.viewport.span) : 0
    }
}

/// L'élément unique d'une piste : son nom, sa fenêtre dite, son état choisi,
/// l'activation, les six pas nommés d'une piste réglable, et — sur la piste
/// choisie dont l'hôte écoute les images clés — un pas par losange.
struct MeeshyTimelineFriseRowAccessibility: ViewModifier {
    let name: String
    let value: String
    let isSelected: Bool
    let nudges: [MeeshyTimelineFriseNudge]
    let names: MeeshyTimelineFriseNames
    let keyframes: [(MeeshyTimelineFriseKey, String)]
    let activate: () -> Void
    let nudge: (MeeshyTimelineFriseNudge) -> Void
    let keyframe: (MeeshyTimelineFriseKey) -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(name))
            .accessibilityValue(Text(value))
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction { activate() }
            .accessibilityActions {
                ForEach(nudges, id: \.self) { step in
                    Button(step.name(in: names)) { nudge(step) }
                }
                ForEach(keyframes, id: \.0.id) { pair in
                    Button(pair.1) { keyframe(pair.0) }
                }
            }
    }
}
