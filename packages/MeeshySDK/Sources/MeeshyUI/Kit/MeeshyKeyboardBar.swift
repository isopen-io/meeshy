import SwiftUI

/// **La barre collée au clavier** (K17) : une capsule de verre (K01, au ton passé en paramètre) qui porte les
/// outils du champ, boutons ronds de K02 emboîtés, et « OK » au bord de fin, la capsule pleine de K16.
/// Aucune légende, aucun titre peint : le nom de la barre (`label`) et celui de chaque outil vivent dans
/// l'accessibilité.
///
/// - Un outil à panneau est annoncé développé ou réduit, et blanc (actif) quand son panneau est ouvert
///   (`openItem`) ; une action simple ne l'est jamais.
/// - Un outil désactivé n'a ni action ni haptique (K02). L'haptique est celle de K02 et de la capsule.
/// - « OK » grandit sur une ligne avec Dynamic Type jusqu'à `xxxLarge`, puis passe en coche quand la rangée
///   ne tient plus (`MeeshyKeyboardBarFit`) : son nom reste dit.
/// - Cinq outils au plus. Sans outil, la capsule épouse « OK ».
/// - Sur iOS 26+, les verres des outils fondent dans un même conteneur (`MeeshyGlassGroup`), posé DANS la
///   capsule : comme la pilule de K10, jamais un verre isolé sur le verre de la barre.
///
/// `Equatable` sur ses valeurs (fermetures hors comparaison) : un hôte qui se re-rend à paramètres égaux, la
/// frappe, le mouvement du clavier ou un réglage du panneau ne le re-rendent pas. Le `glyphKey` dit ce qui
/// fait changer l'encre d'un glyphe personnalisé (la couleur d'une pastille).
public struct MeeshyKeyboardBar<Glyph: View>: View, Equatable {
    private let label: String
    private let items: [MeeshyKeyboardDockItem]
    private let openItem: String?
    private let confirm: MeeshyKeyboardDockConfirm
    private let tone: MeeshyGlassTone
    private let maxWidth: CGFloat
    private let glyphKey: AnyHashable?
    private let onItem: (String) -> Void
    private let glyph: (String) -> Glyph

    public init(
        label: String,
        items: [MeeshyKeyboardDockItem],
        openItem: String?,
        confirm: MeeshyKeyboardDockConfirm,
        tone: MeeshyGlassTone = .deep,
        maxWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        glyphKey: AnyHashable? = nil,
        onItem: @escaping (String) -> Void,
        glyph: @escaping (String) -> Glyph
    ) {
        assert(!label.isEmpty, "MeeshyKeyboardBar : le nom de la barre est obligatoire et non vide")
        self.label = label
        self.items = items
        self.openItem = openItem
        self.confirm = confirm
        self.tone = tone
        self.maxWidth = maxWidth
        self.glyphKey = glyphKey
        self.onItem = onItem
        self.glyph = glyph
    }

    public static func == (lhs: MeeshyKeyboardBar, rhs: MeeshyKeyboardBar) -> Bool {
        lhs.label == rhs.label && lhs.items == rhs.items && lhs.openItem == rhs.openItem
            && lhs.confirm == rhs.confirm && lhs.tone == rhs.tone && lhs.maxWidth == rhs.maxWidth && lhs.glyphKey == rhs.glyphKey
    }

    public var body: some View {
        MeeshyGlassGroup(spacing: MeeshyKeyboardDockRecipe.toolGlassSpacing) {
            ViewThatFits(in: .horizontal) {
                row(display: .title)
                row(display: .glyph)
            }
        }
        .padding(MeeshyKeyboardDockRecipe.barPadding)
        .frame(height: MeeshyKeyboardDockRecipe.barHeight)
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .meeshyGlass(in: Capsule(), tone: tone)
        .meeshyGlassTone(tone)
        .frame(maxWidth: maxWidth)
        .padding(.horizontal, MeeshyKeyboardDockRecipe.edge)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
    }

    private var tools: [MeeshyKeyboardDockItem] {
        MeeshyKeyboardDockRule.visibleItems(items)
    }

    /// Les entrées sont construites ICI, par le `body`, sur le fil principal : la rangée est un candidat de
    /// `ViewThatFits`, que le rendu asynchrone d'iOS 26 mesure hors du fil principal — le `ForEach` n'y relit
    /// que des vues déjà faites (`AsyncRenderRow`, #9456). Chaque entrée est un type NOMMÉ
    /// (`MeeshyKeyboardBarToolSlot`) : un type opaque d'une méthode du type générique, passé en argument
    /// générique d'`AsyncRenderRow`, fait planter l'IRGen de Swift 6.2.
    private func row(display: MeeshyModeCapsuleDisplay) -> some View {
        HStack(spacing: 0) {
            ForEach(tools.map { AsyncRenderRow(id: $0.id, content: toolSlot($0)) },
                    content: asyncRenderRowContent)
            if tools.isEmpty { Spacer(minLength: 0) }
            MeeshyModeCapsule(
                title: confirm.title,
                systemImage: display == .glyph ? "checkmark" : nil,
                kind: .solid,
                display: display,
                hint: confirm.hint,
                action: { confirm.perform() }
            )
            .disabled(!confirm.isEnabled)
            .accessibilityLabel(confirm.label)
        }
    }

    private func toolSlot(_ item: MeeshyKeyboardDockItem) -> MeeshyKeyboardBarToolSlot<Glyph> {
        MeeshyKeyboardBarToolSlot(
            item: item,
            activation: MeeshyKeyboardDockRule.activation(for: item, openItem: openItem),
            onItem: onItem,
            glyph: glyph
        )
    }
}

/// Un outil de la barre suivi de son espace, CONSTRUIT par le `body` de la barre : le `ForEach` qui vit sous
/// `ViewThatFits` ne fait que le relire (`AsyncRenderRow`). Son `body` rend deux vues à plat — la rangée
/// répartit donc l'espace libre entre les outils comme si chacun y était posé directement.
struct MeeshyKeyboardBarToolSlot<Glyph: View>: View {
    let item: MeeshyKeyboardDockItem
    let activation: MeeshyGlassButtonActivation
    let onItem: (String) -> Void
    let glyph: (String) -> Glyph

    var body: some View {
        MeeshyGlassButton(
            label: item.label,
            hint: item.hint,
            value: item.value,
            activation: activation,
            action: { onItem(item.id) },
            glyph: { glyph(item.id) }
        )
        .disabled(!item.isEnabled)
        Spacer(minLength: 0)
    }
}

public extension MeeshyKeyboardBar where Glyph == MeeshyGlassButtonSymbol {
    /// Les outils portent l'image système qu'ils déclarent.
    init(
        label: String,
        items: [MeeshyKeyboardDockItem],
        openItem: String?,
        confirm: MeeshyKeyboardDockConfirm,
        tone: MeeshyGlassTone = .deep,
        maxWidth: CGFloat = MeeshyKeyboardDockRecipe.maxBarWidth,
        glyphKey: AnyHashable? = nil,
        onItem: @escaping (String) -> Void
    ) {
        self.init(
            label: label, items: items, openItem: openItem, confirm: confirm, tone: tone, maxWidth: maxWidth,
            glyphKey: glyphKey,
            onItem: onItem,
            glyph: { id in MeeshyGlassButtonSymbol(items.first { $0.id == id }?.systemImage ?? "circle") }
        )
    }
}
