import SwiftUI
import MeeshySDK

/// **La DISPOSITION du panneau d'options est DEMANDÉE par l'hôte** (#5045,
/// directive porteur 2026-09-03).
///
/// > « Il faut lister les Fond en verticale sur le nombre de rangé qui entre
/// > dans l'écran. Pareil pour les effets, il faut montrer l'exemple dans la
/// > boxe (mis à l'échelle), le nom de l'option en bas et non dans la box…
/// > listé verticalement centré aussi »
///
/// ## Pourquoi un PARAMÈTRE, et non un remplacement
///
/// `TextEditToolOptions` est monté par **trois** hôtes, et la hauteur ne vaut
/// pas la même chose chez chacun :
///
/// | hôte | place | ce que la grille y ferait |
/// |---|---|---|
/// | `ComposerObjectEditorView` (app) | écran plein, options plafonnées | ce que la directive demande |
/// | `StoryTextEditToolbar` (SDK) | îlot AU-DESSUS du clavier | mangerait une hauteur qui n'existe pas |
/// | `MeeshyToolOptionsPanel` (SDK) | zone basse de la scène | volerait la carte 9:16 |
///
/// Basculer le SDK entier aurait donc réglé un écran en cassant les deux
/// autres. Le défaut `.row` garantit qu'un hôte qui ne dit rien garde
/// exactement la forme qu'il avait — la grille est une DEMANDE, jamais un
/// changement subi.
public enum TextEditOptionsLayout: String, Sendable, CaseIterable {

    /// Rangée horizontale défilante — la forme historique.
    case row

    /// Grille verticale : les vignettes s'enroulent sur le nombre de colonnes
    /// que la largeur permet, et le nom se pose SOUS la boîte.
    case grid

    /// **Quels outils la grille gouverne — et pourquoi les autres non.**
    ///
    /// **POLICE a rejoint la grille le 2026-09-05** (directive porteur : « aligne
    /// les polices rangée par rangée comme les effets », #5244). Elle en était
    /// exclue pour une raison écrite — « POLICE porte un curseur et sa propre
    /// grille de dix-huit spécimens » — que la directive supplante : le curseur
    /// de taille vit au-dessus et n'a jamais empêché un enroulement, et la
    /// « grille de spécimens » est une bande HORIZONTALE à deux rangs
    /// (`TextStyleSpecimenBand`), montée ailleurs, qui ne dispensait donc pas
    /// ce panneau-ci d'avoir la même anatomie que ses voisins.
    ///
    /// Les cinq restants ne s'y prêtent toujours pas : ALIGNEMENT tient en
    /// trois pictogrammes qu'aucune ligne ne déborde, CADRE et LISERÉ empilent
    /// déjà curseurs et palettes, LANGUE et COULEUR n'ont pas de nom à poser
    /// sous une boîte — une pastille de couleur EST son propre nom.
    ///
    /// Règle EXHAUSTIVE plutôt qu'un `default` : un neuvième outil ajouté à
    /// `TextEditTool` doit forcer une décision ici, pas hériter d'un silence.
    public nonisolated func wraps(_ tool: TextEditTool) -> Bool {
        guard self == .grid else { return false }
        switch tool {
        case .background, .effect, .style:
            return true
        case .color, .align, .frame, .border, .language:
            return false
        }
    }
}

/// Gabarit de la grille. Les valeurs vivent ici plutôt que dans le corps de la
/// vue : une constante écrite dans un `body` est invisible aux tests, et
/// celle-ci décide combien d'options l'auteur voit sans défiler.
nonisolated enum TextEditOptionsGridMetrics {

    /// Largeur MINIMALE d'une colonne — `GridItem(.adaptive(minimum:))` en
    /// dérive le nombre de colonnes qui entrent dans la largeur servie, ce
    /// qui est exactement la formulation de la directive (« sur le nombre de
    /// rangé qui entre dans l'écran »).
    static let minimumColumnWidth: CGFloat = 72

    static let columnSpacing: CGFloat = 10
    static let rowSpacing: CGFloat = 14

    /// Le côté de la BOÎTE, où l'exemple est rendu à l'échelle. 56 pt : bien
    /// au-dessus du plancher de 44 pt (dimension 5), et assez large pour
    /// qu'une lueur ou une ombre longue tienne dans le cadre sans être rognée.
    static let boxSide: CGFloat = 56

    static let boxCornerRadius: CGFloat = 12

    /// **Le nombre de colonnes qu'une largeur permet.**
    ///
    /// C'est la règle que `.adaptive(minimum:)` applique pour son compte ;
    /// elle est écrite ici pour être TESTABLE — non pour être appelée par la
    /// vue. Ce qu'elle garde n'est pas l'arithmétique de SwiftUI mais le
    /// gabarit : que `minimumColumnWidth` reste assez petit pour que l'iPhone
    /// le plus étroit rende plusieurs colonnes. Une valeur trop grande y
    /// dégraderait la grille en COLONNE UNIQUE — douze fonds sur douze
    /// rangées, soit pire que la rangée qu'on remplace.
    static func columnCount(forWidth width: CGFloat) -> Int {
        guard width > 0 else { return 1 }
        let unit = minimumColumnWidth + columnSpacing
        return max(1, Int((width + columnSpacing) / unit))
    }
}

