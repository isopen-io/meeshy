import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce qu'une rangée offre HORS du menu — glissé, VoiceOver, double toucher**
/// (#12626, #11214).
///
/// Le menu d'appui long lit la loi du message (`MessageActionPolicy`, par
/// `MessageMenuContext.make`) ; le glissé, les actions nommées et le menu
/// système de la rangée en sont d'autres portes, et n'offrent jamais ce que le
/// menu refuse au même message. Le verdict est celui du MENU — ce que sa
/// feuille « Plus… » range —, jamais une règle locale, et il se lit UNE fois
/// par configuration de cellule. Un contrôle existe s'il a un effet : sans
/// verdict, le côté du glissé ne s'arme pas et l'action nommée n'est pas exposée.
struct MessageRowOffer: Equatable {
    enum Action: Hashable {
        case reply, forward

        var accessibilityName: String {
            switch self {
            case .reply: return String(localized: "a11y.message.actions.reply", bundle: .main)
            case .forward: return String(localized: "a11y.message.actions.forward", bundle: .main)
            }
        }
    }

    /// « Éditer » au double toucher : l'auteur, dans la fenêtre de la loi, sur un texte.
    let canEdit: Bool
    let canReply: Bool
    let canForward: Bool

    static let closed = MessageRowOffer(canReply: false, canForward: false)

    init(canEdit: Bool = false, canReply: Bool, canForward: Bool) {
        self.canEdit = canEdit
        self.canReply = canReply
        self.canForward = canForward
    }

    init(menu: MessageMenuContext) {
        let offered = MessageActionResolver.moreSections(menu).flatMap { section -> [MoreItem] in
            switch section {
            case .actions(let items), .info(let items), .moderation(let items): return items
            }
        }
        self.init(
            canEdit: menu.isMine && menu.canEdit && menu.hasText,
            canReply: offered.contains(.reply),
            canForward: offered.contains(.forward)
        )
    }

    /// La loi d'UN message, lue par la fabrique unique. Les faits locaux du
    /// menu (favori, révisions, stickers) ne décident ni d'une édition, ni
    /// d'une réponse, ni d'un transfert : la projection pure suffit, sans singleton.
    static func of(_ message: Message, authority: ConversationMenuAuthority, now: Date = Date()) -> MessageRowOffer {
        MessageRowOffer(menu: MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority, now: now))
    }

    var armsAnySide: Bool { canReply || canForward }

    var accessibilityActions: [Action] {
        (canReply ? [Action.reply] : []) + (canForward ? [Action.forward] : [])
    }

    /// Jusqu'où la bulle suit le doigt d'un côté que la loi refuse : assez pour
    /// lire l'horodatage du glissé, jamais jusqu'au seuil — ni icône d'action,
    /// ni haptique, ni validation.
    static var stampReach: CGFloat { BubbleSwipeResistance.commitDistance - 1 }

    /// Le décalage que la bulle prend pour `tracked`. `replyDirection` oriente
    /// vers la réponse ; un côté offert suit le doigt, un côté refusé s'arrête
    /// sous le seuil.
    func trackedOffset(_ tracked: CGFloat, replyDirection: CGFloat) -> CGFloat {
        let directed = tracked * replyDirection
        let armed = directed > 0 ? canReply : canForward
        guard !armed, abs(tracked) > Self.stampReach else { return tracked }
        return tracked < 0 ? -Self.stampReach : Self.stampReach
    }

    /// L'action que valide un glissé relâché, ou `nil`.
    func committed(directedOffset: CGFloat) -> Action? {
        if canReply && BubbleSwipeResistance.commits(offset: directedOffset) { return .reply }
        if canForward && BubbleSwipeResistance.commits(offset: -directedOffset) { return .forward }
        return nil
    }
}
