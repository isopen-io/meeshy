import SwiftUI
import MeeshySDK

// MARK: - StoryComposerViewModel + PreUpload
//
// L'adoption d'une pré-montée (#5086), extraite de `+Elements` (hors budget de
// taille) avant d'y ajouter le relais du bitmap (retour porteur 2026-09-28).

extension StoryComposerViewModel {

    /// **Adopte une PRÉ-MONTÉE** — l'asset est déjà chez le serveur, l'objet
    /// cesse d'être local (#5086, vue `4c`). La recherche se fait par URL
    /// LOCALE sur TOUTES les slides : l'objet a pu changer de slide pendant la
    /// montée, et le registre est indexé par FICHIER. Les deux champs se posent
    /// ENSEMBLE — la publication saute tout objet dont `postMediaId` est posé,
    /// un `file://` partirait sinon. Elle couvre les médias visuels ET l'audio
    /// (2026-09-06) : un son sans URL publiait sa coquille, pas son fichier.
    ///
    /// **Une montée n'est pas un geste de l'auteur** (#14202) : elle vaut pour
    /// toute la trajectoire d'annulation et n'y ajoute aucune étape. Sans
    /// cela, le premier ↶ après « Remplacer le fond » ne défaisait que la
    /// montée du nouveau fond. La trajectoire est réécrite AVANT le document :
    /// ↶ ↷ se recalculent sur un document identique à l'état capturé.
    ///
    /// - Returns: `false` si l'auteur a retiré le média pendant la montée :
    ///   l'appelant (le registre, côté app) peut l'oublier.
    @discardableResult
    public func adoptPreUploadedMedia(localURL: String, postMediaId: String, remoteURL: String) -> Bool {
        let adoption = StoryPreUploadAdoption(localURL: localURL, postMediaId: postMediaId, remoteURL: remoteURL)
        guard let adopted = adoption.applied(to: slides) else { return false }
        if let (slideId, media) = adoption.adoptedMedia(in: adopted) {
            if let local = URL(string: localURL), local.isFileURL {
                adoptedLocalMedia[remoteURL] = local
                adoptedLocalMedia[postMediaId] = local
            }
            relayLoadedImage(objectId: media.id, slideId: slideId, isImage: media.kind == .image,
                             localURL: localURL, to: [postMediaId, remoteURL])
        }
        history.amendAll(adoption.appliedToSnapshot)
        slides = adopted
        return true
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
    /// cascade, qui finit sur le fichier — décodé à la taille publiée, jamais
    /// pleine taille (#6922).
    private func relayLoadedImage(objectId: String, slideId: String, isImage: Bool,
                                  localURL: String, to keys: [String]) {
        guard isImage, let local = URL(string: localURL) else { return }
        let cleFichier = local.deletingPathExtension().lastPathComponent
        let image = loadedImages[objectId]
            ?? loadedImages[cleFichier]
            ?? slideImages[slideId]
            ?? (local.isFileURL
                ? SceneImageDownsampling.image(fileAt: local,
                                               maxPixelSize: SceneImageDownsampling.workingMaxPixelSize)
                : nil)
        guard let image else { return }
        // Deux clés, deux lecteurs : un média POSÉ se cherche sous son
        // `postMediaId` (`StoryMediaLayer`), le FOND sous son ADRESSE — la clé
        // de routage préfère l'URL à l'identifiant (`backgroundRoutingKey`).
        keys.forEach { registerLoadedImage(image, for: $0) }
    }
}

/// La réécriture d'une montée aboutie, pure : la même pour le document vivant
/// et pour chaque instantané d'annulation.
nonisolated struct StoryPreUploadAdoption: Sendable {
    let localURL: String
    let postMediaId: String
    let remoteURL: String

    /// Le premier objet — média, puis son, slide par slide — qui porte encore
    /// le fichier local ; `nil` s'il n'y en a plus.
    func applied(to slides: [StorySlide]) -> [StorySlide]? {
        for slideIdx in slides.indices {
            var adopted = slides
            var effects = adopted[slideIdx].effects
            if var medias = effects.mediaObjects,
               let mediaIdx = medias.firstIndex(where: { $0.mediaURL == localURL }) {
                medias[mediaIdx].postMediaId = postMediaId
                medias[mediaIdx].mediaURL = remoteURL
                effects.mediaObjects = medias
                adopted[slideIdx].effects = effects
                return adopted
            }
            if var audios = effects.audioPlayerObjects,
               let audioIdx = audios.firstIndex(where: { $0.mediaURL == localURL }) {
                audios[audioIdx].postMediaId = postMediaId
                audios[audioIdx].mediaURL = remoteURL
                effects.audioPlayerObjects = audios
                adopted[slideIdx].effects = effects
                return adopted
            }
        }
        return nil
    }

    func adoptedMedia(in slides: [StorySlide]) -> (slideId: String, media: StoryMediaObject)? {
        for slide in slides {
            if let media = slide.effects.mediaObjects?.first(where: {
                $0.postMediaId == postMediaId && $0.mediaURL == remoteURL
            }) {
                return (slide.id, media)
            }
        }
        return nil
    }

    /// Un instantané qui ne nomme pas le fichier est rendu tel quel, octet pour
    /// octet : la déduplication de l'historique compare des octets.
    func appliedToSnapshot(_ data: Data) -> Data {
        let fichier = URL(string: localURL)?.lastPathComponent ?? localURL
        guard data.range(of: Data(fichier.utf8)) != nil,
              let slides = try? JSONDecoder().decode([StorySlide].self, from: data),
              let adopted = applied(to: slides),
              let encoded = StoryComposerHistoryPace.encode(adopted) else { return data }
        return encoded
    }
}
