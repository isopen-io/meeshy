import UIKit
import QuartzCore
import MeeshySDK

// MARK: - Zone d'édition

/// Bande verticale (repère canvas) dans laquelle vit le texte en cours
/// d'édition : entre le bas du bouton « Terminé » et le haut des bulles
/// d'outils, marges comprises.
///
/// `nonisolated` sur le TYPE : le package pose `.defaultIsolation(MainActor
/// .self)` (SE-0466), qui rendrait la zone illisible depuis les règles pures et
/// depuis un test non isolé.
nonisolated struct StoryInlineEditZone: Equatable, Sendable {
    let top: CGFloat
    let bottom: CGFloat

    init(top: CGFloat, bottom: CGFloat) {
        self.top = top
        self.bottom = bottom
    }

    /// Jamais négative : des bornes croisées (panneau d'outil déplié plus haut
    /// que le top bar sur un très petit écran) donneraient sinon un clamp de
    /// hauteur absurde.
    var height: CGFloat { max(0, bottom - top) }
    var midY: CGFloat { (top + bottom) / 2 }
}

extension StoryCanvasUIView: UITextViewDelegate {

    /// Démarre l'édition du texte `textId`. Pendant l'édition, le texte
    /// REJOINT LE CENTRE DE LA ZONE d'édition par-dessus le canvas (convention
    /// story : le champ est toujours lisible, jamais sous le clavier ni collé à
    /// un bord, ni tourné) : la calque est recentrée SANS muter le modèle
    /// (`x`/`y`/`rotation` intacts) et un `StoryInlineTextEditor` est
    /// superposé dessus, glyphes de la calque masqués (son fond — solide,
    /// glass, losange, bulle… — reste visible et suit les changements de
    /// style en live). Le reste du canvas passe sous un ombrage. À la
    /// fermeture, le texte retrouve sa position réelle et le canvas sa
    /// luminosité.
    public func beginInlineTextEdit(textId: String) {
        guard inlineEditingTextId != textId,
              let textLayer = textLayer(forId: textId),
              let textObject = textLayer.textObject else { return }

        // Bascule directe d'un texte A vers un texte B (tap sur un autre texte
        // pendant l'édition) : A doit retrouver ses glyphes ET sa position
        // réelle immédiatement — sans ça il resterait centré/vidé jusqu'au
        // prochain `rebuildLayers()`.
        if let previousId = inlineEditingTextId,
           let previousLayer = self.textLayer(forId: previousId) {
            previousLayer.setGlyphsHidden(false)
            restoreLayerAfterEditing(previousLayer)
        }

        let editor = inlineEditor ?? StoryInlineTextEditor()
        editor.delegate = self
        if editor.superview == nil { addSubview(editor) }
        inlineEditor = editor
        inlineEditingTextId = textId

        centerLayerForEditing(textLayer)
        position(editor, over: textLayer)
        editor.apply(textObject: textObject, geometry: geometry, setText: true)
        // Garantit que l'éditeur a au moins la taille nécessaire pour
        // afficher son placeholder (l'auto-add part d'un texte vide donc
        // d'une calque bounds quasi-nulle).
        editor.sizeToFitTextContent(maxWidth: bounds.width * 0.88,
                                    maxHeight: inlineEditMaxHeight)
        // Ancrage APRÈS le dimensionnement : c'est la hauteur réelle du champ
        // qui décide si le fond de la calque doit être masqué à la fenêtre.
        anchorInlineEditing(layer: textLayer, editor: editor)
        textLayer.setGlyphsHidden(true)
        setInlineEditScrimVisible(true)
        editor.becomeFirstResponder()
    }

    /// Termine l'édition en place : retire le champ, restaure les glyphes et
    /// renvoie la calque à sa position/rotation réelles (celles du modèle,
    /// jamais mutées par le recentrage d'édition).
    public func endInlineTextEdit() {
        guard let id = inlineEditingTextId else { return }
        if let layer = textLayer(forId: id) {
            layer.setGlyphsHidden(false)
            restoreLayerAfterEditing(layer)
        }
        let editor = inlineEditor
        inlineEditor = nil
        // `inlineEditingTextId` est mis à nil AVANT `resignFirstResponder()` :
        // résigner déclenche un `textViewDidEndEditing` dont la guard sur
        // `inlineEditingTextId` échoue alors — ce qui évite un second
        // `onInlineTextEditEnded` ré-entrant.
        inlineEditingTextId = nil
        // Après la remise à nil : le fondu de sortie du scrim ne retire la
        // calque que si aucune édition n'a repris entre-temps.
        setInlineEditScrimVisible(false)
        editor?.resignFirstResponder()
        editor?.removeFromSuperview()
    }

