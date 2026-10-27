import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le fond de couleur ou de dégradé de la story, peint SOUS le sol et la scène.
/// Rien d'autre que ce que lui disent ses deux entrées : si la slide a un vrai
/// fond média, et la valeur de fond de l'auteur.
struct StoryReaderBackground: View {
    /// `true` quand la slide courante a un vrai fond média (image/vidéo) : le canvas
    /// peint alors ce média plein cadre et le SOL (`SceneFloorView`, Layer 1.5) habille
    /// les letterbox d'un flou DÉRIVÉ du média. Dans ce cas le fond de canvas couleur/gradient
    /// est redondant — pire, il bleed (~15 %) derrière le backdrop
    /// semi-transparent, teintant le média d'un voile indigo parasite. On le neutralise en noir
    /// (user 2026-06-03 : « le reader/preview ne doit pas afficher de fond de canvas quand le fond
    /// est déjà une image/vidéo »).
    let hasMediaBackground: Bool
    let background: String?

    var body: some View {
        Group {
            if hasMediaBackground {
                // Fond média (image/vidéo) : aucun fond de canvas synthétique. Noir immersif
                // sous le backdrop flou dérivé du média (pas de bleed couleur/gradient).
                Color.black
            } else if let bg = background {
                // Source de vérité unique : `StoryBackgroundValue` (forme
                // « gradient:RRGGBB:RRGGBB », séparateur deux-points, partagée
                // avec le composer). Le parsing maison splittait sur la
                // VIRGULE : la chaîne restait entière, `Color(hex:)` recevait
                // « FF0000:0000FF » et le dégradé de l'auteur se rendait en
                // aplat. Le parse tolérant retombe en `.hex` sur une valeur
                // abîmée, ce qui préserve le fallback couleur historique.
                switch StoryBackgroundValue.parse(bg) {
                case .gradient(let start, let end):
                    LinearGradient(
                        colors: [Color(hex: start), Color(hex: end)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                case .hex(let hex):
                    Color(hex: hex)
                }
            } else {
                LinearGradient(
                    colors: [MeeshyColors.indigo950, MeeshyColors.indigo900, Color(hex: "24243E")],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            }
        }
        .ignoresSafeArea()
        .accessibilityHidden(true)
    }
}
