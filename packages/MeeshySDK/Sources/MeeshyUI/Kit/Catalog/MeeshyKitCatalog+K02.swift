#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK02 = MeeshyKitCatalogEntry(
        key: "K02",
        name: "MeeshyGlassButton",
        states: [
            MeeshyKitCatalogState(id: "normal", boardView: "R2", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "seul", boardView: "R1", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "seul-clair", boardView: "R13", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "actif", boardView: "R3", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "destructif", boardView: "S9", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "doux", boardView: "S1", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "texte", boardView: "A2", backdrop: .dark, isTouchable: true),
            MeeshyKitCatalogState(id: "pastille", backdrop: .media),
            MeeshyKitCatalogState(id: "teinte", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "theme", backdrop: .light, isTouchable: true),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "tailles", backdrop: .media),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK02(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyGlassButtonSample(stateID: state.id, isPressed: isPressed)
    }
}

/// La pilule hôte de l'état `normal` (R2), le temps que K10 la livre : sous
/// le Liquid Glass, ce sont les verres des boutons qui se fondent en pilule
/// dans le groupe, et la pilule ne porte aucun verre (jamais de verre sur du
/// verre) ; ailleurs, la pilule est le verre dessiné de K01 et les boutons s'y
/// posent sans matière.
private struct MeeshyGlassButtonSamplePill: ViewModifier {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.meeshyGlassForcesDrawn) private var forcesDrawn
    @Environment(\.meeshyGlassForcesOpaque) private var forcesOpaque

    @ViewBuilder
    func body(content: Content) -> some View {
        if material == .liquid {
            content
        } else {
            content.meeshyGlass(in: Capsule(), tone: .deep)
        }
    }

    private var material: MeeshyGlassMaterial {
        MeeshyGlassMaterial.resolve(
            isLiquidAvailable: Platform.isIOS26OrLater,
            reduceTransparency: reduceTransparency,
            forcesDrawn: forcesDrawn || MeeshyGlassDebug.launchForcesDrawn,
            forcesOpaque: forcesOpaque
        )
    }
}

/// L'échantillon d'un état : le vrai bouton au repos, son disque figé sous le
/// doigt pour la tuile « pressé » (un bouton ne se tient pas pressé hors écran).
private struct MeeshyGlassButtonSample: View {
    let stateID: String
    let isPressed: Bool

    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        switch stateID {
        case "normal": container
        case "seul": cell("xmark", "Fermer", tone: .plain)
        case "seul-clair": cell("xmark", "Fermer", tone: .onLight)
        case "actif": cell("ellipsis", "Ranger les actions", kind: .active)
        case "destructif": cell("trash", "Retirer", kind: .destructive, size: .s40)
        case "doux": cell("chevron.backward", "Retour", kind: .soft, size: .s40)
        case "texte": ownGlyphs
        case "pastille": badged
        case "teinte": cell("doc.on.clipboard", "Coller", tint: MeeshyColors.brandPrimary)
        case "theme": themed
        case "desactive": cell("scribble", "Marqueur").disabled(true)
        default: sizes
        }
    }

    private var container: some View {
        MeeshyGlassGroup(spacing: MeeshySpacing.sm) {
            HStack(spacing: MeeshySpacing.sm) {
                cell("arrow.uturn.backward", "Annuler", size: .s40, pressable: false)
                cell("arrow.uturn.forward", "Rétablir", size: .s40)
                cell("ellipsis", "Afficher les actions", size: .s48, pressable: false)
            }
            .padding(MeeshySpacing.xs)
            .modifier(MeeshyGlassButtonSamplePill())
        }
    }

    private var sizes: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(MeeshyGlassButtonSize.allCases, id: \.self) { size in
                cell("plus", "Ajouter", size: size)
            }
        }
    }

    private var ownGlyphs: some View {
        HStack(spacing: MeeshySpacing.sm) {
            glyphCell("Style du texte") { Text(verbatim: "Aa") }
            glyphCell("Couleur") { Circle().fill(MeeshyColors.brandPrimary).frame(width: MeeshySpacing.lg, height: MeeshySpacing.lg) }
        }
    }

    private var themed: some View {
        HStack(spacing: MeeshySpacing.sm) {
            cell("pencil", "Stylo", tone: .theme)
            cell("pencil", "Stylo", kind: .active, tone: .theme)
        }
        .padding(MeeshySpacing.sm)
        .background(MeeshyColors.backgroundPrimary(isDark: colorScheme == .dark))
    }

    @ViewBuilder
    private var badged: some View {
        if isPressed {
            MeeshyGlassButtonFace(systemImage: "bell", isPressed: true).glassBadge { badge }
        } else {
            MeeshyGlassButton(systemImage: "bell", label: "Notifications", value: "3", action: {}).glassBadge { badge }
        }
    }

    private var badge: some View {
        Circle().fill(MeeshyColors.error).frame(width: MeeshySpacing.sm, height: MeeshySpacing.sm)
    }

    @ViewBuilder
    private func cell(
        _ symbol: String,
        _ label: String,
        kind: MeeshyGlassButtonKind = .normal,
        size: MeeshyGlassButtonSize = .s44,
        tone: MeeshyGlassTone? = nil,
        tint: Color? = nil,
        pressable: Bool = true
    ) -> some View {
        if isPressed && pressable {
            MeeshyGlassButtonFace(systemImage: symbol, kind: kind, size: size, tone: tone, tint: tint, isPressed: true)
        } else {
            MeeshyGlassButton(systemImage: symbol, label: label, kind: kind, size: size, tone: tone, tint: tint, action: {})
        }
    }

    @ViewBuilder
    private func glyphCell<G: View>(_ label: String, @ViewBuilder glyph: () -> G) -> some View {
        if isPressed {
            MeeshyGlassButtonFace(isPressed: true, glyph: glyph)
        } else {
            MeeshyGlassButton(label: label, action: {}, glyph: glyph)
        }
    }
}
#endif
