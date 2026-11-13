import SwiftUI

// MARK: - Les VALEURS d'une cellule

/// Ce que la rangée sait faire, constant d'un rendu à l'autre : les rappels
/// présents de l'hôte. Ils changent rarement, et ne redessinent alors que ce
/// qu'ils rendent possible.
nonisolated struct MeeshyThumbnailCapabilities: Equatable, Sendable {
    let canSelect: Bool
    let canDuplicate: Bool
    let canMove: Bool
    let canRemove: Bool
}

/// Ce que `==` compare : tout ce qui change ce que la vignette DESSINE ou DIT.
/// Le contenu et les rappels de l'hôte n'en font pas partie : il les garde
/// stables, et signale un aperçu neuf par `contentVersion`. La translation du
/// doigt n'est portée que par la soulevée, l'écart que par une voisine : un
/// glisser ne redessine que ces cellules-là.
nonisolated struct MeeshyThumbnailCellSpec<ID: Hashable & Sendable>: Equatable {
    let thumbnail: MeeshyThumbnail<ID>
    let index: Int
    let count: Int
    let size: CGSize
    let pitch: CGFloat
    let tone: MeeshyGlassTone
    let isCurrent: Bool
    let isArmed: Bool
    let isLifted: Bool
    let isEnabled: Bool
    let translation: CGFloat
    let placeholderOffset: CGFloat
    let shift: CGFloat
    let capabilities: MeeshyThumbnailCapabilities
    let isPressedPreview: Bool

    var state: MeeshyThumbnailState {
        MeeshyThumbnailState(isCurrent: isCurrent, isLifted: isLifted, status: thumbnail.status, size: size)
    }

    /// La croix n'existe que sur la vignette armée, supprimable, qu'on ne glisse pas.
    var showsCross: Bool {
        isArmed && !isLifted && isEnabled && capabilities.canRemove && thumbnail.removeLabel != nil
    }

    var zOrder: Double {
        isLifted ? 2 : (isArmed ? 1 : 0)
    }
}

/// Les cellules d'une rangée, depuis l'état du moment : une loi pure, testée
/// sans écran. C'est elle qui dit quelles cellules changent quand la courante,
/// une progression ou un glisser change.
nonisolated enum MeeshyThumbnailRowSpecs {

    nonisolated struct Inputs<ID: Hashable & Sendable> {
        let items: [MeeshyThumbnail<ID>]
        let current: ID?
        let armed: ID?
        let drag: MeeshyThumbnailDrag<ID>?
        let size: CGSize
        let spacing: CGFloat
        let tone: MeeshyGlassTone
        let isEnabled: Bool
        let isRightToLeft: Bool
        let capabilities: MeeshyThumbnailCapabilities
        let pressedPreview: ID?
    }

    static func cells<ID: Hashable & Sendable>(_ inputs: Inputs<ID>) -> [MeeshyThumbnailCellSpec<ID>] {
        let pitch = MeeshyThumbnailRowFit.pitch(tileWidth: inputs.size.width, spacing: inputs.spacing)
        let lift = liftedPlace(inputs, pitch: pitch)
        return inputs.items.enumerated().map { index, item in
            let isLifted = lift?.source == index
            return MeeshyThumbnailCellSpec(
                thumbnail: item,
                index: index,
                count: inputs.items.count,
                size: inputs.size,
                pitch: pitch,
                tone: inputs.tone,
                isCurrent: item.id == inputs.current,
                isArmed: item.id == inputs.armed,
                isLifted: isLifted,
                isEnabled: inputs.isEnabled,
                translation: isLifted ? lift?.translation ?? 0 : 0,
                placeholderOffset: isLifted ? lift?.placeholderOffset ?? 0 : 0,
                shift: lift.map { shiftOf(index, lift: $0, pitch: pitch, inputs: inputs) } ?? 0,
                capabilities: inputs.capabilities,
                isPressedPreview: inputs.pressedPreview == item.id
            )
        }
    }

    private struct Lift {
        let source: Int
        let target: Int
        let translation: CGFloat
        let placeholderOffset: CGFloat
    }

    private static func liftedPlace<ID: Hashable & Sendable>(_ inputs: Inputs<ID>, pitch: CGFloat) -> Lift? {
        guard let drag = inputs.drag,
              let source = inputs.items.firstIndex(where: { $0.id == drag.id }),
              let target = MeeshyThumbnailRowRule.targetIndex(
                from: source, translation: drag.translation, pitch: pitch,
                count: inputs.items.count, isRightToLeft: inputs.isRightToLeft
              ) else { return nil }
        let direction: CGFloat = inputs.isRightToLeft ? -1 : 1
        return Lift(
            source: source, target: target, translation: drag.translation,
            placeholderOffset: CGFloat(target - source) * pitch * direction
        )
    }

    private static func shiftOf<ID: Hashable & Sendable>(
        _ index: Int, lift: Lift, pitch: CGFloat, inputs: Inputs<ID>
    ) -> CGFloat {
        MeeshyThumbnailRowRule.shift(
            of: index, source: lift.source, target: lift.target, pitch: pitch, isRightToLeft: inputs.isRightToLeft
        )
    }
}

