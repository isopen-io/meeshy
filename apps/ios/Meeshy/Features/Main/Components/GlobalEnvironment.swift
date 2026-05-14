import SwiftUI

/// Facilite et sécurise l'injection des objets d'environnement globaux 
/// au travers des barrières de contexte SwiftUI (`.sheet`, `.fullScreenCover`).
/// Forcer le passage en paramètre garantit une vérification stricte à la compilation : 
/// si un nouvel objet global devient requis, l'application entière pète à la compilation 
/// au lieu de crasher silencieusement (Fatal Error) chez l'utilisateur.
extension View {
    func injectGlobalEnvironment(
        router: Router,
        conversationListViewModel: ConversationListViewModel,
        statusViewModel: StatusViewModel
    ) -> some View {
        self
            .environmentObject(router)
            .environmentObject(conversationListViewModel)
            .environmentObject(statusViewModel)
    }
}
