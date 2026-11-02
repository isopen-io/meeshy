import SwiftUI

/// **« Imager »** (#13871) : la même entrée, au même mot et au même glyphe, dans
/// chaque menu ⋯ où une œuvre composée s'enregistre — carte de post et carte de
/// réel du fil, détail d'un post, scène de la galerie d'une conversation. Elle
/// n'est listée que lorsqu'il y a quelque chose à rendre (`action != nil`) :
/// une entrée sans chemin serait un contrôle inerte (loi 4).
struct ImagerMenuButton: View {
    let action: (() -> Void)?

    var body: some View {
        if let action {
            Button(action: action) {
                Label(MessageCardExportMenu.imageLabel, systemImage: MessageCardExportMenu.imageSymbol)
            }
            .accessibilityLabel(MessageCardExportMenu.imageLabel)
        }
    }
}
