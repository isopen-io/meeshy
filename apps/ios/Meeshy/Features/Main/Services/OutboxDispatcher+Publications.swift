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
        var uploadedLocalPaths: [String] = []
        // **Hissés hors du bloc**, comme `uploadedLocalPaths` juste au-dessus :
        // la jointure « position d'origine → id serveur » se lit APRÈS l'upload,
        // pour le corps de la requête (#4756).
        var uploadedIds: [String] = []
        // **L'URL SERVIE voyage avec l'id** (#5280). Le canvas ne référence
        // pas seulement une ligne `PostMedia` : il porte aussi l'URL qu'il
        // affiche. Adopter l'id sans l'URL laisserait le lecteur devant un
        // `file://` que l'assainisseur annule — une scène sans image, pour un
        // canvas pourtant cohérent.
        var uploadedUrls: [String] = []
        var uploadedSourceIndexes: [Int] = []
        // **La PREMIÈRE panne d'upload, retenue pour la ligne** (#5830). Le
        // `catch` par fichier ci-dessous journalise et poursuit — c'est voulu,
        // un fichier ne doit pas condamner les autres — mais la ligne outbox
        // n'en gardait AUCUNE trace : `lastError` ne portait que le 503
        // générique, qui est le SYMPTÔME. Diagnostiquer le réel bloqué du
        // 2026-09-08 a exigé de démonter la base de l'appareil ; l'utilisateur,
        // lui, n'avait rien du tout.
        var premierEchecUpload: Error?
        // **Un fichier ABSENT du disque ne reviendra jamais** — à distinguer
        // d'un upload qui a échoué. Le premier est permanent (les octets ont
        // disparu), le second est transitoire (réseau, suspension, jeton). Les
        // deux se soldent différemment plus bas.
        var fichiersDisparus = 0
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
            let uploader = TusUploadManager(baseURL: baseURL)
            // **Ce qu'une tentative PRÉCÉDENTE a déjà monté** (#5830), relu
            // depuis la ligne elle-même. Sans cette carte, chaque rejeu
            // repartait de l'index 0 et jetait tout ce que le précédent avait
            // obtenu : une publication à trois médias dont aucune tentative ne
            // pouvait tout finir d'un trait ne se publiait JAMAIS.
            let dejaMontes = Dictionary(
                (payload.uploadedMedia ?? []).map { ($0.sourceIndex, $0) },
                uniquingKeysWith: { _, dernier in dernier }
            )
            for (index, stored) in pendingMediaPaths.enumerated() {
                let absolutePath = OfflineQueue.absoluteMediaPath(forStored: stored)
                if let acquis = dejaMontes[index] {
                    uploadedIds.append(acquis.id)
                    uploadedUrls.append(acquis.url)
                    uploadedSourceIndexes.append(index)
                    // Le fichier local reste à nettoyer APRÈS publication : il
                    // a été monté, il n'est plus la source de vérité, mais il
                    // ne se supprime qu'une fois le post créé — sinon un
                    // échec plus bas laisserait la ligne sans ses octets et
                    // sans son post.
                    uploadedLocalPaths.append(absolutePath)
                    logger.info("createPost: média \(index, privacy: .public) déjà monté, upload sauté")
                    continue
                }
                guard FileManager.default.fileExists(atPath: absolutePath) else {
                    logger.error("Post media file missing on dispatch, path=\(stored, privacy: .public)")
                    fichiersDisparus += 1
                    continue
                }
                do {
                    // Le MIME **DÉCLARÉ** par le site d'envoi l'emporte ; la
                    // dérivation depuis l'extension n'est que le REPLI des
                    // lignes qui n'en portent pas. L'extension ne suffit pas :
                    // un vocal importé en `.caf` / `.aiff` / `.opus` s'y
                    // re-dérivait en `application/octet-stream`, et le gateway
                    // ne reconnaît un média audio qu'à
                    // `mimeType.startsWith('audio/')` — la transcription
                    // embarquée était alors ignorée ET Whisper jamais
                    // déclenché, pour un fichier que l'expéditeur savait
                    // pourtant être une voix.
                    let mime = payload.declaredMimeType(at: index)
                        ?? MimeTypeResolver.mimeType(
                            forExtension: URL(fileURLWithPath: absolutePath).pathExtension)
                    let tusResult = try await uploader.uploadFile(
                        fileURL: URL(fileURLWithPath: absolutePath),
                        mimeType: mime,
                        credential: .bearer(token),
                        // POUR QUI ce fichier est téléversé — et sans lui, le
                        // gateway crée un `MessageAttachment` puis répond 201
                        // avec un id parfaitement valide. `PostService.createPost`
                        // ne réclame ensuite que des `PostMedia` : il n'en
                        // réclame AUCUN, ne journalise qu'un `logger.warn`, et le
                        // post arrive publié et VIDE. Les trois chemins EN LIGNE
                        // le passaient déjà ; seule la file durable ne le passait
                        // pas, si bien que le média perdu ne l'était QUE hors
                        // ligne — la condition la moins observée de toutes.
                        uploadContext: "post"
                    )
                    uploadedIds.append(tusResult.id)
                    uploadedUrls.append(tusResult.fileUrl)
                    uploadedLocalPaths.append(absolutePath)
                    // **L'INDEX D'ORIGINE voyage avec l'id** (#4756). C'est la
                    // seule jointure possible entre ce que l'auteur a composé
                    // et ce que le serveur vient de créer : la légende, l'alt
                    // et les objets média du canvas sont tous clés par la
                    // POSITION du fichier, jamais par un id qui n'existait pas
                    // encore à la composition.
                    //
                    // Un upload qui ÉCHOUE est sauté (best-effort, `catch`
                    // ci-dessous) : l'alignement avec `payload.localMediaPaths`
                    // est alors rompu, et c'est précisément pourquoi l'index
                    // s'enregistre ici plutôt que de se déduire de la longueur
                    // des tableaux.
                    uploadedSourceIndexes.append(index)
                    // **Le fait est GRAVÉ sur la ligne, pas seulement dans
                    // cette variable** (#5830) : c'est la seule chose qui
                    // traverse une suspension de l'OS, une coupure réseau ou un
                    // redémarrage. Sans elle, ces octets seraient re-montés au
                    // prochain rejeu — et le rejeu suivant les re-monterait
                    // encore, indéfiniment.
                    await OfflineQueue.shared.recordUploadedPostMedia(
                        outboxId: record.id,
                        UploadedPostMedia(sourceIndex: index, id: tusResult.id, url: tusResult.fileUrl)
                    )
                } catch {
                    if premierEchecUpload == nil { premierEchecUpload = error }
                    logger.error("Post media TUS upload failed (best-effort skip): \(error.localizedDescription, privacy: .public)")
                }
            }
            // **Une publication ne part pas AMPUTÉE d'un média que l'auteur
            // pourra encore obtenir** (#5830). L'ancienne règle — « au moins un
            // média monté suffit » — publiait un réel à trois scènes avec une
            // seule image dès que deux uploads trébuchaient, définitivement et
            // en silence. Elle n'était tenable que parce que rien ne
            // convergeait : rejeter aurait bouclé sans fin. Maintenant que
            // chaque succès est ACQUIS, rejeter converge — le rejeu ne monte
            // plus que ce qui manque.
            //
            // Les deux causes ne se soldent donc pas pareil :
            //  - un upload ÉCHOUÉ est transitoire ⇒ on relance la ligne, en
            //    portant la cause RÉELLE plutôt qu'un compte à zéro ;
            //  - un fichier DISPARU du disque est permanent ⇒ rejeter
            //    bouclerait jusqu'à l'épuisement pour rien, on publie ce qui
            //    reste (comportement historique), et l'absence est tracée.
            if let cause = premierEchecUpload {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 503,
                    userInfo: [
                        NSLocalizedDescriptionKey: "Média \(uploadedIds.count)/\(pendingMediaPaths.count) monté — publication reportée : \(cause.localizedDescription)",
                        NSUnderlyingErrorKey: cause
                    ]
                )
            }
            guard !uploadedIds.isEmpty else {
                throw NSError(
                    domain: "OutboxDispatcher",
                    code: 503,
                    userInfo: [NSLocalizedDescriptionKey: fichiersDisparus > 0
                        ? "Les \(fichiersDisparus) fichier(s) de cette publication ont disparu du disque"
                        : "No media uploaded for offline post media dispatch"]
                )
            }
            if fichiersDisparus > 0 {
                logger.warning("createPost: publication amputée de \(fichiersDisparus, privacy: .public) fichier(s) disparu(s) — les octets n'existent plus, un rejeu ne les rendrait pas")
            }
            resolvedMediaIds = uploadedIds + payload.attachmentIds
        }

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
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.root,
            method: "POST",
            body: try JSONEncoder().encode(body),
            queryItems: nil,
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        for path in uploadedLocalPaths {
            do { try FileManager.default.removeItem(atPath: path) } catch {
                logger.warning("createPost: failed to remove temp file \(path, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
        logger.info("createPost dispatched cmid=\(payload.clientMutationId, privacy: .public)")
    }}
