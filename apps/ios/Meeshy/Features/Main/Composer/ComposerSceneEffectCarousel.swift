import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le carrousel d'effets d'une scène, à la place de l'audience et de
/// Publier** (#8712, directive porteur 2026-09-29 : « des icônes d'effet de la
/// scène qui font apparaître des carrousels d'effets en bas à la place de
/// l'audience et publier »).
///
/// Une plaque de verre teintée du plateau — la même que les options d'un outil
/// (`ComposerSceneSurface.lowerFloors`) — qui porte le nom de la catégorie, sa
/// sortie, et le contenu que l'hôte lui remet : la grille de filtres ou les
/// puces d'ouverture du SDK. Cette vue ne connaît ni l'une ni l'autre.
///
/// **La sortie est explicite** : retoucher l'icône de la colonne referme aussi
/// le carrousel, mais un geste qu'il faut deviner n'est pas un chemin — et
/// VoiceOver a besoin d'un bouton qu'il peut nommer.
struct ComposerSceneEffectCarousel<Content: View>: View {
    let effect: ComposerSceneEffect
    let plateauTint: Color
    let onClose: () -> Void
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(ComposerSceneEffectCopy.label(effect), systemImage: effect.symbol)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                        .frame(width: ComposerRailGeometry.railWidth,
                               height: ComposerRailGeometry.railWidth)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(Text(ComposerSceneEffectCopy.close))
            }
            content()
        }
        .padding(.leading, 14)
        .padding([.trailing, .bottom], 10)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 22, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .padding(.horizontal, ComposerRailGeometry.outerMargin)
        .padding(.bottom, 6)
        .environment(\.colorScheme, .dark)
        .transition(.move(edge: .bottom).combined(with: .opacity))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerSceneEffectCopy.column))
    }
}
