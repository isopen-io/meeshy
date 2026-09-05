import Foundation

/// **Quand une conversation a RATTRAPÉ son retard — la loi, seule et pure.**
///
/// `caughtUpToMessageId` n'est pas un avancement de curseur : côté passerelle
/// il part avec `resetUnreadCount: true` (`MessageReadStatusService`), donc il
/// **vide le badge**. Il ne peut porter que le message le PLUS RÉCENT — il
/// n'existe pas de version « avancer un peu », parce qu'avancer c'est vider.
///
/// ### Le défaut que cette loi corrige (#3902)
///
/// La règle d'origine exigeait que **le lot `seen` de CET appel** contienne
/// littéralement le message le plus récent. Or les deux se courent après : le
/// lot est drainé toutes les ~300 ms, et sur une conversation à fort débit un
/// message plus récent est arrivé avant que le précédent ait fini son délai de
/// présence. La coïncidence n'arrive quasiment jamais, et la mémoïsation
/// (`memoized`) ne peut pas s'amorcer — elle ne retient un identifiant
/// qu'après un premier succès qui n'a jamais lieu.
///
/// Mesuré en production le 2026-08-26 : `lastReadAt` figé depuis 27 jours sur
/// une conversation à fort débit, badge calculé à 165, alors que 95 lectures
/// individuelles s'y étaient bien gelées.
///
/// ### Pourquoi `visible` et pas `seen`
///
/// `seen` répond à « quels messages ont fini leur délai de PRÉSENCE ». Un
/// message affiché depuis 100 ms est sous les yeux du lecteur et absent du
/// lot : c'est exactement le cas de l'issue. `visible` répond à l'autre
/// question — « qu'y a-t-il à l'écran EN CE MOMENT » — et c'est celle qui
/// décide si le lecteur a rattrapé.
///
/// C'est le même déplacement que `markCaughtUpFromSummaryOrRiver` (#3901) a
/// fait pour la Rivière et le Résumé : quand la preuve de consultation ne peut
/// pas venir d'un lot `seen`, elle vient de ce que la surface MONTRE.
///
/// ### Ce que la loi refuse, et pourquoi ce n'est pas un oubli
///
/// Elle ne propose JAMAIS un message autre que le plus récent, même confirmé
/// lu et sans trou depuis le curseur. Le trou dangereux n'est pas ENTRE le
/// curseur et le candidat — il est APRÈS lui : `resetUnreadCount: true`
/// effacerait du badge, sur tous les appareils, les messages plus récents que
/// le candidat. C'est ce qui écarte la piste `hasNoGapBetween` envisagée au
/// 2026-08-26.
///
/// `nonisolated` : arithmétique d'ensembles pure, interrogeable depuis tout
/// test synchrone. La cible app compile sous
/// `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, donc l'isolation serait le
/// DÉFAUT et non une décision.
///
/// Gardes : `ConversationCatchUpLawTests`.
nonisolated enum ConversationCatchUpLaw {

    /// L'identifiant à annoncer comme « rattrapé », ou `nil`.
    ///
    /// - Parameters:
    ///   - newestServerId: le message le plus récent que le SERVEUR connaît
    ///     dans la fenêtre chargée. `nil` ⇒ rien à annoncer (une bulle
    ///     optimiste ne porte pas encore d'ObjectId et ferait rejeter le lot).
    ///   - windowIsAtTip: la fenêtre chargée est bien au sommet. Après un saut
    ///     vers un message cité, le bas de l'écran n'est pas le bas de la
    ///     conversation, et croire l'inverse viderait un badge encore dû.
    ///   - seen: le lot de messages dont le délai de présence vient d'être
    ///     franchi. `nil` = appelant NON INFORMÉ : la passerelle reste sur son
    ///     repli par fenêtre temporelle, qui vide déjà le compteur.
    ///   - visible: ce qui est à l'écran à cet instant. Vide = la surface ne
    ///     le dit pas — la loi retombe alors exactement sur son comportement
    ///     d'avant #3902.
    ///   - memoized: le dernier identifiant rattrapé. Rend le rattrapage
    ///     COLLANT : remonter dans l'historique après avoir touché le bas ne
    ///     remet pas la conversation en retard tant qu'aucun message plus
    ///     récent n'est arrivé.
    static func caughtUpId(
        newestServerId: String?,
        windowIsAtTip: Bool,
        seen: [String]?,
        visible: [String],
        memoized: String?
    ) -> String? {
        guard let seen, windowIsAtTip, let newest = newestServerId else { return nil }
        if seen.contains(newest) { return newest }
        if visible.contains(newest) { return newest }
        return memoized == newest ? newest : nil
    }
}