// MARK: - Ce que la cellule dit à la rangée

/// Les gestes d'une cellule, remis à la rangée. Pas comparés : ils ne changent
/// pas de sens d'un rendu à l'autre (ils lisent le modèle, une référence).
struct MeeshyThumbnailCellHandlers<ID: Hashable & Sendable> {
    let tap: (ID) -> Void
    let holdBegan: (ID) -> Void
    let holdEnded: () -> Void
    let dragChanged: (ID, CGFloat, CGFloat) -> Void
    let dragEnded: (ID) -> Void
    let remove: (ID) -> Void
    let perform: (MeeshyThumbnailRowActionKind, ID) -> Void
    let hostActions: ((ID) -> [MeeshyThumbnailAction])?
    let words: MeeshyThumbnailRowWords
}

/// Le nom de l'espace de coordonnées du contenu : le glisser se lit ICI, dans
/// un repère qui ne bouge pas avec la vignette qui suit le doigt.
enum MeeshyThumbnailRowSpace {
    static let name = "meeshy.thumbnailRow.content"
}

// MARK: - La cellule

/// Une vignette touchable : son bouton, ses gestes, son nom, son rôle.
/// `Equatable` sur ses valeurs : une rangée qui se re-rend à valeurs égales ne
/// la re-rend pas.
struct MeeshyThumbnailCell<ID: Hashable & Sendable, Content: View>: View, Equatable {
    let spec: MeeshyThumbnailCellSpec<ID>
    let content: (MeeshyThumbnail<ID>, MeeshyThumbnailState) -> Content
    let handlers: MeeshyThumbnailCellHandlers<ID>

    @Environment(\.layoutDirection) var layoutDirection

    static func == (lhs: MeeshyThumbnailCell, rhs: MeeshyThumbnailCell) -> Bool {
        lhs.spec == rhs.spec
    }

    var body: some View {
        let id = spec.thumbnail.id
        return Button(action: { handlers.tap(id) }) { EmptyView() }
            .buttonStyle(MeeshyThumbnailButtonStyle(spec: spec, content: content))
            .disabled(!spec.isEnabled)
            .simultaneousGesture(holdAndDrag(id))
            .simultaneousGesture(armedDrag(id))
            .accessibilityLabel(spec.thumbnail.accessibilityLabel)
            .accessibilityValue(spec.thumbnail.accessibilityValue ?? "")
            .accessibilityAddTraits(spec.isCurrent ? .isSelected : [])
            .modifier(MeeshyThumbnailAccessibilityActions(spec: spec, handlers: handlers))
            .overlay(alignment: .topTrailing) { cross(id) }
            .offset(x: spec.shift)
            .meeshyAnimation(.easeOut(duration: MeeshyThumbnailRowRecipe.neighbourDuration), value: spec.shift)
    }

