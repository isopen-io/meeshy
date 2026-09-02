import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Retirer un son posé** (#4696, directive porteur 2026-09-01 : « lors de l'édition
/// mettre un (x) pour supprimer les éléments »).
///
/// ## Ce qui manquait
///
/// Poser un son était IRRÉVERSIBLE. Ni la carte de contenu, ni la pastille de
/// l'avatar, ni la pastille du canvas n'offraient de le retirer : la seule
/// manière d'en défaire un était d'en poser un autre par-dessus — c'est-à-dire
/// d'en perdre un pour en perdre un autre. C'est ce cul-de-sac qui rendait le
/// remplacement destructif de #4676 supportable en apparence, et c'est lui
/// qu'on ferme ici.
///
/// ## Pourquoi ici, et pas sur chaque surface
///
/// Les trois contextes d'édition traversent la MÊME feuille (`openSoundSheet`).
/// Un bouton par surface aurait été trois lois — trois façons de décider ce que
/// « supprimer » emporte, et la troisième aurait divergé au premier champ
/// ajouté. La feuille sait ce qu'elle édite ; l'hôte sait ce que ça retire.
///
/// ## Pourquoi une confirmation, alors que le chemin nominal vaut deux gestes
///
/// Le chemin nominal, c'est POSER. Supprimer ne l'est pas : un enregistrement
/// est unique, il n'existe nulle part ailleurs, et un doigt posé de travers sur
/// une barre de navigation l'effacerait sans retour. La confirmation est le
/// prix de l'irréversibilité — pas une friction ajoutée à un usage courant.
extension AudioPostComposerView {

    /// **L'absence est STRUCTURELLE** : sans `onDelete`, aucune vue n'est
    /// construite. Une feuille de CRÉATION n'a rien à supprimer, et un bouton
    /// grisé y annoncerait une capacité qu'elle n'a pas.
    @ViewBuilder
    var deleteButton: some View {
        if let onDelete {
            Button(role: .destructive) {
                showDeleteConfirmation = true
            } label: {
                Image(systemName: "trash")
            }
            .foregroundColor(MeeshyColors.error)
            // L'icône seule ne se DIT pas : VoiceOver lirait « trash ».
            .accessibilityLabel(String(localized: "composer.audio.delete.action",
                                       defaultValue: "Supprimer le son", bundle: .main))
            .confirmationDialog(
                String(localized: "composer.audio.delete.title",
                       defaultValue: "Supprimer ce son ?", bundle: .main),
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button(String(localized: "composer.audio.delete.confirm",
                              defaultValue: "Supprimer", bundle: .main),
                       role: .destructive) {
                    // L'hôte ferme le portail — la feuille ne se congédie pas
                    // elle-même : c'est lui qui sait si le contexte d'édition
                    // doit être oublié en même temps.
                    onDelete()
                }
                Button(String(localized: "common.cancel",
                              defaultValue: "Annuler", bundle: .main), role: .cancel) {}
            }
        }
    }
}

/// **« Refaire » détruit autant que la corbeille, et ne demandait rien**
/// (#4702).
///
/// Trouvé par la vérification simulateur du 2026-09-01, et c'est une ASYMÉTRIE
/// qui rend le défaut visible une fois nommée : supprimer un son demande
/// « Supprimer ce son ? », alors que « Refaire » — qui efface le MÊME contenu,
/// fichier compris (`resetToIdle` appelle `removeItem`) — ne demandait rien.
///
/// Ce qui transforme le risque en perte : la barre d'action FLOTTE au-dessus du
/// défilement, et la bande de rognage passe dessous. Mesuré : 35 pt sur 72 de
/// la bande, poignées comprises, tombent sur la barre — un doigt qui vise la
/// poignée gauche dans sa moitié basse touche « Refaire ». La prise, son
/// rognage et sa description partent ensemble, sans annulation possible.
///
/// La confirmation est le remède qui vaut dans TOUTES les positions de
/// défilement ; la géométrie a son issue à part, parce qu'elle se corrige sur
/// une mesure et non sur une intuition.
extension AudioPostComposerView {

    /// **Rien à perdre ⇒ rien à demander.** Sans prise, « Refaire » ne fait que
    /// remettre l'écran à zéro : une confirmation y serait une friction posée
    /// sur un geste sans conséquence, et c'est ainsi qu'on apprend aux gens à
    /// valider sans lire.
    func demanderRefaire() {
        guard recordedURL != nil || borrowedSound != nil else {
            resetToIdle()
            return
        }
        showRedoConfirmation = true
    }

    /// Le libellé nomme ce qui PART, pas le bouton qu'on vient de toucher :
    /// « Refaire » dit l'intention, « l'enregistrement sera supprimé » dit le
    /// prix.
    func redoConfirmation<V: View>(_ contenu: V) -> some View {
        contenu.confirmationDialog(
            String(localized: "composer.audio.redo.title",
                   defaultValue: "Refaire l'enregistrement ?", bundle: .main),
            isPresented: $showRedoConfirmation,
            titleVisibility: .visible
        ) {
            Button(String(localized: "composer.audio.redo.confirm",
                          defaultValue: "Refaire", bundle: .main),
                   role: .destructive, action: resetToIdle)
            Button(String(localized: "common.cancel",
                          defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(String(localized: "composer.audio.redo.message",
                        defaultValue: "La prise, son rognage et sa description seront perdus.",
                        bundle: .main))
        }
    }
}
