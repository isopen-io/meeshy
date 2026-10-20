import SwiftUI
import UIKit
import MeeshySDK

// MARK: - StoryComposerViewModel + Media objects

extension StoryComposerViewModel {
    @discardableResult
    /// Point d'entrée protocolaire (`StoryComposerProviding`) : génère un id
    /// frais et délègue à la variante `id`-explicite.
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil) -> StoryMediaObject? {
        addMediaObject(kind: kind, toSlideId: toSlideId, id: UUID().uuidString)
    }

    /// Variante avec id explicite. Le composer passe l'`objectId` qui a servi à
    /// nommer le fichier temp `{objectId}.{ext}` : ainsi `obj.id` == nom-de-fichier
    /// == `composerKey` dérivé par `StoryBackgroundLayer.configure`. Sans cet
    /// alignement, le bitmap du fond (stocké sous `obj.id` dans `loadedImages`)
    /// n'est jamais retrouvé par la clé issue du fichier → fond `.clear` →
    /// canvas noir (bug user 2026-07-20).
    func addMediaObject(kind: StoryMediaKind, toSlideId: String? = nil, id: String) -> StoryMediaObject? {
        guard canAddMedia else { return nil }
        // Resolve the target slide. If the caller pinned a specific id (e.g., the
        // PhotosPicker started on slide 0 and the user switched to slide 1 mid-load),
        // honour it — without this guard, the new media object would be appended to
        // whichever slide happened to be active when the async task resolved.
        guard let targetSlideIndex = slideIndex(pinnedTo: toSlideId) else { return nil }

        // La slide CIBLE, pas la courante : ce site peut poser sur une autre
        // slide, et cascader d'après les objets de la mauvaise donnerait un
        // décalage sans rapport avec ce que l'auteur voit.
        let center = nextObjectPosition(in: slides[targetSlideIndex].effects)
        var targetEffects = slides[targetSlideIndex].effects
        // Auto-background uniquement si la slide n'a aucun media visuel (pre-migration
        // inclus : resolvedBackgroundMedia retombe sur le 1er existant). Un fond
        // statique stocké dans `slideImages` (slide-level bg image) compte aussi
        // comme background — sans ce check, un media ajouté APRÈS un setImage(...)
        // serait incorrectement marqué bg, masquerait l'image, et briserait le
        // synthetic-clip injecté par loadCurrentSlideIntoTimeline.
        let hasSlideLevelBgImage = slideImages[slides[targetSlideIndex].id] != nil
        let shouldBeBackground = targetEffects.resolvedBackgroundMedia == nil && !hasSlideLevelBgImage
        let obj = StoryMediaObject(
            id: id,
            postMediaId: "",
            kind: kind,
            placement: "media",
            // **`nil`, et c'est la correction du #5100.** Ce site posait `1.0`
            // avec un TODO « compute real aspectRatio from asset » : la valeur
            // était donc une SENTINELLE qui se lisait comme un carré. Les
            // appelants mesurent ensuite (`setMediaAspectRatio`) ; jusque-là
            // l'objet doit DIRE qu'il ne sait pas, sans quoi un recadrage tapé
            // pendant cette fenêtre pose une borne calculée contre 1:1 —
            // enregistrée, publiée, et impossible à distinguer d'un choix.
            aspectRatio: nil,
            x: center.x,
            y: center.y,
            scale: 1.0,
            rotation: 0,
            volume: 1.0,
            // Bg media loops by default so a short video/asset covers the
            // full slide duration. Without this, `StoryMediaObject.loop`
            // defaults to false → `bgVideo.loop ?? true` in StoryRenderer
            // never falls back to true → AVPlayerLooper never armed → video
            // stops at its native end while the slide progress bar continues
            // (user report 2026-05-27).
            isBackground: shouldBeBackground,
            loop: shouldBeBackground,
            sourceLanguage: declaredContentLanguage
        )
        var medias = targetEffects.mediaObjects ?? []
        medias.append(obj)
        targetEffects.mediaObjects = medias
        // **Un fond entre AJUSTÉ** (#6125, directive porteur 2026-09-12 : « le
        // Meeshy Composer doit intégrer dans canvas la pièce pour fit dans le
        // canvas par défaut, et l'auteur zoom ou dézoom pour rogner »).
        //
        // Le cadrage se pose ICI, à l'ingestion, et non dans le renderer : le
        // défaut du renderer gouverne aussi les stories DÉJÀ publiées, qu'aucune
        // directive ne demande de recadrer. Ce que ce site change ne concerne
        // que les compositions neuves.
        //
        // `posedFitMode` ne réécrit pas un cadrage déjà déclaré sur la slide :
        // le choix de l'auteur porte sur la SCÈNE, pas sur le fichier qui
        // l'occupe, et le remplacer à chaque média posé lui ferait reprendre
        // indéfiniment le même geste.
        if shouldBeBackground {
            var bg = targetEffects.backgroundTransform ?? StoryBackgroundTransform()
            bg.videoFitMode = StoryBackgroundFraming.posedFitMode(declared: bg.videoFitMode)
            targetEffects.backgroundTransform = bg
        }
        slides[targetSlideIndex].effects = targetEffects
        // Selection / z-index state is composer-global; only mutate it when we're
        // actually adding to the currently-visible slide so the UI doesn't jump.
        if targetSlideIndex == currentSlideIndex {
            selectedElementId = obj.id
            bringToFront(id: obj.id)
        }
        return obj
    }

    /// Pin the natural asset duration on a media object so the reader's
    /// visibility window matches the actual playback length. Idempotent: a
    /// later trim from the timeline editor overwrites this baseline.
    func setMediaDuration(id: String, duration: Float, slideId: String? = nil) {
        guard let targetIndex = slideIndex(pinnedTo: slideId) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].duration = Double(duration)
        // Fige la durée NATIVE de l'asset à la première pose (= import). Sert de
        // borne au rognage (on ne peut pas étendre un clip au-delà du média
        // source). Les changements de fenêtre ultérieurs (timeline editor) ne
        // l'écrasent pas.
        if medias[mediaIdx].intrinsicDuration == nil {
            medias[mediaIdx].intrinsicDuration = Double(duration)
        }
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Set the `mediaURL` on a `StoryMediaObject`. Called after persisting
    /// a composer-loaded UIImage to a temp file so the CALayer canvas
    /// (`StoryMediaLayer.configureImage`) can load it via `file://` URL.
    /// Without this bridge the media object's `mediaURL` stays `nil` and the
    /// layer renders a black rectangle.
    func setMediaURL(id: String, url: String, slideId: String? = nil) {
        guard let targetIndex = slideIndex(pinnedTo: slideId) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].mediaURL = url
        effects.mediaObjects = medias
        slides[targetIndex].effects = effects
    }

    /// Met à jour l'aspectRatio (width/height) d'un media. Appelé après le
    /// pick PhotosPicker / record une fois que l'asset natural size est
    /// mesurée via `UIImage.size` (image) ou `AVAssetTrack.naturalSize` +
    /// `preferredTransform` (vidéo). Sans ça, l'aspectRatio reste à 1.0 et
    /// la layer est rendue en carré 540x540 (cf. `baseMediaDesignSize`).
    func setMediaAspectRatio(id: String, aspectRatio: Double, slideId: String? = nil) {
        guard aspectRatio.isFinite, aspectRatio > 0 else { return }
        guard let targetIndex = slideIndex(pinnedTo: slideId) else { return }
        var effects = slides[targetIndex].effects
        guard var medias = effects.mediaObjects,
              let mediaIdx = medias.firstIndex(where: { $0.id == id }) else { return }
        medias[mediaIdx].aspectRatio = aspectRatio
        effects.mediaObjects = medias
        // « L'import de l'image de fond impose le cadre et forme du Canvas » : dès
        // que la forme réelle du fond est connue (mesure asset après import, ou
        // recadrage), le ratio du canvas suit — paysage → 16:9, sinon 9:16.
        effects.canvasAspectRatio = Self.canvasAspectRatio(forBackgroundOf: effects)
        slides[targetIndex].effects = effects
        // Miroir dans le side-cache si d'autres surfaces le lisent.
        mediaAspectRatios[id] = CGFloat(aspectRatio)
    }

    /// Insère une piste EMPRUNTÉE à la bibliothèque de sons.
    ///
    /// Se distingue d'`addAudioObject` sur deux points, et les deux comptent :
    /// - `soundId` est renseigné et `postMediaId` reste vide — c'est ce couple
    ///   qui dit au serveur « enregistre un usage, ne capture rien, ne crédite
    ///   personne d'autre » ;
    /// - `mediaURL` porte l'URL distante, sans quoi ni le lecteur ni l'export ne
    ///   sauraient retrouver le son (l'export ne reçoit qu'un `StorySlide`).
    /// **`public` parce que l'étagère des sons s'ouvre aussi depuis le MEUBLE.**
    /// Le composer unifié n'avait aucun chemin vers elle : sa porte « son »
    /// n'enregistrait qu'un vocal, alors que la doctrine de la vue `2c` sépare
    /// justement les deux provenances — un son EMPRUNTÉ devient le fond, une
    /// note vocale ne l'est jamais. C'est cette fonction, et elle seule, qui
    /// pose le premier.
    /// **Un son emprunté, éventuellement ROGNÉ** (#4657).
    ///
    /// `trim` porte l'intervalle conservé, en secondes depuis le début de la
    /// piste. Il se pose en `sourceStart`/`sourceEnd` — **jamais** en découpant
    /// un fichier : un son de la bibliothèque garde son `soundId`, et le crédit
    /// de son auteur avec lui. Ré-encoder une copie rognée en ferait un fichier
    /// anonyme, ce que la doctrine du crédit interdit.
    ///
    /// `nil` ⇒ la piste entière, comme avant ce lot.
    @discardableResult
    public func addBorrowedSound(_ sound: APISound,
                                 trim: ClosedRange<TimeInterval>? = nil) -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        let hasExistingBackgroundAudio = currentEffects.resolvedBackgroundAudio != nil
        var obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: 0.5,
            y: 0.65,
            volume: 1.0,
            waveformSamples: sound.waveform,
            isBackground: hasExistingBackgroundAudio ? nil : true,
            duration: sound.durationSeconds.map { Float($0) },
            sourceLanguage: declaredContentLanguage,
            // Le titre de l'auteur, quand il existe, sert de nom de piste dans
            // la timeline. Sans titre on laisse `nil` : le libellé par défaut se
            // compose à l'affichage, dans la langue du lecteur.
            name: sound.hasAuthoredTitle ? sound.title : nil,
            mediaURL: sound.fileUrl,
            soundId: sound.id,
            soundAuthorUsername: sound.uploader?.username,
            soundCreatedAt: StoryAudioPlayerObject.soundCreatedAtStamp(sound.createdAt)
        )
        // Le rognage se pose sur la SOURCE, pas sur un fichier : c'est ce qui
        // laisse `soundId` intact, donc le crédit de l'auteur (#4657).
        // `duration` suit l'intervalle — sans quoi la piste annoncerait sa
        // longueur entière et le lecteur attendrait après la fin du segment.
        if let trim {
            obj.sourceStart = trim.lowerBound
            obj.sourceEnd = trim.upperBound
            obj.duration = Float(trim.upperBound - trim.lowerBound)
        }
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        if let seconds = sound.durationSeconds {
            autoExtendDuration(forElementEnd: Float(seconds))
        }
        return obj
    }

    @discardableResult
    /// `role` nil ⇒ la règle automatique s'applique telle quelle : aucun site
    /// d'appel existant ne change de comportement (#4483).
    func addAudioObject(role: ComposerAudioRole?) -> StoryAudioPlayerObject? {
        guard canAddMedia else { return nil }
        // La cascade est SANS EFFET sur un son qui bascule en fond juste après
        // — un fond n'a pas de position. La calculer quand même coûte un
        // parcours et évite une branche qui devrait deviner, avant la bascule,
        // ce que la règle d'auto-fond décidera après.
        let center = nextObjectPosition(in: currentEffects)
        // Auto-bascule en background si aucun audio n'est déjà en background
        // (ni via isBackground=true, ni via le champ legacy backgroundAudioId).
        let obj = StoryAudioPlayerObject(
            postMediaId: "",
            placement: "overlay",
            x: center.x,
            y: min(0.9, center.y + 0.15),
            volume: 1.0,
            waveformSamples: [],
            // Règle EXTRAITE au #4052 : elle vivait ici en clair, et le second
            // site qui en avait besoin (le son porté depuis l'écran document)
            // l'aurait recopiée. Un `enum` pur la rend éprouvable sans monter
            // de vue, et interdit qu'un jour les deux divergent sur « un audio
            // écrase-t-il celui qui est déjà en fond ? ».
            isBackground: ComposerAudioPlacement.isBackground(
                chosen: role,
                sceneAlreadyHasBackgroundAudio: currentEffects.resolvedBackgroundAudio != nil
            ),
            sourceLanguage: declaredContentLanguage
        )
        var effects = currentEffects
        var audios = effects.audioPlayerObjects ?? []
        audios.append(obj)
        effects.audioPlayerObjects = audios
        currentEffects = effects
        selectedElementId = obj.id
        bringToFront(id: obj.id)
        return obj
    }
}
