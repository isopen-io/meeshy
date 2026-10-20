import CoreGraphics
import Foundation

// MARK: - StoryItem → StorySlide reconstruction (Reader runtime)

extension StoryItem {
    /// Reconstructs a renderable `StorySlide` from a published `StoryItem`.
    /// Resolves `content` via the Prisme Linguistique chain when available.
    /// Used by `StoryReaderRepresentable` to feed the canvas.
    ///
    /// `slide.mediaURL` porte l'URL du fond IMAGE/VIDÉO statique consommée par le
    /// chemin BG legacy de `StoryRenderer.renderBackground` (routée via
    /// `directURLIfAny`). Il vaut :
    /// - `media[0].url` pour une story purement legacy (aucun `mediaObject`) ;
    /// - l'URL de la `media` NON référencée par un objet quand des `mediaObject`
    ///   existent (le backdrop statique d'une story moderne) — voir le détail plus
    ///   bas. Il reste `nil` si tous les `media` sont référencés (foreground-only)
    ///   ou si le fond est un `StoryMediaObject isBackground:true` (traité en amont
    ///   par `renderBackground`), de sorte qu'on ne fournit jamais un post id au
    ///   resolver keyé sur `FeedMedia.id`.
    /// TRANSITOIRE — lecture de la forme legacy « média seul » (2026-08-22).
    ///
    /// Un client qui n'annonce pas `X-Canvas-Caps` reçoit d'une story canvas
    /// v3 une forme dégradée : `storyEffects` OMIS, le média porteur seul dans
    /// `media[0]` (gateway, `negotiateWireStoryEffects`, « règle 5 »). Les
    /// stories publiées avant le canvas ont la même forme. Historiquement ce
    /// média partait dans `slide.mediaURL`, que `StoryRenderer.renderBackground`
    /// peint comme une IMAGE — un `.mov` finissait dans ImageIO et l'écran
    /// restait vide (constat du 2026-08-22, story `6a894bd8…`).
    ///
    /// Plutôt que d'enseigner la vidéo à la route legacy, on MIGRE la forme
    /// legacy vers le modèle unique : un `StoryMediaObject` de fond, que le
    /// lecteur sait déjà jouer (AVPlayer, piste son, durée, placeholder
    /// ThumbHash). L'image legacy garde sa route historique, qui fonctionne.
    ///
    /// **Code à retirer** avec la route `slide.mediaURL` de `renderBackground`
    /// le jour où plus aucun client legacy ne lit de story — le modèle unique
    /// est le canvas v3, et cette fonction n'a pas vocation à grandir.
    static func legacyVideoCarrier(in media: [FeedMedia]) -> StoryMediaObject? {
        guard let carrier = media.first, let url = carrier.url, !url.isEmpty else { return nil }
        // `mimeType` est DÉCLARÉ par le client qui téléverse, jamais vérifié :
        // l'extension de l'URL corrige un type absent ou contradictoire.
        guard StoryMediaStoreRouter.effectiveKind(declaredType: carrier.type, urlString: url) == .video else {
            return nil
        }
        return StoryMediaObject(
            id: "legacy-bg-\(carrier.id)",
            postMediaId: carrier.id,
            mediaURL: url,
            mediaType: FeedMediaType.video.rawValue,
            // **Pas de `?? 1.0` ici** (#5100) : le repli posait une MESURE, alors
            // que le porteur legacy peut très bien n'avoir aucun ratio. Laisser
            // passer le `nil` dit la vérité, et `aspectRatio` sert le même repli
            // qu'avant à quiconque le lit.
            aspectRatio: carrier.aspectRatio,
            isBackground: true,
            loop: true,
            intrinsicDuration: carrier.duration.map(Double.init),
            duration: carrier.duration.map(Double.init),
            thumbHash: carrier.thumbHash
        )
    }

