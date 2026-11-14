import SwiftUI

public extension View {
    /// Le halo d'un objet choisi : une lueur sans cadre ni poignée, qui suit la
    /// silhouette de l'objet (`.content`) ou la boîte arrondie d'un média opaque
    /// (`.rounded(rayon)`). Rien ne se peint sans sélection, ni pendant la
    /// frappe : l'hôte passe `false`.
    ///
    /// - `scale` : l'échelle que l'hôte applique à l'objet, pour que le flou reste en points d'écran ;
    /// - `tone` : celui de la scène (défaut : le ton de l'hôte, `\.meeshyGlassTone`).
    ///
    /// Le modificateur ne prend aucun toucher et n'agrandit pas la cible. Il pose
    /// l'état « sélectionné » à l'accessibilité, sans rien ajouter à l'arbre.
    func meeshySelectionHalo(
        _ isSelected: Bool,
        shape: MeeshySelectionHaloShape = .content,
        scale: CGFloat = 1,
        tone: MeeshyGlassTone? = nil
    ) -> some View {
        modifier(MeeshySelectionHaloModifier(isSelected: isSelected, shape: shape, scale: scale, tone: tone))
    }
}

/// Ce que lit le lecteur d'écran : « sélectionné », rien d'autre.
public nonisolated enum MeeshySelectionFeedbackAccessibility {
    public static func traits(isSelected: Bool) -> AccessibilityTraits {
        isSelected ? .isSelected : []
    }
}

/// La structure du CONTENU ne dépend jamais de la sélection : choisir ou lâcher
/// un objet ne change que l'opacité des lueurs (un `if` autour du contenu
/// referait l'objet, et son état avec). Seule la boîte d'un média, posée en
/// arrière-plan, entre et sort de l'arbre. L'opacité est seule à s'animer ; elle est
/// tenue par un état LOCAL, de sorte que l'animation ne touche pas aux autres
/// changements de l'hôte.
private struct MeeshySelectionHaloModifier: ViewModifier {
    let isSelected: Bool
    let shape: MeeshySelectionHaloShape
    let scale: CGFloat
    let tone: MeeshyGlassTone?

    @Environment(\.meeshyGlassTone) private var hostTone
    @Environment(\.colorSchemeContrast) private var contrast
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @State private var glow: Double

    init(isSelected: Bool, shape: MeeshySelectionHaloShape, scale: CGFloat, tone: MeeshyGlassTone?) {
        self.isSelected = isSelected
        self.shape = shape
        self.scale = scale
        self.tone = tone
        _glow = State(initialValue: isSelected ? 1 : 0)
    }

    func body(content: Content) -> some View {
        let recipe = MeeshySelectionFeedbackRecipe.halo(
            tone: tone ?? hostTone, isIncreasedContrast: contrast == .increased, scale: scale
        )
        let paint = MeeshySelectionFeedbackRecipe.paint(recipe, shape: shape, glow: glow)
        let ink = recipe.ink.color
        content
            .shadow(color: ink.opacity(paint.silhouette[0]), radius: recipe.layers[0].radius)
            .shadow(color: ink.opacity(paint.silhouette[1]), radius: recipe.layers[1].radius)
            .background { box(paint.box, ink: ink) }
            .accessibilityAddTraits(MeeshySelectionFeedbackAccessibility.traits(isSelected: isSelected))
            .adaptiveOnChange(of: isSelected) { _, selected in
                let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
                withAnimation(MeeshySelectionFeedbackRecipe.fade(appearing: selected, reduceMotion: reduce)) {
                    glow = selected ? 1 : 0
                }
            }
    }

    /// La boîte d'un média opaque : l'ombre d'un rectangle arrondi, jamais le
    /// flou de la silhouette. Éteinte, elle n'existe pas dans l'arbre ; son
    /// entrée et sa sortie suivent la transaction du fondu.
    @ViewBuilder
    private func box(_ layers: [MeeshySelectionHaloLayer], ink: Color) -> some View {
        if case .rounded(let radius) = shape, !layers.isEmpty {
            ZStack {
                ForEach(layers.indices, id: \.self) { index in
                    RoundedRectangle(cornerRadius: radius)
                        .fill(ink.opacity(layers[index].opacity))
                        .shadow(color: ink.opacity(layers[index].opacity), radius: layers[index].radius)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
