import Foundation
import Combine
import MeeshySDK
import os

/// **La famille « publications » du dispatcher** — `POST /posts`, extraite de
/// `OutboxDispatcher.swift` (#5830) : ce fichier-là passait 1075 lignes, et le
/// budget (1000–1200, plafond dur 1200) demande qu'on découpe par
/// RESPONSABILITÉ avant d'ajouter. La création de publication est la seule
/// famille du dispatcher qui téléverse des octets avant d'écrire ; elle a sa
/// propre mécanique de reprise, et donc son propre fichier.
///
/// `internal` et non `private` : une extension de ce type dans un AUTRE fichier
/// n'atteint pas un `private`, borné au fichier — même frontière que celle
/// franchie par `OutboxDispatcher+Messages.swift`.
extension OutboxDispatcher {

    /// `POST /posts` — gateway wraps through `withMutationLog`. Body
    /// shape matches `CreatePostSchema` ; `attachmentIds` becomes
    /// `mediaIds` at the wire boundary to match the gateway field name.
    func dispatchCreatePost(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreatePostPayload.self)

        // An offline media post carries local file paths; upload them via TUS
        // on reconnect, then create the post with the resulting ids. TUS
        // checkpoint resume fires on re-upload (same sha256 key), so a kill
        // mid-upload resumes from the saved offset.
        var resolvedMediaIds = payload.attachmentIds
        var montes = PublicationMediaUploads()
        if let pendingMediaPaths = payload.localMediaPaths, !pendingMediaPaths.isEmpty {
            let serverOrigin = MeeshyConfig.shared.serverOrigin
            guard let baseURL = URL(string: serverOrigin),
                  let token = APIClient.shared.authToken else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 401,
                    userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload post media"]
                )
            }
            #if DEBUG
            // La vitrine (#9820) : le VRAI téléverseur, servi par le serveur TUS de la vitrine — aucune requête ne part.
            let sessionDeLaVitrine = await VitrineReel.sessionDeTeleversement
            let uploader = TusUploadManager(baseURL: baseURL, urlSession: sessionDeLaVitrine ?? .shared)
            #else
            let uploader = TusUploadManager(baseURL: baseURL)
            #endif
            let outboxId = record.id
            montes = try await PublicationMediaUploader.uploadAll(
                storedPaths: pendingMediaPaths,
                alreadyUploaded: payload.uploadedMedia ?? [],
                declaredMimeType: { payload.declaredMimeType(at: $0) },
                hooks: PublicationMediaUploader.Hooks(
                    throwIfCancelled: { try await OfflineQueue.shared.throwIfPublicationCancelled(outboxId: outboxId) },
                    recordUploaded: { await OfflineQueue.shared.recordUploadedPostMedia(outboxId: outboxId, $0) }
                )
            ) { fileURL, mimeType in
                // POUR QUI ce fichier est téléversé (`uploadContext: "post"`) :
                // sans lui, le gateway crée un `MessageAttachment` et le post
                // arrive publié et VIDE (`OutboxUploadContextGuardTests`).
                try await uploader.uploadFile(
                    fileURL: fileURL,
                    mimeType: mimeType,
                    credential: .bearer(token),
                    uploadContext: "post"
                )
            }
            resolvedMediaIds = montes.ids + payload.attachmentIds
        }
        let uploadedIds = montes.ids
        let uploadedUrls = montes.urls
        let uploadedSourceIndexes = montes.sourceIndexes
        let uploadedLocalPaths = montes.localPaths

        // **La carte « position d'origine → id serveur »** (#4756) — construite
        // une fois, lue par les deux consommateurs ci-dessous. Vide quand rien
        // n'a été téléversé (post texte, ou pièces déjà en ligne), et les deux
        // lectures rendent alors ce qu'elles avaient.
        let idParIndexSource = Dictionary(
            uniqueKeysWithValues: zip(uploadedSourceIndexes, uploadedIds)
        )
        let urlParIndexSource = Dictionary(
            uniqueKeysWithValues: zip(uploadedSourceIndexes, uploadedUrls)
        )
        let legendesServeur = serverKeyedTexts(
            payload.mediaCaptions, idsBySourceIndex: idParIndexSource
        )
        // **Le même réalignement, sur l'autre texte** (2026-09-05). Deux
        // appels à UNE fonction, jamais deux fonctions : la carte des ids
        // (`idParIndexSource`) est la même, et c'est elle qui porte le seul
        // fait délicat — un upload sauté rompt l'alignement, donc l'index
        // s'enregistre au lieu de se déduire d'une longueur.
        let altsServeur = serverKeyedTexts(
            payload.mediaAlts, idsBySourceIndex: idParIndexSource
        )

        let body = CreatePostBody(
            content: payload.content,
            mediaIds: resolvedMediaIds.isEmpty ? nil : resolvedMediaIds,
            visibility: payload.visibility,
            originalLanguage: payload.originalLanguage,
            type: payload.type,
            moodEmoji: payload.moodEmoji,
            audioUrl: payload.audioUrl,
            audioDuration: payload.audioDuration,
            visibilityUserIds: payload.visibilityUserIds,
            location: payload.location,
            mentions: payload.mentions,
            discoverabilityPrecision: payload.discoverabilityPrecision,
            repostOfId: payload.repostOfId,
            mobileTranscription: payload.mobileTranscription,
            // **ASSAINI avant de partir** (#4756). Le blob composé porte des
            // `mediaURL` LOCALES tant que l'upload n'a pas eu lieu ; le
            // sanitizer les annule et le journalise, plutôt que de publier une
            // scène qui référence un `file://` illisible par quiconque.
            //
            // Ce que ce lot ne fait PAS : relier les objets média du canvas aux
            // `PostMedia` que la boucle ci-dessus vient de créer
            // (`postMediaId`). Un canvas dont le FOND est un fichier local part
            // donc sans son image — suivi ouvert et nommé, jamais masqué par ce
            // correctif.
            // **Le canvas ADOPTE les médias que le post vient de créer**
            // (#5280, 2026-09-05). Avant cette ligne, il désignait la ligne
            // `PostMedia` de la PRÉ-MONTÉE — celle faite au moment où la photo
            // a été posée sur la scène — et le lecteur cherchait un id absent
            // de `post.media` : la scène se peignait VIDE, sur toute la carte.
            //
            // L'adoption se fait ICI parce que c'est le seul étage qui tienne
            // les deux bouts : la carte `position → id serveur` (construite
            // ci-dessus, et déjà lue par les légendes et les alternatives) et
            // le canvas lui-même. Plus haut, les ids serveur n'existent pas ;
            // plus bas, il n'y a plus de canvas.
            //
            // L'ASSAINISSEMENT vient APRÈS, et l'ordre compte : il annule les
            // `file://` restés locaux, et une adoption réussie n'en laisse
            // aucun. Assainir d'abord effacerait l'URL que l'adoption doit
            // remplacer, et le sanitizer journaliserait un défaut que le lot
            // vient de corriger.
            storyEffects: CanvasMediaAdoption
                .adopting(payload.storyEffects,
                          objectIdsBySourceIndex: payload.mediaObjectIds,
                          idsBySourceIndex: idParIndexSource,
                          urlsBySourceIndex: urlParIndexSource)?
                .sanitizedForServerPublish(),
            // **La légende atteint enfin son destinataire** (#4756). Elle était
            // saisie, affichée, relue — et mourait ici, faute d'une clé que le
            // gateway sache reconnaître : `PostService.applyMediaText` filtre en
            // SILENCE les ids qu'il ignore, si bien qu'une carte mal clée se
            // perd sans erreur.
            mediaCaption: legendesServeur.isEmpty ? nil : legendesServeur,
            // **L'alternative textuelle atteint enfin son destinataire.**
            // `CreatePostSchema.mediaAlt` l'attendait depuis toujours côté
            // gateway ; côté client, la carte s'arrêtait au meuble. Un média
            // partait donc muet pour un lecteur d'écran, alors que l'auteur
            // avait rempli le champ « Décrire » et l'avait relu.
            mediaAlt: altsServeur.isEmpty ? nil : altsServeur,
            // **Le toggle « autoriser l'extraction du son » atteint enfin le
            // serveur** (#3996). Il était déclaré (`ComposerMediaAccessibility`,
            // `PublishIntent`), et mourait ici : ni `CreatePostPayload` ni ce
            // corps ne le portaient, si bien que l'auteur croyait décider et
            // le serveur ne l'apprenait jamais.
            allowSoundExtraction: payload.allowSoundExtraction
        )
        // #10321 — dernier point de contrôle : une publication retirée ne part pas.
        try await OfflineQueue.shared.throwIfPublicationCancelled(outboxId: record.id)
        #if DEBUG
        // La vitrine (#9820) : elle crée le post et l'annonce au fil quand elle est installée ; sinon la requête part.
        let televerses = zip(zip(uploadedSourceIndexes, uploadedLocalPaths), zip(uploadedIds, uploadedUrls)).map { source, piece in
            VitrineTeleverse(id: piece.0, url: piece.1, mimeType: payload.declaredMimeType(at: source.0) ?? "application/octet-stream",
                             fichierLocal: URL(fileURLWithPath: source.1))
        }
        let dejaServi = try await VitrineReel.creerSiInstallee(body, televerses: televerses) != nil
        #else
        let dejaServi = false
        #endif
        if !dejaServi {
            let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
                PostsEndpoint.root,
                method: "POST",
                body: try JSONEncoder().encode(body),
                queryItems: nil,
                headers: ["X-Client-Mutation-Id": payload.clientMutationId]
            )
        }
        for path in uploadedLocalPaths {
            do { try FileManager.default.removeItem(atPath: path) } catch {
                logger.warning("createPost: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        logger.info("createPost dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }}
