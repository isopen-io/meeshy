import SwiftUI
import UIKit

/// L'emplacement vide, comparable : un `EmptyView` ne l'est pas.
public struct MeeshyKeyboardDockNoSlot: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

// MARK: - Ce que les vues hébergées appellent

/// Les dernières valeurs de l'hôte, derrière une référence stable : les fermetures des vues hébergées ne
/// changent jamais, donc la racine d'une vue hébergée n'est réécrite que si ses VALEURS changent.
@MainActor
final class MeeshyKeyboardDockHandlers {
    var input: MeeshyKeyboardDockInput = .keyboard
    var items: [MeeshyKeyboardDockItem] = []
    var confirm: MeeshyKeyboardDockConfirm?
    var onItem: (String) -> Void = { _ in }
    var onInputChange: (MeeshyKeyboardDockInput) -> Void = { _ in }

    func item(_ id: String) {
        guard let item = items.first(where: { $0.id == id }) else { return }
        MeeshyKeyboardDockRule.activate(item, input: input, onItem: onItem, onInputChange: onInputChange)
    }

    func confirmed() {
        confirm?.perform()
    }

    func fieldTouched() {
        let next = MeeshyKeyboardDockRule.fieldTouched(input)
        guard next != input else { return }
        onInputChange(next)
    }

    func escaped() {
        guard let next = MeeshyKeyboardDockRule.escaped(input) else { return }
        onInputChange(next)
    }
}

// MARK: - La vue de l'accessoire

/// **La pile de l'accessoire** : la bande `above` s'il y en a une, puis la barre. L'écart de la bande n'existe
/// que si la bande a une hauteur : pas de bande vide, pas d'écart fantôme.
struct MeeshyKeyboardDockStack: Layout {
    let gap: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil)) }
        let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        let width = offered ?? (sizes.map(\.width).max() ?? 0)
        let height = sizes.enumerated().reduce(CGFloat(0)) { total, entry in
            total + entry.element.height + spacing(after: entry.offset, of: sizes)
        }
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil)) }
        var top = bounds.minY
        for (index, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(x: bounds.minX, y: top), anchor: .topLeading,
                proposal: ProposedViewSize(width: bounds.width, height: sizes[index].height)
            )
            top += sizes[index].height + spacing(after: index, of: sizes)
        }
    }

    private func spacing(after index: Int, of sizes: [CGSize]) -> CGFloat {
        index < sizes.count - 1 && sizes[index].height > 0 ? gap : 0
    }
}

/// Ce que la vue accessoire peint : au-dessus, la bande de l'hôte ; dessous, la barre. Rien d'autre.
struct MeeshyKeyboardDockAccessoryRoot<Glyph: View, Above: View>: View {
    let label: String
    let items: [MeeshyKeyboardDockItem]
    let openItem: String?
    let confirm: MeeshyKeyboardDockConfirm
    let tone: MeeshyGlassTone
    let maxWidth: CGFloat
    let glyphKey: AnyHashable?
    let hasAbove: Bool
    let handlers: MeeshyKeyboardDockHandlers
    let glyph: (String) -> Glyph
    let above: Above

    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var body: some View {
        MeeshyKeyboardDockStack(gap: MeeshyKeyboardDockRecipe.aboveGap) {
            if hasAbove {
                VStack(spacing: 0) { above }
                    .transition(.opacity.combined(with: .offset(y: MeeshyKeyboardDockRecipe.bandTravel(reduceMotion: reduceMotion))))
            }
            MeeshyKeyboardBar(
                label: label, items: items, openItem: openItem, confirm: confirm, tone: tone, maxWidth: maxWidth,
                glyphKey: glyphKey, onItem: { [handlers] id in handlers.item(id) }, glyph: glyph
            )
            .equatable()
        }
        .padding(.bottom, MeeshyKeyboardDockRecipe.keyboardGap)
        .animation(.easeOut(duration: MeeshyKeyboardDockRecipe.bandEnterDuration), value: hasAbove)
    }
}

// MARK: - La vue du panneau

/// Ce que la vue du panneau peint : le contenu de l'outil ouvert dans la coque, qui se fond en 150 ms quand
/// l'outil change ; sans outil ouvert, la seule surface.
struct MeeshyKeyboardDockPanelRoot<Content: View>: View {
    let label: String?
    let panelID: String?
    let handlers: MeeshyKeyboardDockHandlers
    let content: (String) -> Content