    /// Hook appelé en fin de `rebuildLayers()` : la calque éditée vient d'être
    /// reconstruite à neuf (donc replacée à sa position modèle) — re-supprimer
    /// ses glyphes, la recentrer pour l'édition et re-synchroniser le style +
    /// la géométrie du champ (SANS réécrire la chaîne : le `UITextView`
    /// est la source de vérité du texte pendant l'édition).
    func reapplyInlineEditingIfNeeded() {
        guard let id = inlineEditingTextId,
              let textLayer = textLayer(forId: id) else { return }
        textLayer.setGlyphsHidden(true)
        centerLayerForEditing(textLayer)
        if let editor = inlineEditor, let textObject = textLayer.textObject {
            position(editor, over: textLayer)
            editor.apply(textObject: textObject, geometry: geometry, setText: false)
            // `position(_:over:)` aligne `editor.bounds = layer.bounds`. Si
            // le texte vient d'être vidé (backspace de tous les caractères)
            // la calque a des bounds quasi-nulles et le placeholder
            // serait clippé. `sizeToFitTextContent` rééquilibre les bounds
            // vers la taille du contenu (et du placeholder en empty).
            editor.sizeToFitTextContent(maxWidth: bounds.width * 0.88,
                                        maxHeight: inlineEditMaxHeight)
            anchorInlineEditing(layer: textLayer, editor: editor)
        }
    }

    /// Pose le bloc en édition (calque + champ) au CENTRE DE LA ZONE, et borne
    /// sa hauteur à celle de la zone (spec 2026-08-01).
    ///
    /// Le centre ne dépend plus de la hauteur du bloc : un texte neuf naît là où
    /// se trouvera un texte de trois lignes, donc la première frappe ne déplace
    /// plus rien. C'est ce qui donnait l'impression d'un champ « confondu avec
    /// les contrôleurs » à l'ouverture, puis d'une zone qui n'apparaissait qu'en
    /// tapant (règle précédente : `min(centre canvas, plafond − hauteur/2)`).
    ///
    /// La calque et le champ peuvent avoir des hauteurs différentes le temps
    /// d'un cycle — le champ grandit à la frappe, la calque au
    /// `rebuildLayers()` d'après — donc on mesure sur la PLUS HAUTE des deux.
    func anchorInlineEditing(layer: StoryTextLayer, editor: StoryInlineTextEditor) {
        let zone = inlineEditZone
        let centerY = Self.inlineEditCenterY(zone: zone, canvasMidY: bounds.midY)
        let visibleHeight = Self.inlineEditBlockHeight(
            natural: max(layer.bounds.height, editor.bounds.height),
            zoneHeight: zone?.height)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.position = CGPoint(x: bounds.midX, y: centerY)
        layer.transform = CATransform3DIdentity
        applyInlineEditMask(to: layer, visibleHeight: visibleHeight)
        CATransaction.commit()

        editor.transform = .identity
        editor.center = CGPoint(x: bounds.midX, y: centerY)
    }

    /// Marge entre le texte édité et chacune des deux bornes de la zone.
    static let inlineEditFloorGap: CGFloat = 12

    /// En deçà, la zone mesurée n'a pas de sens (clavier à moitié levé, bornes
    /// croisées) : on retombe sur le comportement historique plutôt que de
    /// tasser le texte dans quelques points.
    static let inlineEditMinimumZoneHeight: CGFloat = 44

    /// Opacité de l'ombrage posé sur le canvas pendant l'édition.
    static let inlineEditScrimAlpha: CGFloat = 0.45

    /// Centre vertical du bloc édité. Pure et testable hors fenêtre.
    ///
    /// Sans zone mesurée → centre du canvas, comportement historique (canvas de
    /// lecture, tests hors fenêtre, ouverture avant que le composer n'ait
    /// mesuré ses contrôleurs).
    nonisolated static func inlineEditCenterY(zone: StoryInlineEditZone?,
                                              canvasMidY: CGFloat) -> CGFloat {
        zone?.midY ?? canvasMidY
    }

