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

    /// **La sélection en cours, que seul « Valider » remet** (#18709) : le sélecteur
    /// ne valide plus rien lui-même, l'en-tête du composer le fait.
    @State private var draft: [PhotosPickerItem] = []

    static let maxSelectionCount = 10

    func body(content: Content) -> some View {
        content.background {
            Color.clear
                .sheet(isPresented: $isPresented, onDismiss: { draft = [] }) { library }
        }
        .adaptiveOnChange(of: capturing) { _, tient in
            if tient { isPresented = false }
        }
    }

    /// **L'en-tête du composer AU-DESSUS du sélecteur** (#18709) : celui du sélecteur
    /// en ligne restait hors écran au cran moyen sur iPhone SE. Le nôtre est la première
    /// ligne de la feuille, donc visible à tous les crans ; le sélecteur garde sa barre
    /// Photos / Collections, mais plus ses ✕ / ✓ (`.selectionActions`).
    @ViewBuilder
    private var library: some View {
        if #available(iOS 17.0, *) {
            VStack(spacing: 0) {
                ComposerLibraryHeader(count: draft.count,
                                      onCancel: { isPresented = false },
                                      onValidate: { selection = draft })
                PhotosPicker(selection: $draft,
                             maxSelectionCount: Self.maxSelectionCount,
                             matching: .any(of: [.images, .videos]),
                             preferredItemEncoding: .current,
                             photoLibrary: .shared()) {
                    EmptyView()
                }
                .photosPickerStyle(.inline)
                .photosPickerAccessoryVisibility(.visible, edges: .all)
                .photosPickerDisabledCapabilities(.selectionActions)
                .ignoresSafeArea(.container, edges: .bottom)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
            .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        }
    }
}

/// **Annuler · Valider, en tête de la galerie du composer** (#18709).
struct ComposerLibraryHeader: View {
    let count: Int
    let onCancel: () -> Void
    let onValidate: () -> Void

    /// Valider ne répond qu'à un choix : rien de choisi, rien à remettre.
    static func validates(count: Int) -> Bool {
        count > 0
    }

    var body: some View {
        HStack {
            Button(ComposerMediaSourcePolicy.cancel, action: onCancel)
                .accessibilityIdentifier("composer.library.cancel")
            Spacer(minLength: MeeshySpacing.md)
            Button(action: onValidate) {
                Text(verbatim: count > 0 ? "\(ComposerCameraCopy.validate) (\(count))" : ComposerCameraCopy.validate)
                    .fontWeight(.semibold)
            }
            .disabled(!Self.validates(count: count))
            .accessibilityIdentifier("composer.library.validate")
        }
        .font(.body)
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: MeeshyControlSize.tapTarget)
        .padding(.top, MeeshySpacing.sm)
    }
}