    var body: some View {
        if let panelID, let label {
            MeeshyKeyboardPanel(label: label) {
                content(panelID)
                    .id(panelID)
                    .transition(.opacity)
            }
            .animation(.easeInOut(duration: MeeshyKeyboardDockRecipe.panelFadeDuration), value: panelID)
            .dismissOnEscape { handlers.escaped() }
        } else {
            MeeshyColors.indigo950.ignoresSafeArea()
        }
    }
}

// MARK: - Le pont vers UIKit

/// Les valeurs dont dépend la vue accessoire : tant qu'elles ne changent pas, sa racine n'est pas réécrite.
private struct MeeshyKeyboardDockAccessoryKey: Hashable {
    let label: String
    let items: [MeeshyKeyboardDockItem]
    let openItem: String?
    let confirmTitle: String
    let confirmLabel: String
    let confirmHint: String?
    let confirmEnabled: Bool
    let tone: MeeshyGlassTone
    let maxWidth: CGFloat
    let glyphKey: AnyHashable?
    let hasAbove: Bool
}

/// Une vue sans pixel : elle monte la barre et le panneau dans les deux vues d'entrée du champ, par le lien.
private struct MeeshyKeyboardDockHost<Glyph: View, Above: View, PanelContent: View>: UIViewRepresentable {
    typealias Accessory = MeeshyKeyboardDockAccessoryRoot<Glyph, Above>
    typealias PanelRoot = MeeshyKeyboardDockPanelRoot<PanelContent>

    let link: MeeshyKeyboardDockLink
    let label: String
    let items: [MeeshyKeyboardDockItem]
    let input: MeeshyKeyboardDockInput
    let confirm: MeeshyKeyboardDockConfirm
    let isActive: Bool
    let tone: MeeshyGlassTone
    let maxBarWidth: CGFloat
    let glyphKey: AnyHashable?
    let hasAbove: Bool
    let onItem: (String) -> Void
    let onInputChange: (MeeshyKeyboardDockInput) -> Void
    let onKeyboardDismissed: () -> Void
    let onPlaceChange: (MeeshyKeyboardDockPlace) -> Void
    let glyph: (String) -> Glyph
    let above: Above
    let panel: (String) -> PanelContent

    @MainActor
    final class Coordinator {
        let handlers = MeeshyKeyboardDockHandlers()
        var controller: MeeshyKeyboardDockController<Accessory, PanelRoot>?
    }

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> UIView {
        let view = UIView(frame: .zero)
        view.isUserInteractionEnabled = false
        return view
    }

    static func dismantleUIView(_ uiView: UIView, coordinator: Coordinator) {
        coordinator.controller?.detach()
    }

    func updateUIView(_ uiView: UIView, context: Context) {
        let handlers = context.coordinator.handlers
        let resolution = MeeshyKeyboardDockRule.resolve(
            isActive: isActive, input: input, items: items, hasAbove: hasAbove
        )
        guard resolution.attachesToField else {
            context.coordinator.controller?.detach()
            return
        }
        let wrapped = MeeshyKeyboardDockConfirm(
            title: confirm.title, label: confirm.label, hint: confirm.hint, isEnabled: confirm.isEnabled,
            action: { [handlers] in handlers.confirmed() }
        )
        handlers.input = resolution.input
        handlers.items = items
        handlers.confirm = confirm
        handlers.onItem = onItem
        handlers.onInputChange = onInputChange
        link.onFieldTouched = { [handlers] in handlers.fieldTouched() }
        if resolution.input != input {
            let corrected = resolution.input
            Task { @MainActor in onInputChange(corrected) }
        }
        let accessory = Accessory(
            label: label, items: items, openItem: resolution.input.panelID, confirm: wrapped, tone: tone,
            maxWidth: maxBarWidth, glyphKey: glyphKey, hasAbove: hasAbove, handlers: handlers, glyph: glyph, above: above
        )
        let openLabel = items.first { $0.id == resolution.input.panelID }?.label
        let panelRoot = PanelRoot(label: openLabel, panelID: resolution.input.panelID, handlers: handlers, content: panel)
        let controller = context.coordinator.controller ?? MeeshyKeyboardDockController(accessory: accessory, panel: panelRoot)
        context.coordinator.controller = controller
        controller.onPlace = onPlaceChange
        controller.onDismissed = onKeyboardDismissed
        controller.update(
            resolution: resolution, link: link, accessory: accessory, accessoryKey: accessoryKey(for: resolution),
            panel: panelRoot, announcement: MeeshyKeyboardDockRule.announcement(for: resolution.input, items: items)
        )
    }

