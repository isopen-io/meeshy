import Foundation
import MeeshySDK

// Extrait de `StoryExporter.swift` (1 397 lignes, hors du budget 800-1100 de
// la directive 2026-08-28, qui interdit d'AJOUTER à un fichier hors budget).
// Le suivi de #4852 ajoute la résolution des images de stickers : on extrait
// d'abord la résolution des médias visuels — dont elle est la sœur —, on
// ajoute ensuite.
//
// Découpe par RESPONSABILITÉ : ce fichier ramène des ADRESSES à des fichiers
// LOCAUX avant la composition, et rien d'autre.

extension StoryExporter {

    // MARK: - Résolution des médias visuels

    /// Adresse LOCALE d'un média visuel — **point de résolution UNIQUE** de tous
    /// les chemins d'export, miroir exact de `resolveLaneURL` pour l'audio.
    ///
    /// Trois formes d'adresse arrivent ici, et une seule était jusqu'ici gérée :
    /// 1. `file://` — la session composer. Honoré tel quel, mais seulement s'il
    ///    existe sur CET appareil : un `file://` publié pointe vers la sandbox de
    ///    l'auteur et serait servi mort à AVFoundation.
    /// 2. `https://…` — l'URL serveur qu'une story publiée porte réellement
    ///    (`StoryViewModel` flippe le `file://` local vers `TusUploadResult.fileUrl`).
    /// 3. `/api/v1/attachments/…` — la même, en relatif, telle que l'émettent
    ///    `getAttachmentPath` / le forward / le repost.
    ///
    /// Les deux dernières sont normalisées par `StoryBackgroundLayer.directURLIfAny`
    /// (donc par `MeeshyConfig.resolveMediaURL`, garde SSRF comprise) puis
    /// rapatriées sur disque. C'est exactement la cascade du canvas live : sans
    /// elle, l'export ne savait résoudre QUE les stories encore ouvertes dans le
    /// composer, et bakait un fond noir pour toutes les autres.
    static func resolveVisualURL(_ raw: String, kind: StoryMediaKind?) async -> URL? {
        guard let url = StoryBackgroundLayer.directURLIfAny(from: raw) else { return nil }
        if url.isFileURL {
            return FileManager.default.fileExists(atPath: url.path) ? url : nil
        }
        switch kind {
        case .video: return await CacheCoordinator.videoLocalFileURLAwait(for: url)
        case .image, .none: return await CacheCoordinator.imageLocalFileURLAwait(for: url)
        }
    }

    /// Retourne une copie de `slide` dont chaque média visuel porte une adresse
    /// LOCALE, prête à être consommée par la suite du pipeline.
    ///
    /// Pourquoi réécrire le MODÈLE plutôt que câbler chaque site : quatre
    /// consommateurs distincts lisent `mediaURL` en aval — la pose de la piste
    /// vidéo de fond, `StoryAVCompositor.resolveBackgroundImage`,
    /// `StoryForegroundVideoFrameSource` et `StoryMediaLayer` — et tous
    /// fonctionnent déjà parfaitement sur un `file://` (c'est ce que prouve le
    /// chemin composer). Résoudre une fois en amont les répare tous, et rend
    /// impossible qu'un cinquième consommateur naisse cassé.
    ///
    /// **Ne nullifie jamais.** Une adresse non résolvable (hors ligne, 404,
    /// fichier disparu) est laissée telle quelle : le comportement reste au pire
    /// celui d'avant la résolution, jamais pire.
    static func hydratingLocalMedia(_ slide: StorySlide) async -> StorySlide {
        var hydrated = slide

        if var medias = hydrated.effects.mediaObjects, !medias.isEmpty {
            for index in medias.indices {
                guard let raw = medias[index].mediaURL, !raw.isEmpty else { continue }
                if let local = await resolveVisualURL(raw, kind: medias[index].kind) {
                    medias[index].mediaURL = local.absoluteString
                }
            }
            hydrated.effects.mediaObjects = medias
        }

        // Fond legacy : `StoryRenderer.renderBackground` ne le consulte que si
        // AUCUN `mediaObject` ne porte le fond — on applique ici la même
        // priorité, pour ne jamais rapatrier un asset que le rendu ignorera.
        let hasBackgroundObject = (hydrated.effects.mediaObjects ?? [])
            .contains { $0.isBackground }
        if !hasBackgroundObject,
           let legacy = hydrated.mediaURL, !legacy.isEmpty,
           let local = await resolveVisualURL(legacy, kind: .image) {
            hydrated.mediaURL = local.absoluteString
        }

        return hydrated
    }

    // MARK: - Images de stickers (#4852)

    /// **Apparie les stickers IMAGE d'une slide aux médias qui les portent** :
    /// `postMediaId → adresse brute` (celle que `FeedMedia.url` sert — serveur,
    /// relative ou `file://`), prête pour `resolvingStickerImageURLs`.
    ///
    /// Un `StorySticker` ne porte pas d'URL, seulement l'id de son `PostMedia`
    /// (`StoryStickerLayer.bitmapCacheKeys`), et ni la slide ni l'exporteur
    /// n'ont la liste des médias : c'est le propriétaire de la `StoryItem`
    /// (le modèle de partage) qui la possède, et lui seul peut faire cet
    /// appariement. Pure et `nonisolated` pour être appelable d'où qu'il soit.
    ///
    /// - Un sticker sans `postMediaId` (emoji, gabarit) n'a rien à résoudre.
    /// - Un média absent ou sans `url` est ignoré : le sticker sort sous son
    ///   repli 🖼️, jamais un export cassé.
    /// - Deux stickers sur le même média donnent UNE entrée — c'est un index,
    ///   pas une liste de poses.
    public nonisolated static func stickerImageSources(for stickers: [StorySticker]?,
                                                       media: [FeedMedia]) -> [String: String] {
        let urlByMediaId = media.reduce(into: [String: String]()) { index, item in
            guard let url = item.url, !url.isEmpty, index[item.id] == nil else { return }
            index[item.id] = url
        }
        return (stickers ?? []).reduce(into: [String: String]()) { sources, sticker in
            guard !sticker.postMediaId.isEmpty, let url = urlByMediaId[sticker.postMediaId] else { return }
            sources[sticker.postMediaId] = url
        }
    }

    /// Rapatrie chaque image de sticker sur disque par le MÊME point de
    /// résolution que les médias de premier plan (`resolveVisualURL`, kind
    /// `.image`) : `file://` honoré s'il existe, adresse serveur ou relative
    /// normalisée puis téléchargée dans le cache image. Un sticker pas encore
    /// en cache se télécharge donc AVANT l'export, comme un média de fond.
    ///
    /// **Omet, ne nullifie pas** : une adresse irrésolvable (hors ligne, 404)
    /// disparaît de l'index et le compositor peint le repli 🖼️ pour ce seul
    /// sticker — le comportement d'avant la résolution, jamais pire.
    static func resolvingStickerImageURLs(_ sources: [String: String]) async -> [String: URL] {
        var resolved: [String: URL] = [:]
        for (postMediaId, raw) in sources {
            guard let local = await resolveVisualURL(raw, kind: .image) else { continue }
            resolved[postMediaId] = local
        }
        return resolved
    }
}
