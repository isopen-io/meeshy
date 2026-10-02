import SwiftUI
import os
import PhotosUI
import UniformTypeIdentifiers
import MeeshySDK
import MeeshyUI

// **Les feuilles d'ingestion** — photothèque, collage, caméra, fichiers : ce
// qu'elles rendent est matérialisé puis remis à `ingestIntoDocument`, le seul
// écrivain de la liste du document (`MeeshyComposerHost+Intake.swift`).
// Extrait de `+Intake` (#9138), qui frôlait le plafond de 1200 lignes.

extension MeeshyComposerHost {

    func ingestPhotoLibraryItems(_ items: [PhotosPickerItem]) async {
        // Les médias sont ACCUMULÉS puis remis en une fois à
        // `ingestIntoDocument` : écrire dans la boucle rejouait la dérivation à
        // chaque item, sur un état différent (#4879).
        var medias: [ComposerDocumentMedia] = []
        for item in items {
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let declaredType = item.supportedContentTypes.first
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(
                "composer_photo_\(UUID().uuidString).\(declaredType?.preferredFilenameExtension ?? "dat")"
            )
            guard (try? data.write(to: url)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: url, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: mime)
            // **Ce qu'on vient d'ingérer se DIT** (#4879). Le mime décide de
            // TOUT en aval — `ComposerIngestRouter` en tire la famille, et une
            // famille `.document` fait qu'un média n'atteint jamais la scène,
            // sans qu'aucune ligne ne le signale.
            os.Logger(subsystem: "me.meeshy.app", category: "media").info(
                "ingest photothèque: \(url.lastPathComponent, privacy: .public) type=\(declaredType?.identifier ?? "nil", privacy: .public) mime=\(mime, privacy: .public) durée=\(duration ?? -1, privacy: .public)"
            )
            medias.append(ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        routePickedMedia(medias)
        HapticFeedback.light()
    }

    /// La caméra (T2.3) — le mime est celui que CE SITE choisit en écrivant
    /// le fichier, jamais dérivé après coup : JPEG pour une photo, QuickTime
    /// pour une vidéo (le conteneur qu'`AVCaptureMovieFileOutput` écrit déjà,
    /// `CameraModel.startSegment()`).
    ///
    /// **Revue Opus, correctif 1.** La branche vidéo sonde sa durée RÉELLE
    /// (`ComposerMediaProbe.durationMs`) — sans elle, une vidéo de 10 s
    /// captée ici partait `durationMs: nil` et `ReelComposition` la classait
    /// `.post` au lieu de `.reel`. La branche photo n'a rien à sonder : une
    /// image n'a pas de durée, et `ComposerMediaProbe.durationMs` la
    /// classerait `nil` de toute façon — l'appeler ici serait un aller-retour
    /// pour rien.
    /// **Ce qu'un COLLAGE pose** (#4092) — et il ne pose pas comme l'atelier.
    ///
    /// L'atelier a `posePastedItems`, qui route vers `addCapturedMedia` et
    /// `addRecordingToBackground` : deux helpers qui portent son état de
    /// CHARGEMENT (`isLoadingMedia`, `mediaLoadProgress`), une orchestration de
    /// vue que le meuble n'a pas et n'a pas à recopier.
    ///
    /// Le meuble a le sien, et il est déjà écrit : `ingestCameraCapture` pose
    /// une image ou une vidéo dans `documentLocalMedia`, en sondant le mime et
    /// la durée. Un collage d'image EST une capture, du point de vue de ce qui
    /// arrive dans le document — la seule différence est d'où viennent les
    /// octets.
    ///
    /// **Ce n'est donc pas une réécriture de `posePastedItems`, c'est le même
    /// geste branché sur l'ingestion de CE meuble.** Recopier les helpers de
    /// l'atelier aurait apporté avec eux un état de chargement dont rien ici ne
    /// se sert (leçon 336 : emprunter ce qui décide, pas ce qui orchestre).
    ///
    /// Le TEXTE, lui, garde sa règle partagée : `StoryPastePolicy` décide s'il
    /// devient la description ou un objet de scène, et cette question ne dépend
    /// pas de la surface qui colle.
    func handlePastedItems(_ items: [StoryPastedItem]) {
        for item in items {
            switch item {
            case .image(let image):
                // Une image venue du presse-papier n'a pas d'octets d'origine
                // à nous remettre : le repli redresse et ré-encode.
                Task { await ingestCameraCapture(.photo(image, data: nil)) }
            case .video(let url):
                Task { await ingestCameraCapture(.video(url)) }
            case .audio(let url):
                // Un son collé rejoint la scène comme un son EMPRUNTÉ le ferait
                // — c'est le même objet, et `addAudioObject` en est le site
                // unique. Le fichier voyage par `loadedAudioURLs`.
                viewModel.attachPastedAudio(url: url)
            case .text(let contenu):
                switch StoryPastePolicy.placement(forText: contenu) {
                case .description(let texte):
                    documentText = texte
                case .textObject(let texte):
                    if let objet = viewModel.addText() {
                        viewModel.updateTextContent(id: objet.id, text: texte)
                        viewModel.exitTextEditingMode()
                    }
                case nil:
                    break   // coller le vide n'est pas une erreur, c'est un geste sans matière
                }
            }
        }
        HapticFeedback.light()
    }

    func ingestCameraCapture(_ result: CameraResult) async {
        switch result {
        case .photo(let image, let originaux):
            // **Les octets D'ORIGINE quand on les a** (directive porteur
            // 2026-09-04 : « la prise de la photo doit avoir les exif et
            // metadata »).
            //
            // `AVCapturePhoto.fileDataRepresentation()` rend un fichier
            // COMPLET — EXIF, TIFF, appareil, date, temps de pose, focale,
            // orientation. Les ré-encoder depuis l'`UIImage` jetait tout cela :
            // `jpegData` n'écrit ni EXIF ni orientation, et c'est ce qui
            // faisait aussi arriver la photo COUCHÉE. Une seule correction
            // ferme les deux défauts, et elle est la bonne pour une raison de
            // fond : on ne reconstruit pas ce qu'on a reçu.
            let (octets, suffixe) = ComposerCapturePayload.bytes(
                original: originaux, fallback: image)
            guard let octets else { return }
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_camera_\(UUID().uuidString).\(suffixe)")
            guard (try? octets.write(to: url)) != nil else { return }
            ingestIntoDocument([ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: ComposerCapturePayload.mime(for: suffixe))])
        case .video(let url):
            let duration = await ComposerMediaProbe.durationMs(forURL: url, mime: "video/quicktime")
            ingestIntoDocument([ComposerDocumentMediaFactory.media(
                url: url,
                declaredMimeType: "video/quicktime",
                durationMs: duration
            )])
        }
        HapticFeedback.light()
    }

    /// L'importateur de documents (T2.3) — le mime passe par
    /// `ComposerMediaProbe.mime`, jamais recalculé ici.
    ///
    /// **Revue Opus, correctif 3.** `UTType.preferredMIMEType` rend `nil`
    /// pour des types pourtant bien identifiés (`.caf`, `.opus`) : retomber
    /// directement sur `application/octet-stream` ici ferait perdre
    /// EXACTEMENT le défaut que ce lot prétend fermer. `ComposerMediaProbe.mime`
    /// retombe d'abord sur la table par EXTENSION (`MimeTypeResolver`).
    ///
    /// **Revue Opus, correctif 4.** `startAccessingSecurityScopedResource()`
    /// rend `false` pour un fichier qui N'EST PAS security-scoped (conteneur
    /// app, certains fournisseurs) — ce n'EST PAS un échec. La copie est
    /// tentée QUEL QUE SOIT ce retour ; `stopAccessingSecurityScopedResource()`
    /// n'est appelé QUE si `start` a rendu `true`.
    ///
    /// **Revue Opus, correctif 1.** La durée RÉELLE est sondée
    /// (`ComposerMediaProbe.durationMs`) — un `.mp4`/`.caf` importé ici
    /// portait sinon `durationMs: nil`, et `ReelComposition` le classait
    /// `.post` au lieu de `.reel`/l'excluait à tort d'un réel à deux médias.
    ///
    /// `async` depuis ce lot : le `.fileImporter` du corps l'enveloppe d'un
    /// `Task`, comme les deux autres ingestions.
    func ingestFileImporterResult(_ result: Result<[URL], Error>) async {
        guard case .success(let urls) = result else { return }
        // **L'intention retombe dès la lecture** : elle vaut pour UNE ouverture.
        // Laissée à `.sound`, elle ferait poser sur la scène le fichier suivant,
        // même arrivé par la rangée du document.
        let intention = fileImportIntent
        fileImportIntent = .media
        if intention == .sound {
            await ingestSoundFiles(urls)
            return
        }
        // Même accumulation que la photothèque (#4879) : marquer le rail avant
        // d'écrire, et n'écrire qu'une fois.
        var medias: [ComposerDocumentMedia] = []
        for sourceURL in urls {
            let scoped = sourceURL.startAccessingSecurityScopedResource()
            defer { if scoped { sourceURL.stopAccessingSecurityScopedResource() } }
            let declaredType = try? sourceURL.resourceValues(forKeys: [.contentTypeKey]).contentType
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("composer_file_\(UUID().uuidString)_\(sourceURL.lastPathComponent)")
            guard (try? FileManager.default.copyItem(at: sourceURL, to: destination)) != nil else { continue }
            let mime = ComposerMediaProbe.mime(forURL: destination, declaredType: declaredType)
            let duration = await ComposerMediaProbe.durationMs(forURL: destination, mime: mime)
            medias.append(ComposerDocumentMediaFactory.media(
                url: destination,
                declaredMimeType: mime,
                durationMs: duration
            ))
        }
        ingestIntoDocument(medias)
        HapticFeedback.light()
    }
}
