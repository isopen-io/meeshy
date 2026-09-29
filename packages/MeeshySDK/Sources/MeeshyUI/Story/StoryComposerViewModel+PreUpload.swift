import SwiftUI
import MeeshySDK

// MARK: - StoryComposerViewModel + PreUpload
//
// L'adoption d'une pré-montée (#5086), extraite de `+Elements` (hors budget de
// taille) avant d'y ajouter le relais du bitmap (retour porteur 2026-09-28).

extension StoryComposerViewModel {

    /// **Adopte une PRÉ-MONTÉE** — l'asset est déjà chez le serveur, l'objet
    /// cesse d'être local (#5086, vue `4c`).
    ///
    /// La recherche se fait par URL LOCALE et non par identifiant d'objet, et
    /// balaie TOUTES les slides. Deux raisons, chacune décisive :
    ///
    /// - la montée est lancée à la POSE, et l'auteur peut déplacer l'objet
    ///   d'une slide à l'autre pendant qu'elle voyage ; un index de slide
    ///   capturé au départ désignerait la mauvaise à l'arrivée ;
    /// - le registre de pré-montée est indexé par FICHIER, parce que c'est le
    ///   fichier qui monte. Lui faire tenir des identifiants d'objet
    ///   l'obligerait à suivre les créations et suppressions du document.
    ///
    /// Les deux champs se posent ENSEMBLE, et c'est ce qui rend l'adoption
    /// sûre : la boucle de publication saute tout objet dont `postMediaId` est
    /// non vide, donc un objet qui porterait l'identifiant sans l'URL distante
    /// serait publié avec un `file://` que personne ne peut lire.
    ///
    /// - Returns: `true` si un objet a été adopté. `false` — l'auteur a retiré
    ///   le média pendant la montée — n'est pas une erreur : l'appelant y lit
    ///   qu'il peut oublier cette pré-montée.
    /// `public` parce que le REGISTRE de pré-montée vit côté app : le SDK
    /// fournit l'atome — muter le document —, l'app décide QUAND l'appeler.
    @discardableResult
    /// **L'adoption couvre les DEUX familles qui portent un fichier** — les
    /// médias visuels ET l'audio (2026-09-06).
    ///
    /// Elle ne connaissait que `mediaObjects`. Un son — de fond ou posé —
    /// partait donc avec `mediaURL: null` et `postMediaId: null` : sa durée et
    /// sa forme d'onde voyageaient, le FICHIER non. Mesuré sur un post
    /// publié : « Son de fond, 33 secondes » à la composition, et rien à jouer
    /// à la lecture, ni en détail, ni en réel.
    ///
    /// > **Une coquille voyage mieux qu'un fichier.** Tout ce qui DÉCRIT le son
    /// > tenait dans le blob et partait ; seul le contenu manquait — et rien
    /// > n'a rougi, parce qu'un objet audio sans URL reste un objet audio
    /// > parfaitement formé.
    ///
    /// `StoryAudioPlayerObject` porte exactement la même paire
    /// `postMediaId` / `mediaURL` que `StoryMediaObject` : la règle est la
    /// même, seule la famille change, et c'est pourquoi elle s'écrit une fois
    /// pour les deux plutôt qu'en cascade.
    public func adoptPreUploadedMedia(localURL: String, postMediaId: String, remoteURL: String) -> Bool {
        for slideIdx in slides.indices {
            var effects = slides[slideIdx].effects
            if var medias = effects.mediaObjects,
               let mediaIdx = medias.firstIndex(where: { $0.mediaURL == localURL }) {
                if let local = URL(string: localURL), local.isFileURL {
                    adoptedLocalMedia[remoteURL] = local
                    adoptedLocalMedia[postMediaId] = local
                }
                relayLoadedImage(objectId: medias[mediaIdx].id, slideId: slides[slideIdx].id,
                                 isImage: medias[mediaIdx].kind == .image,
                                 localURL: localURL, to: [postMediaId, remoteURL])
                medias[mediaIdx].postMediaId = postMediaId
                medias[mediaIdx].mediaURL = remoteURL
                effects.mediaObjects = medias
                slides[slideIdx].effects = effects
                return true
            }
            if var audios = effects.audioPlayerObjects,
               let audioIdx = audios.firstIndex(where: { $0.mediaURL == localURL }) {
                audios[audioIdx].postMediaId = postMediaId
                audios[audioIdx].mediaURL = remoteURL
                effects.audioPlayerObjects = audios
                slides[slideIdx].effects = effects
                return true
            }
        }
        return false
    }

    /// **Une adoption IMPERCEPTIBLE** (retour porteur 2026-09-28 : « un
    /// scintillement se produit […] comme un rechargement de l'image une seconde
    /// fois »). Adopté, l'objet est cherché sous son `postMediaId` : le bitmap
    /// déjà en mémoire — sous l'id de l'objet, ou sous le nom du fichier local
    /// que le FOND dérive — y est rangé aussi, et la version avance pour que le
    /// lecteur d'images du canvas se reconstruise dans la même passe.
    ///
    /// Un média de FOND n'a pas toujours son bitmap dans `loadedImages` : la
    /// slide le tient (`slideImages`), ou seul son fichier local l'a — d'où la
    /// cascade, qui finit sur le fichier (décodé paresseusement par UIKit).
    private func relayLoadedImage(objectId: String, slideId: String, isImage: Bool,
                                  localURL: String, to keys: [String]) {
        guard isImage, let local = URL(string: localURL) else { return }
        let cleFichier = local.deletingPathExtension().lastPathComponent
        let image = loadedImages[objectId]
            ?? loadedImages[cleFichier]
            ?? slideImages[slideId]
            ?? (local.isFileURL ? UIImage(contentsOfFile: local.path) : nil)
        guard let image else { return }
        // Deux clés, deux lecteurs : un média POSÉ se cherche sous son
        // `postMediaId` (`StoryMediaLayer`), le FOND sous son ADRESSE — la clé
        // de routage préfère l'URL à l'identifiant (`backgroundRoutingKey`).
        keys.forEach { registerLoadedImage(image, for: $0) }
    }
}
