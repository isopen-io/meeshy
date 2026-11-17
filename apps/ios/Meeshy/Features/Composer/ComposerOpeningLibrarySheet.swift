import SwiftUI
import PhotosUI
import Photos
import MeeshyUI

/// **La photothèque d'ouverture, DÉPLIÉE EN ENTIER, sous l'en-tête du système** (#17269, #18709).
///
/// Le sélecteur en ligne à mi-hauteur (#17269) laissait voir la caméra derrière, mais son
/// en-tête ne tenait pas : celui du système disparaît au cran moyen, et un en-tête du
/// composer posé dans la même feuille était rendu tout en haut de l'écran, hors de la
/// feuille et hors d'atteinte, dès que le sélecteur avait chargé (mesuré au simulateur
/// iOS 27, aux deux crans). Le porteur a tranché : « Si c'est compliqué à appliquer, alors
/// il faut déplier en entier ». La photothèque est donc le sélecteur système plein, avec
/// Annuler et Ajouter en tête à tout instant ; ce qui est choisi rejoint la MÊME sélection,
/// donc la même ingestion, depuis l'ouverture du composer comme depuis la Galerie de la
/// caméra.
///
/// Le sélecteur vit sur un fond transparent et non sur la vue qui porte les portails : deux
/// présentations empilées sur une même vue se disputent la place.
struct ComposerOpeningLibrarySheet: ViewModifier {
    @Binding var isPresented: Bool
    @Binding var selection: [PhotosPickerItem]
    /// **Le doigt tient pour filmer** : la photothèque se retire, l'anneau et les
    /// segments de la prise ne restent pas dessous.
    let capturing: Bool

    static let maxSelectionCount = 10

    func body(content: Content) -> some View {
        content.background {
            Color.clear
                .photosPicker(isPresented: $isPresented,
                              selection: $selection,
                              maxSelectionCount: Self.maxSelectionCount,
                              matching: .any(of: [.images, .videos]),
                              preferredItemEncoding: .current,
                              photoLibrary: .shared())
        }
        .adaptiveOnChange(of: capturing) { _, tient in
            if tient { isPresented = false }
        }
    }
}
