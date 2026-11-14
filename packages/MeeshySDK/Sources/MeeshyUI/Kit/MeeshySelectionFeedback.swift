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

/// La structure de l'arbre ne dépend jamais de la sélection : choisir ou lâcher
/// un objet ne change que l'opacité des lueurs (un `if` autour du contenu
/// referait l'objet, et son état avec). Seule cette opacité s'anime ; elle est
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
        let silhouette = silhouetteOpacity(recipe)
        content
            .shadow(color: recipe.ink.color.opacity(silhouette[0]), radius: recipe.layers[0].radius)
            .shadow(color: recipe.ink.color.opacity(silhouette[1]), radius: recipe.layers[1].radius)
            .background { box(recipe) }
            .accessibilityAddTraits(MeeshySelectionFeedbackAccessibility.traits(isSelected: isSelected))
            .adaptiveOnChange(of: isSelected) { _, selected in
                let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
                withAnimation(MeeshySelectionFeedbackRecipe.fade(appearing: selected, reduceMotion: reduce)) {
                    glow = selected ? 1 : 0
                }
            }
    }

    /// Les opacités des deux lueurs de la silhouette : nulles pour une boîte arrondie.
    private func silhouetteOpacity(_ recipe: MeeshySelectionHaloRecipe) -> [Double] {
        guard case .content = shape else { return [0, 0] }
        return recipe.layers.map { $0.opacity * glow }
    }

    /// La boîte d'un média opaque : l'ombre d'un rectangle arrondi, jamais le flou de la silhouette.
    @ViewBuilder
    private func box(_ recipe: MeeshySelectionHaloRecipe) -> some View {
        if case .rounded(let radius) = shape {
            ZStack {
                ForEach(recipe.layers.indices, id: \.self) { index in
                    let layer = recipe.layers[index]
                    RoundedRectangle(cornerRadius: radius)
                        .fill(recipe.ink.color.opacity(layer.opacity * glow))
                        .shadow(color: recipe.ink.color.opacity(layer.opacity * glow), radius: layer.radius)
                }
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }
}
