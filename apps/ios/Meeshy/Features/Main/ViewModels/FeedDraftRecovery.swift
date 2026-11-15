import Foundation
import MeeshySDK

/// Ce qu'un brouillon bloqué en file peut redevenir dans le composer du fil.
///
/// **Une ligne dont un média est de l'AUDIO n'est jamais proposée, et c'est
/// une garde de CONTENU, pas une préférence d'ergonomie.**
///
/// Le composer du feed ne sait pas rouvrir un enregistrement : sa
/// restauration ne traite que l'image et la vidéo
/// (`FeedView+Attachments.restoreRecoveredMedia`). Offrir la ligne quand
/// même produisait une chaîne complète de DESTRUCTION — brouillon
/// « restauré » VIDE (un vocal n'a pas de texte), `recoveredPostCmid` posé
/// malgré tout, puis, à la publication suivante quelle qu'elle soit,
/// `supersedeRecoveredPost` → `cancelCreatePost`, qui efface le fichier
/// relocalisé ET la ligne. L'enregistrement n'a alors JAMAIS été vu par son
/// auteur, et rien ne le lui dit.
///
/// Le trou n'existait pas avant que les deux jumeaux audio entrent dans
/// cette file : `case .audio: break` y était juste, et son commentaire
/// (« audio offline posts aren't queued through this composer path yet »)
/// était vrai. Un lot qui fait CONVERGER une chaîne doit énumérer les
/// CONSOMMATEURS de la ligne qu'il vient de créer, pas seulement les
/// producteurs.
///
/// Prix assumé : tant qu'un vocal est bloqué en file, aucun brouillon plus
/// ancien n'est proposé. Une affordance de reprise retardée n'est pas
/// comparable à un enregistrement détruit.
nonisolated enum FeedDraftRecovery {
    static func isProposable(_ draft: RecoveredOfflinePost) -> Bool {
        !draft.localMediaURLs.contains { url in
            AttachmentKind(mimeType: MimeTypeResolver.mimeType(forURL: url)) == .audio
        }
    }
}
