import SwiftUI

// MARK: - Le rail court

/// La capsule de verre d'un rail court : ses disques de 44 pt se composent dans
/// un même conteneur ; trop haute (paysage, écran court), elle défile et ses
/// bords cachés s'effacent, le fondu étant un masque sur ce qui défile, jamais
/// sur le verre. Un seul verre par rail : les disques dedans n'en dessinent pas
/// en verre dessiné (K01).
struct MeeshyEdgeRailCompactBody<Custom: View>: View {
    let spec: MeeshyEdgeRailSpec
    let tone: MeeshyGlassTone?
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?
    let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    var body: some View {
        MeeshyGlassGroup(spacing: MeeshyEdgeRailsRecipe.compactSpacing) {
            ViewThatFits(in: .vertical) {
                column
                MeeshyFadingScrollView(axis: .vertical, fade: MeeshyEdgeRailsRecipe.edgeFade) { column }
            }
        }
        .clipShape(Capsule())
        .meeshyGlass(in: Capsule(), tone: tone)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spec.name)
    }

    private var column: some View {
        VStack(spacing: MeeshyEdgeRailsRecipe.compactSpacing) {
            ForEach(
                spec.cells.map {
                    AsyncRenderRow(id: $0.id, content: MeeshyEdgeRailCompactCell(
                        entry: $0.entry, tone: tone, onAction: onAction, onLongPress: onLongPress, custom: custom
                    ))
                },
                content: asyncRenderRowContent
            )
        }
        .padding(MeeshyEdgeRailsRecipe.compactPadding)
    }
}

/// Une case du rail court, CONSTRUITE par le `body` du rail : le `ForEach` qui
/// vit sous `ViewThatFits` ne fait que la relire (`AsyncRenderRow`), aucune
/// fermeture isolée n'est atteinte par le rendu asynchrone d'iOS 26.
struct MeeshyEdgeRailCompactCell<Custom: View>: View {
    let entry: MeeshyEdgeRailEntry
    let tone: MeeshyGlassTone?
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?
    let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    var body: some View {
        switch entry {
        case .item(let item):
            MeeshyEdgeRailDisc(item: item, tone: tone, onAction: onAction, onLongPress: onLongPress)
                .equatable()
        case .divider:
            Rectangle()
                .fill(MeeshyColors.onMedia.opacity(MeeshyEdgeRailsRecipe.compactDividerOpacity))
                .frame(height: MeeshyEdgeRailsRecipe.dividerHeight)
                .padding(.horizontal, MeeshyEdgeRailsRecipe.dividerInset)
                .accessibilityHidden(true)
        case .custom(let id):
            custom(id, .compact)
                .frame(width: MeeshyEdgeRailsRecipe.discSide, height: MeeshyEdgeRailsRecipe.discSide)
        }
    }
}

/// Un disque de K02 pour une rangée (doux, dans le pied d'un rail libellé) : son nom, sa valeur, son état et son appui
/// long viennent de la rangée ; l'impact est celui du site unique (léger au
/// toucher, moyen à l'appui long), jamais celui du disque.
struct MeeshyEdgeRailDisc: View, Equatable {
    let item: MeeshyEdgeRailItem
    let tone: MeeshyGlassTone?
    var isSoft = false
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?

    static func == (lhs: MeeshyEdgeRailDisc, rhs: MeeshyEdgeRailDisc) -> Bool {
        lhs.item == rhs.item && lhs.tone == rhs.tone && lhs.isSoft == rhs.isSoft
    }

    private var kind: MeeshyGlassButtonKind {
        isSoft && !item.isLit ? .soft : item.discKind
    }

    var body: some View {
        disc
            .disabled(!item.isEnabled)
            .opacity(item.isDimmed ? MeeshyEdgeRailsRecipe.itemDimmedOpacity : 1)
            .overlay(alignment: .topTrailing) { dot }
    }

    @ViewBuilder
    private var disc: some View {
        switch item.glyph {
        case .system(let name):
            MeeshyGlassButton(
                systemImage: name, label: item.label, hint: item.hint, value: item.value,
                kind: kind, activation: item.effectiveActivation, tone: tone, haptic: .none,
                onLongPress: longPress, longPressLabel: item.longPressLabel, action: tap
            )
        case .text(let text):
            MeeshyGlassButton(
                label: item.label, hint: item.hint, value: item.value,
                kind: kind, activation: item.effectiveActivation, tone: tone, haptic: .none,
                onLongPress: longPress, longPressLabel: item.longPressLabel, action: tap
            ) { Text(text) }
        }
    }

