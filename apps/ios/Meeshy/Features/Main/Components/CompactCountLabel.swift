import Foundation

/// L'abrégé d'un grand nombre — « 1,5 k » / « 1.5K » / « ١٫٥ ألف » — rendu par
/// **Foundation**, dans la locale du lecteur.
///
/// Il remplace un `formatCount` privé de `ConversationListHelpers` qui composait
/// l'abrégé à la main :
///
/// ```swift
/// if count >= 1000000 { return String(format: "%.1fM", Double(count) / 1000000.0) }
/// else if count >= 1000 { return String(format: "%.1fk", Double(count) / 1000.0) }
/// ```
///
/// `String(format:)` appelé **sans locale** ne localise rien : il formate selon
/// la locale POSIX. Deux conséquences, sur toutes les langues sauf l'anglais :
///
/// 1. **Le séparateur décimal était toujours le point.** Le français écrit
///    « 1,5 k » — la virgule est le séparateur décimal, le point y est le
///    séparateur de MILLIERS. « 1.5k » n'y est donc pas seulement inhabituel :
///    il se lit comme un autre nombre. Même rupture en espagnol, italien,
///    allemand et portugais, qui emploient tous la virgule.
/// 2. **Le suffixe latin était gravé.** « k » et « M » sont des abréviations
///    latines ; l'arabe abrège par « ألف » et « مليون ». Un « 1.5k » en écriture
///    arabe mêle deux systèmes d'écriture dans un même nombre.
///
/// `.notation(.compact)` rend les deux — séparateur ET abréviation — depuis les
/// données CLDR de la locale. C'est aussi Foundation qui décide de la précision,
/// donc « 1000 » devient « 1 k » et non « 1.0k » : l'abrégé fait maison gravait
/// une décimale nulle que personne n'écrit à la main.
///
/// `locale` est un paramètre plutôt qu'une valeur en dur, pour la testabilité :
/// sans lui, une suite jugerait la locale du SIMULATEUR — verte en local (fr),
/// rouge en CI (en), ou l'inverse. Même raison que la paire `bundle`/`locale` de
/// `MembersCountLabel` ; il n'y a pas de `bundle` ici parce qu'aucune chaîne du
/// catalogue n'entre dans le rendu — tout vient de CLDR.
enum CompactCountLabel {

    /// Sous 1000, Foundation rend le nombre tel quel (« 999 »), comme le faisait
    /// la branche de repli du code remplacé.
    static func text(_ count: Int, locale: Locale = .current) -> String {
        count.formatted(.number.notation(.compact).locale(locale))
    }
}
