import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Rendering

extension StoryCanvasUIView {
    /// Force le re-stamping des bitmap layers en invalidant le
    /// `StoryRendererCache`. Appelé EXCLUSIVEMENT par
    /// `StoryComposerCanvasView` quand `loadedImagesVersion` bump (édition
    /// d'image) — sans ce bump, les layers du cache stampent l'ancien
    /// bitmap (cache keyé par révision). Le reader N'APPELLE PAS cette
    /// méthode : sa playback (progress bar, video bg) s'appuie sur la
    /// stabilité de la révision entre setReaderContext et startAudio, donc
    /// bumper ici cassait la progress bar (régression 2026-05-27 reportée
    /// par le user — « progress bar ne progresse même plus du tout »).
    public func invalidateImageCache() {
        slideContentRevision &+= 1
        // Dedicated token for composer image-cache invalidation (an in-place image
        // edit bumped `loadedImagesVersion`). Passed to `backgroundLayer.configure`
        // as `contentVersion` so the background re-stamps the edited bitmap under
        // the same media id. Distinct from `slideContentRevision` (which bumps on
        // every edit incl. text keystrokes) to avoid needless bg re-fetches.
        composerImageRevision &+= 1
        // Le cache de layers `.edit` fingerprinte le MODÈLE (JSON de l'élément) ;
        // un bitmap édité in-place vit dans `loadedImages` à modèle constant et
        // serait donc servi périmé sur cache hit. Flush complet — événement
        // rare (retour de l'éditeur d'image plein écran), le re-build est
        // imperceptible à cet instant-là.
        rendererCache.invalidate()
        rebuildLayers()
    }

    func rebuildLayers() {
        guard bounds.size != .zero else { return }
        // CATransaction with disableActions avoids implicit fade animations on
        // every rebuild — important for a smooth ~60 Hz playback loop.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }

        // Background layer
        let bgKind = StoryRenderer.renderBackground(slide: slide,
                                                    languages: readerContext.preferredLanguages)
        // BG transform : priorité à `mediaObjects[bg]` (source de vérité
        // unifiée avec les items FG depuis 2026-05-29). Fallback sur le
        // champ legacy `slide.effects.backgroundTransform.scale/offset/rotation`
        // pour les stories publiées AVANT l'unification (les valeurs y sont
        // gelées mais valides). `videoFitMode` reste toujours sur
        // `backgroundTransform` (n'est pas une coord géométrique).
        let bgTransform: BackgroundTransform = {
            let videoFitMode = slide.effects.backgroundTransform?.videoFitMode
            // Source unique : `mediaObjects[bg]` est TOUJOURS la source de
            // vérité dès qu'il existe — y compris quand toutes ses valeurs
            // sont aux défauts (scale=1.0, x=y=0.5, rotation=0). L'ancienne
            // garde de transition (scale != 1.0 || x != 0.5 || ...) basculait
            // sur `backgroundTransform` legacy quand le user dezoomait
            // exactement à 1.0, provoquant un saut visible entre les deux
            // sources si la legacy avait un scale différent (bug 2026-05-29).
            // `backgroundTransform` n'est utilisée qu'en pur fallback quand
            // `mediaObjects[bg]` n'existe pas (stories pré-unification).
            if let bg = slide.effects.mediaObjects?.first(where: { $0.isBackground }) {
                return BackgroundTransform(
                    scale: bg.scale,
                    offsetX: (bg.x - 0.5) * Double(geometry.renderSize.width),
                    offsetY: (bg.y - 0.5) * Double(geometry.renderSize.height),
                    rotation: bg.rotation,
                    videoFitMode: videoFitMode
                )
            }
            if let t = slide.effects.backgroundTransform {
                return BackgroundTransform(scale: Double(t.scale ?? 1),
                                           offsetX: Double(t.offsetX ?? 0),
                                           offsetY: Double(t.offsetY ?? 0),
                                           rotation: t.rotation ?? 0,
                                           videoFitMode: videoFitMode)
            }
            return BackgroundTransform(scale: 1, offsetX: 0, offsetY: 0,
                                       rotation: 0, videoFitMode: videoFitMode)
        }()
        backgroundLayer.frame = CGRect(origin: .zero, size: geometry.renderSize)
        // Letterbox fill : la couleur de fond de la slide n'habille les bandes QUE
        // s'il n'y a PAS de média de fond visuel. Avec un fond image/vidéo
        // (`bgKind.isVisualMedia`), aucune couleur — letterbox neutre (transparente)
        // → le fond coloré est supprimé dès qu'un visuel de fond existe (user
        // 2026-06-03, inverse la préférence 2026-05-28). En pratique le média
        // remplit le canvas (resizeAspectFill par défaut) ; la bande neutre ne
        // concerne que le mode fit explicite (double-tap auteur).
        let letterboxColor: UIColor? = {
            guard !bgKind.isVisualMedia, let hex = slide.effects.background else { return nil }
            return Self.parseBackgroundHex(hex)
        }()
        backgroundLayer.configure(
            kind: bgKind,
            transform: bgTransform,
            geometry: geometry,
            resolver: readerContext.postMediaURLResolver,
            imageCache: readerContext.imageCache,
            letterboxColor: letterboxColor,
            // Slide-level thumbHash flows through so `.solidColor` and
            // `.gradient` cases can stamp the preview ON TOP of the flat tint
            // (user spec 2026-05-28: thumbnail visible above color, not below).
            slidePreviewThumbHash: slide.effects.thumbHash,
            // Filter is BAKED into the background bitmap at stamp time (no overlay) —
            // renders identically in composer / preview / reader / published, and an
            // in-place image edit re-filters via `contentVersion` (2026-06-03 pivot).
            filter: slide.effects.filter.flatMap { StoryFilter(rawValue: $0) },
            filterIntensity: Float(slide.effects.filterIntensity ?? 1.0),
            contentVersion: composerImageRevision
        )

        // Items — détache les sublayers existants AVANT de les ré-attacher.
        // Les layers cachés (StoryRendererCache) restent retenus côté cache
        // et seront ré-attachés via `addSublayer` à la prochaine itération,
        // ce qui détache automatiquement du parent précédent (O(1)).
        itemsContainer.sublayers?.forEach { $0.removeFromSuperlayer() }

        // Drop the stale canvas backdrop captured during the previous tick,
        // then re-capture against the current slide state. The helper short-
        // circuits to a no-op when no glass-style text exists on the slide,
        // so this is essentially free for the common path.
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages)

