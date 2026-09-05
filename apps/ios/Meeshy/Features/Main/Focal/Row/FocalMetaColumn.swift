import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La date et l'accusé, au bas de la bulle — la seconde colonne de la rangée**
/// (#5135, directive porteur 2026-09-04).
///
/// > « il faudrait mettre la date et coche au niveau de la bulle et non sur une
/// > ligne […] un composant de deux colonnes dont la seconde colonne alignée en
/// > bas contient la date et l'information de réception si nécessaire ! ce qui
/// > permet d'éviter quelques lignes blanches inutiles ! »
///
/// ## Ce que ce type déplace, et ce qu'il rend possible
///
/// La méta vivait sur la LIGNE BASSE (`FocalRow.flagAndReactionsRow`), à droite
/// des drapeaux et des réactions — disposition posée le 2026-08-24, qui avait
/// déjà supprimé une ligne. Elle en laissait une : cette ligne basse se montait
/// **toujours**, y compris sans drapeau ni réaction, *parce que* c'est elle qui
/// portait la méta. Son propre doc-comment le disait — « elle se monte
/// TOUJOURS […] : c'est elle qui porte désormais la méta ».
///
/// La méta partie ici, cette justification tombe avec elle : la ligne basse
/// redevient conditionnelle, et c'est `mountsBottomLine` qui en décide.
///
/// ## Pourquoi le déplacement ne coûte AUCUN relayout
///
/// `FocalRevealedDetail` masque l'heure et les coches par **opacité**, jamais
/// par un `if` : leur place est donc **déjà** réservée en permanence, au repos
/// comme au défilement. Les faire passer en colonne ne change pas ce fait — la
/// contrainte « la hauteur de la rangée ne dépend jamais du focus, zéro
/// relayout » est préservée par construction, pas par précaution.
///
/// C'est aussi ce qui rendait l'ancienne disposition coûteuse : une ligne pleine
/// hauteur, plus son espacement vertical, réservés sous chaque message à une
/// information que personne ne voit tant qu'il ne défile pas.
///
/// ## `nonisolated` sur les deux règles
///
/// Même raison que `ComposerObjectChipsCopy` et `FocalRow.focusFlagCodes` : ce
/// sont des RÈGLES, éprouvables sans monter de vue. Les isoler au `MainActor`
/// les rendrait inatteignables depuis un test synchrone — et une règle qu'on ne
/// peut pas interroger redevient un `if` inline, ce que ce lot vient
/// précisément de défaire.
struct FocalMetaColumn: View, Equatable {

    // MARK: - Les règles

    /// **La ligne basse se monte-t-elle ?** Elle ne porte plus que les drapeaux
    /// et les réactions ; sans ni l'un ni l'autre, elle n'a plus rien à dire et
    /// ne réserve plus de hauteur. C'est le blanc que la directive vient
    /// chercher.
    ///
    /// Les deux gardes historiques sont portées ICI, pas laissées derrière :
    /// - **jamais de drapeau en clair sur un message voilé** (revue
    ///   adversariale 2026-08-18) — révéler la langue d'origine d'un message
    ///   protégé fuiterait une information ;
    /// - **un seul jeu de drapeaux par groupe, sur son DERNIER message**
    ///   (#3919, directive porteur 2026-08-26).
    ///
    /// Les réactions, elles, restent **hors voile** (parité bulle historique) :
    /// un message protégé sur lequel on a réagi garde sa ligne.
    nonisolated static func mountsBottomLine(hasTranslation: Bool,
                                             isBlurred: Bool,
                                             isLastInGroup: Bool,
                                             hasReactions: Bool) -> Bool {
        let showsFlags = hasTranslation && !isBlurred && isLastInGroup
        return showsFlags || hasReactions
    }

    /// **« l'information de réception SI NÉCESSAIRE. »** Un accusé ne concerne
    /// que ce qu'on a envoyé soi-même ; un message reçu porte sa date et rien
    /// d'autre. Sans statut connu, on ne peint pas non plus — une coche grise
    /// « par défaut » affirmerait un état qu'on ignore.
    nonisolated static func showsDeliveryChecks(isMe: Bool, hasStatus: Bool) -> Bool {
        isMe && hasStatus
    }

    // MARK: - La colonne

    let isMe: Bool
    let timeString: String
    let deliveryStatus: Message.DeliveryStatus?
    let isDark: Bool
    var editedAt: Date? = nil
    var isEditSaving: Bool = false
    var hasEditHistory: Bool = false
    /// Toucher les COCHES ouvre les détails de lecture. Relayé tel quel à
    /// `FocalMetaRow`, qui porte l'affordance depuis la directive 2026-08-23.
    var onShowReadStatus: (() -> Void)? = nil

    /// `==` MANUEL, pour la même raison que `FocalMetaRow` : `onShowReadStatus`
    /// est une closure, donc la synthèse automatique ne s'applique plus. Elle
    /// reste HORS comparaison — c'est une action, pas un état ; la comparer
    /// rendrait la colonne inégale à chaque reconstruction du parent et
    /// annulerait le `.equatable()` qui protège la liste des re-rendus.
    static func == (lhs: FocalMetaColumn, rhs: FocalMetaColumn) -> Bool {
        lhs.isMe == rhs.isMe
            && lhs.timeString == rhs.timeString
            && lhs.deliveryStatus == rhs.deliveryStatus
            && lhs.isDark == rhs.isDark
            && lhs.editedAt == rhs.editedAt
            && lhs.isEditSaving == rhs.isEditSaving
            && lhs.hasEditHistory == rhs.hasEditHistory
    }

    var body: some View {
        FocalMetaRow(
            isMe: isMe,
            timeString: timeString,
            deliveryStatus: deliveryStatus,
            isDark: isDark,
            editedAt: editedAt,
            isEditSaving: isEditSaving,
            hasEditHistory: hasEditHistory,
            onShowReadStatus: onShowReadStatus,
            // La colonne ne remplit RIEN : c'est elle la largeur, et le retrait
            // de 29 pt appartient à la bulle, qui est l'autre colonne.
            fillsWidth: false
        )
        .frame(minWidth: FocalMetrics.MetaColumn.reservedWidth, alignment: .trailing)
    }
}
