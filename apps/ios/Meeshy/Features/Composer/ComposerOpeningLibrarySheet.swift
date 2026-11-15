import SwiftUI
import PhotosUI
import Photos
import MeeshyUI

/// **La photothèque d'ouverture, à mi-hauteur** (#17269, porteur :
/// « l'ouverture des images à sélectionner qui doit être à présent moins
/// imposant (à mi-chemin et non totalement, de sorte qu'on voie la caméra en
/// arrière-plan) »).
///
/// Le sélecteur système en ligne, dans une feuille à crans moyen et grand : la
/// caméra armée reste visible au-dessus, et l'appui long sur la scène y filme
/// pendant que la feuille est au cran moyen. Ce qui est choisi rejoint la MÊME
/// sélection que la photothèque plein écran, donc la même ingestion. Avant
/// iOS 17, le style en ligne n'existe pas : l'ouverture garde la photothèque
/// plein écran (`ComposerOpeningPlan.Library`).
///
/// La feuille vit sur un fond transparent et non sur la vue qui porte les
/// portails : deux `.sheet` empilés sur une même vue se disputent la place.
struct ComposerOpeningLibrarySheet: ViewModifier {
    @Binding var isPresented: Bool
    @Binding var selection: [PhotosPickerItem]
    /// **Le doigt tient pour filmer** : la feuille se retire, l'anneau et les
    /// segments de la prise ne restent pas dessous.
    let capturing: Bool

    static let maxSelectionCount = 10

    func body(content: Content) -> some View {
        content.background {
            Color.clear
                .sheet(isPresented: $isPresented) { library }
        }
        .adaptiveOnChange(of: capturing) { _, tient in
            if tient { isPresented = false }
        }
    }

    @ViewBuilder
    private var library: some View {
        if #available(iOS 17.0, *) {
            PhotosPicker(selection: $selection,
                         maxSelectionCount: Self.maxSelectionCount,
                         matching: .any(of: [.images, .videos]),
                         preferredItemEncoding: .current,
                         photoLibrary: .shared()) {
                EmptyView()
            }
            .photosPickerStyle(.inline)
            .photosPickerAccessoryVisibility(.visible, edges: .all)
            .ignoresSafeArea(.container, edges: .bottom)
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
    }
}
