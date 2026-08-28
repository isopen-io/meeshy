import CoreGraphics
import Foundation

/// **Ce qui s'annonce quand quelqu'un se met à écrire** (issue #4066, directive
/// porteur 2026-08-28 : « il existe un composant qui rend les informations en
/// gros et c'est ce composant qu'il faut utiliser lorsqu'un utilisateur
/// commence la frappe ! Laisser le SyncPill dans sa forme normale »).
///
/// La pastille ne grossit plus. Ce qui doit se voir paraît par
/// `IslandEmergingBanner` — une capsule qui naît dans la Dynamic Island et se
/// pose dessous. Trois révisions de l'accentuation en dix jours (#4018 → #4026
/// → #4050) s'arrêtent ici, et pas sur un quatrième réglage :
///
/// > Une capsule de STATUT n'est pas le porteur d'une annonce. La grossir la
/// > laisse être ce qu'elle est ; une annonce doit paraître comme une annonce.
///
/// Type pur, `nonisolated`, sans horloge murale ni SwiftUI : la peau injecte
/// l'instant et la mesure — même patron que `ScrollTimePillLaw` et
/// `FocalMagnificationLaw`.
nonisolated enum TypingAnnouncementLaw {

    /// Combien de temps la capsule reste posée avant de se refondre dans l'île.
    ///
    /// Volontairement plus COURT que `SyncPill.idleHideDelay` (6 s) : l'annonce
    /// dit « quelqu'un vient de commencer », pas « quelqu'un écrit encore ».
    /// C'est la pastille, sous sa forme normale, qui porte la durée — et cette
    /// division du travail est précisément ce que l'accentuation confondait.
    static let visibleDuration: TimeInterval = 4.0

    /// Le padding de la capsule, repris de l'ancien appelant du composant
    /// (`CallView.remoteQualityDegradedBanner`) pour que les deux capsules
    /// aient la même assise.
    static let horizontalPadding: CGFloat = 16
    static let verticalPadding: CGFloat = 8

    /// L'entrée à annoncer parmi celles qui viennent d'arriver.
    ///
    /// - Seules les entrées de FRAPPE s'annoncent : un envoi en file ou une
    ///   reconnexion sont des faits de synchronisation, et la pastille les dit
    ///   déjà. Les distinguer par leur préfixe d'identifiant plutôt que par un
    ///   drapeau de plus garde la règle lisible à côté de `typingEntries`, qui
    ///   pose ce préfixe.
    /// - La PLUS RÉCENTE, jamais une file : deux capsules qui se succéderaient
    ///   dans l'île en moins de quatre secondes se liraient comme un
    ///   clignotement. L'ordre est celui de `typingEntries` (trié par
    ///   conversation), donc stable d'un rendu à l'autre.
    static func announcement(among newEntries: [SyncPillEntry]) -> SyncPillEntry? {
        newEntries.last { $0.id.hasPrefix(typingIDPrefix) }
    }

    /// Le préfixe que `ConnectionBanner.typingEntries` pose sur ses
    /// identifiants. Nommé ici pour que les deux sites ne le réécrivent pas
    /// chacun de leur côté.
    static let typingIDPrefix = "typing."

    /// La taille POSÉE de la capsule, dérivée de la largeur mesurée du libellé.
    ///
    /// Le composant en dérive l'échelle et l'offset de NAISSANCE : une taille
    /// fausse fait naître la capsule hors de l'île, ce que son propre
    /// doc-comment nomme comme le mode d'échec à éviter. Elle se calcule donc à
    /// partir d'une mesure réelle du texte, jamais d'une estimation.
    ///
    /// La largeur est bornée : un pseudonyme très long ne doit pas faire naître
    /// une capsule plus large que l'écran.
    static func settledSize(
        labelWidth: CGFloat,
        lineHeight: CGFloat,
        maxWidth: CGFloat
    ) -> CGSize {
        let width = min(maxWidth, max(0, labelWidth) + 2 * horizontalPadding)
        let height = max(0, lineHeight) + 2 * verticalPadding
        return CGSize(width: width, height: height)
    }
}
