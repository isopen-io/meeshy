import UIKit
import QuartzCore
import MeeshySDK

/// **Le câblage du remplissage de bande** — la règle vit dans
/// `StoryLetterboxFill`, ce fichier ne fait que la poser sur un `CALayer`.
///
/// Il est SÉPARÉ de `StoryBackgroundLayer.swift` pour une raison arithmétique :
/// ce fichier tenait 1069 lignes, et le budget du dépôt s'arrête à 1100
/// (`CLAUDE.md` § Code Style). Y ajouter une responsabilité de plus aurait
/// franchi la borne — on extrait d'abord, on ajoute ensuite.
extension StoryBackgroundLayer {

    /// (Ré)installe la bande sous le contenu, ou la retire.
    ///
    /// **Sous le contenu, toujours** : `insertSublayer(at: 0)`. Le média, lui,
    /// est ajouté par `addSublayer` et se retrouve donc au-dessus quoi qu'il
    /// arrive — y compris l'`AVPlayerLayer`, attaché plus tard et par un autre
    /// chemin. Un ordre qui dépendrait de l'ordre des appels aurait fini par
    /// peindre le flou PAR-DESSUS la vidéo, un jour, sans que rien ne rougisse.
    ///
    /// **Et sans le transform du contenu** : le pinch/pan de l'auteur agit sur
    /// le média (`applyContentTransform` ne touche que `contentLayer` et
    /// `avPlayerLayer`). La bande, elle, habille le CANVAS : elle doit rester
    /// collée à ses bords pendant que le média bouge dedans.
    @MainActor
    func refreshLetterboxFill(hashes: [String]) {
        letterboxFillLayer?.removeFromSuperlayer()
        letterboxFillLayer = nil
        letterboxFillHashes = hashes

        let hash = hashes.first
        guard StoryLetterboxFill.isServed(fitMode: transform3D.videoFitMode, hash: hash),
              let premier = hashes.first(where: {
                  ThumbHashDecoder.decodeIfAvailable($0) != nil
              }),
              let image = ThumbHashDecoder.decodeIfAvailable(premier)?.cgImage
        else { return }

        let fill = CALayer()
        fill.frame = bounds
        fill.contents = image
        // `.resizeAspectFill` : la bande doit être PLEINE. Un `.resizeAspect`
        // y laisserait ses propres bandes — un letterbox dans un letterbox.
        fill.contentsGravity = .resizeAspectFill
        fill.masksToBounds = true
        fill.opacity = StoryLetterboxFill.fillOpacity
        Self.withDisabledCAActions {
            insertSublayer(fill, at: 0)
        }
        letterboxFillLayer = fill
    }

    /// Le chemin RAPIDE de `configure(...)` — celui qui garde le contenu en
    /// place quand seul le mode d'ajustement change (double-tap de l'auteur).
    ///
    /// Il ne repasse pas par la branche qui connaît les hachages ; c'est pour
    /// cela que `letterboxFillHashes` les retient. Sans cette mémoire, basculer
    /// en AJUSTÉ depuis le double-tap aurait laissé les bandes nues, alors que
    /// les rouvrir par un rebuild complet les aurait peintes — deux résultats
    /// pour un même geste, selon un chemin que l'auteur ne voit pas.
    @MainActor
    func refreshLetterboxFillAfterFitChange() {
        refreshLetterboxFill(hashes: letterboxFillHashes)
    }
}
