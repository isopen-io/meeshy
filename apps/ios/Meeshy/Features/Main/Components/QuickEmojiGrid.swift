import CoreGraphics
import Foundation

/// **Les emojis rapides de l'emplacement d'action** (#7931, #7985, #10842).
///
/// Une rangée à la hauteur de la ligne de saisie, EN PERMANENCE, focus ou non
/// (directive porteur 2026-09-25), dans la MÊME largeur qu'à trois émojis de
/// 32 pt. Depuis #10842 (retour porteur 2026-10-16) elle sert les 20 derniers
/// émojis utilisés (`RecentEmojiHistory`) et en montre TROIS ET DEMI : la
/// quatrième coupée en deux dit qu'on peut faire défiler. Chaque cellule reste
/// sous la cible tactile de 44 pt (décision ouverte #7979) ; l'appui long vers
/// la feuille des emojis en est le recours.
nonisolated enum QuickEmojiGrid {

    /// Combien la rangée en sert au plus — l'historique entier.
    static let count = RecentEmojiHistory.capacity
    /// Combien la rangée en MONTRE à la fois.
    static let visibleCount: CGFloat = 3.5
    static let spacing: CGFloat = 3
    static let inset: CGFloat = 4
    /// La hauteur de la ligne de saisie, sur laquelle le cadre s'aligne.
    static let rowHeight: CGFloat = 44

    /// La largeur de la rangée : celle de trois cellules de 32 pt (#7985),
    /// inchangée — la ligne de saisie ne perd rien.
    static let width: CGFloat = 3 * 32 + 2 * spacing

    /// La cellule : trois et demie, et trois gouttières, dans la largeur.
    static var cell: CGFloat { (width - 3 * spacing) / visibleCount }

    /// L'émoji suit sa cellule (24 pt dans une cellule de 32 avant #10842).
    static var emojiSize: CGFloat { (cell * 0.75).rounded() }

    /// La largeur du cadre de verre, et donc celle que la ligne lui réserve.
    static var frameWidth: CGFloat { width + 2 * inset }

    /// La largeur du contenu de `itemCount` émojis, marges du cadre comprises.
    static func contentWidth(itemCount: Int) -> CGFloat {
        guard itemCount > 0 else { return 0 }
        return CGFloat(itemCount) * cell + CGFloat(itemCount - 1) * spacing + 2 * inset
    }

    /// Le décalage de la rangée, borné : jamais avant le premier émoji, jamais
    /// au-delà du dernier.
    static func clampedScroll(_ offset: CGFloat, itemCount: Int) -> CGFloat {
        let travel = max(contentWidth(itemCount: itemCount) - frameWidth, 0)
        return min(0, max(offset, -travel))
    }

    /// Les vingt premiers, jamais plus.
    static func row(_ emojis: [String]) -> [String] {
        Array(emojis.prefix(count))
    }
}

/// **Les derniers émojis utilisés, du plus récent au plus ancien** (#10842).
///
/// « Utilisé » : envoyé depuis la rangée rapide ou sa feuille, contenu dans un
/// message composé et envoyé, choisi dans la feuille des stickers. Le compteur
/// de FRÉQUENCE (`EmojiUsageTracker`) reste celui des menus de réaction : cet
/// historique vit à côté de lui, il ne change pas sa sémantique.
nonisolated enum RecentEmojiHistory {
    static let capacity = 20

    /// `emojis` dans l'ordre où ils ont été employés : le dernier est le plus
    /// récent. Un émoji réemployé remonte en tête, sans doublon.
    static func recording(_ emojis: [String], into history: [String]) -> [String] {
        let fresh = emojis.reversed().reduce(into: [String]()) { acc, emoji in
            if !acc.contains(emoji) { acc.append(emoji) }
        }
        return Array((fresh + history.filter { !fresh.contains($0) }).prefix(capacity))
    }

    /// Les émojis d'un texte, dans l'ordre d'écriture — séquences composées
    /// (drapeaux, tons de peau, familles) entières.
    static func emojis(in text: String) -> [String] {
        text.filter(\.isEmojiGlyph).map(String.init)
    }

    /// Ce que la rangée sert : l'historique, complété par les défauts.
    static func row(history: [String], defaults: [String]) -> [String] {
        Array((history + defaults.filter { !history.contains($0) }).prefix(capacity))
    }
}

/// L'historique récent, persisté hors de toute vue.
nonisolated enum RecentEmojiStore {
    private static let key = "com.meeshy.recentEmojis"

    static func load(from store: UserDefaults = .standard) -> [String] {
        store.stringArray(forKey: key) ?? []
    }

    static func record(_ emojis: [String], in store: UserDefaults = .standard) {
        guard !emojis.isEmpty else { return }
        store.set(RecentEmojiHistory.recording(emojis, into: load(from: store)), forKey: key)
    }
}

private extension Character {
    /// Un émoji « vu comme tel » : présentation émoji par défaut, ou séquence
    /// composée — jamais un chiffre ni un « # », qui portent la propriété
    /// `isEmoji` sans en avoir l'aspect.
    nonisolated var isEmojiGlyph: Bool {
        guard let first = unicodeScalars.first else { return false }
        return first.properties.isEmojiPresentation
            || (first.properties.isEmoji && unicodeScalars.count > 1 && first.value > 0x238C)
    }
}

/// **Le retour après envoi, adouci** (#7985, directive porteur 2026-09-25 :
/// « l'effet de retour après l'envoi du message doit être moins accentué »).
///
/// Le bouton d'envoi part et les emojis rapides reviennent dans le même
/// emplacement. Le tourbillon d'origine (#3927) les faisait tourner de 250° en
/// partant d'un vingtième de leur taille, sur un ressort qui rebondissait : un
/// effet plus fort que l'acte qu'il accompagne, rejoué à CHAQUE envoi. Il en
/// reste un léger pivot, un léger grossissement et un ressort presque amorti.
nonisolated enum ComposerSlotMotion {
    static let rotationDegrees: Double = 40
    static let startScale: CGFloat = 0.6
    static let response: Double = 0.3
    static let damping: Double = 0.86
    static let sendBounceScale: CGFloat = 1.08
}

/// **La rangée qui ARRIVE ignore les appuis pendant une demi-seconde** (#7985).
///
/// Elle revient à l'emplacement même du bouton d'envoi, 0,2 s après son appui :
/// le second appui d'un double appui sur « Envoyer » tombait sur l'emoji revenu
/// sous le doigt et l'envoyait. Même fenêtre que le web (`composer.tsx`). Ce
/// n'est pas un dédoublonnage : des appuis en série sur une rangée déjà là
/// partent tous.
nonisolated enum QuickEmojiArrivalGuard {
    static let window: TimeInterval = 0.5

    static func acceptsTap(arrivedAt: Date?, now: Date) -> Bool {
        guard let arrivedAt else { return true }
        return now.timeIntervalSince(arrivedAt) >= window
    }
}
