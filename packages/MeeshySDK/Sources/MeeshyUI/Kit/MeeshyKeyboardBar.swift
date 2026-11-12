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
        ViewThatFits(in: .horizontal) {
            row(display: .title)
            row(display: .glyph)
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

    private func row(display: MeeshyModeCapsuleDisplay) -> some View {
        HStack(spacing: 0) {
            ForEach(tools) { item in
                tool(item)
                Spacer(minLength: 0)
            }
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

    private func tool(_ item: MeeshyKeyboardDockItem) -> some View {
        MeeshyGlassButton(
            label: item.label,
            hint: item.hint,
            value: item.value,
            activation: MeeshyKeyboardDockRule.activation(for: item, openItem: openItem),
            action: { onItem(item.id) },
            glyph: { glyph(item.id) }
        )
        .disabled(!item.isEnabled)
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
