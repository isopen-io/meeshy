import QuartzCore
import UIKit

/// La fenêtre de défilement d'un texte en édition en place, hors de
/// `StoryCanvasUIView` : elle ne lit que la calque qu'on lui confie.
@MainActor
enum StoryInlineEditMask {

    /// Aligne le FOND du texte (solide, glass, losange, bulle — peint par la
    /// calque, pas par le champ) sur la fenêtre de défilement.
    ///
    /// Les sous-calques de fond sont dimensionnés dans `StoryTextLayer
    /// .configure()` à partir de `bounds` ; les muter après coup ne les
    /// redimensionne pas. Un texte plus haut que la zone garderait donc un fond
    /// sortant de l'écran sous un champ borné. `StoryTextLayer` n'utilise jamais
    /// `self.mask` (seulement `backdrop.mask` sur son sous-calque de glass),
    /// la propriété est libre.
    static func apply(to layer: StoryTextLayer, visibleHeight: CGFloat) {
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
}