    // MARK: Gestes

    /// Appui long (400 ms, annulé au-delà de 10 de déplacement) puis glisser,
    /// d'UN seul geste : la vignette s'arme, puis suit le doigt sans qu'il faille
    /// la relâcher.
    private func holdAndDrag(_ id: ID) -> some Gesture {
        LongPressGesture(minimumDuration: MeeshyThumbnailRowRecipe.holdDuration, maximumDistance: MeeshyThumbnailRowRecipe.holdSlop)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named(MeeshyThumbnailRowSpace.name)))
            .onChanged { value in
                guard case .second(true, let drag) = value else { return }
                handlers.holdBegan(id)
                if let drag { handlers.dragChanged(id, drag.translation.width, drag.location.x) }
            }
            .onEnded { value in
                guard case .second(true, _) = value else { return }
                handlers.holdEnded()
                handlers.dragEnded(id)
            }
    }

    /// Déjà armée : la vignette part au glisser dès quelques points.
    private func armedDrag(_ id: ID) -> some Gesture {
        DragGesture(minimumDistance: MeeshyThumbnailRowRecipe.armedDragSlop, coordinateSpace: .named(MeeshyThumbnailRowSpace.name))
            .onChanged { value in
                guard spec.isArmed else { return }
                handlers.dragChanged(id, value.translation.width, value.location.x)
            }
            .onEnded { _ in
                guard spec.isArmed else { return }
                handlers.dragEnded(id)
            }
    }

    // MARK: Croix

    /// La croix rouge au coin de la vignette armée : un bouton nommé `removeLabel`,
    /// cible de 44. La confirmation reste à l'hôte.
    @ViewBuilder
    private func cross(_ id: ID) -> some View {
        if spec.showsCross, let name = spec.thumbnail.removeLabel {
            Button { handlers.remove(id) } label: { MeeshyThumbnailCross(tone: spec.tone) }
                .buttonStyle(MeeshyThumbnailPressStyle())
                .accessibilityLabel(name)
                .offset(crossOffset)
                .zIndex(1)
        }
    }

    /// Le disque déborde de 8 à droite et de 10 en haut du coin de la vignette,
    /// la cible de 44 centrée sur lui ; le coin se miroite en RTL.
    private var crossOffset: CGSize {
        let disc = MeeshyThumbnailRowRecipe.crossDisc
        let target = MeeshyThumbnailRowRecipe.crossTarget
        let marginX = (spec.pitch - spec.size.width) / 2
        let cellHeight = max(spec.size.height, MeeshyThumbnailRowRecipe.targetHeight)
        let marginY = (cellHeight - spec.size.height) / 2
        let x = MeeshyThumbnailRowRecipe.crossOverhangX - disc / 2 + target / 2 - marginX
        let y = marginY - MeeshyThumbnailRowRecipe.crossOverhangY + disc / 2 - target / 2
        return CGSize(width: layoutDirection == .rightToLeft ? -x : x, height: y)
    }
}

// MARK: - L'apparence d'une vignette

/// Le style du bouton : l'appui se lit dans `configuration.isPressed`, donc la
/// vignette se redessine seule, jamais l'hôte. Aucune échelle à l'appui.
struct MeeshyThumbnailButtonStyle<ID: Hashable & Sendable, Content: View>: ButtonStyle {
    let spec: MeeshyThumbnailCellSpec<ID>
    let content: (MeeshyThumbnail<ID>, MeeshyThumbnailState) -> Content

    func makeBody(configuration: Configuration) -> some View {
        MeeshyThumbnailFace(spec: spec, content: content, isPressed: configuration.isPressed || spec.isPressedPreview)
    }
}

