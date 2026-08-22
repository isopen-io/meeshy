import Foundation

/// Le compteur « N non lus » de l'application — **une** règle plurielle par
/// nom compté, **une** clé de catalogue, **un** site de rendu.
///
/// Jumeau de `MembersCountLabel` (234i), et posé pour la même raison : la
/// famille « non-lus » avait accumulé cinq écritures du MÊME libellé, dont
/// quatre fausses au singulier.
///
/// 1. `accessibility.unread_count` — la seule qui était juste : une vraie
///    `variations.plural`, 2 formes dans les 6 locales latines et 6 en arabe.
///    C'est elle qui survit, et c'est elle que ce type sert.
/// 2. `conversation.scroll-to-bottom.a11y-unread` — **doublon mot pour mot** de
///    la forme `other` de la précédente, dans les 7 locales, mais à plat : le
///    bouton de retour en bas de conversation annonçait « 1 messages non lus ».
/// 3. `unit.unread` — le seul adjectif, nu, concaténé au nombre par
///    `GlobalSearchView` (`"\(count) " + « non lus »`). Une concaténation ne
///    peut pas accorder, et l'arabe n'en recevait jamais qu'une forme sur six.
/// 4. `a11y.notifications.unread_count` — même défaut à plat sur l'autre nom
///    compté de la famille (les notifications, pas les messages) : « 1
///    notifications non lues » sur le libellé de la cloche.
///
/// Le contrat est celui de 234i : la **règle plurielle** vient du catalogue
/// (`variations.plural`), la **mise en page** de la vue.
///
/// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibility`) : le
/// bundle choisit la TABLE de traduction, le locale choisit la RÈGLE plurielle
/// appliquée à cette table. Fixer l'un sans l'autre rend le test vert en local
/// et rouge en CI — le simulateur choisirait la règle.
///
/// **Deux fonctions, pas une avec un paramètre de nom** : « message » et
/// « notification » n'ont pas le même genre en français, en espagnol, en
/// italien ni en portugais, et l'accord de l'adjectif « non lu » suit ce genre.
/// Une clé par nom compté est la seule forme qui laisse le catalogue porter cet
/// accord au lieu de le graver dans du code.
enum UnreadCountLabel {

    /// « 3 messages non lus » / « 1 message non lu », accordé par le catalogue
    /// dans les 7 locales.
    static func messages(_ count: Int,
                         bundle: Bundle = .main,
                         locale: Locale = .current) -> String {
        String(
            format: String(
                localized: "accessibility.unread_count",
                defaultValue: "%d message non lu",
                bundle: bundle,
                locale: locale
            ),
            locale: locale,
            count
        )
    }

    /// « 3 notifications non lues » / « 1 notification non lue », accordé par le
    /// catalogue dans les 7 locales.
    static func notifications(_ count: Int,
                              bundle: Bundle = .main,
                              locale: Locale = .current) -> String {
        String(
            format: String(
                localized: "a11y.notifications.unread_count",
                defaultValue: "%d notification non lue",
                bundle: bundle,
                locale: locale
            ),
            locale: locale,
            count
        )
    }
}
