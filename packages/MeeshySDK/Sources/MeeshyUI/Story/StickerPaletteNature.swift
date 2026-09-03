import SwiftUI
import MeeshySDK

// MARK: - La NATURE d'une décoration, avant sa famille (#5012)

/// **Ce qu'une décoration EST, question posée avant « laquelle ».**
///
/// > Directive porteur 2026-09-03 : « La feuille des stickers doit afficher en
/// > haut un switch liquidglass avec logo sticker et logo smiley avec la liste
/// > des stickers et smileys par categorie verticalement ! »
///
/// La palette mêlait les deux dans un même ruban d'onglets : `Emoji` voisinait
/// avec `Love`, `Joie`, `Heure`… alors que ce sont deux natures et non deux
/// familles. Un glyphe du système d'un côté, une construction DESSINÉE par
/// l'application de l'autre — elles ne se posent pas pareil, ne se rendent pas
/// pareil, et l'une seule peut bouger (#4821).
///
/// > **Deux questions, deux contrôles.** Le switch dit la NATURE, les sections
/// > disent la FAMILLE. Les mêler dans une seule rangée obligeait l'auteur à
/// > faire défiler pour découvrir qu'il existait autre chose que des emoji.
public enum StickerPaletteNature: String, CaseIterable, Identifiable, Sendable {
    /// Les constructions du catalogue — gabarits, lieu, texte, « Mes stickers ».
    case sticker
    /// Les glyphes du système, rangés par catégorie Unicode.
    case smiley

    public var id: String { rawValue }

    /// **La nature d'un onglet existant** — la table qui permet au switch de
    /// remplacer le ruban sans rien perdre : tout onglet servi appartient à une
    /// nature, et une seule.
    public static func of(_ tab: StickerPaletteTab) -> StickerPaletteNature {
        tab == .emoji ? .smiley : .sticker
    }

    /// Le glyphe de chaque position. Celui du sticker est **le même que celui
    /// de la porte qui ouvre la feuille** (`StickerPickerView.sheetSymbolName`)
    /// — une position dont l'icône diffère du bouton qui l'a fait paraître fait
    /// perdre à l'auteur la trace de ce qu'il a touché.
    public var symbolName: String {
        switch self {
        case .sticker: return StickerPickerView.sheetSymbolName
        case .smiley:  return "face.smiling"
        }
    }

    public var title: String {
        switch self {
        case .sticker:
            return String(localized: "sticker.nature.sticker", defaultValue: "Stickers", bundle: .module)
        case .smiley:
            return String(localized: "sticker.nature.smiley", defaultValue: "Smileys", bundle: .module)
        }
    }
}

// MARK: - Le switch

/// **Deux positions, en verre.**
///
/// ## Pourquoi `adaptiveGlass` et pas un matériau écrit ici
///
/// Le verre liquide n'existe pas sur tout le plancher que l'app tient
/// (iOS 16→26), et `MeeshyUI/Compatibility/AdaptiveGlass.swift` est l'endroit
/// UNIQUE où le repli est décidé — onze surfaces le montent, dont trois du
/// composer. Un matériau écrit à la main ici rendrait un aspect juste sur l'OS
/// de développement et un autre sur le plancher, sans que rien ne rougisse.
///
/// ## Pourquoi un contrôle et pas un `Picker` segmenté
///
/// Le segmented natif s'annonce seul (« 1 sur 2 ») mais n'accepte pas le verre :
/// son fond est imposé. Le contrôle est donc écrit, et il DOIT reproduire à la
/// main ce que le natif donnait — `.isSelected` sur la position active, et un
/// libellé qui dit la nature. C'est la dette qu'un contrôle maison contracte,
/// et la seule raison acceptable de le préférer.
public struct StickerNatureSwitch: View {
    @Binding private var selection: StickerPaletteNature

    public init(selection: Binding<StickerPaletteNature>) {
        self._selection = selection
    }

    public var body: some View {
        HStack(spacing: 4) {
            ForEach(StickerPaletteNature.allCases) { nature in
                position(nature)
            }
        }
        .padding(3)
        .adaptiveGlass(in: Capsule())
    }

    @ViewBuilder
    private func position(_ nature: StickerPaletteNature) -> some View {
        let choisie = selection == nature
        Button {
            withAnimation(.spring(response: 0.25)) { selection = nature }
            HapticFeedback.light()
        } label: {
            Image(systemName: nature.symbolName)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(choisie
                                 ? AnyShapeStyle(MeeshyColors.brandGradient)
                                 : AnyShapeStyle(Color.secondary))
                // 44 pt : la cible ne rétrécit pas parce que le dessin est un
                // glyphe (dimension 5).
                .frame(width: 52, height: 38)
                .background(
                    Capsule().fill(choisie ? Color.primary.opacity(0.10) : Color.clear)
                )
        }
        // `.plain` obligatoire dans cette feuille : le style par défaut rend les
        // glyphes invisibles (vécu it.72, même cause que les onglets emoji).
        .buttonStyle(.plain)
        .accessibilityLabel(nature.title)
        .accessibilityAddTraits(choisie ? [.isSelected] : [])
    }
}
