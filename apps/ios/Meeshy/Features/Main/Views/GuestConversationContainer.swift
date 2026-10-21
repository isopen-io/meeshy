import SwiftUI
import MeeshySDK
import MeeshyUI

/// D'où vient une session invitée : un lien de partage, ou l'entrée World
/// Wide de l'écran de connexion (#10006), qui sait déjà ce que `GET /world` a
/// servi.
enum GuestSessionOrigin: Equatable {
    case shareLink
    case world(WorldEntry)
}

struct GuestSession {
    let identifier: String
    var context: AnonymousSessionContext?
    /// La personne a CHOISI d'entrer sans compte alors qu'elle en a un.
    ///
    /// Sans ce drapeau, le conteneur invité se démonterait aussitôt : sa
    /// présentation exige `!isAuthenticated`, garde qui protège d'un tout autre
    /// cas — un lien traité AVANT la fin de la vérification de session, qui
    /// laisserait un utilisateur pourtant connecté échoué dans un flux invité.
    /// Distinguer l'intention de l'accident permet de garder cette protection
    /// tout en autorisant le choix délibéré.
    var isDeliberate: Bool = false
    var origin: GuestSessionOrigin = .shareLink
    /// #10442 — la passerelle a terminé cette session : lien échu, ou accès
    /// retiré par l'hôte. Le fil laisse place à l'écran qui le dit.
    var ended: GuestSessionEnd? = nil

    /// La fin signalée vise-t-elle CETTE session ? Une session sans contexte
    /// n'a rien à terminer ; un refus qui nomme un autre jeton vise une session
    /// déjà quittée — le départ d'une ancienne, refusé après qu'un nouveau lien
    /// a été ouvert. Un refus sans jeton (le socket) vise la session courante.
    func isEnded(byRefusedToken token: String?) -> Bool {
        guard let context, ended == nil else { return false }
        return token == nil || token == context.sessionToken
    }

    /// La session une fois terminée : plus de contexte — donc plus de fil, ni
    /// de départ à annoncer à la fermeture — et la raison, que l'écran dit.
    func ended(by end: GuestSessionEnd) -> GuestSession {
        var copy = self
        copy.context = nil
        copy.ended = end
        return copy
    }

    /// Les clés de trousseau sous lesquelles cette session a pu être gardée.
    var storedSessionKeys: [String] {
        Array(Set([identifier, context?.linkId].compactMap { $0 })).sorted()
    }

    /// La session que le fil reçoit. World Wide plafonne les familles de ses
    /// invités (#10001) : des termes qui ne les disent pas — ancien serveur,
    /// session enregistrée avant le champ — n'ouvrent pas le sélecteur en
    /// grand, ils prennent le plafond (#10055).
    func effectiveContext(_ context: AnonymousSessionContext) -> AnonymousSessionContext {
        guard case .world = origin else { return context }
        var capped = context
        capped.allowedAttachmentKinds = context.attachmentAllowance
            .capped(by: GuestAttachmentKind.worldGuestCeiling)
            .kinds
        return capped
    }

    /// La conversation que le fil ouvre une fois la session obtenue. World
    /// Wide s'annonce par ce que le serveur a servi — son type global, son
    /// titre, son effectif — avant que le détail ne revienne du réseau.
    func conversationShell(for context: AnonymousSessionContext) -> Conversation {
        switch origin {
        case .shareLink:
            return Conversation(id: context.conversationId, identifier: identifier, type: .group)
        case .world(let entry):
            return Conversation(
                id: context.conversationId,
                identifier: entry.identifier,
                type: .global,
                title: entry.title,
                avatar: entry.avatar,
                banner: entry.banner,
                memberCount: entry.memberCount,
                memberCountCapped: entry.memberCountCapped == true
            )
        }
    }
}

struct GuestConversationContainer: View {
    let session: GuestSession
    let onSessionCreated: (AnonymousSessionContext) -> Void
    /// « Se connecter » / « Créer un compte » depuis la page d'invitation.
    let onAccountRequest: (InviteLandingChoice) -> Void
    /// #10442 — « Rejoindre par un nouveau lien » depuis l'écran de fin.
    var onNewLink: (String) -> Void = { _ in }

    /// Ce que `RootView` pose pour un membre, et qu'un invité n'a pas : le fil
    /// est présenté HORS de `RootView`. Sans eux, `ConversationView` trappait
    /// dès l'entrée (« No ObservableObject of type Router found »). Le routeur
    /// de l'invité refuse toute fiche de profil (#10205).
    @StateObject private var router = Router(refusesProfiles: true)
    @StateObject private var storyViewModel = StoryViewModel()
    @StateObject private var statusViewModel = StatusViewModel()

