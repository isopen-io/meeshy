import SwiftUI
import MeeshySDK

// MARK: - La sortie d'une conversation consomme ce qu'on y a lu (#7500)

/// > « pour le texte, le faire disparaître lorsqu'on quitte la conversation
/// > uniquement » — directive porteur, recette 1.1.0.
///
/// Un TEXTE à vue unique ne se lit pas comme un média : il n'a pas de plein
/// écran, il se lit sur place. Sa consommation ne peut donc pas partir du
/// toucher — qui le détruisait avant qu'on l'ait lu — ni d'un minuteur de cinq
/// secondes, qui décide à la place du lecteur combien de temps il lui faut pour
/// comprendre une phrase.
///
/// Elle part de la SORTIE, et « quitter, c'est quitter » : le retour par
/// navigation, le passage en arrière-plan et le verrouillage de l'écran sont la
/// même chose vue de l'utilisateur. Les deux portes appellent donc le même
/// geste, qui est idempotent par construction.
///
/// **Pourquoi ce fichier plutôt que l'hôte.** `ConversationView.swift` est dans
/// la dette héritée du cliquet de taille, où la directive du 2026-08-28
/// interdit d'ajouter : on extrait d'abord, on ajoute ensuite. L'hôte ne garde
/// donc que les deux appels, à l'endroit où les sorties se lisent déjà.
extension ConversationView {

    /// **Le toucher de la puce d'une vue unique** (#7618), dans les cinq modes.
    ///
    /// Le média s'ouvre en PLEIN ÉCRAN et passe à « déjà ouvert » à la
    /// fermeture (#7499). Le texte se révèle à sa place et passe à « déjà
    /// ouvert » quand on le RETOUCHE, quand il SORT de l'écran ou quand on
    /// quitte la conversation (#7579, qui remplace la règle de #7500) : le
    /// ViewModel tient ces trois portes. Rend `true` quand un texte vient
    /// d'être révélé sur place.
    func openViewOnce(messageId: String) -> Bool {
        switch viewModel.openViewOnce(messageId: messageId) {
        case .fullscreen(let attachment):
            GalleryPrewarm.warm(attachment)
            scrollState.pendingViewOnceConsumption.arm(messageId)
            scrollState.galleryStartAttachment = attachment
            return false
        case .inPlace:
            return true
        case .closed, .unavailable:
            return false
        }
    }

    /// Consomme, côté serveur, les vues uniques révélées pendant la visite.
    ///
    /// `takeAll()` VIDE dans le même geste : la seconde porte ne trouve plus
    /// rien. C'est ce qui rend sûr d'appeler ce geste depuis les deux sorties —
    /// un retour qui suit un passage en arrière-plan ne consomme pas deux fois,
    /// et le serveur COMPTE les ouvertures.
    ///
    /// Le `Task` n'est PAS attendu, et ne peut pas l'être : `onDisappear` et le
    /// changement de phase sont synchrones. La consommation est un accusé — si
    /// elle échoue, le message reste consommable, ce qui est le bon sens de
    /// l'échec : on ne détruit pas ce qu'on n'a pas pu confirmer.
    func consumeOpenedViewOnceOnExit() {
        viewModel.closeAllRevealedViewOnce()
        let lues = scrollState.pendingViewOnceConsumption.takeAll()
        guard !lues.isEmpty else { return }
        let vm = viewModel
        Task {
            for messageId in lues {
                _ = await vm.consumeViewOnce(messageId: messageId)
            }
        }
    }
}