        // Cache CALayer : actif dans LES DEUX modes depuis 2026-07-11.
        // - `.play` : `displayLinkTick` rebuild à 60 Hz sans mutation du modèle
        //   (seul `currentTime` avance) — fingerprint historique inchangé.
        // - `.edit` : `StoryRenderer.render` fournit un `contentHash` JSON
        //   exhaustif par élément, qui capture TOUTES les mutations possibles
        //   (fontSize, textColor, backgroundStyle…) — l'ancienne raison de
        //   passer `cache: nil` ici. Résultat : muter un élément ne recrée que
        //   SA layer ; les vidéos intouchées gardent la leur (AVPlayer compris)
        //   et continuent de jouer sans coupure, et un changement de géométrie
        //   sur un média RECONFIGURE sa layer in-place (impératif user
        //   2026-07-11 « la manipulation ne fait pas sauter les vidéos »).
        let cacheForRender: StoryRendererCache? = rendererCache
        if let cacheForRender {
            cacheForRender.invalidateIfNeeded(slideId: slide.id,
                                              languages: readerContext.preferredLanguages,
                                              mode: mode,
                                              renderSize: geometry.renderSize)
        }

        let rendered = StoryRenderer.render(slide: slide,
                                            into: geometry,
                                            at: currentTime,
                                            mode: mode,
                                            languages: readerContext.preferredLanguages,
                                            resolver: readerContext.postMediaURLResolver,
                                            imageCache: readerContext.imageCache,
                                            cache: cacheForRender,
                                            backdropProvider: { [weak backdropCapture] frame in
                                                backdropCapture?.cropRegion(frame)
                                            },
                                            suppressDrawingOverlay: isDrawingOverlayActive)
        for sub in rendered.sublayers ?? [] {
            itemsContainer.addSublayer(sub)
        }

        // Re-stamp l'état mute global sur les media layers fraîchement
        // (re-)attachées + sur le background layer. `StoryRenderer.renderItem`
        // et `StoryRenderer.renderBackground` n'ont pas accès à `isAudioMuted`
        // au moment de créer le layer ; sans cette passe, une vidéo (foreground
        // OU background) attachée après que l'utilisateur a tapé Mute en
        // sidebar jouerait son audio jusqu'au prochain toggle.
        // Re-stamp aussi l'intention de lecture foreground : une vidéo
        // foreground (re)créée pendant ce rebuild hérite de l'état « GO » courant
        // (`foregroundVideosPlaybackActive`) — elle ne démarre donc qu'en phase
        // avec la vidéo de fond + l'audio, jamais en avance dès l'attach.
        // `slidePlayheadSeconds` AVANT `isPlaybackActive` : si ce dernier flippe
        // true (didSet → calage timeline), le player se cale sur le playhead à
        // jour. Mis à jour à chaque rebuild (≈60 Hz en lecture) pour qu'un layer
        // qui attache/démarre tard rattrape la bonne position.
        let playheadSeconds = currentTime.seconds
        forEachMediaLayer {
            $0.slidePlayheadSeconds = playheadSeconds
            $0.isMuted = isAudioMuted
            $0.isPlaybackActive = foregroundVideosPlaybackActive
        }
        backgroundLayer.slidePlayheadSeconds = playheadSeconds
        backgroundLayer.isMuted = isAudioMuted

