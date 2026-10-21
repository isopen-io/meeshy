import Foundation
import UIKit

/// Le pont ✦ — ce que le lecteur a manqué, sous une forme qui survit au
/// Prisme Linguistique.
///
/// Miroir Swift de `ConversationBridge`
/// (`packages/shared/types/conversation-bridge.ts`, contrat §3.2). Deux
/// étages, un seul champ :
/// - `kind == .fallback` — des DONNÉES (`data`), formatées par l'i18n du
///   client. Cet étage n'a pas de langue : rien à traduire.
/// - `kind == .agent` — une vraie phrase (`text`), donc soumise au Prisme.
///   Elle voyage avec la MÊME paire que `lastMessagePreview`
///   (`translations` + `originalLanguage`) précisément pour que le lecteur
///   puisse la RE-résoudre : une chaîne unique « déjà dans la bonne langue »
///   serait un instantané, figé dès qu'une traduction atterrit tardivement
///   ou que le lecteur change de langue principale.
///
/// **Aucun résolveur ici, volontairement.** L'étage agent se résout
/// EXCLUSIVEMENT par le résolveur existant (`resolvedLastMessagePreview` /
/// `resolveLastMessagePreview()`) : le chantier Lentille n'écrit pas une
/// seconde loi de langue (contrat §5.2, conséquence 2).
///
/// Le champ est **absent** — pas vide — quand `unreadCount == 0` : un
/// client ancien l'ignore, et la Lentille n'affiche rien. Zéro rupture de
/// compatibilité dans les deux sens (voir le décodage tolérant de
/// `MeeshyConversation.bridge`).
public struct ConversationBridge: Codable, Equatable, Sendable {
    /// Nichée dans `ConversationBridge` plutôt que déclarée au premier
    /// niveau : le miroir Swift complet de `ConversationReadingMode`
    /// (`packages/shared/types/reading-modes.ts`, 4 modes) appartient à un
    /// autre fichier du chantier, et deux types voisins nommés `…Mode` au
    /// premier niveau se disputeraient l'espace de noms du module.
    public enum Kind: String, Codable, Sendable {
        case agent, fallback
    }

    /// Décision d'orchestrateur PRÉCALCULÉE — un sous-ensemble strict des
    /// modes de lecture, les deux seuls qu'un pont peut suggérer.
    public enum SuggestedMode: String, Codable, Sendable {
        case focal, resume
    }

    public let kind: Kind
    /// Le chiffre vit ICI, plus dans un badge.
    public let unreadCount: Int
    public let suggestedMode: SuggestedMode

    /// La fenêtre de calcul du producteur couvre-t-elle TOUT l'intervalle non
    /// lu ? **`nil` = complet** — c'est le cas du gateway, qui calcule sur la
    /// fenêtre entière et n'a donc rien à annoncer, et c'est aussi ce que lit
    /// un client qui ignore le champ.
    ///
    /// `false` vient d'un producteur borné (le substitut client, limité aux
    /// messages déjà en cache) : la ligne porte alors « sur les N derniers
    /// messages », jamais un chiffre extrapolé au-delà de ce qui a réellement
    /// été vu. La qualification voyage SUR le pont, et pas dans une enveloppe
    /// de retour de provider, précisément pour survivre au cache, au socket et
    /// au modèle de liste jusqu'au rang (miroir de
    /// `ConversationBridgeSchema.isComplete`, REV-1 blocage 6).
    public let isComplete: Bool?

    /// `kind == .fallback`.
    public let data: ConversationBridgeData?

    /// `kind == .agent` — la phrase et sa paire de résolution.
    public let text: String?
    public let translations: [String: String]?
    public let originalLanguage: String?

    public init(kind: Kind, unreadCount: Int, suggestedMode: SuggestedMode,
                isComplete: Bool? = nil,
                data: ConversationBridgeData? = nil,
                text: String? = nil,
                translations: [String: String]? = nil,
                originalLanguage: String? = nil) {
        self.kind = kind
        self.unreadCount = unreadCount
        self.suggestedMode = suggestedMode
        self.isComplete = isComplete
        self.data = data
        self.text = text
        self.translations = translations
        self.originalLanguage = originalLanguage
    }

    private enum CodingKeys: String, CodingKey {
        case kind, unreadCount, suggestedMode, isComplete, data, text, translations, originalLanguage
    }
}
