#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK16 = MeeshyKitCatalogEntry(
        key: "K16",
        name: "MeeshyModeChrome",
        states: [
            MeeshyKitCatalogState(id: "texte", boardView: "A13", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "plaque", boardView: "A13", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "coche", boardView: "A8", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "trois", boardView: "C1", backdrop: .media, isTouchable: true),
            MeeshyKitCatalogState(id: "accessoire", backdrop: .media),
            MeeshyKitCatalogState(id: "plaque-longue", backdrop: .media),
            MeeshyKitCatalogState(id: "sans-plaque", backdrop: .media),
            MeeshyKitCatalogState(id: "occupe", backdrop: .media),
            MeeshyKitCatalogState(id: "desactive", backdrop: .media),
            MeeshyKitCatalogState(id: "clair", backdrop: .light),
            MeeshyKitCatalogState(id: "large", boardView: "I3", backdrop: .media, isTouchable: true),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK16(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyModeChromeSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : le cadre posé en surimpression d'un bloc d'hôte, comme la scène de la
/// planche. La fenêtre de démonstration fait 390 × 520 ; la hauteur de fenêtre du plafond de la plaque est
/// celle de l'écran de la planche (844), car le catalogue n'est pas dans une fenêtre.
private struct MeeshyModeChromeSample: View {
    let stateID: String
    let isPressed: Bool

    private static let windowWidth: CGFloat = 390
    private static let windowHeight: CGFloat = 520
    private static let boardWindowHeight: CGFloat = 844
    private static let widePlateWidth: CGFloat = 320
    private static let toolNames = ["Pinceau", "Marqueur", "Gomme", "Flou"]

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                .fill(MeeshyColors.mediaFill)
                .overlay { Image(systemName: "photo").font(.largeTitle).foregroundStyle(MeeshyColors.onMediaMuted) }
                .padding(MeeshySpacing.lg)
            chrome
        }
        .frame(width: Self.windowWidth, height: Self.windowHeight)
        .environment(\.meeshyModeFixedPress, isPressed ? true : nil)
        .meeshyModePlateWindowHeight(Self.boardWindowHeight)
    }

    @ViewBuilder
    private var chrome: some View {
        switch stateID {
        case "texte":
            MeeshyModeChrome(label: "Dessin", exit: exit, confirm: confirmTitle("Valider"), plateLabel: "Réglages du dessin") { tools }
        case "plaque":
            MeeshyModeChrome(label: "Dessin", exit: exit, confirm: confirmTitle("Valider"), plateLabel: "Réglages du dessin") {
                tools
                actions
            }
        case "coche":
            MeeshyModeChrome(label: "Caméra", exit: exit, confirm: confirmCheck)
        case "trois":
            MeeshyModeChrome(label: "Retouche", exit: exit, confirm: confirmTitle("Terminé")) { photosCapsule }
        case "accessoire":
            MeeshyModeChrome(
                label: "Caméra", exit: exit, confirm: confirmCheck,
                center: { EmptyView() }, accessory: { dropTake }, plate: { EmptyView() }
            )
        case "plaque-longue":
            MeeshyModeChrome(label: "Dessin", exit: exit, confirm: confirmTitle("Valider"), plateLabel: "Réglages du dessin") {
                ForEach(0..<14, id: \.self) { index in row("Réglage \(index + 1)") }
            }
        case "sans-plaque":
            MeeshyModeChrome(label: "Plan temps", exit: exit, confirm: confirmTitle("Valider"))
        case "occupe":
            MeeshyModeChrome(label: "Retouche", exit: exit, confirm: confirmTitle("Terminé", isBusy: true))
        case "desactive":
            MeeshyModeChrome(label: "Plan temps", exit: exit, confirm: confirmTitle("Valider", isEnabled: false))
        case "clair":
            MeeshyModeChrome(label: "Dessin", exit: exit, confirm: confirmTitle("Valider"), tone: .onLight,
                             plateLabel: "Réglages du dessin") { tools }
        default:
            wide
        }
    }

    private var wide: some View {
        VStack(spacing: MeeshySpacing.md) {
            MeeshyModeHeader(
                label: "Dessin", exit: exit, confirm: confirmTitle("Valider"), tone: .plain,
                headerInset: MeeshyModeChromeRecipe.wideHeaderInset
            )
            Spacer(minLength: 0)
            MeeshyModePlate(label: "Réglages du dessin", maxWidth: Self.widePlateWidth, tone: .plain) { tools }
                .padding(.bottom, MeeshyModePlateMetrics.bottomMargin(safeBottom: 0))
        }
    }

    // MARK: Actions

    private var exit: MeeshyModeAction {
        MeeshyModeAction(title: "Quitter", hint: "Revient à l'état d'avant") {}
    }

    private func confirmTitle(_ title: String, isBusy: Bool = false, isEnabled: Bool = true) -> MeeshyModeAction {
        MeeshyModeAction(title: title, isEnabled: isEnabled, isBusy: isBusy) {}
    }

    private var confirmCheck: MeeshyModeAction {
        MeeshyModeAction(title: "Valider", systemImage: "checkmark", display: .glyph) {}
    }

    private var photosCapsule: some View {
        MeeshyModeCapsule(title: "Photos", systemImage: "arrow.down.to.line", display: .glyphAndTitle) {}
    }

    private var dropTake: some View {
        MeeshyGlassButton(systemImage: "delete.left", label: "Retirer la dernière prise") {}
    }

    // MARK: Plaque

    private var tools: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ForEach(Self.toolNames, id: \.self) { name in
                MeeshyGlassButton(systemImage: "scribble", label: name) {}
            }
        }
    }

    private var actions: some View {
        HStack(spacing: MeeshySpacing.sm) {
            MeeshyGlassButton(systemImage: "doc.on.doc", label: "Dupliquer") {}
            MeeshyGlassButton(systemImage: "trash", label: "Supprimer", kind: .destructive) {}
        }
    }

    private func row(_ title: String) -> some View {
        Text(title)
            .font(MeeshyFont.relative(MeeshyFont.bodySize))
            .foregroundStyle(MeeshyColors.onMedia)
            .frame(maxWidth: .infinity, minHeight: MeeshyControlSize.tapTarget, alignment: .leading)
    }
}
#endif
