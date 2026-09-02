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

    /// Le côté long de l'image qui peint la bande.
    ///
    /// Trente-deux pixels, **et c'est ce nombre qui fait le flou**. Étirée à la
    /// taille du canvas, une image de cette finesse est lissée par le
    /// rééchantillonnage de CoreAnimation : pas de `CIFilter`, pas de rendu
    /// hors écran, pas de passe de flou. C'est aussi, à peu de chose près, la
    /// taille qu'un ThumbHash décodé produit — les deux sources rendent donc le
    /// même grain, ce qui évite qu'une bande change d'aspect selon qu'elle a
    /// été peinte avant ou après le chargement du bitmap.
    static let letterboxFillLongEdge: CGFloat = 32

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

        let source = StoryLetterboxFill.source(
            hasStampedBitmap: letterboxSourceImage != nil, hashes: hashes)
        guard StoryLetterboxFill.isServed(fitMode: transform3D.videoFitMode,
                                          hasSource: source != .none),
              let image = fillImage(for: source)
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

    @MainActor
    private func fillImage(for source: StoryLetterboxFill.Source) -> CGImage? {
        switch source {
        case .stampedBitmap:
            return letterboxSourceImage.flatMap(Self.downsampledForFill)?.cgImage
        case .thumbHash(let hash):
            return ThumbHashDecoder.decodeIfAvailable(hash)?.cgImage
        case .none:
            return nil
        }
    }

    /// Réduit le bitmap de fond au grain de la bande.
    ///
    /// Le redimensionnement est ce qui produit le flou ET ce qui borne le coût :
    /// poser le bitmap PLEIN sur la bande donnerait une bande NETTE — une
    /// seconde copie de la photo, à côté d'elle, ce que personne ne demande —
    /// et retiendrait une image de plusieurs mégaoctets par canvas monté.
    static func downsampledForFill(_ image: UIImage) -> UIImage? {
        let cote = max(image.size.width, image.size.height)
        guard cote > 0 else { return nil }
        let facteur = min(1, letterboxFillLongEdge / cote)
        let taille = CGSize(width: max(1, image.size.width * facteur),
                            height: max(1, image.size.height * facteur))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: taille, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: taille))
        }
    }

    /// **La bande se repeint au moment où la MATIÈRE arrive.**
    ///
    /// Le bitmap de fond est chargé de façon ASYNCHRONE : au premier
    /// `configure`, il n'existe pas, et la bande n'aurait que le hachage — celui
    /// que l'atelier, justement, n'a pas. Repeindre au stamp est ce qui la rend
    /// visible dans le composer, c'est-à-dire là où le porteur l'a demandée.
    @MainActor
    func noteStampedBackground(_ display: UIImage) {
        letterboxSourceImage = display
        refreshLetterboxFillAfterFitChange()
    }

    /// Le chemin RAPIDE de `configure(...)` — celui qui garde le contenu en
    /// place quand seul le mode d'ajustement change (double-tap de l'auteur) —
    /// et le moment où le bitmap final vient d'être stampé.
    ///
    /// Ni l'un ni l'autre ne repasse par la branche qui connaît les hachages ;
    /// c'est pour cela que `letterboxFillHashes` les retient. Sans cette
    /// mémoire, basculer en AJUSTÉ depuis le double-tap aurait laissé les
    /// bandes nues, alors que les rouvrir par un rebuild complet les aurait
    /// peintes — deux résultats pour un même geste, selon un chemin que
    /// l'auteur ne voit pas.
    @MainActor
    func refreshLetterboxFillAfterFitChange() {
        refreshLetterboxFill(hashes: letterboxFillHashes)
    }
}
