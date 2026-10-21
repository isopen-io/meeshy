import SwiftUI
import UIKit
import MeeshySDK

// MARK: - StoryComposerViewModel + Stickers and places

extension StoryComposerViewModel {
    /// Pose une pastille de lieu en BAS de slide, centrée (brief T20) — hors
    /// timeline : elle reste visible tant que la slide l'est. Écrit dans
    /// `currentEffects`, la seule source de vérité (et la seule unité persistée
    /// / envoyée au serveur). Décalage en cascade comme les stickers pour que
    /// deux lieux successifs ne se superposent pas exactement.
    /// - Parameter styleId: le gabarit qui DÉCORE la pastille (#4717). `nil`
    ///   rend la pastille d'origine, au pixel près — c'est le cas de la porte
    ///   canonique du lieu, qui n'a pas à choisir une décoration.
    /// `public` depuis le #4579 : la palette de constructions du composer
    /// unifié — qui vit dans l'APP — pose des lieux décorés. Son voisin
    /// `addSticker` l'était déjà pour la même raison.
    @discardableResult
    public func addLocation(place: SharedPlace, styleId: String? = nil) -> StoryLocationObject {
        let offset = Double(currentEffects.locationObjects.count % 5) * 0.04
        let badge = StoryLocationObject(place: place, x: 0.5, y: 0.8 - offset,
                                        sourceLanguage: declaredContentLanguage,
                                        styleId: styleId)
        var effects = currentEffects
        effects.locationObjects.append(badge)
        currentEffects = effects
        selectedElementId = badge.id
        bringToFront(id: badge.id)
        return currentEffects.locationObjects.first { $0.id == badge.id } ?? badge
    }

    func removeLocation(id: String) {
        var effects = currentEffects
        effects.locationObjects.removeAll { $0.id == id }
        currentEffects = effects
        if selectedElementId == id { selectedElementId = nil }
    }

    /// C13 — les stickers suivent le modèle moderne : `currentEffects` est la
    /// SEULE source de vérité (parité addText). L'ancien chemin @State View
    /// canvas-authored révertait les mutations VM/canvas au sync suivant.
    /// Décalage en cascade pour que des ajouts successifs ne s'empilent pas
    /// exactement au même point.
    @discardableResult
    /// - Parameter scale: l'échelle de POSE. `nil` garde le défaut du modèle
    ///   (taille de référence) ; les surfaces qui posent sur une scène passent
    ///   `StorySticker.posedScale`, à laquelle le sticker se voit d'emblée.
    public func addSticker(emoji: String,
                           provider: String? = nil,
                           scale: Double? = nil) -> StorySticker {
        let count = currentEffects.stickerObjects?.count ?? 0
        let offset = Double(count % 5) * 0.04
        var sticker = StorySticker(emoji: emoji, provider: provider,
                                   sourceLanguage: declaredContentLanguage,
                                   x: 0.5 + offset, y: 0.5 + offset)
        if let scale { sticker.scale = scale }
        var effects = currentEffects
        var stickers = effects.stickerObjects ?? []
        stickers.append(sticker)
        effects.stickerObjects = stickers
        currentEffects = effects
        // Sélectionné à la pose, comme une décoration (#4824) : la feuille se
        // referme sur le geste, et l'auteur doit retrouver ce qu'il vient de
        // poser sous ses poignées, pas le chercher.
        selectedElementId = sticker.id
        bringToFront(id: sticker.id)
        return currentEffects.stickerObjects?.first { $0.id == sticker.id } ?? sticker
    }

    /// **Pose une DÉCORATION** — un gabarit et ses emplacements déjà figés
    /// (#4716).
    ///
    /// Le placement, la cascade et le z-order sont ceux de `addSticker(emoji:)` :
    /// une décoration est un sticker, pas une sixième famille de scène.
    ///
    /// Deux choses lui sont propres :
    /// - **l'échelle vient du GABARIT**, jamais de `StorySticker.posedScale` —
    ///   ce 2,2 agrandit un glyphe nu, et ferait déborder un cartouche qui
    ///   mesure déjà son contenu ;
    /// - **l'emoji de repli est écrit ICI**, pas à la publication : un brouillon
    ///   relu par une version antérieure — qui ne sait rien du gabarit — doit
    ///   déjà montrer un glyphe. Même règle que le sticker image juste en
    ///   dessous.
    @discardableResult
    public func addSticker(template: StickerTemplate,
                           slots: [String: String]) -> StorySticker {
        let count = currentEffects.stickerObjects?.count ?? 0
        let offset = Double(count % 5) * 0.04
        var sticker = StorySticker(emoji: template.fallbackEmoji,
                                   templateId: template.id,
                                   slots: slots,
                                   sourceLanguage: declaredContentLanguage,
                                   x: 0.5 + offset, y: 0.5 + offset)
        sticker.scale = template.posedScale
        sticker.animation = template.animation
        var effects = currentEffects
        var stickers = effects.stickerObjects ?? []
        stickers.append(sticker)
        effects.stickerObjects = stickers
        currentEffects = effects
        selectedElementId = sticker.id
        bringToFront(id: sticker.id)
        return currentEffects.stickerObjects?.first { $0.id == sticker.id } ?? sticker
    }

    /// Pose une image de « Mes stickers ». Le placement, la cascade et le
    /// z-order restent ceux de `addSticker(emoji:)` — seule la charge diffère.
    ///
    /// Le bitmap est retenu sous l'id de l'ÉLÉMENT, dans `loadedImages` : c'est
    /// là que le composer tient tout média importé qu'aucun upload n'a encore
    /// adressé (`StoryMediaObject` naît avec un `postMediaId` vide et son
    /// bitmap sous `loadedImages[obj.id]`). Écrire un identifiant local dans
    /// `postMediaId` publierait une référence morte : la publication lit
    /// justement `postMediaId.isEmpty` pour savoir ce qui reste à téléverser.
    ///
    /// L'emoji de repli est écrit ICI, pas à la publication : un brouillon relu
    /// par une version antérieure — qui ne sait rien de l'image — doit déjà
    /// montrer un glyphe.
    /// - Parameter animatedData: les octets d'un GIF/APNG/WebP/HEICS collé
    ///   (#3956) — `nil` pour une image fixe, qui ne paie donc rien. Ils sont
    ///   retenus sous le MÊME id que le bitmap : la couche du canvas essaie les
    ///   octets d'abord et retombe sur l'image fixe quand il n'y en a pas.
    @discardableResult
    public func addSticker(image: UIImage,
                           provider: String,
                           scale: Double? = nil,
                           animatedData: Data? = nil) -> StorySticker {
        let sticker = addSticker(emoji: StorySticker.imageFallbackEmoji,
                                 provider: provider, scale: scale)
        registerLoadedImage(image, for: sticker.id)
        if let animatedData {
            registerLoadedStickerAnimation(animatedData, for: sticker.id)
        }
        return sticker
    }
}
