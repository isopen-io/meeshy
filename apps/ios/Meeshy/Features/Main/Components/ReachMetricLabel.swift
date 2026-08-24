import SwiftUI
import MeeshyUI

/// Un compteur de portée — une icône, un nombre abrégé — qui se présente à
/// VoiceOver comme **un élément nommé**.
///
/// ## Le défaut qu'il corrige
///
/// Les statistiques d'auteur (vues, impressions) se rendaient sur quatre écrans
/// et se disaient de trois façons. La pire, `FeedPostCard` :
///
/// ```swift
/// .accessibilityElement(children: .ignore)
/// .accessibilityLabel("Impressions")
/// .accessibilityValue("\(post.impressionCount) · \(post.viewCount)")
/// ```
///
/// VoiceOver annonce « Impressions, 1234 · 567 ». **Le second nombre n'est
/// nommé par rien.** Ce n'est pas un libellé imparfait : l'information « 567 est
/// un nombre de vues » n'existe nulle part dans l'arbre d'accessibilité. Un
/// lecteur d'écran entend deux nombres et une seule étiquette, et doit deviner.
///
/// `PostDetailView` nommait bien les deux (« Vues et impressions ») mais faisait
/// reposer l'appariement sur l'ORDRE — et son bloc englobant, marqué
/// `children: .ignore`, **avalait le `@pseudo`** qu'il contenait : le nom
/// d'utilisateur disparaissait purement et simplement de VoiceOver.
///
/// ## La règle
///
/// **Un nombre, un élément, un nom.** Chaque métrique porte son propre libellé,
/// donc l'ordre de rendu n'a plus à être appris : « Vues, 567 » puis
/// « Impressions, 1234 » se comprend dans les deux sens. C'est ce que
/// `ReelFeedCard` et `ReelsPlayerView` faisaient déjà — avec deux helpers
/// `metricInline` / `statInline` **identiques au caractère près**. Ce composant
/// est leur fusion, étendue aux deux écrans qui ne l'avaient pas.
///
/// ## La valeur est EXACTE, jamais l'abrégé
///
/// Le texte visible est abrégé (`CompactCountLabel`, « 1,2 k ») parce que la
/// place manque ; la valeur d'accessibilité ne l'est pas. Un lecteur d'écran
/// n'a pas de contrainte de largeur, et « mille deux cent trente-quatre » est
/// l'information réelle — « 1,2 k » en est une dégradation.
///
/// Elle passe malgré tout par `formatted(locale:)` et non par `"\(count)"` :
/// l'interpolation grave les chiffres latins, alors que l'arabe s'écrit en
/// chiffres arabo-indiens. Le compteur VISIBLE, lui, était déjà localisé depuis
/// 238i — les deux disaient donc le même nombre dans deux systèmes d'écriture.
struct ReachMetricLabel: View {
    let icon: String
    let count: Int
    /// Déjà localisé par l'appelant — « Vues », « Impressions ».
    let label: String
    let tint: Color
    var iconFont: Font = .caption2.weight(.semibold)

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: icon).font(iconFont)
            Text(CompactCountLabel.text(count)).font(.caption2.weight(.medium))
        }
        .foregroundColor(tint)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(label)
        .accessibilityValue(Self.spokenCount(count))
    }

    /// La `locale` est un paramètre plutôt qu'une valeur en dur, pour la même
    /// raison qu'en 234i/236i/237i/238i : sans elle, une suite jugerait la
    /// locale du SIMULATEUR — verte en local, rouge en CI.
    ///
    /// **241i — la règle a changé d'adresse, pas d'énoncé.** Neuf autres valeurs
    /// d'accessibilité avaient le même défaut de chiffres ; les brancher sur
    /// `ReachMetricLabel` aurait fait porter un « compteur de portée » à un score
    /// de santé et à une position de lecture. La règle vit donc dans
    /// `LocalizedNumber`, et ce point d'entrée la relaie pour les appelants de
    /// 239i.
    nonisolated static func spokenCount(_ count: Int, locale: Locale = .current) -> String {
        LocalizedNumber.exact(count, locale: locale)
    }
}
