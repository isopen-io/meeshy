import Foundation

/// Où atterrit une pièce jointe qu'on republie depuis une conversation.
///
/// Transférer un média à quelqu'un et le PUBLIER sont deux gestes voisins et un
/// seul point de départ : la feuille de partage. Elle offre donc, à côté des
/// conversations, les destinations publiques — et le format n'est pas un choix
/// de plus à faire, il DÉCOULE du média :
///
///   - une image devient un POST : elle se regarde, elle se garde ;
///   - une vidéo ou un son deviennent un REEL — c'est le fil qui sait les
///     jouer, et un son publié en POST n'aurait aucune surface pour être
///     écouté ;
///   - une STORY accepte l'un et l'autre, mais jamais par déduction : elle
///     expire en 24 h, donc elle se DEMANDE, elle ne se devine pas.
///
/// Les documents, PDF et fichiers de code n'ont aucune destination publique :
/// le fil ne sait pas les rendre. Les proposer produirait un post vide portant
/// une pièce jointe invisible.
///
/// **Jumelle de `packages/shared/utils/forward-to-publication.ts`** — toute
/// évolution touche les deux. Comme elle, cette règle lit la NATURE du fichier
/// via `AttachmentKind`, jamais l'extension du nom, qu'un client peut écrire à
/// sa guise.
public enum PublicationTarget: String, Sendable, Equatable, CaseIterable, Codable {
    case post = "POST"
    case reel = "REEL"
    case story = "STORY"
}

public enum PublicationTargetRule {

    /// Le format qu'une pièce jointe prend quand on la publie SANS le préciser.
    /// `nil` quand le média n'a aucune surface publique (document, PDF, code).
    ///
    /// La STORY n'en sort jamais : son caractère éphémère est un choix, pas une
    /// conséquence du type de fichier.
    public static func defaultTarget(forMimeType mimeType: String?) -> PublicationTarget? {
        switch AttachmentKind(mimeType: mimeType ?? "") {
        case .image:
            return .post
        case .video, .audio:
            return .reel
        default:
            return nil
        }
    }

    /// Les destinations publiques offertes pour une pièce jointe, dans l'ordre
    /// où la feuille les présente. Vide quand le média n'en a aucune —
    /// l'appelant n'affiche alors pas la section, plutôt qu'une section vide.
    public static func targets(forMimeType mimeType: String?) -> [PublicationTarget] {
        guard let fallback = defaultTarget(forMimeType: mimeType) else { return [] }
        return [fallback, .story]
    }

    /// Publier un média que l'appareil vient de CAPTURER se confirme.
    ///
    /// Transférer une photo à un ami et la publier à tout un fil sont deux
    /// gestes que la même feuille rend voisins, et la seconde est irréversible
    /// du point de vue de qui l'a prise : une photo sortie de la caméra n'a
    /// encore été vue par personne. Une image choisie dans la galerie a déjà
    /// été gardée, regardée, éventuellement partagée ; une note vocale qu'on
    /// vient d'enregistrer, non.
    ///
    /// La provenance ne peut PAS être décidée par le serveur : rien dans le
    /// fichier ne distingue une photo prise à l'instant d'une photo importée.
    /// Seul le client qui a ouvert la caméra ou le micro le sait, et seulement
    /// à cet instant — il la DÉCLARE donc à l'envoi, et le serveur la lui
    /// rend ensuite sur la pièce jointe (`capturedInApp`).
    ///
    /// La destination n'entre pas dans la décision : une STORY expire, mais
    /// elle est vue avant d'expirer. C'est le fait d'OUVRIR le média au-delà de
    /// la conversation qui se confirme, pas la durée pendant laquelle il reste
    /// ouvert.
    public static func needsCaptureConfirmation(
        capturedInApp: Bool,
        target: PublicationTarget
    ) -> Bool {
        capturedInApp
    }
}
