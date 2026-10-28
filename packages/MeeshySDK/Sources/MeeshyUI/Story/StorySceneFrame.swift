import Foundation
import MeeshySDK

/// **Le CADRE de la scène — règles pures, hors du viewmodel** : ce que le fond
/// fait au canvas (le remplit-il ?) et la forme qu'il lui impose (aucune). Le
/// composeur les lit ; elles ne dépendent que des effets de la scène.
nonisolated enum StorySceneFrame {

    /// Résolution pure (testable) : un fond visuel remplit le canvas sauf en
    /// mode `"fit"`. Le double-tap du fond cycle `nil` (auto = aspectFill) →
    /// `"fit"` (aspectFit) → `"fill"` (aspectFill) — seul `"fit"` laisse des
    /// bandes vides. Le fit-mode du fond vit sur `backgroundTransform`.
    static func backgroundFillsCanvas(for effects: StoryEffects) -> Bool {
        guard effects.resolvedBackgroundMedia != nil else { return false }
        return effects.backgroundTransform?.videoFitMode != "fit"
    }

    /// **La SCÈNE est figée en 9:16 — le fond n'impose plus sa forme
    /// (directive porteur, 2026-08-31).**
    ///
    /// Elle suivait le ratio CONTINU du fond, clampé à [9/21, 21/9] : « l'import
    /// du fond impose le cadre et forme du Canvas » (directive du 2026-07-14).
    /// Une photo paysage donnait donc un canvas 16:9 — ce que le porteur a
    /// mesuré sur capture, là où toutes les planches du document montrent une
    /// scène verticale.
    ///
    /// **Ce que la règle d'avant coûtait, au-delà de la forme** : le canvas
    /// changeait de proportion SOUS la composition. Un texte posé sur une scène
    /// verticale se retrouvait ailleurs dès qu'on ajoutait un fond paysage, et
    /// l'outil de dessin traçait sur un cadre qui n'était plus celui de la carte
    /// (#4515). Une scène qui change de forme n'est plus une scène : c'est un
    /// cadre qui suit son contenu, quand c'est au contenu de trouver sa place
    /// dans le cadre.
    ///
    /// `nil` veut dire « portrait 9:16 » — la valeur par défaut de
    /// `StoryCanvasAspect.from(ratio:)`. On n'écrit donc pas un nombre : **on
    /// s'abstient d'en imposer un**, ce qui laisse le défaut du modèle décider.
    ///
    /// Ce qui est déjà PUBLIÉ garde son ratio : cette règle ne gouverne que ce
    /// qui se compose maintenant. Et le média qui ne remplit pas la scène laisse
    /// des bandes — elles se peignent, elles ne restent pas noires.
    static func canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double? {
        nil
    }
}
