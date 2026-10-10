import Foundation

/// Une section repliée dit ce qu'elle cache (#8694, directive porteur
/// 2026-09-29).
///
/// Repliée, une section de la liste retire ses rangées — et avec elles leurs
/// pastilles de non-lus : ce qui restait à lire disparaissait de l'écran. Le
/// compte monte donc sur l'en-tête, à côté du chevron. Dépliée, il vaut zéro :
/// les rangées le portent déjà, le dire deux fois serait compter deux fois.
///
/// La SOURCE est le compteur déjà servi par conversation
/// (`userState.unreadCount`, celui que lisent les pastilles des rangées) :
/// rien n'est recalculé côté serveur, et le compte bouge au même instant que
/// les rangées — message reçu, lecture, « Non lu ».
///
/// Aucun plafond ici : « 99+ » est le fait de la pastille
/// (`UnreadCountBadge` → `NotificationBadge.displayed`), et VoiceOver annonce
/// le nombre exact.
///
/// Jumeau web : `foldedSectionUnread` / `lensSectionAccessibleName`
/// (`apps/web/src/lib/lens/folded-unread.ts`).
enum SectionFoldedUnread {

    static func count(unreadCounts: [Int], isExpanded: Bool) -> Int {
        guard !isExpanded else { return 0 }
        return unreadCounts.reduce(0) { sum, count in sum + max(0, count) }
    }

    /// La valeur VoiceOver de l'en-tête — le libellé est le nom de la section,
    /// la valeur dit l'état et, repliée, le compte : « Épingles » ·
    /// « Réduite, 12 messages non lus ». `bundle` et `locale` vont par paire
    /// (idiome `UnreadCountLabel`).
    static func accessibilityValue(
        isExpanded: Bool,
        foldedUnread: Int,
        bundle: Bundle = .main,
        locale: Locale = .current
    ) -> String {
        guard !isExpanded else {
            return String(localized: "accessibility.section_expanded", defaultValue: "Développée", bundle: bundle, locale: locale)
        }
        let state = String(localized: "accessibility.section_collapsed", defaultValue: "Réduite", bundle: bundle, locale: locale)
        guard foldedUnread > 0 else { return state }
        return "\(state), \(UnreadCountLabel.messages(foldedUnread, bundle: bundle, locale: locale))"
    }
}
