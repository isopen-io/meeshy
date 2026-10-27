/// Écriture durable (write-ahead) d'une publication dans `StoryPublishQueue` :
/// médias recopiés sur disque dans un dossier propre à la story, payload des
/// slides encodé, item mis en file. Sans état ni dépendance au view model : les
/// deux chemins (hors ligne et en ligne) de `StoryViewModel` y passent par sa
/// façade `persistPublishIntentToQueue`.
///
/// Extrait de `StoryViewModel+Publication.swift`.

import Foundation
import UIKit
import os
import MeeshySDK
import MeeshyUI

enum StoryPublishIntentWriter {
    /// E5 — cœur de persistance du publish (write-ahead) partagé par les DEUX
    /// chemins : offline (enqueue + UX optimiste ci-dessus) et online
    /// (`publishStoryInBackground` persiste AVANT de lancer l'upload, marque
    /// l'item in-flight, le retire au succès — un kill mid-upload laisse
    /// l'item en queue, repris au drain de boot). Retourne les ids de l'item
    /// persisté, `nil` si l'encodage échoue.
    static func persist(
        /// Le format choisi. Persisté DANS l'item de file : il ne vit nulle
        /// part ailleurs (le brouillon ne le porte pas), donc un rejeu qui ne
        /// l'emporterait pas republierait une story là où l'auteur avait
        /// choisi « Post ».
        targetType: PostType = .story,
        slides: [StorySlide],
        slideImages: [String: UIImage],
        loadedImages: [String: UIImage],
        loadedVideoURLs: [String: URL],
        loadedAudioURLs: [String: URL],
        /// Les octets ANIMÉS des stickers (#8522) : sans eux, le fichier mis en
        /// file est un PNG fixe et le rejeu publie un sticker figé.
        loadedStickerAnimations: [String: Data] = [:],
        originalLanguage: String? = nil,
        visibility: String,
        visibilityUserIds: [String],
        draftId: String? = nil,
        /// Republication : id de l'original, persisté DANS l'item de file pour
        /// survivre à un kill — le rejeu au boot doit republier avec la même
        /// attribution, pas créer une story orpheline.
        repostOfId: String? = nil,
        /// Références DÉCLARÉES : elles ne vivent nulle part ailleurs (un badge
        /// est exclu de la relecture serveur, une note comme un silence n'ont
        /// aucun texte), donc un rejeu qui ne les porterait pas publierait une
        /// story qui ne prévient personne.
        declaredMentions: [PostMentionInput] = [],
        /// Les mentions PAR SLIDE (#4068), persistées pour la même raison :
        /// sans elles le rejeu retomberait sur la liste plate et re-sèmerait
        /// une NOTE sur toutes les slides. Vide ⇒ repli assumé.
        mentionsBySlide: [String: [PostMentionInput]] = [:],
        /// Accessibilité : ces deux champs ne vivent NULLE PART ailleurs (le
        /// brouillon ne les porte pas), donc un rejeu qui ne les emporterait
        /// pas publierait une story muette pour les lecteurs d'écran.
        composerMediaTexts: ComposerMediaTexts = .none,
        allowSoundExtraction: Bool? = nil,
        /// « Aussi en réel » (#9476) — persisté : un rejeu sans lui publierait la story seule.
        alsoAsReel: Bool = false,
        /// Appelé quand un média ne peut VRAIMENT pas être écrit (#10495). Le
        /// chemin hors ligne y garde la composition et nomme le média ; le
        /// chemin en ligne n'en passe pas : son envoi continue depuis la
        /// mémoire, et lui annoncer un échec serait faux.
        onUnsavedMedia: ((StoryOfflineMediaWriter.Outcome) -> Void)? = nil
    ) async -> (queueId: String, tempStoryId: String)? {
        // 1. Re-key slide backgrounds.
        let bgImages = Dictionary(
            uniqueKeysWithValues: slideImages.map { (slideId, img) in
                ("slide-bg-\(slideId)", img)
            }
        )
        // Foreground images merged with backgrounds; collisions go to the
        // foreground value (extremely unlikely — slide ids and effect ids
        // are both UUIDs).
        let allImages = bgImages.merging(loadedImages) { _, fg in fg }

        // 2. Persist media on disk in a dedicated offline queue directory per story.
        // This avoids `StoryDraftStore.saveMedia` which clears the directory, allowing
        // multiple stories to be queued without data loss.
        let fm = FileManager.default
        let docDir = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let tempStoryId = "pending_\(UUID().uuidString)"
        let offlineDir = docDir.appendingPathComponent("meeshy_offline_queue").appendingPathComponent(tempStoryId)
        try? fm.createDirectory(at: offlineDir, withIntermediateDirectories: true)
        
        // Chaque écriture passait par un `try?` nu : un échec était avalé ET
        // la référence ajoutée quand même. La story partait en file, on
        // promettait « publication au retour en ligne », puis le drain la
        // faisait échouer DÉFINITIVEMENT en `.missingLocalMedia` — travail
        // perdu, longtemps après, sans signal au moment où c'était réparable.
        //
        // Les images de stickers doivent traverser la file SANS être aplaties :
        // le JPEG n'a pas de canal alpha et c'est ce fichier-là que le drain
        // téléversera. On nomme tous les ids de stickers — le writer n'agit que
        // sur ceux dont il détient réellement un bitmap, donc un sticker emoji
        // n'y change rien. `StorySticker.kind` ne peut pas servir de filtre
        // ici : il se déduit de `postMediaId`, encore vide avant publication.
        let stickerIds = Set(slides.flatMap { $0.effects.stickerObjects ?? [] }.map(\.id))
        let mediaOutcome = StoryOfflineMediaWriter.persist(
            images: allImages,
            videos: loadedVideoURLs,
            audios: loadedAudioURLs,
            into: offlineDir,
            alphaPreservingIds: stickerIds,
            animations: loadedStickerAnimations,
            fileManager: fm
        )
        guard mediaOutcome.isComplete else {
            Logger.stories.error(
                "offline.publish aborted — médias non persistés: \(mediaOutcome.failedElementIds.joined(separator: ","), privacy: .public)")
            // Le dossier partiel ne sert à rien et occuperait le disque.
            try? fm.removeItem(at: offlineDir)
            onUnsavedMedia?(mediaOutcome)
            return nil
        }
        let mediaReferences = mediaOutcome.references

        // 3. Encode the slides payload. The custom encoder excludes
        //    `mediaData`, which is exactly why `mediaReferences` carries
        //    the disk paths separately.
        let encoder = MeeshyCoders.encoder(.persistence)
        guard let payload = try? encoder.encode(slides) else {
            FeedbackToastManager.shared.showError(String(
                localized: "story.publish.queue.encodeError",
                defaultValue: "Impossible d'enregistrer la story pour publication différée"
            ))
            return nil
        }

        // 4. Enqueue. The queue persists to disk synchronously so a crash
        //    immediately after this call still preserves the item.
        let item = StoryPublishQueueItem(
            visibility: visibility,
            slidesPayload: payload,
            repostOfId: repostOfId,
            mediaReferences: mediaReferences,
            tempStoryId: tempStoryId,
            visibilityUserIds: visibilityUserIds,
            originalLanguage: originalLanguage,
            draftId: draftId,
            mentionsPayload: declaredMentions.isEmpty ? nil : declaredMentions,
            mentionsBySlidePayload: mentionsBySlide.isEmpty ? nil : mentionsBySlide,
            mediaAltPayload: composerMediaTexts.payload(.alt),
            mediaCaptionPayload: composerMediaTexts.payload(.caption),
            allowSoundExtractionPayload: allowSoundExtraction,
            targetTypePayload: targetType.rawValue,
            alsoAsReelPayload: alsoAsReel ? true : nil
        )
        _ = await StoryPublishQueue.shared.enqueue(item)
        return (queueId: item.id, tempStoryId: tempStoryId)
    }

    /// E5 — supprime le dossier médias `meeshy_offline_queue/<tempStoryId>/`
    /// d'un intent retiré de la queue (succès ou annulation du chemin online).
    /// Sans ce cleanup, chaque publish online laisserait ses copies de médias
    /// orphelines sur disque.
    nonisolated static func removeMediaDirectory(tempStoryId: String) {
        let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let dir = docDir.appendingPathComponent("meeshy_offline_queue")
            .appendingPathComponent(tempStoryId)
        try? FileManager.default.removeItem(at: dir)
    }
}
