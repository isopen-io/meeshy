import SwiftUI

/// **« Sauvegarder », puis « Imager »** (#13871) : le couple que le menu ⋯ d'un
/// post pose, dans cet ordre, sur la carte du fil et dans le détail — l'ordre du
/// lecteur de réels. L'hôte garde sa règle de libellé (média ou favori, #9681 ;
/// l'état du favori dit par le nom, #4266) et la passe en titre et en glyphe ;
/// l'ordre et l'entrée « Imager » ne se réécrivent plus d'un hôte à l'autre.
struct PostSaveMenuItems: View {
    let title: String
    let systemImage: String
    let save: () -> Void
    let imager: (() -> Void)?

    var body: some View {
        Button(action: save) {
            Label(title, systemImage: systemImage)
        }
        ImagerMenuButton(action: imager)
    }
}
