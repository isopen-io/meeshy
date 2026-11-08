import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Un avis système n'est la voix de personne** — et la peau doit le dire.
///
/// La loi l'a déjà retiré des voix, des couloirs, des connecteurs et des
/// groupes (`RiverLaneResolver`, « ce qu'un avis système n'est pas ») ; elle
/// le sert quand même dans `bubbles`, avec son rang, et documente que « la
/// peau le rend PLEINE LARGEUR ». Ce type porte de quoi le faire — en
/// réutilisant les vues et les clés i18n du Fil, jamais un libellé réécrit
/// pour la Rivière.
enum RiverSystemNotice: Equatable {
    /// « X a rejoint la conversation » — `BubbleJoinNoticeView`, qui sait dire
    /// l'arrivant sans compte et les droits du lien d'entrée.
    case join(BubbleContent.JoinNotice)
    /// Résumé d'appel — `BubbleCallNoticeView`, la carte compacte du Fil.
    case call(BubbleContent.CallNotice)
    /// Tout autre jalon, déjà localisé par l'appelant.
    case plain(String)
}

/// « La citation est une RÉFÉRENCE, pas une relecture » (§7ter A4) — une
/// seule ligne tronquée, même règle que `FocalQuotedReplyView`.
struct RiverReplyPreview: Equatable {
    let authorDisplayName: String
    let text: String
    /// #8283 — l'aperçu du média cité (vignette, poster, vocal), sous la
    /// ligne. `nil` ⇒ la citation reste la seule ligne de texte.
    let media: RiverQuotedMedia?
    /// #9574 — la citation d'un contenu qui disparaît se rend dans la couche
    /// sécurisée (`ReplyReference.quotedCapture`).
    let capturesBlocked: Bool

    init(authorDisplayName: String, text: String, media: RiverQuotedMedia? = nil, capturesBlocked: Bool = false) {
        self.authorDisplayName = authorDisplayName
        self.text = text
        self.media = media
        self.capturesBlocked = capturesBlocked
    }
}

// MARK: - Initiales — pures, testables sans monter la vue

/// Extrait de la vue pour que `RiverBubbleLayoutTests` puisse l'éprouver
/// sans SwiftUI (§ tests possibles sans runtime UIKit complet).
nonisolated enum RiverBubbleLayout {
    /// Une ou deux lettres majuscules — premier caractère du premier mot, et
    /// du second s'il existe. Purement typographique : le SENS de « Toi »
    /// (résolution `isViewer`) est une affaire de l'appelant, pas de ce
    /// calcul.
    static func initials(for displayName: String) -> String {
        let letters = displayName
            .split(separator: " ")
            .filter { !$0.isEmpty }
            .prefix(2)
            .compactMap { $0.first }
        guard !letters.isEmpty else { return "?" }
        return String(letters).uppercased()
    }
}
