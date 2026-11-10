import SwiftUI
import UIKit

/// Le verre DESSINÉ, lu depuis sa recette : flou du matériau système, remplissage
/// du ton, voile de teinte, reflet, reflet interne du haut, liseré, ombre.
/// Décoratif : masqué aux lecteurs d'écran.
struct MeeshyDrawnGlass<S: Shape>: View {
    let shape: S
    let recipe: MeeshyGlassRecipe
    let tint: Color?

    var body: some View {
        base
            .overlay(shape.fill(fillColor.opacity(recipe.fillOpacity)))
            .overlay(shape.fill((tint ?? .clear).opacity(recipe.tintWash)))
            .overlay(shape.fill(sheen))
            .overlay { topLight }
            .overlay(shape.stroke(rim, lineWidth: 1))
            .compositingGroup()
            .shadow(
                color: MeeshyColors.mediaBackdrop.opacity(recipe.shadowOpacity),
                radius: recipe.shadowRadius,
                y: recipe.shadowY
            )
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var base: some View {
        if recipe.blursBackdrop {
            shape.fill(.ultraThinMaterial)
        } else {
            shape.fill(Color.clear)
        }
    }

    private var fillColor: Color {
        switch recipe.fill {
        case .clear: return .clear
        case .light: return MeeshyColors.onMedia
        case .dark: return MeeshyColors.mediaBackdrop
        case .system: return Color(uiColor: .secondarySystemBackground)
        }
    }

    private var sheen: LinearGradient {
        LinearGradient(
            colors: [MeeshyColors.onMedia.opacity(recipe.sheen), MeeshyColors.onMedia.opacity(0)],
            startPoint: .top,
            endPoint: .center
        )
    }

    @ViewBuilder
    private var topLight: some View {
        if recipe.topLight > 0 {
            shape.stroke(
                LinearGradient(
                    colors: [MeeshyColors.onMedia.opacity(recipe.topLight), MeeshyColors.onMedia.opacity(0)],
                    startPoint: .top,
                    endPoint: .center
                ),
                lineWidth: 1
            )
        }
    }

    private var rim: LinearGradient {
        LinearGradient(
            colors: [
                MeeshyColors.onMedia.opacity(recipe.rimLit),
                MeeshyColors.onMedia.opacity(recipe.rimShade),
                MeeshyColors.onMedia.opacity(recipe.rimTail)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}
