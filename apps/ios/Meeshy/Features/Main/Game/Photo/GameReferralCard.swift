import Foundation
import MeeshySDK

/// CE QUE LA CARTE PORTE EN PLUS DU MOMENT (#7742) — conception, partie XII.3 : en bas de la carte
/// 9:16, un bandeau avec la Signature, « Rejoins-moi sur Meeshy », le lien de parrainage court de
/// l'utilisateur et sa Flamme. Le partage transmet aussi le lien en TEXTE.
///
/// Conformité (`docs/product/jeu-meeshy-conformite-2026-10-05.md` § H) :
///  - H-2 : l'utilisateur voit la carte telle qu'elle partira, et peut retirer sa Flamme — elle
///    révèle un rythme d'usage. La carte ne porte AUCUN nom civil ;
///  - H-5 : partager ne rapporte rien de plus qu'un partage ordinaire ;
///  - H-8 : sans lien disponible, la carte part sans bandeau, et sans rien qui ressemble à un lien.
nonisolated struct ReferralCard: Equatable, Sendable {

    /// La Flamme que le bandeau montre : sa forme et ses jours.
    struct Flame: Equatable, Sendable {
        let form: FlameFormKey
        let days: Int

        /// Une Flamme éteinte, ou sans série, ne se montre pas.
        init?(game flame: GameBlock.Flame) {
            guard flame.days > 0, flame.status != .out, let form = flame.form else { return nil }
            self.form = form
            self.days = flame.days
        }

        init(form: FlameFormKey, days: Int) {
            self.form = form
            self.days = days
        }
    }

    /// Le lien de parrainage COMPLET, tel qu'il part dans le texte du partage.
    let link: String
    let flame: Flame?
    /// L'EMPLACEMENT du lien, quand l'utilisateur n'a encore aucun jeton : « meeshy.me/r/… » en pointillé, dans
    /// l'APERÇU seulement. Le jeton ne se crée qu'au toucher de « Partager » ; ce qui sort de l'app (partage,
    /// Photos, carnet) porte le vrai lien ou RIEN — jamais un emplacement qui ressemblerait à un lien (H-8).
    let isPlaceholder: Bool

    init(link: String, flame: Flame?) {
        self.link = link
        self.flame = flame
        self.isPlaceholder = false
    }

    private init(placeholderFlame flame: Flame?) {
        self.link = Self.placeholderText
        self.flame = flame
        self.isPlaceholder = true
    }

    static let placeholderText = "meeshy.me/r/…"

    static func placeholder(flame: Flame?) -> ReferralCard {
        ReferralCard(placeholderFlame: flame)
    }

    /// Le lien COURT que la carte écrit : sans schéma ni barre finale — « meeshy.me/signup/affiliate/AMANI7 ».
    var displayLink: String {
        if isPlaceholder { return Self.placeholderText }
        var text = link.trimmingCharacters(in: .whitespacesAndNewlines)
        for scheme in ["https://", "http://"] where text.lowercased().hasPrefix(scheme) {
            text.removeFirst(scheme.count)
        }
        while text.hasSuffix("/") { text.removeLast() }
        return text
    }

    func withFlame(_ flame: Flame?) -> ReferralCard {
        isPlaceholder ? .placeholder(flame: flame) : ReferralCard(link: link, flame: flame)
    }
}
