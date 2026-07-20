import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Gestures

extension StoryCanvasUIView {
    /// `true` quand un gesture pan/pinch/rotate est en cours sur un item.
    /// Indique au parent SwiftUI (`StoryCanvasRepresentable.updateUIView`) que
    /// la vérité de `slide` est temporairement dans UIKit ; les mutations
    /// parent doivent être différées jusqu'à la fin du geste pour éviter
    /// scintillement et conflits de réécriture.
    public var isGestureActive: Bool { manipulatedItemId != nil }

    func setupGesturesAll() {
        panRecognizer = UIPanGestureRecognizer(target: self, action: #selector(handlePan(_:)))
        pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch(_:)))
        rotationRecognizer = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation(_:)))
        singleTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleSingleTap(_:)))
        singleTapRecognizer.numberOfTapsRequired = 1
        doubleTapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap(_:)))
        doubleTapRecognizer.numberOfTapsRequired = 2
        // Le single-tap n'émet qu'après l'échec du double-tap pour éviter
        // qu'un double-tap déclenche deux fois le format panel (open puis
        // open-via-double). Pattern UIKit standard.
        singleTapRecognizer.require(toFail: doubleTapRecognizer)
        canvasZoomPinchRecognizer = ThreeFingerPinchGestureRecognizer(
            target: self,
            action: #selector(handleCanvasZoomPinch(_:))
        )
        for recognizer: UIGestureRecognizer in [panRecognizer, pinchRecognizer, rotationRecognizer, singleTapRecognizer, doubleTapRecognizer, canvasZoomPinchRecognizer] {
            recognizer.delegate = self
            addGestureRecognizer(recognizer)
        }
        addInteraction(UIPointerInteraction(delegate: self))
        addInteraction(UIContextMenuInteraction(delegate: self))
    }

    @objc func handleSingleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit, recognizer.state == .ended else { return }
        let location = recognizer.location(in: self)
        guard let id = hitTestItem(at: location), let kind = itemKind(forId: id) else {
            // Tap sur une zone vide du canvas pendant l'édition de texte en
            // place → sortie de l'édition (déclencheur nº2 de la spec). `endEditing`
            // résigne le `StoryInlineTextEditor`, ce qui déclenche
            // `textViewDidEndEditing` → `onInlineTextEditEnded`.
            if inlineEditingTextId != nil {
                endEditing(true)
            } else {
                onBackgroundTapped?()
            }
            return
        }
        // Sémantique tactile : le tap simple ramène l'élément touché au
        // premier plan (`bringForegroundToFront`) puis le sélectionne via
        // `onItemTapped`. Le double-tap reste réservé à l'édition dédiée
        // (cropper image / éditeur vidéo). `bringForegroundToFront` est un
        // no-op si l'élément est déjà au sommet ou si c'est un média de fond.
        bringForegroundToFront(id: id)
        onItemTapped?(id, kind)
    }

    @objc func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
        guard mode == .edit, recognizer.state == .ended else { return }
        let location = recognizer.location(in: self)

        // Sortie GESTUELLE du zoom viewport (C4) : zoomé + double-tap sur une
        // zone sans item foreground → reset (convention photo-viewer). Le
        // cycle videoFitMode ci-dessous reste le double-tap fond à l'échelle 1 ;
        // un double-tap sur un ITEM garde son édition dédiée même zoomé.
        if CanvasViewportZoomPolicy.doubleTapResetsViewport(
            isViewportZoomed: isViewportZoomed,
            hitItemId: hitTestItem(at: location)
        ) {
            onViewportZoomResetRequested?()
            return
        }

        // Background double-tap → cycle videoFitMode (auto → fit → fill → auto).
        // Use `resolveManipulationTarget` to honour the active manipulation
        // layer (so a tap on the bg in `.background` layer triggers the cycle
        // even when no foreground item is hit). Foreground items still get
        // their dedicated double-tap handling below via `hitTestItem`.
        if let bgId = backgroundMediaObjectId,
           resolveManipulationTarget(at: location) == bgId,
           hitTestItem(at: location) == nil {
            let current = slide.effects.backgroundTransform?.videoFitMode
            let next: String?
            switch current {
            case nil:    next = "fit"
            case "fit":  next = "fill"
            case "fill": next = nil
            default:     next = nil
            }
            var updated = slide
            var bg = updated.effects.backgroundTransform ?? StoryBackgroundTransform()
            bg.videoFitMode = next
            updated.effects.backgroundTransform = bg.isIdentity ? nil : bg
            slide = updated
            onItemModified?(slide)
            onBackgroundTransformChanged?(bg)
            return
        }

        guard let id = hitTestItem(at: location), let kind = itemKind(forId: id) else { return }
        onItemDoubleTapped?(id, kind)
    }

    func itemKind(forId id: String) -> CanvasItemKind? {
        if slide.effects.textObjects.contains(where: { $0.id == id }) { return .text }
        if (slide.effects.mediaObjects ?? []).contains(where: { $0.id == id }) { return .media }
        if (slide.effects.stickerObjects ?? []).contains(where: { $0.id == id }) { return .sticker }
        return nil
    }

    @objc func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
        guard mode == .edit else { return }
        // Garde-fou : ce recognizer est dédié au pinch 2 doigts (élément ou
        // fond). Si trois doigts sont posés, c'est le `canvasZoomPinch` qui
        // doit prendre la main — on annule pour éviter le double zoom
        // (élément ET viewport).
        if recognizer.numberOfTouches >= 3 {
            recognizer.state = .cancelled
            return
        }
        switch recognizer.state {
        case .began:
            // Routage par couche : `.canvas` absorbe (recognizer cancelled),
            // `.background` cible le bg media, `.foreground` hit-teste les fg
            // (avec fallback bg si le doigt ne touche aucun foreground).
            //
            // Unification BG ↔ FG (2026-05-29) : le bg media est dans
            // `mediaObjects[]` avec `isBackground: true`, donc `currentScale`
            // / `updateScale` fonctionnent déjà pour lui. On utilise donc
            // EXACTEMENT le même flow que les items foreground (mute
            // mediaObjects[bg].scale via updateScale, le mini-preview et le
            // reader voient le changement live via @Binding/slide.didSet,
            // updateManipulatedItemLayer route le bg vers backgroundLayer
            // pour le rendu live sur le canvas principal).
            guard let id = resolveManipulationTarget(at: recognizer.location(in: self)) else {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            baseScale = currentScale(forId: id) ?? 1.0
            if id != backgroundMediaObjectId {
                bringForegroundToFront(id: id)
            }
        case .changed:
            guard let id = manipulatedItemId else { return }
            let newScale = max(0.3, min(4.0, baseScale * Double(recognizer.scale)))
            slide = updateScale(slideId: id, scale: newScale)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    /// Pinch à 3 doigts → relaie l'échelle au composer pour piloter le zoom
    /// du viewport. Ne mute pas la slide (le viewport est un état SwiftUI).
    @objc func handleCanvasZoomPinch(_ recognizer: ThreeFingerPinchGestureRecognizer) {
        guard mode == .edit else { return }
        onCanvasZoomScaleChanged?(recognizer.scale, recognizer.state)
    }

    @objc func handleRotation(_ recognizer: UIRotationGestureRecognizer) {
        guard mode == .edit else { return }
        switch recognizer.state {
        case .began:
            guard let id = resolveManipulationTarget(at: recognizer.location(in: self)) else {
                recognizer.state = .cancelled
                return
            }
            // Rotation interdite sur le background media — user feedback
            // 2026-05-27 « la rotation du media doit etre … bloqués sur les
            // background ». Les 2-doigts pour pan+pinch firent souvent une
            // rotation accidentelle non désirée sur le fond. Le foreground
            // reste rotable (intent explicite).
            if id == backgroundMediaObjectId {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            baseRotation = currentRotation(forId: id) ?? 0
            bringForegroundToFront(id: id)
        case .changed:
            guard let id = manipulatedItemId else { return }
            // Sensibilité rotation divisée par 2 — user feedback 2026-05-27 :
            // la rotation 1:1 (chaque degré de doigt = 1° sur l'élément) était
            // trop sensible et difficile à contrôler avec précision. Le user
            // peut quand même tourner à 360° en faisant 2 tours avec les
            // doigts, ce qui reste raisonnable pour un geste manuel.
            let degrees = (Double(recognizer.rotation) * 180 / .pi) * 0.5
            slide = updateRotation(slideId: id, rotation: baseRotation + degrees)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    @objc func handlePan(_ recognizer: UIPanGestureRecognizer) {
        guard mode == .edit else { return }
        let location = recognizer.location(in: self)
        switch recognizer.state {
        case .began:
            guard let id = resolveManipulationTarget(at: location),
                  let (sx, sy) = currentItemNormalizedPosition(forId: id) else {
                recognizer.state = .cancelled
                return
            }
            manipulatedItemId = id
            dragStartSlideX = sx
            dragStartSlideY = sy
            lastBgSnapX = nil
            lastBgSnapY = nil

            // Bring-to-front au touch : couvre tap simple ET début de drag.
            // Skip pour le background media (toujours derrière les fg) — le
            // helper filtre déjà mais on est explicite ici pour la lisibilité.
            if id != backgroundMediaObjectId {
                bringForegroundToFront(id: id)
            }
        case .changed:
            guard let id = manipulatedItemId, bounds.size != .zero else { return }
            let translation = recognizer.translation(in: self)
            // Projection écran → normalisé alignée sur la projection design→render
            // utilisée par `StoryRenderer.renderItem` (cf. `updateManipulatedItemLayer`).
            // - x reste linéaire sur la largeur du canvas
            // - y est mappé sur `1920 * scaleFactor` pour rester cohérent quand
            //   le canvas n'a pas un ratio exactement 9:16.
            let geo = CanvasGeometry(renderSize: bounds.size)
            // Hauteur design projetée à l'écran pour CE canvas (9:16 → 1920×scale,
            // 16:9 → 607.5×scale) — même base que la projection des layers, donc
            // le geste écran→normalisé round-trip quel que soit le ratio du canvas.
            let renderHeightForDesign = geo.render(geo.designHeight)
            let dxNorm = Double(translation.x / bounds.width)
            let dyNorm = Double(translation.y / renderHeightForDesign)

            // Unification BG/FG (2026-05-29) : updatePosition mute
            // mediaObjects[bg].x/y qui est lu par le converter bgTransform de
            // rebuildLayers et appliqué via applyContentTransform sur le
            // contentLayer du bg.
            //
            // Sensibilité réduite (× 0.5) pour le pan BG : le geste s'applique
            // au repositionnement d'une image qui couvre déjà tout le canvas,
            // donc un déplacement 1:1 du doigt à la position normalisée est
            // trop sensible pour ajuster finement le cadrage (user feedback
            // 2026-05-29 : « avec une faible sensibilité »).
            //
            // Snap de CADRAGE (directive user 2026-07-14) : contrairement au
            // foreground (rails 0.18/0.25/0.5/0.75/0.82), le bg s'accroche au
            // centre (0.5) et aux bords (0.0/1.0) — « centrer ou coller la
            // bordure que l'utilisateur approche ». Guides + haptic à l'entrée.
            if id == backgroundMediaObjectId {
                let rawX = clamp(dragStartSlideX + dxNorm * 0.5)
                let rawY = clamp(dragStartSlideY + dyNorm * 0.5)
                let (snappedX, didSnapX) = snapBackground(rawX)
                let (snappedY, didSnapY) = snapBackground(rawY)
                noteBackgroundSnap(x: didSnapX ? snappedX : nil,
                                   y: didSnapY ? snappedY : nil)
                updateSnapGuides(x: didSnapX ? snappedX : nil,
                                 y: didSnapY ? snappedY : nil)
                slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
                onItemModified?(slide)
                return
            }

            let rawX = clamp(dragStartSlideX + dxNorm)
            let rawY = clamp(dragStartSlideY + dyNorm)
            let (snappedX, didSnapX) = snap(rawX)
            let (snappedY, didSnapY) = snap(rawY)
            updateSnapGuides(x: didSnapX ? snappedX : nil,
                             y: didSnapY ? snappedY : nil)
            slide = updatePosition(slideId: id, x: snappedX, y: snappedY)
            onItemModified?(slide)
        case .ended, .cancelled, .failed:
            manipulatedItemId = nil
            lastBgSnapX = nil
            lastBgSnapY = nil
            hideSnapGuides()
            slideContentRevision &+= 1
            rebuildLayers()
        default:
            break
        }
    }

    nonisolated func snap(_ value: Double) -> (snapped: Double, didSnap: Bool) {
        for target in Self.snapTargets where abs(value - target) < Self.snapTolerance {
            return (target, true)
        }
        return (value, false)
    }

    /// Snap du CADRAGE d'arrière-plan : ramène la position normalisée vers le
    /// centre (0.5) ou un bord (0.0 / 1.0) quand l'utilisateur s'en approche.
    /// Pure et `nonisolated` pour être testable sans monter de vue.
    nonisolated func snapBackground(_ value: Double) -> (snapped: Double, didSnap: Bool) {
        for target in Self.backgroundSnapTargets where abs(value - target) < Self.backgroundSnapTolerance {
            return (target, true)
        }
        return (value, false)
    }

    /// Émet un tap haptique léger UNIQUEMENT à l'entrée dans une nouvelle zone
    /// de snap (transition), pour matérialiser l'accroche magnétique sans
    /// vibrer en continu tant que le doigt reste dans la zone.
    func noteBackgroundSnap(x: Double?, y: Double?) {
        if x != lastBgSnapX || y != lastBgSnapY {
            if (x != nil && x != lastBgSnapX) || (y != nil && y != lastBgSnapY) {
                HapticFeedback.light()
            }
        }
        lastBgSnapX = x
        lastBgSnapY = y
    }

    func updateSnapGuides(x: Double?, y: Double?) {
        // Désactive les actions implicites de CoreAnimation (fade in / out de
        // contents) pour éviter tout scintillement quand on recrée les guides
        // à chaque tick de drag. Voir spec § 2.5 A.4.a.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        defer { CATransaction.commit() }
        hideSnapGuides()
        guard bounds.size != .zero else { return }
        if let x {
            let line = makeGuideLine(verticalAt: CGFloat(x) * bounds.width,
                                     length: bounds.height,
                                     vertical: true)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
        if let y {
            let line = makeGuideLine(verticalAt: CGFloat(y) * bounds.height,
                                     length: bounds.width,
                                     vertical: false)
            editOverlayLayer.addSublayer(line)
            snapGuideLayers.append(line)
        }
    }

    func hideSnapGuides() {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        snapGuideLayers.forEach { $0.removeFromSuperlayer() }
        snapGuideLayers.removeAll()
        CATransaction.commit()
    }

    func makeGuideLine(verticalAt offset: CGFloat,
                               length: CGFloat,
                               vertical: Bool) -> CAShapeLayer {
        let path = UIBezierPath()
        if vertical {
            path.move(to: CGPoint(x: offset, y: 0))
            path.addLine(to: CGPoint(x: offset, y: length))
        } else {
            path.move(to: CGPoint(x: 0, y: offset))
            path.addLine(to: CGPoint(x: length, y: offset))
        }
        let line = CAShapeLayer()
        line.path = path.cgPath
        line.strokeColor = UIColor.systemPink.cgColor
        line.lineWidth = 1
        line.lineDashPattern = [4, 4]
        line.fillColor = UIColor.clear.cgColor
        return line
    }

    /// During an active gesture (pan/pinch/rotate), update only the manipulated
    /// item's CALayer transform instead of rebuilding all layers. This keeps
    /// drag/resize fluid even with many layers on canvas.
    func updateManipulatedItemLayer() {
        guard let id = manipulatedItemId else { return }
        let bounds = self.bounds
        guard bounds.size != .zero else { return }

        // Background media : pas dans itemsContainer mais dans
        // `backgroundLayer`. On apply le transform au contentLayer interne
        // via `applyContentTransform`, miroir exact du chemin que prend le
        // converter `bgTransform` lors d'un rebuildLayers complet.
        //
        // Unification BG/FG (2026-05-29) : le bg passe par les mêmes
        // updateScale/updatePosition/updateRotation que les items FG (qui
        // mutent `mediaObjects[bg]`), donc les valeurs lues ici viennent de
        // la même source de vérité que le mini-preview et le reader.
        if id == backgroundMediaObjectId,
           let bg = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            let live = BackgroundTransform(
                scale: bg.scale,
                offsetX: (bg.x - 0.5) * Double(bounds.width),
                offsetY: (bg.y - 0.5) * Double(bounds.height),
                rotation: bg.rotation,
                videoFitMode: slide.effects.backgroundTransform?.videoFitMode
            )
            backgroundLayer.applyContentTransform(live.caTransform())
            return
        }

        guard let layer = itemsContainer.sublayers?.first(where: { $0.name == id }) else { return }

        // Position dans le même référentiel que `StoryRenderer.renderItem` :
        // - x  est mappé en `media.x * renderWidth` (linéaire sur la largeur)
        // - y  est mappé en `media.y * 1920 * scaleFactor` où scaleFactor est
        //   `renderWidth / 1080` → c'est la projection design→render utilisée
        //   par `StoryMediaLayer.configure`. Sans cet alignement, la layer
        //   sautait au release du drag : updateManipulatedItemLayer plaçait via
        //   `bounds.height * y` (qui ≠ 1920*scaleFactor*y dès que bounds.height
        //   ≠ 16/9 × bounds.width, ce qui arrive systématiquement quand la
        //   safe area top/bottom est non-nulle).
        let geo = CanvasGeometry(renderSize: bounds.size)
        func renderPosition(x: Double, y: Double) -> CGPoint {
            let designX = geo.designLength(forNormalized: CGFloat(x))
            let designY = geo.designHeightLength(forNormalized: CGFloat(y))
            return geo.render(CGPoint(x: designX, y: designY))
        }

        // Read the current model values for this item
        if let media = slide.effects.mediaObjects?.first(where: { $0.id == id }) {
            // Alignement strict sur `StoryMediaLayer.configure` : scale cuit
            // dans `bounds` (base × scale), transform = rotation only.
            // L'ancien chemin posait `transform = scale × rotation` sur des
            // `bounds` déjà × scale (depuis le dernier configure), ce qui
            // double-scale dès le 2e geste sur le même media → bug
            // "media grossit après rotation puis pan" (2026-05-27). Même
            // pattern que la branche text plus bas qui ne pose que la
            // rotation parce que scale est déjà cuit dans fontSize.
            let baseDesign = StoryMediaLayer.baseMediaDesignSize(aspectRatio: media.aspectRatio)
            let scaledDesign = CGSize(width: baseDesign.width * CGFloat(media.scale),
                                      height: baseDesign.height * CGFloat(media.scale))
            let renderedSize = geo.render(scaledDesign)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            if layer.bounds.size != renderedSize {
                layer.bounds = CGRect(origin: .zero, size: renderedSize)
            }
            layer.position = renderPosition(x: media.x, y: media.y)
            let rotation = CGFloat(media.rotation * .pi / 180)
            layer.transform = CATransform3DMakeRotation(rotation, 0, 0, 1)
            CATransaction.commit()
        } else if let text = slide.effects.textObjects.first(where: { $0.id == id }) {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.position = renderPosition(x: text.x, y: text.y)
            // Échelle LIVE pendant le pinch (user 2026-07-11 « le zoom/dézoom
            // de texte doit être rendu en temps réel ») : le scale d'un texte
            // est CUIT dans `fontSize` au configure (`text.fontSize ×
            // text.scale`, cf. StoryTextLayer) — la layer restait donc FIGÉE à
            // sa taille d'avant-geste, seul le rebuild `.ended` montrait la
            // nouvelle taille. On applique un ratio transitoire (scale modèle
            // courant / scale cuit lu sur `StoryTextLayer.textObject`) par-
            // dessus la rotation ; hors geste le ratio vaut 1 (pas de
            // double-scale — régression 2026-05-27 toujours couverte) et le
            // rebuild de fin de geste re-rend les glyphes NETS à la taille
            // finale.
            let bakedScale = (layer as? StoryTextLayer)?.textObject?.scale ?? text.scale
            layer.transform = Self.liveTextGestureTransform(rotationDegrees: text.rotation,
                                                            modelScale: text.scale,
                                                            bakedScale: bakedScale)
            CATransaction.commit()
        } else if let sticker = slide.effects.stickerObjects?.first(where: { $0.id == id }) {
            // Alignement strict sur `StoryStickerLayer.configure` : scale cuit
            // dans bounds (baseSide × scale), transform = rotation only.
            // Mêmes raisons que la branche media — éviter le double-scale au
            // 2e geste sur le même sticker.
            let designSide = CGFloat(sticker.baseSize * sticker.scale)
            let renderedSide = geo.render(designSide)
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            let newBounds = CGRect(x: 0, y: 0, width: renderedSide, height: renderedSide)
            if layer.bounds.size != newBounds.size {
                layer.bounds = newBounds
            }
            layer.position = renderPosition(x: sticker.x, y: sticker.y)
            let rotation = CGFloat(sticker.rotation * .pi / 180)
            layer.transform = CATransform3DMakeRotation(rotation, 0, 0, 1)
            CATransaction.commit()
        }
    }

    /// Transform de geste LIVE d'un texte : rotation modèle + ratio d'échelle
    /// transitoire (scale modèle courant ÷ scale cuit dans le rendu au dernier
    /// configure). L'échelle uniforme commute avec la rotation 2D — l'ordre de
    /// composition est donc indifférent. `bakedScale` ≤ 0 (layer jamais
    /// configurée, données corrompues) → rotation seule, jamais de division
    /// invalide. Pure et `nonisolated` pour être testable sans monter de vue.
    nonisolated static func liveTextGestureTransform(rotationDegrees: Double,
                                                     modelScale: Double,
                                                     bakedScale: Double) -> CATransform3D {
        let rotation = CATransform3DMakeRotation(CGFloat(rotationDegrees * .pi / 180), 0, 0, 1)
        guard bakedScale > 0, modelScale > 0 else { return rotation }
        let ratio = CGFloat(modelScale / bakedScale)
        return CATransform3DScale(rotation, ratio, ratio, 1)
    }

    func hitTestItem(at point: CGPoint) -> String? {
        // Itération manuelle des layers NOMMÉES par zPosition décroissant :
        // `CALayer.hitTest` natif ignore les zPosition ET se fait avaler par
        // les overlays pleine-toile sans nom (layer de DESSIN, zPosition
        // 9999) — dès qu'un dessin existait, plus AUCUN item n'était
        // touchable et le pan retombait sur le fond (bug user 2026-07-11).
        let named = (itemsContainer.sublayers ?? []).enumerated()
            .filter { !($0.element.name ?? "").isEmpty }
            .sorted {
                if $0.element.zPosition != $1.element.zPosition {
                    return $0.element.zPosition > $1.element.zPosition
                }
                return $0.offset > $1.offset
            }
        for (_, layer) in named where layer.hitTest(point) != nil {
            return layer.name
        }
        return nil
    }

    /// Hit-test qui exclut explicitement les médias `isBackground == true`.
    /// Utilisé en mode `.foreground` pour empêcher la manipulation du fond
    /// quand au moins un foreground est posé sur la slide.
    func hitTestForegroundItem(at point: CGPoint) -> String? {
        guard let id = hitTestItem(at: point) else { return nil }
        if let media = slide.effects.mediaObjects?.first(where: { $0.id == id }),
           media.isBackground == true {
            return nil
        }
        return id
    }
}
