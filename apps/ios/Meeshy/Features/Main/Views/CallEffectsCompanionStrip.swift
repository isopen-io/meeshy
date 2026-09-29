import SwiftUI
import MeeshySDK
import MeeshyUI

/// #8737 — en mode Effets, les autres participants restent à l'écran : un bloc
/// posé en haut, sous la Dynamic Island, que le doigt emmène d'un coin du haut à
/// l'autre. Il occupe la bande LIBRE entre le haut de l'écran et les commandes du
/// mode, qui le mesurent en le posant au-dessus d'elles : jamais il ne les couvre.
///
/// Les photos et les films du mode restent « mon image » : ils sont pris sur les
/// pistes, jamais sur l'écran — une vignette posée ici n'y entre pas.
struct CallEffectsCompanionStrip: View {
    let tiles: [GroupCallStageTile]
    let track: (GroupCallStageTile) -> Any?
    let intendedFront: Bool
    let topInset: CGFloat

    @State private var corner: CallEffectsCompanionCorner = .topTrailing
    @State private var dragOffset: CGSize = .zero
    @State private var blockWidth: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.layoutDirection) private var layoutDirection

    private static let margin: CGFloat = 16
    private static let inset: CGFloat = 6
    private static let spacing: CGFloat = 8
    private static let chipDiameter: CGFloat = 44
    private static let cornerRadius: CGFloat = 22

    private struct Arrangement {
        let layout: CallEffectsCompanionLayout
        let tileSize: CGSize

        var isEmpty: Bool { layout.companions.isEmpty && layout.overflow == 0 }
        var isSingleTile: Bool { layout.companions.count == 1 && layout.overflow == 0 }
    }

    var body: some View {
        GeometryReader { proxy in
            let plan = arrangement(in: proxy.size)
            if !plan.isEmpty {
                block(plan)
                    .environment(\.layoutDirection, layoutDirection)
                    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { blockWidth = $0 }
                    .offset(dragOffset)
                    .gesture(dragGesture(containerWidth: proxy.size.width))
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: sitsLeft ? .topLeading : .topTrailing)
                    .padding(.horizontal, Self.margin)
            }
        }
        // Le glissé se compte en coordonnées PHYSIQUES : le bloc suit le doigt
        // quelle que soit l'écriture ; le coin reste, lui, un coin de tête ou de
        // fin, pour que l'arabe le range au même endroit logique.
        .environment(\.layoutDirection, .leftToRight)
        .padding(.top, topInset)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "call.group.stage", defaultValue: "Participants à l'appel", bundle: .main))
    }

    private var isRightToLeft: Bool { layoutDirection == .rightToLeft }

    private var sitsLeft: Bool { (corner == .topLeading) != isRightToLeft }

    private func arrangement(in size: CGSize) -> Arrangement {
        let everyone = CallEffectsCompanionRule.layout(tiles: tiles, featuredId: nil, capacity: 0)
        guard let tileSize = CallEffectsCompanionRule.tileSize(companionCount: everyone.overflow, freeHeight: size.height - 2 * Self.inset) else {
            return Arrangement(layout: everyone, tileSize: .zero)
        }
        let capacity = CallEffectsCompanionRule.capacity(
            availableWidth: size.width - 2 * (Self.margin + Self.inset),
            tileWidth: tileSize.width,
            spacing: Self.spacing,
            chipWidth: Self.chipDiameter,
            count: everyone.overflow
        )
        return Arrangement(
            layout: CallEffectsCompanionRule.layout(tiles: tiles, featuredId: nil, capacity: capacity),
            tileSize: tileSize
        )
    }

    // MARK: - Le bloc

    @ViewBuilder
    private func block(_ arrangement: Arrangement) -> some View {
        if arrangement.isSingleTile, let only = arrangement.layout.companions.first {
            companionTile(only, size: arrangement.tileSize)
                .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        } else {
            HStack(spacing: Self.spacing) {
                ForEach(arrangement.layout.companions) { tile in
                    companionTile(tile, size: arrangement.tileSize)
                }
                if arrangement.layout.overflow > 0 {
                    overflowChip(arrangement.layout.overflow)
                }
            }
            .padding(Self.inset)
            .callChromeGlass(in: RoundedRectangle(cornerRadius: Self.cornerRadius, style: .continuous))
        }
    }

    private func companionTile(_ tile: GroupCallStageTile, size: CGSize) -> some View {
        GroupCallTileView(tile: tile, track: track(tile), intendedFront: intendedFront)
            .frame(width: size.width, height: size.height)
            .contentShape(Rectangle())
            .accessibilityAction(named: moveActionName) { settle(on: corner.other) }
    }

    private func overflowChip(_ count: Int) -> some View {
        Text(verbatim: "+\(count)")
            .font(.subheadline.weight(.semibold))
            .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .foregroundColor(.white)
            .frame(width: Self.chipDiameter, height: Self.chipDiameter)
            .background(Circle().fill(Color.white.opacity(0.16)))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(String(
                format: String(localized: "call.effects.companions.more", defaultValue: "%lld autres participants", bundle: .main),
                count
            ))
            .accessibilityAction(named: moveActionName) { settle(on: corner.other) }
    }

    private var moveActionName: Text {
        Text(String(localized: "call.effects.companions.move", defaultValue: "Changer de côté", bundle: .main))
    }

    // MARK: - Le glissé

    /// Le bloc suit le doigt image par image ; relâché, il rejoint le coin du
    /// haut le plus proche. Ramené là d'où il partait, il y reste : rien n'est
    /// décidé avant la levée du doigt.
    private func dragGesture(containerWidth: CGFloat) -> some Gesture {
        DragGesture(coordinateSpace: .global)
            .onChanged { dragOffset = $0.translation }
            .onEnded { value in
                let restingX = CallEffectsCompanionRule.restingCenterX(
                    corner,
                    blockWidth: blockWidth,
                    containerWidth: containerWidth,
                    margin: Self.margin,
                    isRightToLeft: isRightToLeft
                )
                settle(on: CallEffectsCompanionRule.corner(
                    dropX: restingX + value.translation.width,
                    containerWidth: containerWidth,
                    isRightToLeft: isRightToLeft
                ))
            }
    }

    private func settle(on target: CallEffectsCompanionCorner) {
        let changed = target != corner
        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.75)) {
            corner = target
            dragOffset = .zero
        }
        guard changed else { return }
        HapticFeedback.light()
    }
}
