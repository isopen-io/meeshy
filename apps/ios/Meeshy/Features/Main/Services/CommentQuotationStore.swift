import Foundation
import Combine
import MeeshySDK

/// **CE QUE L'UTILISATEUR VIENT DE DÉSIGNER, en attendant qu'il l'écrive**
/// (#6578).
///
/// Ouvrir le plein écran d'un post et toucher « Commenter cette photo » n'écrit
/// rien : ça DÉCLARE un sujet, que le composer du fil reprendra quelques
/// secondes plus tard, une fois la galerie refermée. Entre les deux, la
/// désignation doit vivre quelque part — et cet endroit ne peut pas être un
/// `@State` de l'hôte : la galerie et le composer ne sont pas montés sur la même
/// vue, et la galerie est présentée par une couche qui se démonte avec elle.
///
/// > Un `@State` a de surcroît un setter `nonmutating` qui n'écrit NULLE PART
/// > tant que SwiftUI n'a pas installé la vue — une désignation faite pendant la
/// > fermeture de la modale se serait perdue sans le moindre signal, et aucun
/// > témoin n'aurait pu distinguer « appliqué » de « calculé puis jeté ».
///
/// Même forme, et même raison, que `CommentDraftStore` — le brouillon TEXTE
/// d'un commentaire, qui vit déjà ici et que le composer relit par `postId`.
/// La citation est l'autre moitié du même brouillon.
///
/// Clé par `postId` : deux posts ouverts (le détail, une carte de fil) ne
/// partagent pas de sujet, et la citation de l'un ne doit jamais apparaître
/// dans le composer de l'autre.
@MainActor
final class CommentQuotationStore: ObservableObject {

    // iOS 26.1 : la `deinit` synthétisée d'un type `@MainActor` est ISOLÉE
    // (SE-0466) et double-libère au démontage hors d'une tâche — abrt. Même
    // déclaration que `CommentMediaGalleryContext` et que `CommentDraftStore`.
    // Garde : `MainActorDeinitSourceGuardTests`.
    nonisolated deinit {}

    static let shared = CommentQuotationStore()

    /// La désignation courante, par post. `@Published` sur la CARTE et non sur
    /// une valeur unique : l'objet est un singleton, et une vue montée sur un
    /// autre post ne doit pas se redessiner parce qu'un voisin a désigné.
    @Published private(set) var quotations: [String: CommentQuotedMedia] = [:]

    private init() {}

    func quotation(for postId: String) -> CommentQuotedMedia? {
        quotations[postId]
    }

    /// Désigne le média dont le prochain commentaire de ce post parlera.
    ///
    /// REMPLACE la désignation précédente plutôt que de l'empiler : un
    /// commentaire cite UN média — le serveur ne grave qu'une ancre — et
    /// accumuler donnerait un bandeau qui promet ce que l'envoi ne tient pas.
    func designate(_ citation: CommentQuotedMedia, for postId: String) {
        quotations[postId] = citation
    }

    /// Retire la désignation — au retrait par l'utilisateur, ET après l'envoi.
    ///
    /// **L'envoi DOIT effacer**, sinon le commentaire suivant cite le média du
    /// précédent sans que personne ne l'ait demandé : la citation se lirait
    /// comme un réglage collant alors qu'elle décrit UNE phrase.
    func clear(for postId: String) {
        quotations.removeValue(forKey: postId)
    }
}
