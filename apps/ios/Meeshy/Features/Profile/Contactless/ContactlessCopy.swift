import Foundation
import MeeshySDK
import MeeshyUI

/// Les mots du partage sans contact (#19484, planche `Sans-Contact`). Le repli QR garde ceux de `ProfileLinksCopy`.
nonisolated enum ContactlessCopy {

    // MARK: - 1 · Approche

    static var approachTitle: String {
        String(localized: "profile.contactless.approach.title", defaultValue: "Approche le haut de ton téléphone du sien", bundle: .main)
    }
    static var approachHint: String {
        String(localized: "profile.contactless.approach.hint", defaultValue: "Rien ne part tant que tu n'as pas choisi.", bundle: .main)
    }

    // MARK: - 2 · Trouvé

    static func isHere(_ name: String) -> String {
        String(format: String(localized: "profile.contactless.isHere", defaultValue: "%@ est là", bundle: .main), name)
    }
    static var whatIGive: String {
        String(localized: "profile.contactless.whatIGive", defaultValue: "Ce que je donne", bundle: .main)
    }
    static var vitrine: String {
        String(localized: "profile.contactless.gift.vitrine", defaultValue: "Ma vitrine", bundle: .main)
    }
    static var friendRequest: String {
        String(localized: "profile.contactless.gift.friendRequest", defaultValue: "Une demande d'ami", bundle: .main)
    }
    static var phone: String {
        String(localized: "profile.contactless.gift.phone", defaultValue: "Mon numéro", bundle: .main)
    }
    static var phoneNote: MeeshyInfoNote {
        MeeshyInfoNote(
            question: String(localized: "profile.contactless.gift.phone.question", defaultValue: "Pourquoi mon numéro est-il verrouillé ?", bundle: .main),
            text: String(localized: "profile.contactless.gift.phone.note", defaultValue: "Ton numéro ne se donne qu'à tes Proches.", bundle: .main)
        )
    }
    static var give: String {
        String(localized: "profile.contactless.give", defaultValue: "Donner", bundle: .main)
    }
    static var chooseOne: String {
        String(localized: "profile.contactless.chooseOne", defaultValue: "Choisis ce que tu donnes", bundle: .main)
    }
    static var eachChooses: String {
        String(localized: "profile.contactless.eachChooses", defaultValue: "Chacun choisit de son côté", bundle: .main)
    }
    static var giveFailed: String {
        String(localized: "profile.contactless.giveFailed", defaultValue: "Rien n'est parti. Réessaie.", bundle: .main)
    }

    // MARK: - 3 · Reçu

    static var seeShowcase: String {
        String(localized: "profile.contactless.seeShowcase", defaultValue: "Voir sa vitrine", bundle: .main)
    }
    static var askFriends: String {
        String(localized: "profile.contactless.askFriends", defaultValue: "Demander à être amis", bundle: .main)
    }
    static var friendAskSent: String {
        String(localized: "profile.contactless.friendAskSent", defaultValue: "Demande envoyée", bundle: .main)
    }
    static func askedYou(_ name: String) -> String {
        String(format: String(localized: "profile.contactless.askedYou", defaultValue: "%@ t'a demandé en ami", bundle: .main), name)
    }
    static func choosing(_ name: String) -> String {
        String(format: String(localized: "profile.contactless.choosing", defaultValue: "%@ choisit de son côté", bundle: .main), name)
    }

    /// L'accusé : ce que l'autre a reçu de moi — la vitrine d'abord, sinon la demande.
    static func acknowledged(_ name: String, received: [ContactExchangeOffer]) -> String? {
        if received.contains(.vitrine) {
            return String(format: String(localized: "profile.contactless.receivedShowcase", defaultValue: "%@ a reçu ta vitrine", bundle: .main), name)
        }
        if received.contains(.friendRequest) {
            return String(format: String(localized: "profile.contactless.receivedRequest", defaultValue: "%@ a reçu ta demande d'ami", bundle: .main), name)
        }
        return nil
    }

    // MARK: - 4 · Sans la puce

    static var withoutChip: String {
        String(localized: "profile.contactless.withoutChip", defaultValue: "Sans la puce", bundle: .main)
    }
}
