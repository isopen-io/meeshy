import SwiftUI
import MeeshySDK

/// **La teinte d'un fond UNI du Cadre, en couleur** (#8414, #8457).
///
/// `StoryBackdrop.solidHex` porte le contrat commun avec le web ; sa
/// conversion en `Color` vit ici, avec les autres couleurs du thème, pour que
/// le sol du composer et le panneau ne recopient pas `Color(hex:)` chacun.
public extension StoryBackdrop {
    var solidColor: Color? {
        solidHex.map { Color(hex: $0) }
    }
}
