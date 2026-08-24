import Foundation

/// La source unique des libellés « N j'aime / N commentaires / N repartages /
/// N réponses » du fil. Chaque clé (`feed.post.stat.*`) porte une
/// `variations.plural` complète — 2 formes dans les 6 locales latines, **6 en
/// arabe** — donc l'accord est celui du CATALOGUE, jamais du code.
///
/// ## Ce n'est pas un pis-aller réservé à UIKit
///
/// Les cellules `TextPostCell` / `MediaPostCell` (UIKit) posent ces chaînes en
/// `accessibilityLabel` — leur bouton n'affiche que le nombre nu (« 5 »), et
/// sans libellé VoiceOver annonce « 5, bouton » sans dire de quoi. Mais les
/// écrans SwiftUI du fil rendaient les MÊMES compteurs par **quatre clés plates**
/// (`a11y.feed.post.like.value`, `a11y.comment.replies.count`,
/// `feed.post.comment.replies_count`, `a11y.comment.show_replies`), qui gravaient
/// « %d réponses » : « **1 réponses** » en français, « **1 replies** » en
/// anglais — l'une VISIBLE à l'écran (`FeedPostCard`). Une clé plate ne peut pas
/// accorder ; l'arabe n'en recevait jamais qu'une forme sur six. 240i les a
/// toutes rebranchées ici. L'AGA inline `^[…](inflect: true)` reste proscrite
/// (cf. `ExplicitPluralLabelTests`) : sans entrée catalogue, le markup fuit en
/// brut sur iOS 18.x — mais ces entrées existent, ce sont ces `variations.plural`.
///
/// `bundle` et `locale` sont des paramètres plutôt que des valeurs en dur, pour
/// une raison de testabilité — et ils vont par PAIRE :
///   - `bundle` choisit la TABLE de traduction (`en.lproj` / `fr.lproj`) ;
///   - `locale` choisit la RÈGLE DE PLURIEL appliquée à cette table.
/// Les fixer séparément ne suffit pas : avec la seule table anglaise et un
/// simulateur français, `likesLabel(0)` rend « 0 like » (le français range 0
/// dans le singulier) au lieu de « 0 likes ». Sans les fixer du tout, le test
/// juge la langue du SIMULATEUR — vert en local (fr), rouge en CI (en).
enum PostStatAccessibility {
    static func likesLabel(_ count: Int,
                           bundle: Bundle = .main,
                           locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.likes",
            defaultValue: "\(count) \(count == 1 ? "like" : "likes")",
            bundle: bundle,
            locale: locale
        )
    }

    static func commentsLabel(_ count: Int,
                              bundle: Bundle = .main,
                              locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.comments",
            defaultValue: "\(count) \(count == 1 ? "comment" : "comments")",
            bundle: bundle,
            locale: locale
        )
    }

    static func repostsLabel(_ count: Int,
                             bundle: Bundle = .main,
                             locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.reposts",
            defaultValue: "\(count) \(count == 1 ? "repost" : "reposts")",
            bundle: bundle,
            locale: locale
        )
    }

    static func repliesLabel(_ count: Int,
                             bundle: Bundle = .main,
                             locale: Locale = .current) -> String {
        String(
            localized: "feed.post.stat.replies",
            defaultValue: "\(count) \(count == 1 ? "reply" : "replies")",
            bundle: bundle,
            locale: locale
        )
    }
}
