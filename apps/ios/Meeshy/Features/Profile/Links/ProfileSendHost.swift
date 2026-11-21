import SwiftUI
import MeeshySDK
import MeeshyUI

/// « Envoyer son profil » depuis la fiche d'un autre (#19442, planche `Autre-Liens`) : la feuille d'envoi Meeshy, la
/// même que pour ma fiche — « Voilà ce que ton ami recevra », sa carte, les amis suggérés, « Envoyer à … ». Le SDK
/// remet la carte ; « Ouvrir » la conversation envoyée referme la fiche puis y mène.
struct ProfileSendHost: View {
    let request: ProfileSendRequest
    let exits: ProfileSendExits

    @Environment(\.routerCommands) private var router

    var body: some View {
        ShareSheetView(
            subject: .card(ProfileLinksShare.card(of: request)),
            actions: ShareSheetHostActions(onOpenConversation: { conversation in
                exits.closeProfile()
                router.navigateToConversation(conversation)
            }),
            onDismiss: { exits.close() }
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// L'hôte que l'app pose sur toutes les feuilles de profil.
    static var sheet: ProfileSendSheet {
        ProfileSendSheet { request, exits in
            ProfileSlot.view(.send, userId: "", displayName: "", send: ProfileSendHost(request: request, exits: exits))
        }
    }
}
