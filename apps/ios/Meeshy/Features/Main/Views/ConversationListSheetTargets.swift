import Foundation
import MeeshySDK

/// **Les cibles de feuilles de la Lentille, sur le TAS** (#6221, suite).
///
/// ## Ce qu'elle ferme
///
/// `ConversationListView` — l'écran principal du produit — pesait **10 256
/// octets**, mesuré sur `Services CEO i16pm`. C'est plus que
/// `ConversationView` APRÈS le correctif du crash (5 064), et le même défaut,
/// à un cran de gravité près : sept `Conversation?` déclarés en `@State`,
/// **992 octets chacun stockés EN LIGNE**, soit ~6,9 Ko sur les 10,2.
///
/// Une vue SwiftUI est un type VALEUR que chaque closure de son `body`
/// capture en la COPIANT. C'est ce coût-là — payé à chaque rendu, invisible à
/// tout profil d'allocation — qui a fini par déborder la pile principale de
/// 1008 Ko à l'ouverture d'une conversation (#6221). La Lentille n'avait pas
/// encore débordé ; elle suivait la même trajectoire.
///
/// ## Pourquoi elles peuvent partager une boîte
///
/// **Une seule est jamais non-nulle à la fois.** On ne bloque pas un
/// interlocuteur pendant qu'on supprime une autre conversation, qu'on en
/// verrouille une troisième et qu'on invite dans une quatrième : chaque champ
/// arme UNE feuille, et une feuille en chasse une autre. Sept emplacements
/// permanents pour un contenu à la fois — le motif exact de
/// `ConversationOverlayState`, qui gardait six `Message?` pour la même raison.
///
/// ## Pourquoi un sac plutôt que `@Indirect` sur les `@State`
///
/// `@Indirect` ne se compose pas avec `@State` : deux enveloppes sur la même
/// propriété donneraient un `Binding<Indirect<Conversation?>>`, que
/// `.sheet(item:)` ne sait pas lire. Regroupées dans une structure portée par
/// UN `@State`, les cibles gardent leurs liaisons — `$sheetTargets.info` reste
/// un `Binding<Conversation?>`, parce que `@Indirect` expose bien un
/// `WritableKeyPath` vers sa valeur.
struct ConversationListSheetTargets {

    /// La conversation dont on s'apprête à bloquer l'interlocuteur.
    @Indirect var blockTarget: Conversation? = nil

    /// Celle dont la suppression attend confirmation.
    @Indirect var deleteTarget: Conversation? = nil

    /// Celle dont la feuille de verrou est présentée.
    @Indirect var lockSheet: Conversation? = nil

    /// Celle dont le panneau d'informations est présenté.
    @Indirect var info: Conversation? = nil

    /// Celle dont la feuille d'invitation est présentée.
    @Indirect var inviteSheet: Conversation? = nil

    /// Celle dont l'aperçu (appui long) est monté.
    @Indirect var preview: Conversation? = nil

    /// Celle dont le menu contextuel est ouvert.
    @Indirect var contextMenu: Conversation? = nil
}