    @ViewBuilder
    private var dot: some View {
        if item.showsDot {
            Circle()
                .fill(MeeshyColors.brandPrimary)
                .frame(width: MeeshyEdgeRailsRecipe.carriedDotSide, height: MeeshyEdgeRailsRecipe.carriedDotSide)
                .padding(MeeshyEdgeRailsRecipe.carriedDotInset)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var tap: () -> Void {
        let id = item.id
        let isEnabled = item.isEnabled
        let onAction = onAction
        return { MeeshyEdgeRailsTrigger.tap(isEnabled: isEnabled, action: { onAction(id) }) }
    }

    private var longPress: (() -> Void)? {
        guard item.longPressLabel != nil, let onLongPress else { return nil }
        let id = item.id
        let isEnabled = item.isEnabled
        return { MeeshyEdgeRailsTrigger.longPress(isEnabled: isEnabled, action: { onLongPress(id) }) }
    }
}

// MARK: - Le rail libellé

/// Le rail libellé : un en-tête, des rangées glyphe + mot, un pied épinglé. Court
/// et centré, il défile s'il déborde ; le pied ne défile jamais.
struct MeeshyEdgeRailLabeledBody<Custom: View>: View {
    let spec: MeeshyEdgeRailSpec
    let width: MeeshyEdgeRailWidth
    let tone: MeeshyGlassTone?
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?
    let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshyEdgeRailsRecipe.rowSpacing) {
            header
            ViewThatFits(in: .vertical) {
                rows
                MeeshyFadingScrollView(axis: .vertical, fade: MeeshyEdgeRailsRecipe.edgeFade) { rows }
            }
            foot
        }
        .padding(MeeshyEdgeRailsRecipe.padding(width))
        .frame(width: width.points)
        .meeshyGlass(
            in: RoundedRectangle(cornerRadius: MeeshyEdgeRailsRecipe.labeledRadius, style: .continuous),
            tone: tone
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(spec.name)
    }

    @ViewBuilder
    private var header: some View {
        if let header = spec.header {
            Text(header)
                .textCase(.uppercase)
                .font(MeeshyFont.relative(MeeshyEdgeRailsRecipe.headerSize, weight: .heavy))
                .tracking(MeeshyEdgeRailsRecipe.headerSize * MeeshyEdgeRailsRecipe.headerTrackingEm)
                .foregroundStyle(MeeshyColors.onMedia.opacity(MeeshyEdgeRailsRecipe.headerOpacity))
                .padding(.top, MeeshyEdgeRailsRecipe.headerTop)
                .padding(.leading, MeeshyEdgeRailsRecipe.headerLeading)
                .padding(.bottom, MeeshyEdgeRailsRecipe.headerBottom)
                .accessibilityAddTraits(.isHeader)
        }
    }

    private var rows: some View {
        VStack(spacing: MeeshyEdgeRailsRecipe.rowSpacing) {
            ForEach(
                spec.cells.map {
                    AsyncRenderRow(id: $0.id, content: MeeshyEdgeRailLabeledCell(
                        entry: $0.entry, width: width, onAction: onAction, onLongPress: onLongPress, custom: custom
                    ))
                },
                content: asyncRenderRowContent
            )
        }
    }

    @ViewBuilder
    private var foot: some View {
        if spec.hasFoot {
            VStack(spacing: MeeshyEdgeRailsRecipe.footInset) {
                MeeshyEdgeRailHairline(opacity: MeeshyEdgeRailsRecipe.labeledDividerOpacity)
                HStack(spacing: MeeshyEdgeRailsRecipe.footSpacing) {
                    ForEach(spec.foot) { item in
                        MeeshyEdgeRailDisc(item: item, tone: tone, isSoft: true, onAction: onAction, onLongPress: onLongPress)
                            .equatable()
                    }
                }
            }
            .padding(.top, MeeshyEdgeRailsRecipe.footMargin - MeeshyEdgeRailsRecipe.rowSpacing)
        }
    }
}

/// Une case du rail libellé, construite par le `body` du rail et relue par son
/// `ForEach` (même raison que `MeeshyEdgeRailCompactCell`).
struct MeeshyEdgeRailLabeledCell<Custom: View>: View {
    let entry: MeeshyEdgeRailEntry
    let width: MeeshyEdgeRailWidth
    let onAction: (String) -> Void
    let onLongPress: ((String) -> Void)?
    let custom: (String, MeeshyEdgeRailsPresentation) -> Custom

    var body: some View {
        switch entry {
        case .item(let item):
            MeeshyEdgeRailLabeledRow(item: item, width: width, onAction: onAction, onLongPress: onLongPress)
                .equatable()
        case .divider:
            MeeshyEdgeRailHairline(opacity: MeeshyEdgeRailsRecipe.labeledDividerOpacity)
        case .custom(let id):
            custom(id, .labeled(width))
                .frame(maxWidth: .infinity, minHeight: MeeshyEdgeRailsRecipe.rowHeight, alignment: .leading)
        }
    }
}

/// Le filet d'un rail libellé : entre deux rangées et au-dessus du pied.
struct MeeshyEdgeRailHairline: View {
    let opacity: Double

    var body: some View {
        Rectangle()
            .fill(MeeshyColors.onMedia.opacity(opacity))
            .frame(height: MeeshyEdgeRailsRecipe.dividerHeight)
            .padding(.horizontal, MeeshyEdgeRailsRecipe.footInset)
            .accessibilityHidden(true)
    }
}
