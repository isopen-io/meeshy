import Foundation
import GRDB

/// **La progression d'un téléversement multi-média SURVIT à la tentative qui
/// l'a obtenue** (#5830).
///
/// Le défaut mesuré sur l'appareil du porteur le 2026-09-08 : un réel à trois
/// médias (13 Mo + 2,1 Mo + 40,7 Mo) enfilé hors ligne, `attempts = 5`,
/// `status = exhausted`, `lastError = "No media uploaded for offline post media
/// dispatch"` — **et les trois fichiers encore intacts sur le disque**. Le
/// serveur n'y était pour rien : le même `POST /uploads` + `PATCH` passe.
///
/// Ce qui manquait n'était pas un octet mais une MÉMOIRE. `dispatchCreatePost`
/// tenait ses ids dans une variable LOCALE et reparcourait `localMediaPaths`
/// depuis l'index 0 à chaque rejeu : un fichier fini à la tentative *n* était
/// jeté dès que la tentative échouait sur le suivant. L'unique trace qui
/// survivait était l'offset TUS d'un fichier — un octet compté, jamais un
/// fichier acquis. Cinq tentatives ne valaient donc pas mieux qu'une seule, et
/// le dernier checkpoint de l'appareil le disait à voix haute : `2.mov` figé à
/// 20 971 520 octets sur 42 636 952 depuis la PREMIÈRE tentative, jamais
/// réatteint par les quatre suivantes.
///
/// Le lieu de la mémoire est la LIGNE elle-même, pas le dispatcher : c'est elle
/// qui traverse les redémarrages, les suspensions et les changements de réseau.
extension OfflineQueue {

    /// Grave dans la charge persistée d'une ligne `.createPost` qu'UN média est
    /// désormais acquis côté serveur.
    ///
    /// Idempotent par `sourceIndex` : un même index réécrit remplace son entrée
    /// plutôt que d'en ajouter une seconde — la carte reste une FONCTION de
    /// l'index, ce dont dépendent la légende, l'alt et les objets du canvas,
    /// tous clés par la POSITION du fichier (#4756).
    ///
    /// L'échec d'écriture est journalisé et avalé, jamais propagé : perdre la
    /// mémoire d'un téléversement coûte une re-montée au prochain rejeu, tandis
    /// que faire échouer la tentative en cours ferait perdre les médias que
    /// celle-ci vient d'obtenir — l'inverse exact de ce que ce champ défend.
    public func recordUploadedPostMedia(outboxId: String, _ media: UploadedPostMedia) async {
        guard let pool = outboxPool else { return }
        do {
            // Lecture, fusion et écriture en TROIS temps plutôt qu'en une
            // transaction : `JSONDecoder`/`JSONEncoder` ne sont pas `Sendable`
            // et ne peuvent pas franchir la frontière du bloc `write`. La
            // fenêtre entre les deux `await` est sans danger ici — ce champ n'a
            // qu'UN écrivain (ce site) et le flusher sérialise déjà les
            // tentatives d'une même ligne. Les autres écritures de la ligne
            // (`retryItem`, backoff) touchent `status`/`attempts`, jamais la
            // charge.
            guard let record = try await pool.read({ db in
                try OutboxRecord.fetchOne(db, key: outboxId)
            }) else { return }
            let payload = try decoder.decode(CreatePostPayload.self, from: record.payload)
            var acquis = (payload.uploadedMedia ?? []).filter { $0.sourceIndex != media.sourceIndex }
            acquis.append(media)
            acquis.sort { $0.sourceIndex < $1.sourceIndex }
            let encoded = try encoder.encode(payload.withUploadedMedia(acquis))
            try await pool.write { db in
                try db.execute(sql: """
                    UPDATE outbox SET payload = ?, updatedAt = ? WHERE id = ?
                    """, arguments: [encoded, Date(), outboxId])
            }
        } catch {
            logger.error("recordUploadedPostMedia(\(outboxId, privacy: .public), index \(media.sourceIndex, privacy: .public)) failed — ce média sera re-téléversé au prochain rejeu : \(error.localizedDescription, privacy: .public)")
        }
    }
}

extension CreatePostPayload {
    /// Une copie portant une AUTRE carte des médias acquis.
    ///
    /// Écrite à la main plutôt que dérivée : la charge n'a pas d'`init`
    /// mémberwise synthétisé (elle en déclare un explicite), et un champ ajouté
    /// en amont sans passer ici serait PERDU à la première écriture de
    /// progression — un `init` complet fait rougir le compilateur, ce qu'aucun
    /// `mutating` sur un `let` n'aurait fait.
    func withUploadedMedia(_ acquis: [UploadedPostMedia]) -> CreatePostPayload {
        CreatePostPayload(
            clientMutationId: clientMutationId,
            content: content,
            attachmentIds: attachmentIds,
            visibility: visibility,
            originalLanguage: originalLanguage,
            localMediaPaths: localMediaPaths,
            type: type,
            moodEmoji: moodEmoji,
            audioUrl: audioUrl,
            audioDuration: audioDuration,
            visibilityUserIds: visibilityUserIds,
            location: location,
            mentions: mentions,
            discoverabilityPrecision: discoverabilityPrecision,
            repostOfId: repostOfId,
            mobileTranscription: mobileTranscription,
            localMediaMimeTypes: localMediaMimeTypes,
            storyEffects: storyEffects,
            mediaCaptions: mediaCaptions,
            mediaAlts: mediaAlts,
            mediaObjectIds: mediaObjectIds,
            allowSoundExtraction: allowSoundExtraction,
            uploadedMedia: acquis
        )
    }
}