/// Un bouton sans autre effet qu'un appui à 85 %.
struct MeeshyThumbnailPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(MeeshyThumbnailRowRecipe.plusOpacity(isPressed: configuration.isPressed, isHovered: false))
    }
}

/// La face d'une vignette : le contenu rogné à sa forme, son statut, le cercle,
/// l'ombre ; la soulevée grandit et s'incline, un pointillé marque la place visée.
struct MeeshyThumbnailFace<ID: Hashable & Sendable, Content: View>: View {
    let spec: MeeshyThumbnailCellSpec<ID>
    let content: (MeeshyThumbnail<ID>, MeeshyThumbnailState) -> Content
    let isPressed: Bool

    @Environment(\.colorScheme) var colorScheme
    @Environment(\.accessibilityReduceMotion) var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) var forcedReduceMotion
    @State var isHovered = false

    var body: some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
        let recipe = MeeshyThumbnailRowRecipe.resolve(
            tone: spec.tone, isCurrent: spec.isCurrent, isLifted: spec.isLifted,
            isPressed: isPressed, isHovered: isHovered, isEnabled: spec.isEnabled, reduceMotion: reduce
        )
        let isDark = colorScheme == .dark
        return ZStack {
            if spec.isLifted { placeholder(recipe: recipe, isDark: isDark) }
            tile(recipe: recipe, isDark: isDark)
                .scaleEffect(recipe.scale)
                .rotationEffect(.degrees(recipe.tiltDegrees))
                .offset(x: spec.translation)
                .meeshyAnimation(
                    .spring(response: MeeshyThumbnailRowRecipe.liftResponse, dampingFraction: MeeshyThumbnailRowRecipe.liftDamping),
                    value: spec.isLifted
                )
        }
        .frame(width: spec.pitch, height: max(spec.size.height, MeeshyThumbnailRowRecipe.targetHeight))
        .contentShape(Rectangle())
        .onHover { isHovered = $0 }
    }

    // MARK: Pièces

    private func tile(recipe: MeeshyThumbnailRowRecipe, isDark: Bool) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyThumbnailRowRecipe.radius, style: .continuous)
        return ZStack {
            content(spec.thumbnail, spec.state)
            MeeshyThumbnailStatusOverlay(status: spec.thumbnail.status, size: spec.size, tone: spec.tone)
        }
        .frame(width: spec.size.width, height: spec.size.height)
        .clipShape(shape)
        .overlay { outline(recipe: recipe) }
        .overlay { ring(recipe: recipe, isDark: isDark) }
        .shadow(color: recipe.shadowColor, radius: recipe.shadow.radius, x: 0, y: recipe.shadow.y)
        .opacity(recipe.opacity)
        .meeshyAnimation(.easeInOut(duration: MeeshyThumbnailRowRecipe.ringFadeDuration), value: recipe.ringOpacity)
        .accessibilityHidden(true)
    }

    /// Le cercle : collé à la vignette, dehors d'elle, jamais rogné par la rangée.
    private func ring(recipe: MeeshyThumbnailRowRecipe, isDark: Bool) -> some View {
        let width = MeeshyThumbnailRowRecipe.ringWidth
        return RoundedRectangle(cornerRadius: MeeshyThumbnailRowRecipe.radius + width, style: .continuous)
            .strokeBorder(recipe.inkColor(isDark: isDark), lineWidth: width)
            .padding(-width)
            .opacity(recipe.ringOpacity)
            .allowsHitTesting(false)
    }

    /// Sur une scène claire, un filet sombre détache la vignette (et son cercle).
    @ViewBuilder
    private func outline(recipe: MeeshyThumbnailRowRecipe) -> some View {
        if recipe.outlineOpacity > 0 {
            let width = MeeshyThumbnailRowRecipe.outlineWidth
            let outset = (recipe.ringOpacity > 0 ? MeeshyThumbnailRowRecipe.ringWidth : 0) + width
            RoundedRectangle(cornerRadius: MeeshyThumbnailRowRecipe.radius + outset, style: .continuous)
                .strokeBorder(recipe.outlineColor, lineWidth: width)
                .padding(-outset)
                .allowsHitTesting(false)
        }
    }

    /// Le pointillé de la place visée : un cadre vide, 1,5 blanc à 60 %.
    private func placeholder(recipe: MeeshyThumbnailRowRecipe, isDark: Bool) -> some View {
        RoundedRectangle(cornerRadius: MeeshyThumbnailRowRecipe.radius, style: .continuous)
            .strokeBorder(
                recipe.inkColor(isDark: isDark).opacity(MeeshyThumbnailRowRecipe.placeholderOpacity),
                style: StrokeStyle(lineWidth: MeeshyThumbnailRowRecipe.placeholderStroke, dash: [4, 3])
            )
            .frame(width: spec.size.width, height: spec.size.height)
            .offset(x: spec.placeholderOffset)
            .meeshyAnimation(.easeOut(duration: MeeshyThumbnailRowRecipe.neighbourDuration), value: spec.placeholderOffset)
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}