    private func accessoryKey(for resolution: MeeshyKeyboardDockRule.Resolution) -> AnyHashable {
        AnyHashable(MeeshyKeyboardDockAccessoryKey(
            label: label, items: items, openItem: resolution.input.panelID, confirmTitle: confirm.title,
            confirmLabel: confirm.label, confirmHint: confirm.hint, confirmEnabled: confirm.isEnabled, tone: tone,
            maxWidth: maxBarWidth, glyphKey: glyphKey, hasAbove: hasAbove
        ))
    }
}

// MARK: - Le dock

/// **La barre collée au clavier et le panneau qui le remplace** (K17), pour un champ en place.
///
/// Une vue SANS PIXEL dans l'hôte : elle peint dans les deux vues d'entrée du champ que le lien (`link`) lui
/// donne, la barre en accessoire du clavier et, quand un outil à panneau est ouvert (`input`), le panneau à la
/// place du clavier, à sa hauteur exacte. Le champ garde le focus tout du long ; la barre ne bouge pas à la
/// bascule ; un clavier flottant, scindé ou matériel est suivi par le système.
///
/// - `input` est contrôlé par l'hôte ; `onInputChange` rend la valeur que la loi a élue (toucher un outil à
///   panneau, toucher le champ par `link.fieldTouched()`, Échap dans le panneau).
/// - `onItem` entend chaque toucher d'un outil actif, une fois ; « OK » appelle `confirm.action`, K17 ne
///   termine rien lui-même.
/// - `onPlaceChange` publie, une fois par mouvement du clavier, la réserve que l'hôte retire de sa scène.
/// - `onKeyboardDismissed` : le système a rangé le clavier alors que `input` vaut `keyboard`.
/// - `isActive` faux : rien n'est monté ni accroché au champ.
/// - `tone` est un paramètre : la barre vit dans la fenêtre du clavier, l'environnement de l'hôte n'y arrive pas.
///
/// Emplacements : `glyph(id)` remplace l'image d'un outil, `above` se pose à 4 au-dessus de la barre (mentions,
/// compteur), `panel(id)` est le contenu du panneau de l'outil ouvert.
public struct MeeshyKeyboardDock<Glyph: View, Above: View, PanelContent: View>: View {
    private let link: MeeshyKeyboardDockLink
    private let label: String
    private let items: [MeeshyKeyboardDockItem]
    private let input: MeeshyKeyboardDockInput
    private let confirm: MeeshyKeyboardDockConfirm
    private let isActive: Bool
    private let tone: MeeshyGlassTone
    private let maxBarWidth: CGFloat
    private let glyphKey: AnyHashable?
    private let onItem: (String) -> Void
    private let onInputChange: (MeeshyKeyboardDockInput) -> Void
    private let onKeyboardDismissed: () -> Void
    private let onPlaceChange: (MeeshyKeyboardDockPlace) -> Void
    private let glyph: (String) -> Glyph
    private let above: Above
    private let panel: (String) -> PanelContent

    public init(
        link: MeeshyKeyboardDockLink,
        label: String,
        items: [MeeshyKeyboardDockItem],
        input: MeeshyKeyboardDockInput = .keyboard,
        confirm: MeeshyKeyboardDockConfirm,
        isActive: Bool = true,
        tone: MeeshyGlassTone = .deep,
        maxBarWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        glyphKey: AnyHashable? = nil,
        onItem: @escaping (String) -> Void = { _ in },
        onInputChange: @escaping (MeeshyKeyboardDockInput) -> Void = { _ in },
        onKeyboardDismissed: @escaping () -> Void = {},
        onPlaceChange: @escaping (MeeshyKeyboardDockPlace) -> Void = { _ in },
        glyph: @escaping (String) -> Glyph,
        @ViewBuilder above: () -> Above,
        panel: @escaping (String) -> PanelContent
    ) {
        assert(!label.isEmpty, "MeeshyKeyboardDock : le nom de la barre est obligatoire et non vide")
        self.link = link
        self.label = label
        self.items = items
        self.input = input
        self.confirm = confirm
        self.isActive = isActive
        self.tone = tone
        self.maxBarWidth = maxBarWidth
        self.glyphKey = glyphKey
        self.onItem = onItem
        self.onInputChange = onInputChange
        self.onKeyboardDismissed = onKeyboardDismissed
        self.onPlaceChange = onPlaceChange
        self.glyph = glyph
        self.above = above()
        self.panel = panel
    }

    private static var hasAbove: Bool {
        Above.self != EmptyView.self && Above.self != MeeshyKeyboardDockNoSlot.self
    }