// MARK: - Les deux grilles

extension TextEditToolOptions {

    var gridColumns: [GridItem] {
        [GridItem(.adaptive(minimum: TextEditOptionsGridMetrics.minimumColumnWidth),
                  spacing: TextEditOptionsGridMetrics.columnSpacing)]
    }

    /// L'encre du spécimen est celle que l'auteur a CHOISIE, jamais une encre
    /// de démonstration : une vignette qui montre un « Aa » blanc pendant que
    /// le texte est rouge compare deux effets sur une donnée qui n'est pas la
    /// sienne.
    var specimenInk: Color { Color(hex: textObject.textColor ?? "FFFFFF") }

    /// Le fond de la boîte tient lieu de SCÈNE. Sans lui, un fond translucide
    /// (« Noir 65 % ») et son opaque voisin peindraient la même vignette : ce
    /// dégradé est ce à travers quoi l'alpha se VOIT.
    var specimenCanvas: some View {
        LinearGradient(colors: [Color.gray.opacity(0.55), Color.gray.opacity(0.16)],
                       startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var effectGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: TextEditOptionsGridMetrics.rowSpacing) {
            ForEach(StoryTextEffect.allCases, id: \.self) { effect in
                effectGridCell(effect)
            }
        }
        .padding(.vertical, 4)
    }

