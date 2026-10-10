import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le sélecteur de réaction posé SUR une tuile (#4020, #9910)

/// **Le sélecteur de réaction d'UNE pièce, centré dans sa tuile**, fond assombri
/// qu'un toucher referme.
///
/// Extrait de `BubbleGridCell` (#9910) : la tuile Focal — le mode de lecture
/// par défaut — devait recevoir le MÊME geste, et une seconde écriture du
/// sélecteur aurait divergé à la première retouche de l'une.
///
/// **Aucune échelle écrite ici** (#6117) : la taille de la rangée est celle du
/// composant, une seule pour toutes les surfaces où l'on réagit. `scrollable`
/// reste : à 1,5 la rangée dépasse la largeur d'une tuile, donc elle DÉFILE
/// plutôt que d'être rognée par la tuile.
struct AttachmentReactionPickerOverlay: View {
    @Binding var isPresented: Bool
    let onReact: (String) -> Void

    var body: some View {
        if isPresented {
            ZStack {
                Color.black.opacity(0.4)
                    .contentShape(Rectangle())
                    .onTapGesture { close() }
                EmojiReactionPicker(
                    scrollable: true,
                    onReact: { emoji in
                        onReact(emoji)
                        close()
                    },
                    onDismiss: { close() }
                )
                .padding(MeeshySpacing.sm)
                // `adaptiveGlass` et non `.ultraThinMaterial` en dur : sous
                // iOS 26 le verre système, avant iOS 26 la matière (#4997).
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.lg))
                .padding(.horizontal, MeeshySpacing.xs + 2)
            }
            .transition(.opacity)
        }
    }

    private func close() {
        withAnimation { isPresented = false }
    }
}