    /// Hauteur VISIBLE du bloc édité. Pure et testable hors fenêtre.
    ///
    /// Sans zone mesurée → hauteur naturelle, croissance libre d'origine.
    nonisolated static func inlineEditBlockHeight(natural: CGFloat,
                                                  zoneHeight: CGFloat?) -> CGFloat {
        guard let zoneHeight else { return natural }
        return min(natural, zoneHeight)
    }

    /// Zone d'édition en repère canvas, ou `nil` tant que le composer n'a pas
    /// mesuré ses DEUX contrôleurs (ou que la vue n'est pas en fenêtre).
    ///
    /// `convert(_:from: nil)` absorbe le `scaleEffect`/`offset` que SwiftUI
    /// applique au conteneur du canvas.
    var inlineEditZone: StoryInlineEditZone? {
        guard window != nil,
              let ceiling = canvasY(fromGlobal: inlineEditCeilingGlobalY),
              let floor = canvasY(fromGlobal: inlineEditFloorGlobalY) else { return nil }
        let zone = StoryInlineEditZone(top: ceiling + Self.inlineEditFloorGap,
                                       bottom: floor - Self.inlineEditFloorGap)
        return zone.height >= Self.inlineEditMinimumZoneHeight ? zone : nil
    }

    // MARK: - Private

    /// Passe une ordonnée écran en repère canvas, ou `nil` si le composer n'a
    /// rien rapporté pour cette borne.
    private func canvasY(fromGlobal y: CGFloat) -> CGFloat? {
        guard y.isFinite, y < .greatestFiniteMagnitude else { return nil }
        return convert(CGPoint(x: 0, y: y), from: nil).y
    }

    /// Aligne le FOND du texte (solide, glass, losange, bulle — peint par la
    /// calque, pas par le champ) sur la fenêtre de défilement.
    ///
    /// Les sous-calques de fond sont dimensionnés dans `StoryTextLayer
    /// .configure()` à partir de `bounds` ; les muter après coup ne les
    /// redimensionne pas. Un texte plus haut que la zone garderait donc un fond
    /// sortant de l'écran sous un champ borné. `StoryTextLayer` n'utilise jamais
    /// `self.mask` (seulement `backdrop.mask` sur son sous-calque de glass),
    /// la propriété est libre.
    private func applyInlineEditMask(to layer: StoryTextLayer, visibleHeight: CGFloat) {
        guard layer.bounds.height > visibleHeight + 0.5 else {
            layer.mask = nil
            return
        }
        let window = CGRect(x: 0,
                            y: (layer.bounds.height - visibleHeight) / 2,
                            width: layer.bounds.width,
                            height: visibleHeight)
        // Ré-assigner la MÊME instance en masque la fait passer par un retrait
        // puis un ré-attachement côté Core Animation, dont le superlayer d'un
        // masque est déjà la calque masquée : on se contente de recadrer.
        if let existing = layer.mask {
            existing.frame = window
            return
        }
        let mask = CALayer()
        mask.backgroundColor = UIColor.white.cgColor
        mask.frame = window
        layer.mask = mask
    }

    /// Hauteur maximale offerte au champ : celle de la zone, ou aucune borne
    /// tant qu'elle n'est pas mesurée.
    private var inlineEditMaxHeight: CGFloat {
        inlineEditZone?.height ?? .greatestFiniteMagnitude
    }

    /// Fait apparaître ou disparaître l'ombrage. `opacity` porte l'état — les
    /// animations implicites d'une `CALayer` autonome donnent le fondu — et
    /// `isHidden` ne retombe qu'une fois le fondu de sortie terminé, sans quoi
    /// la sortie d'édition couperait net.
    private func setInlineEditScrimVisible(_ visible: Bool) {
        inlineEditScrimLayer.frame = bounds
        guard visible else {
            CATransaction.begin()
            CATransaction.setCompletionBlock { [weak self] in
                guard let self, self.inlineEditingTextId == nil else { return }
                self.inlineEditScrimLayer.isHidden = true
            }
            inlineEditScrimLayer.opacity = 0
            CATransaction.commit()
            return
        }
        inlineEditScrimLayer.isHidden = false
        inlineEditScrimLayer.opacity = 1
    }

    private func textLayer(forId id: String) -> StoryTextLayer? {
        itemsContainer.sublayers?
            .first { $0.name == id } as? StoryTextLayer
    }