    /// **La grille des POLICES** (#5244) — même gabarit que les fonds et les
    /// effets, par le MÊME `gridCell` : le spécimen dans la boîte, le nom
    /// dessous. Écrire une seconde cellule « comme celle-ci mais pour les
    /// polices » aurait fait diverger les trois anatomies à la première
    /// retouche de l'une.
    ///
    /// Le spécimen est rendu AVEC l'effet courant du texte : on choisit une
    /// police pour ce qu'elle donnera, et l'effet en change la lecture — c'est
    /// la réciproque exacte de la vignette d'effet, qui rend « Aa » dans la
    /// police courante.
    var styleGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: TextEditOptionsGridMetrics.rowSpacing) {
            ForEach(StoryTextStyle.allCases, id: \.self) { style in
                styleGridCell(style)
            }
        }
        .padding(.vertical, 4)
    }

    var backgroundGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: TextEditOptionsGridMetrics.rowSpacing) {
            ForEach(Array(StoryTextBackgroundPresets.all.enumerated()), id: \.offset) { _, style in
                backgroundGridCell(style)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: - Une cellule

    /// **La sélection se marque par un ANNEAU, jamais par un remplissage.**
    ///
    /// La rangée historique peint la pastille choisie au dégradé de marque et
    /// force son encre en blanc — ce qui, sur une vignette dont tout l'intérêt
    /// est de MONTRER une couleur ou un effet, efface précisément ce qu'on est
    /// venu comparer. L'anneau dit la même chose en ne cachant rien.
    private func gridCell<Sample: View>(name: String,
                                        selected: Bool,
                                        @ViewBuilder sample: () -> Sample) -> some View {
        VStack(spacing: 5) {
            ZStack { sample() }
                .frame(width: TextEditOptionsGridMetrics.boxSide,
                       height: TextEditOptionsGridMetrics.boxSide)
                .clipShape(RoundedRectangle(cornerRadius: TextEditOptionsGridMetrics.boxCornerRadius,
                                            style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: TextEditOptionsGridMetrics.boxCornerRadius,
                                     style: .continuous)
                        .strokeBorder(
                            selected ? AnyShapeStyle(MeeshyColors.brandGradient)
                                     : AnyShapeStyle(Color.primary.opacity(0.14)),
                            lineWidth: selected ? 2.5 : 1
                        )
                )

            // **Le nom SOUS la boîte, hors d'elle** — c'est la directive mot
            // pour mot : « le nom de l'option en bas et non dans la box ».
            // Dedans, il occupait la moitié de la surface qui devait montrer
            // l'exemple.
            Text(name)
                .font(.system(size: 10, weight: selected ? .bold : .medium))
                .foregroundStyle(selected ? MeeshyColors.brandPrimary : Color.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        // Centré dans sa colonne : la grille répartit la largeur restante,
        // et une vignette calée à gauche décrocherait de son nom.
        .frame(maxWidth: .infinity)
    }

    private func effectGridCell(_ effect: StoryTextEffect) -> some View {
        let isSel = textObject.parsedTextEffect == effect
        let ink = specimenInk
        return Button {
            // « Aucun » s'écrit `nil` — même règle que la rangée et que
            // `StoryTextAttributeCycle`.
            textObject.textEffect = effect == StoryTextEffect.none ? nil : effect.rawValue
            HapticFeedback.light()
        } label: {
            gridCell(name: TextEditLabels.title(for: effect), selected: isSel) {
                specimenCanvas
                Text(verbatim: "Aa")
                    .font(storyFont(for: textObject.parsedTextStyle, size: 20))
                    .foregroundStyle(ink)
                    .storyTextEffect(effect, fontSize: 20, textColor: ink)
            }
        }
        .buttonStyle(.plain)
        // La boîte et le nom disent la MÊME chose : sans cette fusion,
        // VoiceOver lirait deux fois le libellé pour une seule cible.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TextEditLabels.title(for: effect))
        .accessibilityAddTraits(isSel ? [.isButton, .isSelected] : .isButton)
    }

    private func styleGridCell(_ style: StoryTextStyle) -> some View {
        let isSel = textObject.parsedTextStyle == style
        let ink = specimenInk
        return Button {
            textObject.textStyle = style.rawValue
            HapticFeedback.light()
        } label: {
            gridCell(name: TextEditLabels.title(for: style), selected: isSel) {
                specimenCanvas
                Text(verbatim: "Aa")
                    .font(storyFont(for: style, size: 22))
                    .foregroundStyle(ink)
                    .storyTextEffect(textObject.parsedTextEffect, fontSize: 22, textColor: ink)
            }
        }
        .buttonStyle(.plain)
        // La boîte et le nom disent la MÊME chose — sans cette fusion,
        // VoiceOver lirait deux fois le libellé pour une seule cible. Et
        // c'est ici que dix-huit boutons cessent d'être annoncés « Aa ».
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(TextEditLabels.title(for: style))
        .accessibilityAddTraits(isSel ? [.isButton, .isSelected] : .isButton)
    }

    private func backgroundGridCell(_ style: StoryTextBackgroundStyle) -> some View {
        let isSel = textObject.resolvedBackgroundStyle == style
        let ink = specimenInk
        return Button {
            textObject.backgroundStyle = style
            textObject.textBg = nil
            HapticFeedback.light()
        } label: {
            gridCell(name: StoryTextBackgroundPresets.label(for: style), selected: isSel) {
                specimenCanvas
                backgroundSampleLayer(style)
                Text(verbatim: "Aa")
                    .font(storyFont(for: textObject.parsedTextStyle, size: 18))
                    .foregroundStyle(ink)
            }
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(StoryTextBackgroundPresets.label(for: style))
        .accessibilityAddTraits(isSel ? [.isButton, .isSelected] : .isButton)
    }

    /// Le fond LUI-MÊME, peint sur la scène de démonstration. Exhaustif : une
    /// quatrième forme de fond doit se déclarer ici, pas disparaître dans un
    /// `default` qui rendrait une boîte vide indiscernable d'« Aucun ».
    @ViewBuilder
    private func backgroundSampleLayer(_ style: StoryTextBackgroundStyle) -> some View {
        switch style {
        case .none:
            EmptyView()
        case .solid(let hex):
            Color(hex: hex)
        case .glass:
            Rectangle().fill(.ultraThinMaterial)
        }
    }
}
