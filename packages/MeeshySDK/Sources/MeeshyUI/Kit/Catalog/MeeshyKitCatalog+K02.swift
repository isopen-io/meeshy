#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK02 = MeeshyKitCatalogEntry(
        key: "K02",
        name: "MeeshyGlassButton",
        states: [
            MeeshyKitCatalogState(id: "normal-groupe", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "seul-plain", boardView: "R1", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "seul-deep", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "seul-onlight", boardView: "R13", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "actif", boardView: "R3", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "destructif", boardView: "S9", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "doux", boardView: "R7", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "glyphe-propre", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "occupe", backdrop: .media),
            MeeshyKitCatalogState(id: "pastille", backdrop: .media),
            MeeshyKitCatalogState(id: "tailles", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK02(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyGlassButtonSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : le vrai bouton au repos, son disque figé sous le
/// doigt pour la tuile « pressé » (un bouton ne se tient pas pressé hors écran).
private struct MeeshyGlassButtonSample: View {
    let stateID: String
    let isPressed: Bool

    var body: some View {
        switch stateID {
        case "normal-groupe": group
        case "seul-plain": cell("xmark", tone: .plain)
        case "seul-deep": cell("chevron.backward", tone: .deep)
        case "seul-onlight": cell("xmark", tone: .onLight)
        case "actif": cell("ellipsis", kind: .active)
        case "destructif": cell("trash", kind: .destructive, size: .compact)
        case "doux": cell("chevron.backward", kind: .soft, size: .compact)
        case "glyphe-propre": ownGlyphs
        case "desactive": cell("scribble").disabled(true)
        case "occupe": busyCell
        case "pastille": badged
        default: sizes
        }
    }

    private var group: some View {
        MeeshyGlassGroup(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                cell("arrow.uturn.backward", size: .compact, pressable: false)
                cell("arrow.uturn.forward", size: .compact)
                cell("ellipsis", size: .large, pressable: false)
            }
            .padding(MeeshySpacing.xs)
            .meeshyGlass(in: Capsule(), tone: .deep)
        }
    }

    private var sizes: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(MeeshyGlassButtonSize.allCases, id: \.self) { size in
                cell("plus", size: size)
            }
        }
    }

    private var ownGlyphs: some View {
        HStack(spacing: MeeshySpacing.sm) {
            glyphCell("Aa") { Text(verbatim: "Aa") }
            glyphCell("color") { Circle().fill(MeeshyColors.brandPrimary).frame(width: MeeshySpacing.lg, height: MeeshySpacing.lg) }
        }
    }

    private var busyCell: some View {
        MeeshyGlassButton(systemImage: "arrow.clockwise", label: "arrow.clockwise", isBusy: true, action: {})
    }

    private var badged: some View {
        MeeshyGlassButton(systemImage: "bell", label: "bell", value: "3", action: {})
            .glassBadge {
                Circle().fill(MeeshyColors.error).frame(width: MeeshySpacing.sm, height: MeeshySpacing.sm)
            }
    }

    @ViewBuilder
    private func cell(
        _ symbol: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .regular,
        tone: MeeshyGlassTone? = nil,
        pressable: Bool = true
    ) -> some View {
        if isPressed && pressable {
            MeeshyGlassDisc(systemImage: symbol, kind: kind, size: size, tone: tone, isPressed: true)
                .frame(width: side(of: size), height: side(of: size))
        } else {
            MeeshyGlassButton(systemImage: symbol, label: symbol, kind: kind, size: size, tone: tone, action: {})
        }
    }

    @ViewBuilder
    private func glyphCell<G: View>(_ label: String, @ViewBuilder glyph: () -> G) -> some View {
        if isPressed {
            MeeshyGlassDisc(isPressed: true, glyph: glyph)
                .frame(width: side(of: .regular), height: side(of: .regular))
        } else {
            MeeshyGlassButton(label: label, action: {}, glyph: glyph)
        }
    }

    private func side(of size: MeeshyGlassButtonSize) -> CGFloat {
        CGFloat(MeeshyGlassButtonRecipe.resolve(kind: .normal, size: size).targetSide)
    }
}
#endif
