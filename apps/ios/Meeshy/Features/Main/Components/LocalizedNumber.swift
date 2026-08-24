import Foundation

/// Les nombres que l'application **dit** et **montre** — une règle de locale,
/// un site.
///
/// ## Le défaut qu'il corrige
///
/// Dix valeurs d'accessibilité interpolaient leur nombre à la main :
///
/// ```swift
/// .accessibilityValue("\(likeCount)")          // chiffres latins en arabe
/// .accessibilityValue("\(player.percentInt) %") // …et un « % » gravé
/// ```
///
/// `"\(n)"` grave les **chiffres latins**. L'arabe s'écrit en chiffres
/// arabo-indiens : une interface arabe mêlait donc deux systèmes d'écriture,
/// exactement la régression que 238i puis 239i ont soldée sur les compteurs
/// visibles et les compteurs de portée. Ce type ferme la même famille du côté
/// des valeurs d'accessibilité.
///
/// ## Le pourcentage avait DEUX orthographes dans un même composant
///
/// `MessageOverlayMenu` rendait le même nombre deux fois, à quatre lignes
/// d'écart, avec deux espacements différents :
///
/// | ligne | rendu | forme |
/// |---|---|---|
/// | 974 / 1076 | `"\(player.percentInt) %"` | **avec** espace (usage français) |
/// | 977 / 1104 | `"\(player.percentInt)%"` | **sans** espace (usage anglais) |
///
/// Aucune des deux n'était juste partout : le français veut une espace
/// insécable avant `%`, l'anglais n'en veut pas. Graver l'une ou l'autre, c'est
/// se tromper dans une locale sur deux — et ici, se tromper dans les deux à la
/// fois, puisque la valeur PARLÉE et la valeur AFFICHÉE ne s'accordaient même
/// pas entre elles.
///
/// Le glyphe `%`, son espacement et le système de chiffres appartiennent tous
/// les trois à la **locale**, pas au code. `FormatStyle` les porte déjà.
///
/// ## `exact` — et jamais l'abrégé
///
/// La règle de 239i est conservée telle quelle : ce qu'un lecteur d'écran
/// entend n'est **jamais** l'abrégé affiché (`CompactCountLabel`, « 1,2 k »).
/// L'écran manque de place, pas l'oreille — et « 1,2 k » vaut aussi bien pour
/// 1 200 que pour 1 249. `ReachMetricLabel.spokenCount` délègue désormais ici :
/// la règle ne change pas d'énoncé, seulement d'adresse.
enum LocalizedNumber {

    /// Le compte **exact**, groupé et écrit dans le système de chiffres du
    /// lecteur — « 1 234 » (fr), « 1,234 » (en), « ١٢٣٤ » (ar).
    ///
    /// `locale` est un paramètre plutôt qu'une valeur en dur pour la raison
    /// devenue idiomatique depuis 234i : sans elle, une suite jugerait la locale
    /// du SIMULATEUR — verte en local, rouge en CI.
    nonisolated static func exact(_ value: Int, locale: Locale = .current) -> String {
        IntegerFormatStyle<Int>(locale: locale).format(value)
    }

    /// Un pourcentage **entier** rendu par la locale — glyphe et espacement
    /// compris : « 50 % » (fr), « 50% » (en), chiffres arabo-indiens en arabe.
    ///
    /// L'entrée est le pourcentage lui-même (`50` pour 50 %), pas la fraction :
    /// c'est ce que portent les deux appelants (`percentInt`,
    /// `Int((progress * 100).rounded())`). La division interne existe parce que
    /// seul le style flottant applique l'échelle de pourcentage.
    nonisolated static func percent(_ value: Int, locale: Locale = .current) -> String {
        (Double(value) / 100).formatted(
            .percent.locale(locale).precision(.fractionLength(0))
        )
    }
}