// MARK: - La croix

/// Le disque rouge de 24, filet blanc, glyphe de 12 ; la cible tactile de 44 est
/// celle du bouton qui le porte.
struct MeeshyThumbnailCross: View {
    let tone: MeeshyGlassTone

    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        let ink = MeeshyThumbnailRowRecipe
            .resolve(tone: tone, isCurrent: false, isLifted: false)
            .inkColor(isDark: colorScheme == .dark)
        return ZStack {
            Circle().fill(MeeshyColors.error)
            Circle().strokeBorder(ink, lineWidth: MeeshyThumbnailRowRecipe.crossStroke)
            Image(systemName: "xmark")
                .font(Font.system(size: MeeshyThumbnailRowRecipe.crossGlyph, weight: .bold))
                .foregroundStyle(ink)
        }
        .frame(width: MeeshyThumbnailRowRecipe.crossDisc, height: MeeshyThumbnailRowRecipe.crossDisc)
        .frame(width: MeeshyThumbnailRowRecipe.crossTarget, height: MeeshyThumbnailRowRecipe.crossTarget)
        .contentShape(Rectangle())
    }
}

// MARK: - Les actions du lecteur d'écran

/// Les actions nommées d'une vignette, selon les rappels présents : celles de la
/// rangée (dupliquer, déplacer, supprimer), puis celles de l'hôte. Aucun geste
/// n'est la seule voie.
struct MeeshyThumbnailAccessibilityActions<ID: Hashable & Sendable>: ViewModifier {
    let spec: MeeshyThumbnailCellSpec<ID>
    let handlers: MeeshyThumbnailCellHandlers<ID>

    private var kinds: [MeeshyThumbnailRowActionKind] {
        guard spec.isEnabled else { return [] }
        return MeeshyThumbnailRowRule.actions(
            index: spec.index, count: spec.count, canDuplicate: spec.capabilities.canDuplicate,
            canMove: spec.capabilities.canMove, canRemove: spec.capabilities.canRemove && spec.thumbnail.removeLabel != nil
        )
    }

    private var hostActions: [MeeshyThumbnailAction] {
        spec.isEnabled ? handlers.hostActions?(spec.thumbnail.id) ?? [] : []
    }

    func body(content: Content) -> some View {
        content.accessibilityActions {
            ForEach(kinds, id: \.self) { kind in
                Button(
                    MeeshyThumbnailRowAccessibility.name(of: kind, words: handlers.words, removeLabel: spec.thumbnail.removeLabel)
                ) { handlers.perform(kind, spec.thumbnail.id) }
            }
            ForEach(Array(hostActions.enumerated()), id: \.offset) { _, action in
                Button(action.name) { action.perform() }
            }
        }
    }
}
