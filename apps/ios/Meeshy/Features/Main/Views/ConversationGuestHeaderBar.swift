import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - L'adresse publique d'une conversation (#10206)

/// L'adresse que « Partager » transmet : `<origine web>/chat/<lien>`, la page
/// de jonction que le web sert à tout le monde, compte ou pas.
///
/// Directive porteur du 2026-10-11 : « mettre à côté de l'avatar le lien pour
/// partager la conversation (/chat/mshy_world), permettant à chacun de
/// transmettre la conversation ». Le lien existe dans deux cas :
/// - l'invité est ENTRÉ par un lien — c'est celui-là qu'il transmet ;
/// - la conversation est World Wide, dont `GET /world` sert le lien public.
///   Rien n'est écrit en dur : la conversation est reconnue à l'identifiant
///   SERVI, et le lien est celui que le serveur nomme.
/// Ailleurs, la conversation ne porte aucun lien public : `nil`, pas de bouton.
enum ConversationShareTarget {

    static func url(conversation: Conversation?, guestLinkId: String?, world: WorldEntry?, webOrigin: String) -> URL? {
        guard let linkKey = linkKey(conversation: conversation, guestLinkId: guestLinkId, world: world),
              let encoded = linkKey.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/")))
        else { return nil }
        return URL(string: "\(webOrigin)/chat/\(encoded)")
    }

    /// Seule une conversation `global` peut être World Wide : les autres
    /// n'interrogent jamais `GET /world`.
    static func needsWorldEntry(conversation: Conversation?, guestLinkId: String?) -> Bool {
        (guestLinkId ?? "").isEmpty && conversation?.type == .global
    }

    private static func linkKey(conversation: Conversation?, guestLinkId: String?, world: WorldEntry?) -> String? {
        if let guestLinkId, !guestLinkId.isEmpty { return guestLinkId }
        guard let conversation, conversation.type == .global, let world,
              conversation.identifier == world.identifier else { return nil }
        return world.shareLinkIdentifier
    }
}

/// L'entrée World Wide lue une fois par lancement : le bouton « Partager » se
/// peint depuis elle sans réinterroger le réseau à chaque ouverture du fil.
@MainActor
enum WorldEntryMemory {
    private(set) static var entry: WorldEntry?

    static func load(from provider: WorldEntryProviding = WorldService.shared) async -> WorldEntry? {
        if let entry { return entry }
        let served = try? await provider.fetchWorldEntry()
        if let served { entry = served }
        return served
    }
}

/// La place du bouton « Partager » à côté de l'avatar : il n'apparaît que
/// lorsque la conversation a une adresse publique (`ConversationShareTarget`).
struct ConversationShareLinkSlot: View {
    let conversation: Conversation?
    let guestLinkId: String?
    let accentColor: String
    let secondaryColor: String

    @State private var world: WorldEntry? = WorldEntryMemory.entry

    private var url: URL? {
        ConversationShareTarget.url(
            conversation: conversation,
            guestLinkId: guestLinkId,
            world: world,
            webOrigin: MeeshyConfig.shared.webOrigin
        )
    }

    var body: some View {
        ZStack {
            Color.clear.frame(width: 0, height: 0)
            if let url {
                ConversationShareLinkButton(url: url, accentColor: accentColor, secondaryColor: secondaryColor)
            }
        }
        .task(id: conversation?.identifier) { @MainActor in
            guard ConversationShareTarget.needsWorldEntry(conversation: conversation, guestLinkId: guestLinkId),
                  world == nil else { return }
            world = await WorldEntryMemory.load()
        }
    }
}

// MARK: - Ce qu'un invité ne demande pas (#10205, #10216)

/// La passerelle répond `403 ACCOUNT_REQUIRED` à un invité sans compte sur
/// « qui a vu » (`GET /messages/:id/read-status`), la liste des participants
/// et les fiches. Le fil ne lui OFFRE donc pas ces portes : un geste qui
/// n'aboutirait qu'à une erreur n'existe pas.
enum GuestViewerAccess {
    static func offersWhoSaw(prefersReadReceipts: Bool, isGuest: Bool) -> Bool {
        prefersReadReceipts && !isGuest
    }
}

// MARK: - Le bouton « Partager » de l'en-tête (#10206)

/// Le partage natif de l'adresse publique, posé à côté de l'avatar. Même
/// gabarit que le bouton d'appel voisin : cercle de verre de 28 pt, cible de
/// 44 pt.
struct ConversationShareLinkButton: View {
    let url: URL
    let accentColor: String
    let secondaryColor: String

    var body: some View {
        ShareLink(item: url) {
            Image(systemName: "square.and.arrow.up")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(
                    LinearGradient(
                        colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                )
                .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
                .adaptiveGlass(in: Circle(), tint: Color(hex: accentColor).opacity(0.4), interactive: true)
                .meeshyTapTarget()
        }
        .accessibilityLabel(String(localized: "conversation.header.share", defaultValue: "Partager la conversation", bundle: .main))
        .accessibilityIdentifier("conversation.header.share")
    }
}

// MARK: - L'en-tête d'un invité sans compte (#10205, #10206)

/// Ce qu'un visiteur sans compte voit au-dessus du fil : le titre, l'avatar
/// de la conversation — qui n'ouvre rien —, le lien à transmettre et la
/// fermeture. Directive porteur du 2026-10-11 : ni nombre de participants, ni
/// détail de la conversation, ni fiche de profil pour qui n'est pas membre de
/// Meeshy. Sorti de `ConversationView` (hors budget) pour y poser le partage.
/// Le titre prend la couleur du thème et la bande le verre de l'en-tête d'un
/// membre : en blanc sur le fil clair, « World Wide » ne se lisait pas.
struct ConversationGuestHeaderBar: View {
    let title: String
    let favoriteEmoji: String?
    let avatarURL: String?
    let accentColor: String
    let secondaryColor: String
    let guestLinkId: String?
    let titleColor: Color
    let mutedColor: Color
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            ConversationTitleLabel(
                name: title,
                favoriteEmoji: favoriteEmoji,
                font: MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold, design: .rounded),
                color: titleColor
            )
            Spacer()
            ConversationShareLinkSlot(
                conversation: nil,
                guestLinkId: guestLinkId,
                accentColor: accentColor,
                secondaryColor: secondaryColor
            )
            MeeshyAvatar(
                name: title,
                context: .conversationHeaderStacked,
                kind: .entity,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                avatarURL: avatarURL
            )
            .allowsHitTesting(false)
            .accessibilityHidden(true)
            Button {
                HapticFeedback.light()
                onClose()
            } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(MeeshyIconSize.xxs, weight: .bold))
                    .foregroundColor(mutedColor)
                    .frame(width: MeeshyControlSize.compact, height: MeeshyControlSize.compact)
                    .background(Circle().fill(mutedColor.opacity(MeeshyOpacity.light)))
            }
            .accessibilityLabel(String(localized: "conversation.view.close", bundle: .main))
        }
        .padding(.leading, MeeshySpacing.md)
        .padding(.trailing, MeeshySpacing.xs)
        .padding(.vertical, MeeshySpacing.xxs)
        .background(ConversationHeaderGlass(shape: .floatingBlock, accentColor: accentColor, secondaryColor: secondaryColor))
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.top, MeeshySpacing.sm)
    }
}