    var body: some View {
        if let end = session.ended {
            GuestSessionEndedView(end: end, onNewLink: onNewLink)
        } else if let stored = session.context {
            let context = session.effectiveContext(stored)
            ConversationView(
                conversation: session.conversationShell(for: context),
                anonymousSession: context,
                showsOwnConnectionBanner: true
            )
            .meeshyRouter(router)
            .environmentObject(storyViewModel)
            .environmentObject(statusViewModel)
            .reportsConversationViewing(context.conversationId)
        } else if case .world(let entry) = session.origin {
            // #10006 — nom → langue → fil, depuis l'écran de connexion.
            WorldGuestEntryView(entry: entry, onEntered: onSessionCreated)
        } else {
            // Une entrée DÉLIBÉRÉE a déjà vu la page d'invitation (#7795) et y a
            // choisi l'anonymat : le formulaire s'ouvre directement.
            JoinFlowSheet(
                identifier: session.identifier,
                isSignedIn: session.isDeliberate,
                entry: session.isDeliberate ? .anonymousForm : .landing,
                onAccountRequest: onAccountRequest
            ) { joinResponse in
                let ctx = joinResponse.toSessionContext
                onSessionCreated(ctx)
            }
        }
    }
}

// MARK: - Fin de session d'invité (#10442)

/// Ce que l'invité lit quand la passerelle a terminé sa session. Un fil qui se
/// tait, ou une erreur générique, se vit comme une panne : la cause se dit, et
/// une sortie s'offre.
struct GuestSessionEndedCopy: Equatable {
    let title: String
    let message: String
    let systemImage: String

    init(end: GuestSessionEnd) {
        switch end {
        case .linkExpired:
            title = String(localized: "guest.ended.expired.title", defaultValue: "Ce lien a expiré", bundle: .main)
            message = String(localized: "guest.ended.expired.message", defaultValue: "Ce lien ne donne plus accès à la conversation. Demandez un nouveau lien à la personne qui vous l'a envoyé.", bundle: .main)
            systemImage = "clock.arrow.circlepath"
        case .accessRevoked:
            title = String(localized: "guest.ended.revoked.title", defaultValue: "Votre accès a été retiré", bundle: .main)
            message = String(localized: "guest.ended.revoked.message", defaultValue: "L'hôte de la conversation a retiré ce lien. Un nouveau lien vous permettra de revenir.", bundle: .main)
            systemImage = "person.crop.circle.badge.xmark"
        }
    }
}

/// Le lien d'invitation que l'invité colle : `/join/<id>` ou `/chat/<id>`,
/// lus par le MÊME analyseur que les liens universels. Rien d'autre n'ouvre
/// une session d'invité.
enum GuestNewLink {
    static func identifier(in text: String) -> String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed), url.scheme != nil else { return nil }
        switch DeepLinkParser.parse(url) {
        case .joinLink(let identifier), .chatLink(let identifier):
            return identifier.isEmpty ? nil : identifier
        default:
            return nil
        }
    }
}

struct GuestSessionEndedView: View {
    let end: GuestSessionEnd
    let onNewLink: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var pastedLink = ""
    private var theme: ThemeManager { ThemeManager.shared }

    private var newLinkIdentifier: String? { GuestNewLink.identifier(in: pastedLink) }

    var body: some View {
        let copy = GuestSessionEndedCopy(end: end)
        ScrollView {
            VStack(spacing: MeeshySpacing.xl) {
                Image(systemName: copy.systemImage)
                    .font(MeeshyFont.relative(MeeshyFont.largeTitleSize, weight: .semibold))
                    .foregroundColor(MeeshyColors.indigo500)
                    .padding(.top, MeeshySpacing.xxxl)
                    .accessibilityHidden(true)

                Text(copy.title)
                    .font(MeeshyFont.relative(MeeshyFont.titleSize, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)

                Text(copy.message)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                    .foregroundColor(theme.textSecondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                TextField(String(localized: "guest.ended.newLink.placeholder", defaultValue: "Collez le nouveau lien", bundle: .main), text: $pastedLink)
                    .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .regular))
                    .foregroundColor(theme.textPrimary)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.join)
                    .onSubmit(joinNewLink)
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(minHeight: 50)
                    .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(theme.inputBackground))
                    .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.md).stroke(theme.inputBorder, lineWidth: 1))

                if !pastedLink.isEmpty && newLinkIdentifier == nil {
                    Text(String(localized: "guest.ended.newLink.invalid", defaultValue: "Ce n'est pas un lien d'invitation Meeshy", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .regular))
                        .foregroundColor(MeeshyColors.error)
                        .multilineTextAlignment(.center)
                }

                Button(action: joinNewLink) {
                    Text(String(localized: "guest.ended.newLink.join", defaultValue: "Rejoindre par un nouveau lien", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(MeeshyColors.brandGradient))
                        .opacity(newLinkIdentifier == nil ? 0.5 : 1)
                }
                .disabled(newLinkIdentifier == nil)

                Button {
                    dismiss()
                } label: {
                    Text(String(localized: "guest.ended.home", defaultValue: "Retour à l'accueil", bundle: .main))
                        .font(MeeshyFont.relative(MeeshyFont.labelSize, weight: .semibold))
                        .foregroundColor(MeeshyColors.indigo500)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxl)
            .padding(.bottom, MeeshySpacing.xxl)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(theme.backgroundPrimary.ignoresSafeArea())
    }

    private func joinNewLink() {
        guard let identifier = newLinkIdentifier else { return }
        onNewLink(identifier)
    }
}
