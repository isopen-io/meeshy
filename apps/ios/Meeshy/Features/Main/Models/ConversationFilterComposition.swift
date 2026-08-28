import Foundation
import MeeshySDK

/// **Composer plusieurs filtres de liste, et les retirer d'un second appui.**
///
/// Directive porteur du 2026-08-28 : les chips passent sous le rail de stories,
/// en plus petit, « pour faire du filtrage composé » — et « on touche une
/// seconde fois, ça enlève le filtre simplement ».
///
/// La sélection cesse donc d'être UNE valeur pour devenir un ENSEMBLE, et c'est
/// tout le sujet de ce type : dire ce que « Non lus + Personnel » signifie.
///
/// ## Deux familles, deux conjonctions
///
/// Composer n'est pas intersecter aveuglément. « Personnel + Privée » avec un
/// ET ne rendrait JAMAIS rien — une conversation est de l'un ou de l'autre
/// type, jamais des deux. La règle suit donc la nature des filtres :
///
/// - **au sein du TYPE** (personnel · privée · ouvertes · globales · channels)
///   — un OU : « montre-moi les directs ET les groupes » ;
/// - **au sein de l'ÉTAT** (non lus · favoris) — un ET : « non lus ET
///   favoris » restreint, comme on l'attend ;
/// - **entre les deux familles** — un ET : « non lus, parmi les directs ».
///
/// > La faute qu'un ensemble invite à commettre est de tout intersecter. Deux
/// > filtres du même axe s'ADDITIONNENT ; deux filtres d'axes différents se
/// > CROISENT. Un seul opérateur pour les deux rend l'écran vide ou inutile.
///
/// ## Trois états qui ne sont pas des filtres comme les autres
///
/// - **`.all`** est le NEUTRE : le choisir efface les autres, en choisir un
///   autre l'efface. Il ne se compose avec rien — il est l'absence de filtre.
/// - **`.archived`** ne restreint pas, il CHANGE DE CORPUS : les archives sont
///   masquées partout ailleurs. Le composer avec un type reste sensé
///   (« archivées, parmi les groupes ») ; c'est l'inclusion des archives qui
///   bascule, pas un critère de plus.
/// - **l'ensemble VIDE** vaut `.all`. Un second appui qui viderait la sélection
///   ne doit pas rendre une liste vide : il rend la liste entière.
nonisolated enum ConversationFilterComposition {

    /// Les filtres qui décrivent la NATURE du fil — combinés par OU.
    static let typeFilters: Set<MeeshyConversationFilter> =
        [.personnel, .privee, .ouvertes, .globales, .channels]

    /// Les filtres qui décrivent son ÉTAT pour ce lecteur — combinés par ET.
    static let stateFilters: Set<MeeshyConversationFilter> = [.unread, .favoris]

    /// La sélection par défaut, et celle vers laquelle tout retrait ramène.
    static let neutral: Set<MeeshyConversationFilter> = [.all]

    /// Un appui sur `filter` : il s'ajoute s'il manque, il PART s'il est là.
    ///
    /// « On touche une seconde fois, ça enlève le filtre simplement » — le même
    /// geste pose et retire, sans bouton d'effacement à trouver ailleurs.
    static func toggling(
        _ filter: MeeshyConversationFilter,
        in selection: Set<MeeshyConversationFilter>
    ) -> Set<MeeshyConversationFilter> {
        if filter == .all { return neutral }

        var next = selection
        next.remove(.all)
        if next.contains(filter) {
            next.remove(filter)
        } else {
            next.insert(filter)
        }
        return next.isEmpty ? neutral : next
    }

    /// La sélection est-elle sans restriction ?
    static func isNeutral(_ selection: Set<MeeshyConversationFilter>) -> Bool {
        selection.isEmpty || selection.contains(.all)
    }

    /// Les archives entrent-elles dans le corps de la liste ?
    ///
    /// Elles sont masquées PARTOUT ailleurs — une conversation archivée ne doit
    /// pas reparaître dans « Non lus » parce qu'elle porte encore des messages
    /// non lus.
    static func includesArchived(_ selection: Set<MeeshyConversationFilter>) -> Bool {
        selection.contains(.archived)
    }

    /// Les critères de TYPE retenus — vide veut dire « tous les types ».
    static func selectedTypes(
        _ selection: Set<MeeshyConversationFilter>
    ) -> Set<MeeshyConversationFilter> {
        isNeutral(selection) ? [] : selection.intersection(typeFilters)
    }

    /// Les critères d'ÉTAT retenus — vide veut dire « aucune restriction ».
    static func selectedStates(
        _ selection: Set<MeeshyConversationFilter>
    ) -> Set<MeeshyConversationFilter> {
        isNeutral(selection) ? [] : selection.intersection(stateFilters)
    }

    /// Le libellé d'accessibilité d'une chip : son état se DIT, il ne se déduit
    /// pas d'une couleur. Une chip sélectionnée annonce comment la retirer.
    static func accessibilityHint(isSelected: Bool) -> String {
        isSelected
            ? String(localized: "conversation.filter.remove",
                     defaultValue: "Toucher pour retirer ce filtre", bundle: .main)
            : String(localized: "conversation.filter.add",
                     defaultValue: "Toucher pour ajouter ce filtre", bundle: .main)
    }
}
