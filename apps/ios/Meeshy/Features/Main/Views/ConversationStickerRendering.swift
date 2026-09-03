// apps/ios/Meeshy/Features/Main/Views/ConversationStickerRendering.swift
//
// Sorti de `ConversationView+Sticker.swift` (#4947) : le chemin d'ENVOI y tient
// en ≤ 300 lignes (garde `ConversationStickerSendGuardTests`) et le RENDU d'un
// sticker en image est une responsabilité à part — pure, testée par
// `ConversationStickerRenderingTests`, sans lien avec la vue.

import SwiftUI
import os
import MeeshySDK
import MeeshyUI

// MARK: - Rendu d'un sticker en image

/// **Ce qu'un lecteur VOIT d'un sticker de conversation** (#4823, moitié ENVOI).
///
/// Le fil transporte deux choses : un PNG — pièce jointe image ORDINAIRE, la
/// seule que voit un lecteur qui ne sait pas dessiner un gabarit — et, à côté,
/// `MessageSticker`, qui dit ce que l'image REPRÉSENTE pour qu'un lecteur
/// capable la redessine en vectoriel. Ce type produit le PNG ; il est PUR
/// (une entrée, une image) pour que les tests le mesurent sans simulateur.
///
/// Trois entrées, trois formes :
/// - un EMOJI se rasterise seul, centré dans un carré transparent — pas
///   `StoryStickerRasterizer`, dont l'image colle au glyphe et dont le cache
///   NSCache n'a rien à faire d'un rendu qui ne sert qu'une fois ;
/// - un GABARIT passe par `StickerTemplateRenderer`, le MÊME moteur que la
///   scène et la vignette de palette (exigence #4110) — la mesure d'abord, pour
///   ramener un cartouche long sous le côté maximal sans le tronquer ;
/// - un LIEU décoré remplit ses emplacements comme `StoryLocationLayer`, repli
///   « Ici » compris, puis suit le chemin du gabarit.
enum ConversationStickerRendering {

    /// Côté du carré emoji, en points — assez pour rester net dans une bulle
    /// à 2× sans peser plus qu'une vignette.
    static let emojiSide: CGFloat = 256
    /// Corps du glyphe : il remplit le carré en laissant l'air qu'Apple laisse
    /// autour de ses propres emojis dans Messages.
    static let emojiFontSize: CGFloat = 200
    /// Côté maximal d'un gabarit rendu, en points.
    static let templateMaxSide: CGFloat = 512
    /// Échelle de rasterisation FIXE : le PNG voyage vers d'autres appareils,
    /// son échelle ne doit pas dépendre de l'écran de l'auteur.
    static let renderScale: CGFloat = 2

    /// Le PNG d'un sticker emoji — carré, transparent, `nil` pour une chaîne
    /// vide (rien à peindre, donc rien à envoyer).
    static func emojiImage(_ emoji: String) -> UIImage? {
        let glyphe = emoji.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !glyphe.isEmpty else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.opaque = false
        format.scale = renderScale
        let côté = emojiSide
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: côté, height: côté), format: format)
        let attributed = NSAttributedString(string: glyphe,
                                            attributes: [.font: UIFont.systemFont(ofSize: emojiFontSize)])
        let mesure = attributed.size()
        let origine = CGPoint(x: (côté - mesure.width) / 2, y: (côté - mesure.height) / 2)
        return renderer.image { _ in attributed.draw(at: origine) }
    }

    /// Le PNG d'un gabarit, ou `nil` si ce binaire ne sait pas le dessiner —
    /// l'appelant choisit alors son repli (l'emoji du gabarit), comme la scène.
    static func templateImage(templateID: String, slots: [String: String]) -> UIImage? {
        let base = StickerTemplateMetrics.preview(side: templateMaxSide)
        guard let mesure = StickerTemplateRenderer.measuredSize(templateID: templateID, slots: slots, metrics: base),
              mesure.width > 0, mesure.height > 0 else { return nil }
        // Un cartouche mesure son contenu : un nom de lieu long dépasse le
        // côté visé. Les mesures sont proportionnelles au corps, donc réduire
        // le corps du même rapport ramène la boîte sous le plafond.
        let plusLong = max(mesure.width, mesure.height)
        let metrics = plusLong > templateMaxSide
            ? StickerTemplateMetrics.preview(side: templateMaxSide * (templateMaxSide / plusLong))
            : base
        guard let rendu = StickerTemplateRenderer.image(templateID: templateID, slots: slots,
                                                        metrics: metrics, screenScale: renderScale),
              let image = rendu.0, rendu.1.width > 0, rendu.1.height > 0 else { return nil }
        return fitted(image, size: rendu.1, maxSide: templateMaxSide)
    }

    /// La mesure d'un cartouche n'est pas strictement proportionnelle au corps
    /// (marges fixes, pliage du texte) : réduire le corps du même rapport laisse
    /// parfois quelques points au-dessus du plafond. Le plafond se GARANTIT
    /// donc sur l'image rendue, par une réduction proportionnelle finale — un
    /// PNG de sticker n'a aucune raison de dépasser le côté visé.
    static func fitted(_ image: UIImage, size: CGSize, maxSide: CGFloat) -> UIImage {
        let plusLong = max(size.width, size.height)
        guard plusLong > maxSide else { return image }
        let ratio = maxSide / plusLong
        let cible = CGSize(width: (size.width * ratio).rounded(.down), height: (size.height * ratio).rounded(.down))
        let format = UIGraphicsImageRendererFormat()
        format.scale = renderScale
        format.opaque = false
        return UIGraphicsImageRenderer(size: cible, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: cible))
        }
    }

    /// Les emplacements d'un gabarit de LIEU — même dépouillement que la
    /// scène (`StickerSlotFiller.placeSlots`), même repli localisé « Ici » que
    /// `StoryLocationLayer` pour un lieu sans nom ni adresse.
    static func locationSlots(for place: SharedPlace) -> [String: String] {
        var emplacements = StickerSlotFiller.placeSlots(for: place)
        if (emplacements[StickerSlotFiller.placeNameSlot] ?? "").isEmpty {
            emplacements[StickerSlotFiller.placeNameSlot] = StoryLocationLayer.resolvedLabel(for: place)
        }
        return emplacements
    }
}
