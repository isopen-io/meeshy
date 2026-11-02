import Foundation

/// Le plafond du TEXTE d'une publication (post, réel, story), le seul que le
/// serveur accepte (#13824).
///
/// `CreatePostSchema.content` est `z.string().max(5000)`, et Zod compte en
/// unités UTF-16 — un emoji en vaut deux, un « é » composé une. Compter en
/// `Character` laisserait partir un texte que le serveur refuse : c'est ce qui
/// a bloqué deux posts dans la file d'envoi, refusés en 400 à chaque
/// « Réessayer », sans que rien à l'écran ne l'annonce.
///
/// Doctrine du mood : la saisie se TRONQUE, elle ne se refuse pas. La surface
/// tronque pour que l'auteur le voie ; la fabrique du brouillon tronque pour
/// qu'aucun chemin d'envoi ne passe au-delà. Deux sites, une règle.
nonisolated enum ComposerPostTextPolicy {

    static let contentLimit = 5000

    /// Le compteur n'apparaît qu'à l'approche du plafond : un post de trois
    /// lignes n'a rien à compter.
    static let counterThreshold = 4000

    /// Le cran où le compteur passe en alerte.
    static let warningThreshold = 4500

    static func length(of text: String) -> Int {
        text.utf16.count
    }

    static func isOverLimit(_ text: String) -> Bool {
        length(of: text) > contentLimit
    }

    /// Coupe à la dernière grappe de graphèmes qui tient dans le plafond :
    /// jamais un emoji coupé en deux.
    static func truncate(_ text: String) -> String {
        guard isOverLimit(text) else { return text }
        var used = 0
        var end = text.startIndex
        for index in text.indices {
            let size = text[index].utf16.count
            guard used + size <= contentLimit else { break }
            used += size
            end = text.index(after: index)
        }
        return String(text[..<end])
    }
}
