import SwiftUI

/// **Retoucher un texte à vue unique le referme** (#7579).
///
/// Directive porteur du 2026-09-23 : un texte à vue unique s'affiche à sa place
/// au premier toucher, et passe à `(1) · Déjà ouvert` dès qu'on le RETOUCHE ou
/// qu'il sort de l'écran. Ce modificateur porte la première porte, pour les
/// trois peaux (Bulles, Focal/Script, Rivière) ; la seconde est tenue par l'hôte
/// de chaque peau (fin d'affichage de la cellule, disparition de la bulle).
///
/// Le geste est SIMULTANÉ : il n'avale ni l'appui long du menu, ni un lien
/// touché dans le texte. Inactif, il ne pose rien — l'écrasante majorité des
/// messages ne paie aucun geste de plus.
struct ViewOnceRetouchModifier: ViewModifier {
    let isActive: Bool
    let onRetouch: () -> Void

    func body(content: Content) -> some View {
        if isActive {
            content.simultaneousGesture(TapGesture().onEnded(onRetouch))
        } else {
            content
        }
    }
}

extension View {
    func viewOnceRetouch(isActive: Bool, onRetouch: @escaping () -> Void) -> some View {
        modifier(ViewOnceRetouchModifier(isActive: isActive, onRetouch: onRetouch))
    }
}