    /// Recentre la calque et annule sa rotation pour la durée de l'édition —
    /// override PUREMENT visuel : le modèle (`x`, `y`, `rotation`) n'est pas
    /// touché, et `rebuildLayers()` replace toujours la calque depuis le modèle
    /// (d'où le re-recentrage dans `reapplyInlineEditingIfNeeded`).
    ///
    /// « Recentre » au sens de `inlineEditCenterY(zone:canvasMidY:)` : milieu de
    /// la zone d'édition, ou centre du canvas tant qu'aucune zone n'est mesurée.
    private func centerLayerForEditing(_ layer: StoryTextLayer) {
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.position = CGPoint(
            x: bounds.midX,
            y: Self.inlineEditCenterY(zone: inlineEditZone, canvasMidY: bounds.midY))
        layer.transform = CATransform3DIdentity
        CATransaction.commit()
    }

    /// Replace la calque à sa position/rotation réelles depuis son
    /// `textObject` — même projection design→render que
    /// `updateManipulatedItemLayer` / `StoryTextLayer.configure`.
    private func restoreLayerAfterEditing(_ layer: StoryTextLayer) {
        guard let textObject = layer.textObject else { return }
        let designX = geometry.designLength(forNormalized: CGFloat(textObject.x))
        let designY = geometry.designHeightLength(forNormalized: CGFloat(textObject.y))
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        // Hors édition il n'y a plus de fenêtre de défilement : la calque
        // retrouve son fond intégral.
        layer.mask = nil
        layer.position = geometry.render(CGPoint(x: designX, y: designY))
        layer.transform = CATransform3DMakeRotation(
            CGFloat(textObject.rotation) * .pi / 180, 0, 0, 1)
        CATransaction.commit()
    }

    /// Positionne le champ sur la calque : `bounds` + `center` + rotation.
    /// `center` (centre géométrique de la `UIView`) est dérivé de `position`
    /// (point d'ancrage de la calque) corrigé de l'`anchorPoint` — exact pour
    /// l'ancrage par défaut (0.5, 0.5) de tous les textes.
    private func position(_ editor: StoryInlineTextEditor, over layer: CALayer) {
        editor.transform = .identity
        editor.bounds = layer.bounds
        let anchor = layer.anchorPoint
        editor.center = CGPoint(
            x: layer.position.x + (0.5 - anchor.x) * layer.bounds.width,
            y: layer.position.y + (0.5 - anchor.y) * layer.bounds.height
        )
        let angle = atan2(layer.transform.m12, layer.transform.m11)
        if angle != 0 { editor.transform = CGAffineTransform(rotationAngle: angle) }
    }

    // MARK: - UITextViewDelegate

    public func textViewDidChange(_ textView: UITextView) {
        // A keystroke is user activity — wakes the idle-throttled edit clock
        // (issue #3906). See `noteEditInteraction()`.
        noteEditInteraction()
        let editor = textView as? StoryInlineTextEditor
        editor?.updatePlaceholderVisibility()
        // Croissance immédiate des bounds de l'éditeur pour englober tout
        // le texte tapé. Sans ça la nouvelle frappe restait clippée par
        // les bounds dérivés de la calque pré-saisie jusqu'au prochain
        // `rebuildLayers()` (qui arrive ~1 tick async après la
        // propagation viewModel → SwiftUI → updateUIView → slide.didSet).
        // Pendant ce gap, l'utilisateur voyait des mots disparaître ; le
        // resync visuel n'arrivait qu'après zoom/dezoom ou nouvelle frappe.
        let maxWidth = bounds.width * 0.88
        editor?.sizeToFitTextContent(maxWidth: maxWidth, maxHeight: inlineEditMaxHeight)
        guard let id = inlineEditingTextId else { return }
        // La croissance est symétrique autour du centre (`sizeToFitTextContent`
        // préserve `center`) : le ré-ancrage à chaque frappe garde le bloc au
        // milieu de la zone et réaligne le masque du fond sur la fenêtre de
        // défilement quand le texte vient de dépasser la hauteur de zone.
        if let editor, let layer = textLayer(forId: id) {
            anchorInlineEditing(layer: layer, editor: editor)
        }
        onInlineTextChanged?(id, textView.text ?? "")
    }

    public func textViewDidEndEditing(_ textView: UITextView) {
        guard let id = inlineEditingTextId else { return }
        onInlineTextEditEnded?(id)
    }
}
