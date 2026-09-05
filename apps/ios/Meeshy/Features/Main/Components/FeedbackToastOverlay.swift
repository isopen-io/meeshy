import SwiftUI
import MeeshyUI

/// **L'hôte d'un toast de retour — écrit UNE fois** (#4872).
///
/// ## Le défaut
///
/// L'overlay de toast vivait sur la vue RACINE de l'app. Le composer est
/// présenté en `fullScreenCover` : il couvre la racine, donc **tout toast levé
/// depuis le composer était invisible**. Un refus de publication ne produisait
/// rien à l'écran — la flèche semblait simplement ne rien faire.
///
/// L'ironie qui rend le défaut cher : le doc-comment du refus de la porte
/// document décrit EXACTEMENT le symptôme que cette absence produit —
///
/// > « Un refus qui se DIT. Rendre `false` sans rien dire laisserait l'auteur
/// > devant une flèche qui semble ne rien faire — et il la presserait encore. »
///
/// Le bon geste était fait ; la couche d'affichage le rendait sans effet. **Un
/// correctif dont la valeur n'atteint aucun lecteur n'a corrigé personne.**
///
/// ## Pourquoi un modificateur, et pas un troisième bloc
///
/// Le même overlay était déjà écrit DEUX fois — la racine iPhone et la racine
/// iPad — et les deux avaient déjà divergé : l'un porte le rappel de tap et
/// l'identifiant d'accessibilité, l'autre non. Un troisième exemplaire aurait
/// divergé au premier réglage. Ce type porte la forme COMPLÈTE, celle de la
/// racine iPhone.
///
/// ## Il vit APP-SIDE, et c'est la règle du SDK
///
/// `FeedbackToastManager` est un singleton nommé de l'app ; un modificateur qui
/// le lit encode « quand montrer un toast Meeshy », pas un atome réutilisable.
/// Le SDK garde `FeedbackToastView`, qui ne prend que des paramètres opaques.
///
/// ## Où l'appliquer
///
/// Sur toute surface qui **couvre** son hôte et peut lever un toast —
/// `fullScreenCover`, `sheet` plein écran. Une surface qui ne couvre rien n'en
/// a pas besoin : l'hôte du dessous la sert déjà.
struct FeedbackToastOverlay: ViewModifier {

    @ObservedObject private var toastManager = FeedbackToastManager.shared

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .top) {
                if let toast = toastManager.currentToast {
                    FeedbackToastView(toast: toast)
                        .transition(.feedbackToastReveal)
                        .padding(.top, MeeshySpacing.xxl)
                        .onTapGesture {
                            if let action = toastManager.onTapAction { action() }
                            toastManager.dismiss()
                        }
                        .accessibilityIdentifier(MeeshyA11yID.toastContainer)
                        .zIndex(999)
                }
            }
            .meeshyAnimation(MeeshyAnimation.springBouncy, value: toastManager.currentToast)
    }
}

extension View {
    /// Pose l'hôte des toasts de retour SUR cette surface — voir
    /// `FeedbackToastOverlay` pour quand c'est nécessaire.
    func feedbackToastOverlay() -> some View { modifier(FeedbackToastOverlay()) }
}
