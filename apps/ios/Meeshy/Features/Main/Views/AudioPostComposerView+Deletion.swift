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