    public func toRenderableSlide(preferredLanguages: [String]) -> StorySlide {
        // R10 — chaîne complète (et plus seulement `.first`) : un viewer
        // fr→es voit la traduction es si la fr manque, au lieu de l'original.
        let resolvedContent = self.resolvedContent(preferredLanguages: preferredLanguages)
                              ?? self.content
        var effects = self.storyEffects ?? StoryEffects()

        // Hydrate media durations depuis `self.media` (FeedMedia côté API)
        // vers `StoryMediaObject.duration` quand celle-ci est nil. Sans
        // ça, `StorySlide.computedTotalDuration()` ne voit pas la durée
        // réelle du media bg pour les stories venues du backend (le
        // composer remplit `StoryMediaObject.duration` localement mais
        // le payload backend ne le réécrit pas — la durée vit dans
        // `FeedMedia` côté API). Fix user-reporté 2026-05-28 « il n'y a
        // plus le respect de la durée des média dynamique ».
        if var medias = effects.mediaObjects, !medias.isEmpty {
            for i in medias.indices {
                let feed = self.media.first(where: { $0.id == medias[i].postMediaId })
                if medias[i].duration == nil, let dur = feed?.duration, dur > 0 {
                    medias[i].duration = Double(dur)
                }
                // Hydrate `aspectRatio` (≈1.0, sentinelle) depuis `FeedMedia
                // .width/height`. Ce n'est PAS un simple repli legacy : le
                // composer stampe TOUJOURS `aspectRatio: 1.0` à l'add-media
                // (`StoryComposerViewModel` ~l.1101, TODO Phase 2/3 « compute
                // real aspectRatio from asset »), donc cette hydratation
                // read-time est la source de dimensionnement PRIMAIRE pour
                // quasi toutes les stories actuelles — sans elle un média
                // non-carré s'affiche squishé (carré) dans le reader alors que
                // le canvas/snapshot le dimensionnent via `aspectRatio`. Les
                // (rares) stories portant déjà un ratio réel ≠ 1.0 ne sont
                // jamais touchées — parité avec l'hydratation de `duration`
                // ci-dessus (fix proportions 2026-06-30).
                // **La condition porte sur la MESURE, plus sur un seuil** (#5100).
                //
                // Elle testait `abs(aspectRatio - 1.0) < 0.05` — c'est-à-dire la
                // SENTINELLE, pas une propriété du média. Une photo réellement
                // carrée était donc réécrite comme si son ratio était inconnu ;
                // le résultat coïncidait par chance (w/h ≈ 1), et la règle ne
                // pouvait structurellement pas distinguer les deux cas.
                //
                // Depuis que « pas encore mesuré » est représentable, la question
                // se pose telle qu'elle a toujours été voulue : *ce média a-t-il
                // un ratio ?* Un carré mesuré traverse désormais intact.
                if medias[i].measuredAspectRatio == nil,
                   let w = feed?.width, let h = feed?.height, w > 0, h > 0 {
                    medias[i].aspectRatio = Double(w) / Double(h)
                }
            }
            effects.mediaObjects = medias
        }
        if var audios = effects.audioPlayerObjects, !audios.isEmpty {
            for i in audios.indices {
                let feed = self.media.first(where: { $0.id == audios[i].postMediaId })
                if audios[i].duration == nil, let dur = feed?.duration, dur > 0 {
                    audios[i].duration = Float(dur)
                }
                // Adresse de l'asset : `postMediaId` n'est résolvable que par un
                // consommateur qui porte l'index des médias. L'exporteur ne reçoit
                // qu'un slide — sans cette URL, « Partager » et « Enregistrer dans
                // Photos » bakaient un MP4 muet. Une URL déjà persistée par le
                // composer gagne : elle est plus fraîche que le repli.
                if audios[i].mediaURL == nil, let url = feed?.url, !url.isEmpty {
                    audios[i].mediaURL = url
                }
            }
            effects.audioPlayerObjects = audios
        }

        // `slide.mediaURL` porte le fond IMAGE/VIDÉO statique (chemin BG legacy
        // de `StoryRenderer.renderBackground`, routé via `directURLIfAny`).
        //
        // - Story purement legacy (aucun `mediaObject`) : le fond vit directement
        //   dans `media[0]` → on le garde.
        // - Story moderne (au moins un `mediaObject`) : un fond photo statique est
        //   une entrée `media` qui n'est référencée par AUCUN objet (foreground,
        //   background, audio ou variante TTS). Si une telle entrée existe, c'est
        //   le backdrop → on route son URL (sinon `renderBackground` retombe sur
        //   `.solidColor(.black)` = fond NOIR sur la story d'un autre). Quand
        //   chaque `media` est référencée (story foreground-only), il n'y a pas de
        //   backdrop statique → `nil`, et le fond vient de `effects.background`.
        //
        // Un fond porté par un `StoryMediaObject isBackground:true` référence sa
        // `media`, donc il n'est jamais choisi ici : `renderBackground` le traite
        // en amont (branche isBackground), et `mediaURL` reste `nil` — pas de
        // double routage ni de post id fourni au resolver keyé sur `FeedMedia.id`.
        let legacyMediaURL: String?
        if let mediaObjects = effects.mediaObjects, !mediaObjects.isEmpty {
            var referencedIds = Set(mediaObjects.map(\.postMediaId))
            for audio in effects.audioPlayerObjects ?? [] {
                referencedIds.insert(audio.postMediaId)
                for variant in audio.backgroundAudioVariants ?? [] {
                    referencedIds.insert(variant.postMediaId)
                }
            }
            legacyMediaURL = self.media.first(where: { !referencedIds.contains($0.id) })?.url
        } else if let carrier = Self.legacyVideoCarrier(in: self.media) {
            // TRANSITOIRE — forme legacy « média seul ». À SUPPRIMER quand le
            // parc ne sert plus que le canvas v3 (voir `legacyVideoCarrier`).
            effects.mediaObjects = [carrier]
            legacyMediaURL = nil
        } else {
            legacyMediaURL = self.media.first?.url
        }
        return StorySlide(
            id: self.id,
            mediaURL: legacyMediaURL,
            content: resolvedContent,
            effects: effects
        )
    }
}
