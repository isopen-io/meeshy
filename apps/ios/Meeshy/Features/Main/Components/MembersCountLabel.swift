import Foundation

/// Le compteur « N membres » de l'application — **une** règle plurielle, **une**
/// clé de catalogue, **un** site de rendu.
///
/// Avant consolidation, six surfaces rendaient ce même libellé par trois
/// mécanismes différents :
///
/// 1. `ForwardPickerRow.membersCountLabel` (231i) — clé `forward.members-count`,
///    pluriel correct, mais le **séparateur « • » était gravé dans les 13 formes
///    localisées**. Un glyphe de mise en page vivait dans la mémoire de
///    traduction : chaque traducteur devait le reproduire, et la clé ne pouvait
///    pas servir aux surfaces qui n'ont pas de puce.
/// 2. `ConversationInfoSheet.membersCountLabel` (232i) — clé
///    `conversation.info.members-count`, **doublon mot pour mot** du helper
///    ci-dessus, à la puce près.
/// 3. Quatre sites concaténaient le nombre et la clé `unit.members` — le nom au
///    pluriel nu, collé à un compteur. La concaténation ne peut pas
///    accorder : `ConversationListHelpers` rendait « 1 membres » pour un groupe
///    d'un seul membre (FR/ES/IT/DE/PT), et l'arabe — qui distingue six formes
///    plurielles — recevait toujours la même, fausse dès N ≥ 11.
///
/// Le contrat est désormais : la **règle plurielle** vient du catalogue
/// (`variations.plural`), la **mise en page** (puce, police, écart) de la vue.
///
/// `bundle` et `locale` vont par PAIRE (idiome `PostStatAccessibility`) : le
/// bundle choisit la TABLE de traduction, le locale choisit la RÈGLE plurielle
/// appliquée à cette table. Fixer l'un sans l'autre rend le test vert en local
/// et rouge en CI — le simulateur choisirait la règle.
enum MembersCountLabel {

    /// « 3 membres » / « 1 membre », accordé par le catalogue dans les 7 locales.
    ///
    /// `capped` traite le seul cas où l'effectif n'est PAS un entier rendu tel
    /// quel : quand le serveur plafonne la valeur pour ce lecteur, l'affichage
    /// est « 199+ ». Le `+` est un suffixe du NOMBRE, qu'aucun `%d` ne peut
    /// porter ; la forme plafonnée retombe donc sur le nom au pluriel nu
    /// (`unit.members`), ce qui reste juste puisqu'un plafond n'est jamais
    /// atteint sous 2. C'est la seule survivance de la concaténation, et elle
    /// est ici — à un seul endroit — plutôt que dispersée dans les vues.
    static func text(_ count: Int,
                     capped: Bool = false,
                     bundle: Bundle = .main,
                     locale: Locale = .current) -> String {
        guard capped else {
            return String(
                format: String(
                    localized: "conversation.members-count",
                    defaultValue: "%d membre",
                    bundle: bundle,
                    locale: locale
                ),
                locale: locale,
                count
            )
        }

        let unit = String(
            localized: "unit.members",
            defaultValue: "membres",
            bundle: bundle,
            locale: locale
        )
        return "\(count)+ " + unit
    }
}
