import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le choix en attente sur un lien de partage.
struct ShareLinkIdentityChoice: Identifiable {
    /// `linkId` du lien tapé — l'identité de la feuille, un lien à la fois.
    let identifier: String
    let conversationId: String
    let conversationTitle: String?
    /// Une session invitée dort déjà sur ce lien : la branche anonyme la
    /// REPREND au lieu d'en ouvrir une seconde.
    let resumesGuestSession: Bool
    /// Le lien déjà résolu par `ShareLinkEntryResolver` — la page s'affiche
    /// avec, sans second appel ni indicateur de chargement.
    ///
    /// `@Indirect` : le choix vit en `@State` dans `RootView` et
    /// `iPadRootView`, dont la taille est un budget ; en ligne, ce lien a
    /// poussé `iPadRootView` au-delà des 8 192 octets permis.
    @Indirect var info: ShareLinkInfo

    var id: String { identifier }
}

/// La page d'invitation, quand un compte est présent (#7795).
///
/// L'app rejoignait silencieusement avec le compte présent ; puis elle a posé
/// la question dans une feuille à deux boutons, sans rien montrer de ce qu'on
/// allait rejoindre. La personne voit désormais la MÊME page que sans compte —
/// qui l'invite, le groupe, ce qu'on y parle, ce qu'un invité anonyme peut y
/// faire — et choisit : son compte d'abord, l'anonymat si le lien l'autorise.
///
/// L'annulation est un geste, pas un bouton — la feuille se referme sans rien
/// engager. Les choix sont EXÉCUTÉS par l'hôte (`RootView`, `iPadRootView`) :
/// la jointure par compte et la session invitée ne vivent pas ici.
struct ShareLinkIdentitySheet: View {
    let choice: ShareLinkIdentityChoice
    let accountDisplayName: String
    let onContinueWithAccount: () -> Void
    let onJoinAnonymously: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        InviteLandingView(
            info: choice.info,
            isSignedIn: true,
            resumesGuestSession: choice.resumesGuestSession,
            accountInitials: MeeshyAvatar.initials(for: accountDisplayName),
            onChoice: { handle($0) },
            onClose: { dismiss() }
        )
        .presentationDragIndicator(.visible)
    }

    private func handle(_ landingChoice: InviteLandingChoice) {
        dismiss()
        switch landingChoice {
        case .joinWithAccount:
            onContinueWithAccount()
        case .joinAnonymously:
            onJoinAnonymously()
        case .signIn, .signUp:
            break
        }
    }
}
