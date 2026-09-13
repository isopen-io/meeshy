import CoreGraphics
import Foundation

/// **Ce qui s'annonce quand quelqu'un se met à écrire** (issue #6188, directive
/// porteur 2026-09-12 : « supprime le composant qui grandit en venant de la
/// dynamic island lorsqu'on a une personne qui écrit et garder l'information
/// uniquement dans SyncPill avec un effet Zoom-In Zoom-Out qui agrandit la pill
/// puis reduit au début de la frappe »).
///
/// ## Le va-et-vient, écrit ici pour qu'il cesse
///
/// L'accentuation de la pastille a été posée puis reprise TROIS fois en dix
/// jours — pulse fixe (#4018), liée à la durée du signal (#4026), fenêtre
/// réarmable (#4050) — puis SUPPRIMÉE le 2026-08-28 (#4066, `960f7d1df0`) au
/// profit d'`IslandEmergingBanner`, une capsule naissant dans la Dynamic
/// Island, au motif que « une capsule de STATUT n'est pas le porteur d'une
/// annonce ». La directive du 2026-09-12 revient sur ce choix : l'île se tait,
/// la pastille porte de nouveau l'annonce, et elle le fait en enflant.
///
/// C'est la CINQUIÈME révision du même geste. Elle est notée parce qu'un
/// fichier muet sur ce point en invite une sixième — et parce que le prochain
/// lecteur doit savoir que l'argument « une capsule de statut n'annonce pas »
/// a déjà été tenu, et tranché dans l'autre sens par le porteur.
///
/// ## Ce que la loi décide, et ce qu'elle laisse à la peau
///
/// Type pur, `nonisolated`, sans horloge murale ni SwiftUI : la peau injecte
/// l'instant et joue l'animation — même patron que `ScrollTimePillLaw` et
/// `FocalMagnificationLaw`. La loi dit QUOI annoncer et de COMBIEN enfler ;
/// `SyncPill` dit quand la frame est peinte.
nonisolated enum TypingAnnouncementLaw {

    /// **De combien la pastille enfle au début d'une frappe.**
    ///
    /// `1.18` et non `1.5` (la valeur de #4018, qui avait motivé deux des trois
    /// reprises) : la pastille vit sous la Dynamic Island, dans un couloir
    /// étroit, et une capsule qui grandit de moitié y touche les bords sur les
    /// petits écrans. L'emphase doit se REMARQUER, pas déplacer la mise en
    /// page — c'est un accent, pas un changement de taille.
    static let emphasisScale: CGFloat = 1.18

    /// Montée, palier, retour. Trois durées plutôt qu'un aller-retour
    /// symétrique : sans palier, l'œil qui regarde ailleurs au mauvais moment
    /// ne voit rien du tout, et l'accent n'aurait servi à personne.
    static let emphasisRiseDuration: TimeInterval = 0.22
    static let emphasisHoldDuration: TimeInterval = 0.45
    static let emphasisFallDuration: TimeInterval = 0.28

    /// Le temps total pendant lequel la pastille est hors de sa taille de
    /// repos. Dérivé, jamais saisi deux fois : la peau programme son retour sur
    /// cette valeur, et un écart entre les deux laisserait la pastille enflée.
    static var emphasisTotalDuration: TimeInterval {
        emphasisRiseDuration + emphasisHoldDuration + emphasisFallDuration
    }

    /// L'échelle à appliquer selon que l'emphase est en cours ou non.
    ///
    /// Une fonction plutôt qu'un ternaire au site d'appel : c'est la seule
    /// forme où « au repos, la pastille est à sa taille » est un fait
    /// TESTABLE. La régression de 2026-08 n'était pas une mauvaise amplitude,
    /// c'était une pastille qui ne redescendait pas.
    static func scale(emphasizing: Bool) -> CGFloat {
        emphasizing ? emphasisScale : 1
    }

    /// L'entrée à annoncer parmi celles qui viennent d'arriver.
    ///
    /// - Seules les entrées de FRAPPE s'annoncent : un envoi en file ou une
    ///   reconnexion sont des faits de synchronisation, et la pastille les dit
    ///   déjà. Les distinguer par leur préfixe d'identifiant plutôt que par un
    ///   drapeau de plus garde la règle lisible à côté de `typingEntries`, qui
    ///   pose ce préfixe.
    /// - La PLUS RÉCENTE, jamais une file : deux emphases qui se succéderaient
    ///   en moins d'une seconde se liraient comme un clignotement. L'ordre est
    ///   celui de `typingEntries` (trié par conversation), donc stable d'un
    ///   rendu à l'autre.
    /// - Sur des entrées NEUVES uniquement (l'appelant filtre) : une frappe qui
    ///   continue ne rejoue pas l'accent.
    static func announcement(among newEntries: [SyncPillEntry]) -> SyncPillEntry? {
        newEntries.last { $0.id.hasPrefix(typingIDPrefix) }
    }

    /// Le préfixe que `ConnectionBanner.typingEntries` pose sur l'identifiant
    /// d'une ligne de frappe : `typing.<conversationId>`.
    static let typingIDPrefix = "typing."

    /// **La conversation où quelqu'un écrit**, lue depuis l'identifiant de
    /// l'entrée (#6188).
    ///
    /// Toucher l'annonce doit ouvrir cette conversation. L'entrée porte déjà sa
    /// destination dans `source` (`.conversation(id:messageId:)`), et c'est
    /// elle que le tap emprunte ; cette fonction existe pour les appelants qui
    /// n'ont que l'identifiant sous la main, et pour que « ce préfixe encode un
    /// identifiant de conversation » soit un fait vérifié plutôt qu'une
    /// convention orale entre deux fichiers.
    static func conversationId(fromEntryId entryId: String) -> String? {
        guard entryId.hasPrefix(typingIDPrefix) else { return nil }
        let id = String(entryId.dropFirst(typingIDPrefix.count))
        return id.isEmpty ? nil : id
    }
}
