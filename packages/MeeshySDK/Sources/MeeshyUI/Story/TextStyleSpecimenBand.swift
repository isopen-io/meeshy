import SwiftUI
import MeeshySDK

/// **Le spécimen des dix-huit styles de texte** — vue `2e` de la planche
/// (#4083).
///
/// > « Le spécimen se lit sur le fond réel. L'aperçu en haut applique le style
/// > sélectionné au VRAI texte de la scène ; la grille ne montre que `Aa` pour
/// > rester comparable d'un style à l'autre. »
///
/// ## Deux registres, et c'est la doctrine
///
/// L'aperçu répond à « à quoi ressemblera MON texte ? » ; la grille répond à
/// « lequel choisir ? ». La seconde question exige que les dix-huit vignettes
/// portent le MÊME contenu — un texte réel de longueur variable ferait comparer
/// des largeurs plutôt que des typographies.
///
/// ## Ce que cette vue ne sait pas, délibérément
///
/// Ni quel objet est sélectionné, ni où il vit, ni ce qu'un choix écrit. Elle
/// reçoit un texte, un style et un rappel — c'est ce qui la range du côté SDK
/// (§ SDK Purity) et lui permet de servir aussi bien la scène incrustée que
/// l'atelier.
///
/// ## Cibles tactiles
///
/// 48 × 48, là où la rangée historique de `TextEditToolOptions` posait
/// 46 × **38** — sous le minimum de 44 pt (dimension 5). Une vignette qu'on
/// rate au doigt n'est pas un choix offert.
public struct TextStyleSpecimenBand: View {

    /// Le VRAI texte de l'objet sélectionné. Vide ⇒ l'aperçu ne se peint pas :
    /// une ligne de spécimen fabriquée répondrait à la question « à quoi
    /// ressemblera mon texte ? » par un texte qui n'est pas le sien.
    public let text: String
    public let selection: StoryTextStyle

    /// Le plateau du composer est sombre EN PERMANENCE, quel que soit le thème
    /// de l'appareil. Sans ce drapeau, les vignettes non sélectionnées peignent
    /// du sombre sur du sombre — présentes à l'accessibilité, invisibles à
    /// l'œil (défaut mesuré au simulateur le 2026-08-30 sur les puces
    /// d'ouverture, même cause).
    public let onDarkSurface: Bool
    public let onSelect: (StoryTextStyle) -> Void

    public init(text: String,
                selection: StoryTextStyle,
                onDarkSurface: Bool = false,
                onSelect: @escaping (StoryTextStyle) -> Void) {
        self.text = text
        self.selection = selection
        self.onDarkSurface = onDarkSurface
        self.onSelect = onSelect
    }

    private static let cell: CGFloat = 48
    private static let gap: CGFloat = 8

    private var ink: Color { onDarkSurface ? .white : .primary }
    private var inkMuted: Color { onDarkSurface ? .white.opacity(0.62) : .secondary }
    private var restingFill: Color { onDarkSurface ? .white.opacity(0.14) : .gray.opacity(0.18) }

    public var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            apercu
            grille
        }
    }

    /// L'aperçu applique le style au texte RÉEL, sur une seule ligne : la bande
    /// vit sous une scène qu'elle rétrécit, et un aperçu multiligne prendrait
    /// la place de ce qu'il décrit.
    @ViewBuilder
    private var apercu: some View {
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Text(text)
                .font(storyFont(for: selection, size: 24))
                .foregroundStyle(ink)
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityHidden(true)
        }
    }

    /// Deux rangées, défilement horizontal : dix-huit vignettes ne tiennent pas
    /// sur une largeur de téléphone, et les empiler verticalement mangerait la
    /// scène. Le défilement garde la COMPARAISON latérale — le critère même qui
    /// fait de ce contexte une bande plutôt qu'un rail.
    private var grille: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHGrid(rows: [GridItem(.fixed(Self.cell), spacing: Self.gap),
                             GridItem(.fixed(Self.cell), spacing: Self.gap)],
                      spacing: Self.gap) {
                ForEach(StoryTextStyle.allCases, id: \.self) { style in
                    vignette(style)
                }
            }
            .padding(.vertical, 2)
        }
    }

    private func vignette(_ style: StoryTextStyle) -> some View {
        let choisi = style == selection
        return Button {
            onSelect(style)
            HapticFeedback.light()
        } label: {
            Text(verbatim: "Aa")
                .font(storyFont(for: style, size: 19))
                .foregroundStyle(choisi ? Color.white : ink)
                .frame(width: Self.cell, height: Self.cell)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(choisi ? AnyShapeStyle(MeeshyColors.brandGradient)
                                     : AnyShapeStyle(restingFill))
                )
        }
        .buttonStyle(.plain)
        // « Aa » se VOIT ; il ne se DIT pas. Le nom de la famille est ce qu'un
        // lecteur d'écran doit entendre — les noms de fontes ne se traduisent
        // pas, c'est du vocabulaire typographique.
        .accessibilityLabel(style.displayName)
        .accessibilityAddTraits(choisi ? [.isButton, .isSelected] : .isButton)
    }
}