    public var body: some View {
        MeeshyKeyboardDockHost(
            link: link, label: label, items: items, input: input, confirm: confirm, isActive: isActive, tone: tone,
            maxBarWidth: maxBarWidth, glyphKey: glyphKey, hasAbove: Self.hasAbove, onItem: onItem,
            onInputChange: onInputChange, onKeyboardDismissed: onKeyboardDismissed, onPlaceChange: onPlaceChange,
            glyph: glyph, above: above, panel: panel
        )
        .frame(width: 0, height: 0)
        .accessibilityHidden(true)
    }
}

// MARK: - Les inits sans emplacement vide

public extension MeeshyKeyboardDock where Glyph == MeeshyGlassButtonSymbol {
    /// Les outils portent l'image système qu'ils déclarent.
    init(
        link: MeeshyKeyboardDockLink,
        label: String,
        items: [MeeshyKeyboardDockItem],
        input: MeeshyKeyboardDockInput = .keyboard,
        confirm: MeeshyKeyboardDockConfirm,
        isActive: Bool = true,
        tone: MeeshyGlassTone = .deep,
        maxBarWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        onItem: @escaping (String) -> Void = { _ in },
        onInputChange: @escaping (MeeshyKeyboardDockInput) -> Void = { _ in },
        onKeyboardDismissed: @escaping () -> Void = {},
        onPlaceChange: @escaping (MeeshyKeyboardDockPlace) -> Void = { _ in },
        @ViewBuilder above: () -> Above,
        panel: @escaping (String) -> PanelContent
    ) {
        self.init(
            link: link, label: label, items: items, input: input, confirm: confirm, isActive: isActive, tone: tone,
            maxBarWidth: maxBarWidth, onItem: onItem, onInputChange: onInputChange,
            onKeyboardDismissed: onKeyboardDismissed, onPlaceChange: onPlaceChange,
            glyph: { id in MeeshyGlassButtonSymbol(items.first { $0.id == id }?.systemImage ?? "circle") },
            above: above, panel: panel
        )
    }
}

public extension MeeshyKeyboardDock where Above == MeeshyKeyboardDockNoSlot {
    init(
        link: MeeshyKeyboardDockLink,
        label: String,
        items: [MeeshyKeyboardDockItem],
        input: MeeshyKeyboardDockInput = .keyboard,
        confirm: MeeshyKeyboardDockConfirm,
        isActive: Bool = true,
        tone: MeeshyGlassTone = .deep,
        maxBarWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        glyphKey: AnyHashable? = nil,
        onItem: @escaping (String) -> Void = { _ in },
        onInputChange: @escaping (MeeshyKeyboardDockInput) -> Void = { _ in },
        onKeyboardDismissed: @escaping () -> Void = {},
        onPlaceChange: @escaping (MeeshyKeyboardDockPlace) -> Void = { _ in },
        glyph: @escaping (String) -> Glyph,
        panel: @escaping (String) -> PanelContent
    ) {
        self.init(
            link: link, label: label, items: items, input: input, confirm: confirm, isActive: isActive, tone: tone,
            maxBarWidth: maxBarWidth, glyphKey: glyphKey, onItem: onItem, onInputChange: onInputChange,
            onKeyboardDismissed: onKeyboardDismissed, onPlaceChange: onPlaceChange,
            glyph: glyph, above: { MeeshyKeyboardDockNoSlot() }, panel: panel
        )
    }
}

public extension MeeshyKeyboardDock where Glyph == MeeshyGlassButtonSymbol, Above == MeeshyKeyboardDockNoSlot {
    init(
        link: MeeshyKeyboardDockLink,
        label: String,
        items: [MeeshyKeyboardDockItem],
        input: MeeshyKeyboardDockInput = .keyboard,
        confirm: MeeshyKeyboardDockConfirm,
        isActive: Bool = true,
        tone: MeeshyGlassTone = .deep,
        maxBarWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        onItem: @escaping (String) -> Void = { _ in },
        onInputChange: @escaping (MeeshyKeyboardDockInput) -> Void = { _ in },
        onKeyboardDismissed: @escaping () -> Void = {},
        onPlaceChange: @escaping (MeeshyKeyboardDockPlace) -> Void = { _ in },
        panel: @escaping (String) -> PanelContent
    ) {
        self.init(
            link: link, label: label, items: items, input: input, confirm: confirm, isActive: isActive, tone: tone,
            maxBarWidth: maxBarWidth, onItem: onItem, onInputChange: onInputChange,
            onKeyboardDismissed: onKeyboardDismissed, onPlaceChange: onPlaceChange,
            above: { MeeshyKeyboardDockNoSlot() }, panel: panel
        )
    }
}