        // Prune le cache des layers dont l'id n'est plus présent dans la
        // slide (élément supprimé) — libère les AVPlayer associés.
        if let cacheForRender {
            var keepIds = Set<String>()
            slide.effects.textObjects.forEach { keepIds.insert($0.id) }
            (slide.effects.mediaObjects ?? []).forEach { keepIds.insert($0.id) }
            (slide.effects.stickerObjects ?? []).forEach { keepIds.insert($0.id) }
            cacheForRender.prune(keepIds: keepIds)
        }

        applyForegroundFrames()
        scheduleContentReadyEvaluation(for: bgKind)
        // Emit l'état initial de progression (généralement 0.0 hors color/gradient
        // qui passent immédiatement à backgroundContentReady=true via le path sync).
        recomputeContentProgress()
        reapplyInlineEditingIfNeeded()
        // Composer live preview : (re)démarre la lecture/boucle des vidéos en
        // `.edit` sur des layers fraîchement reconstruits. No-op hors composer.
        applyEditPlayback()
    }

    /// Trace un cadre autour des médias foreground (images / vidéos non-bg).
    /// Appliqué dans TOUS les modes — édition, preview ET viewer — car le cadre
    /// fait partie du rendu de la story, pas seulement une aide d'édition.
    ///
    /// Implémentation : on définit `borderWidth` / `borderColor` directement sur
    /// chaque sublayer (le `name` du layer == element id) plutôt qu'un overlay
    /// CAShapeLayer séparé. Ça suit les transformations / drag / pinch sans
    /// avoir besoin de re-synchroniser un layer supplémentaire à chaque tick.
    func applyForegroundFrames() {
        // Les textes ne reçoivent PAS de cadre permanent : le contour
        // rectangulaire entoure inutilement la chaîne de caractères et alourdit
        // le rendu (le glyph dessine déjà sa propre forme). Seuls les médias
        // visuels foreground (images / vidéos) gardent un cadre.
        let fgMediaIds = Set((slide.effects.mediaObjects ?? []).filter { !$0.isBackground }.map { $0.id })
        let fgTextIds: Set<String> = []

        // Cadre blanc franc. Le média se détache toujours du fond (slide
        // sombre, photo, dégradé) avec un liseré blanc — c'est le rendu
        // attendu pour un média foreground, façon photo encadrée.
        let frameColor: CGColor = UIColor.white.cgColor

        for sub in itemsContainer.sublayers ?? [] {
            guard let name = sub.name else { continue }
            if fgMediaIds.contains(name) || fgTextIds.contains(name) {
                sub.borderColor = frameColor
                sub.borderWidth = 2
                // `cornerRadius` n'est PAS écrasé ici : `StoryMediaLayer`
                // l'a déjà posé sur ce même layer. Le border CALayer suit
                // automatiquement ce rayon — bordure et image partagent donc
                // l'arrondi exact. `borderWidth`/`borderColor` étant portés
                // par le `StoryMediaLayer`, ils héritent de son `transform`
                // (rotation) et de sa `position` : le cadre reste solidaire
                // des déplacements et rotations du média.
            }
        }
    }

    /// Itère sur toutes les `StoryMediaLayer` du canvas (vidéos + images de
    /// fond), même celles dont l'`AVPlayer` n'est pas encore attaché. Utile
    /// pour propager un toggle de mute global : on stocke l'état sur la
    /// layer, qui le stampera sur le player dès `attachPlayer()` — ferme la
    /// fenêtre de course où un player fraîchement créé jouait audible le
    /// temps d'un cycle de display-link.
    func forEachMediaLayer(_ block: (StoryMediaLayer) -> Void) {
        for sub in itemsContainer.sublayers ?? [] {
            if let media = sub as? StoryMediaLayer {
                block(media)
            }
        }
    }

    /// Parses a `#RRGGBB` or `RRGGBB` hex string into a UIColor.
    /// Local helper; matches the logic used by StoryRenderer + StoryAVCompositor.
    nonisolated static func parseBackgroundHex(_ hex: String) -> UIColor? {
        var s = hex
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255,
                       green: CGFloat((v >> 8) & 0xff) / 255,
                       blue: CGFloat(v & 0xff) / 255,
                       alpha: 1)
    }
}
