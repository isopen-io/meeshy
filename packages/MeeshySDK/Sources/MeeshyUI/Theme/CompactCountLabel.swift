import Foundation

/// L'abrégé d'un grand nombre — « 1,5 k » / « 1.5K » / « ١٫٥ ألف » — rendu par
/// **Foundation**, dans la locale du lecteur.
///
/// Il est la **source unique** de cet abrégé dans tout le produit iOS. Il a
/// commencé par remplacer deux `formatCount` privés, copies l'un de l'autre
/// (`ConversationListHelpers` / `ThemedCommunityCard` côté app et
/// `CommunityListView` / `VibrantCommunityCard` côté SDK — deux cartes
/// « communauté » que corriger séparément aurait rendues incohérentes,
/// « 1,5 k » d'un côté et « 1.5k » de l'autre), puis a absorbé les **six
/// dernières copies** de la même règle : `FeedPostCard.compactCount`,
/// `ReelFeedCard.compactCount`, `ReelActionButton.compact`,
/// `PostReachFormatter.compact`, `StatRing.displayValue` et l'abrègement de
/// `ConversationDashboardView.formatNumber`.
///
/// Aucune de ces copies ne s'écartait de la règle — elles la répétaient. C'est
/// pourquoi le défaut de locale a pu s'y propager sept fois : chaque nouvelle
/// surface recopiait la voisine plutôt que d'appeler quoi que ce soit.
/// `CompactCountConsolidationSourceGuardTests` interdit la huitième.
///
/// Il vit dans le SDK parce que c'est un **moteur de règle sans état à
/// paramètres opaques** — la case « rule engines stateless (pures functions)
/// → SDK » du tableau de placement de `packages/MeeshySDK/CLAUDE.md`. Il
/// n'orchestre rien, ne lit aucun singleton Meeshy, ne décide d'aucune règle
/// produit : il formate un entier. L'app le consomme via `import MeeshyUI`,
/// qu'elle importait déjà.
///
/// Le code remplacé, à l'identique des deux côtés :
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
/// `.notation(.compactName)` rend les deux — séparateur ET abréviation — depuis les
/// données CLDR de la locale. C'est aussi Foundation qui décide de la précision,
/// donc « 1000 » devient « 1 k » et non « 1.0k » : l'abrégé fait maison gravait
/// une décimale nulle que personne n'écrit à la main.
///
/// `locale` est un paramètre plutôt qu'une valeur en dur, pour la testabilité :
/// sans lui, une suite jugerait la locale du SIMULATEUR — verte en local (fr),
/// rouge en CI (en), ou l'inverse. Même raison que la paire `bundle`/`locale` de
/// `MembersCountLabel` ; il n'y a pas de `bundle` ici parce qu'aucune chaîne du
/// catalogue n'entre dans le rendu — tout vient de CLDR.
public enum CompactCountLabel {

    /// Sous 1000, Foundation rend le nombre tel quel (« 999 »), comme le faisait
    /// la branche de repli du code remplacé.
    ///
    /// Le style est **nommé et construit explicitement** plutôt qu'écrit
    /// `count.formatted(.number.notation(…))` : la forme abrégée passe par la
    /// surcharge générique de `BinaryInteger.formatted(_:)`, où le membre
    /// statique `.number` n'a pas de base à inférer — le compilateur rend
    /// « type 'BinaryInteger' has no member 'number' ». Construire
    /// `IntegerFormatStyle<Int>` puis appeler `format(_:)` ne dépend d'aucune
    /// inférence.
    ///
    /// La notation s'appelle `.compactName` — `.compact` n'existe pas dans
    /// `NumberFormatStyleConfiguration.Notation`, qui n'offre que `.automatic`,
    /// `.scientific` et `.compactName`.
    public nonisolated static func text(_ count: Int, locale: Locale = .current) -> String {
        IntegerFormatStyle<Int>(locale: locale)
            .notation(.compactName)
            .format(count)
    }
}
