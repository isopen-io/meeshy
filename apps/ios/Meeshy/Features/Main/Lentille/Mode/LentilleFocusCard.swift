import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Pourquoi ce fichier vit dans Lentille/Mode/, pas Lentille/Perspective/
//
// Re-preuve d'ancrage (règle §0 du workshop) : le contrat/workshop citent
// « Lentille/Perspective/ + Lentille/Mode/ » comme territoire d'I-071. Mais
// `Lentille/Perspective/` porte une garde de source GELÉE et déjà VERTE
// (`LentillePerspectiveCurveTests.test_perspective_appliesOpacityAndScaleOnly`,
// scan DYNAMIQUE de tout le dossier) qui interdit `.font(`, `.offset(`,
// `blur(`, `rotationEffect(`… à TOUT fichier qu'il contient.
// `Lentille/Perspective/*.swift` (GELÉ : `LentillePerspective.swift`,
// `LentilleFocusElection.swift`, `LentilleFocusElectionHost.swift`) est
// CONSOMMÉ ici, jamais édité.

// MARK: - Il n'y a PLUS de carte (2026-08-23)
//
// Ce fichier a porté, du 2026-08-21 au 2026-08-23, une VUE : `LentilleFocusCard`
// (fond `bg2`, anneau d'accent, ombre, avatar 52, nom 17, encoche débordant du
// bord haut) et son hôte `LentilleFocusCardHost`, qui la peignait PAR-DESSUS
// la rangée élue dans l'overlay de la liste.
//
// Deux directives produit successives l'ont dissoute :
//
// 1. « Pas de bordure, on complète juste les informations, directement sur le
//    row existant ! Sans que l'utilisateur ne sente un changement si ce n'est
//    le surplus d'information, l'objet reste le même. »
// 2. « Mettre à jour la rangée cible avec des données et un style adéquats
//    afin qu'elle hérite des features du mode normal […] ENFIN, le mode
//    magnificence doit permettre le swipe gauche et droite comme le mode
//    normal. »
//
// La seconde a tranché l'ARCHITECTURE, pas seulement la peinture. Une couche
// posée SUR la rangée ne peut pas tenir les deux promesses à la fois : ou bien
// elle est transparente aux touches — et alors ses propres pastilles (mode,
// catégorie, étiquettes, effectif) ne sont pas actionnables — ou bien elle
// prend les touches — et alors elle avale le swipe, le glisser-déposer et
// l'appui long de la rangée qu'elle recouvre. Il n'y a pas de troisième
// position : `allowsHitTesting(false)` posé sur un parent gagne toujours sur
// ses enfants.
//
// La magnification vit donc DANS la rangée : `LentilleConversationRow` reçoit
// un `LentilleMagnification?` (`Lentille/Mode/LentilleMagnification.swift`) et
// se rend elle-même magnifiée. Elle hérite ainsi de TOUTES ses features sans
// qu'aucune soit à recopier — anneau story, badge mood, présence, saisie en
// cours, brouillon, appel en cours, outbox, ❤️ favori, sourdine, épingle,
// sélection iPad — et ses gestes restent les siens, puisqu'il n'y a plus rien
// au-dessus d'elle.
//
// Ne subsiste ici que ce qui était une LOI, pas une peinture : la date
// complète et la précédence du pont ✦.

/// Les deux lois de la magnification — pures, testables sans vue.
///
/// Le nom `LentilleFocusCard` survit à la carte qu'il désignait : il est cité
/// par le contrat LWS-8 et par les suites de tests, et le renommer n'aurait
/// rien clarifié qu'un commentaire ne dise mieux.
nonisolated enum LentilleFocusCard {

    /// Date COMPLÈTE du dernier message, MÊME loi que le message en focus du
    /// fil (`FocalFocusTimestamp`) avec le joint « à » : « Aujourd'hui à
    /// 5:49 », « Hier à 22:12 », « Mardi à 23:50 », « Sam. 3 oct. 2025 à
    /// 14:41 » (directive 2026-08-21).
    static func fullTimestamp(lastMessageAt: Date, now: Date, calendar: Calendar, locale: Locale) -> String {
        FocalFocusTimestamp.listLabel(
            sentAt: lastMessageAt,
            timeString: TimeStringCache.shared.format(lastMessageAt),
            now: now,
            calendar: calendar,
            locale: locale,
            today: String(localized: "date.today", defaultValue: "Aujourd'hui", bundle: .main),
            yesterday: String(localized: "date.yesterday", defaultValue: "Hier", bundle: .main),
            dayBeforeYesterday: String(localized: "date.dayBeforeYesterday", defaultValue: "Avant-hier", bundle: .main),
            atWord: String(localized: "conversations.focus.at", defaultValue: "à", bundle: .main)
        )
    }

    /// Le pont ✦ ne remplace l'aperçu que s'il y a quelque chose à rattraper —
    /// MÊME règle que `LentilleConversationRow.showsBridge`, désormais le seul
    /// consommateur de la précédence à l'écran.
    static func showsBridge(unreadCount: Int, bridge: ConversationBridge?) -> Bool {
        unreadCount > 0 && bridge != nil
    }
}
