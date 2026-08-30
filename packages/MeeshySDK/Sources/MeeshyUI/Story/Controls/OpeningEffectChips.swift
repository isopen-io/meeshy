import SwiftUI
import MeeshySDK

/// Rangée de chips de sélection de l'animation d'OUVERTURE du slide courant
/// (`effects.opening`, rendue par `StoryRenderer.applyOpening` au passage
/// edit→play et par l'export AVCompositor).
///
/// Partagée entre la sheet ⋯ Transitions (C7) et le panneau Fond du band
/// (C1 — accès gestuel : FAB Fond → band → chips ; swipe-down pour fermer).
/// Une seule UI, une seule source de vérité : `viewModel.openingEffect` —
/// la persistance passe par la chaîne `granularCanvasSync` (pas de callback
/// de sync à câbler par surface).
/// **`public` parce que le composer unifié monte la MÊME vue** (#4403).
///
/// Le panneau « Fond » de l'atelier porte deux choses — les couleurs ET cette
/// rangée. La bande de fond du plateau ne portait que les couleurs : l'effet
/// d'ouverture d'une scène y était inatteignable, et le manque ne se voyait
/// pas en composant, puisque cet effet ne se joue qu'à la LECTURE.
///
/// L'emprunt se fait par EXTRACTION, jamais par copie — règle du #4035 : un
/// corps, deux montages. Cette vue s'y prêtait déjà sans rien changer, ses
/// deux entrées étant opaques (`selection`, `onSelect`) : elle ne connaît ni
/// le ViewModel, ni la surface qui la monte.
public struct OpeningEffectChips: View {
    let selection: StoryTransitionEffect?
    let onSelect: (StoryTransitionEffect?) -> Void

    public init(selection: StoryTransitionEffect?,
                onSelect: @escaping (StoryTransitionEffect?) -> Void) {
        self.selection = selection
        self.onSelect = onSelect
    }
    // Les chips s'affichent sur le band opaque (blanc@92% en clair) : sans
    // adaptation, un label blanc y était invisible en light mode.
    @Environment(\.colorScheme) private var colorScheme

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(nil)
                ForEach(StoryTransitionEffect.allCases, id: \.self) { effect in
                    chip(effect)
                }
            }
            .padding(.horizontal, 2)
        }
    }

    private func chip(_ effect: StoryTransitionEffect?) -> some View {
        let isSelected = selection == effect
        let title = effect.map(Self.title(for:)) ?? String(
            localized: "story.composer.openingNone",
            defaultValue: "Aucune",
            bundle: .module
        )
        let isDark = colorScheme == .dark
        // Sélectionné : blanc sur brand (contrasté dans les deux thèmes).
        // Non sélectionné : texte adaptatif sur remplissage subtil adaptatif.
        let textColor: Color = isSelected ? .white : (isDark ? .white : MeeshyColors.indigo950)
        let fillColor: Color = isSelected
            ? MeeshyColors.brandPrimary.opacity(0.85)
            : (isDark ? Color.white.opacity(0.10) : MeeshyColors.indigo950.opacity(0.06))
        let strokeColor: Color = isSelected
            ? MeeshyColors.brandPrimary.opacity(0.35)
            : (isDark ? Color.white.opacity(0.12) : MeeshyColors.indigo950.opacity(0.14))
        return Button {
            onSelect(effect)
            HapticFeedback.light()
        } label: {
            Text(title)
                .font(.system(size: 13, weight: isSelected ? .bold : .medium))
                .foregroundColor(textColor)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(Capsule().fill(fillColor))
                .overlay(Capsule().strokeBorder(strokeColor, lineWidth: 1))
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// Titre localisé d'un effet — vit ici (MeeshyUI) et pas sur
    /// `StoryTransitionEffect` lui-même (MeeshySDK core, sans bundle de
    /// ressources/catalogue de chaînes) : le modèle reste pur, l'affichage
    /// est un souci UI. Anciennement `StoryTransitionEffect.label`, qui
    /// renvoyait des littéraux FR bruts jamais localisés (« Fondu »/
    /// « Glissement »/« Révélation » visibles quelle que soit la langue
    /// device — même classe de bug que C12/C17).
    static func title(for effect: StoryTransitionEffect) -> String {
        switch effect {
        case .fade:
            return String(localized: "story.composer.opening.fade", defaultValue: "Fondu", bundle: .module)
        case .zoom:
            return String(localized: "story.composer.opening.zoom", defaultValue: "Zoom", bundle: .module)
        case .slide:
            return String(localized: "story.composer.opening.slide", defaultValue: "Glissement", bundle: .module)
        case .reveal:
            return String(localized: "story.composer.opening.reveal", defaultValue: "Révélation", bundle: .module)
        }
    }
}
