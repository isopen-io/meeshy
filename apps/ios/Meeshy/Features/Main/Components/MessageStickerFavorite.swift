import Foundation
import MeeshySDK
import MeeshyUI

/// **La décoration d'un MESSAGE, vue depuis la palette** (directive porteur
/// 2026-09-05 : « permettre de pouvoir ajouter dans favoris par long-press sur
/// les stickers dans les composers ET messages »).
///
/// ## Le pont, et pourquoi il est une RÈGLE et non deux lignes au site d'appel
///
/// Deux modèles décrivent la même chose sans se connaître :
///
/// | | ce qu'il porte | où il vit |
/// |---|---|---|
/// | `MessageSticker` | `templateId` · `slots` · `emoji` (repli) | ce qui a été ENVOYÉ |
/// | `StickerUsageEntry` | `kind` · `value` | ce que la palette RETIENT |
///
/// La traduction tient en trois lignes, et c'est justement pourquoi elle se
/// recopierait : le menu d'un message, la bulle, et demain la vue Focal la
/// referaient chacun. La ligne qui compte est la PRIORITÉ — un gabarit porte
/// AUSSI un emoji de repli (`StickerTemplate.fallbackEmoji`), donc lire l'emoji
/// en premier épinglerait « 📍 » là où l'auteur a envoyé une carte postale.
///
/// > C'est le même piège que le rendu : `FocalRow` documente que le bloc
/// > sticker doit passer AVANT l'emoji-only, « le repli servi à la place de la
/// > chose, alors que la chose est disponible ». La mémoire a exactement le
/// > même ordre à tenir, et rien ne l'aurait rappelé au second site.
nonisolated enum MessageStickerFavorite {

    /// **Ce qu'un message-sticker met en favori — `nil` si ce n'est pas un
    /// sticker.**
    ///
    /// `nil` gouverne l'ABSENCE de l'entrée de menu, pas son grisé : un message
    /// texte n'a pas de décoration à épingler, et une entrée inerte
    /// promettrait (loi 4).
    static func entry(for sticker: MessageSticker?) -> StickerUsageEntry? {
        guard let sticker else { return nil }
        // Le GABARIT d'abord : il porte aussi un emoji de repli, et le lire en
        // premier épinglerait le repli à la place de la chose.
        if let id = sticker.templateId, !id.isEmpty {
            return StickerUsageEntry(kind: .template, value: id)
        }
        guard let emoji = sticker.emoji, !emoji.isEmpty else { return nil }
        return .emoji(emoji)
    }

    /// **L'état à servir au menu — `nil` ⇒ pas d'entrée.**
    ///
    /// Le tri-état de `MessageMenuContext.stickerFavorite` se compose ici et
    /// pas au site d'appel : deux hôtes montent ce menu (`ConversationView` a
    /// DEUX constructions de contexte), et la question « est-ce un sticker, et
    /// est-il déjà épinglé ? » a une seule réponse.
    @MainActor
    static func state(for sticker: MessageSticker?,
                      in store: StickerUsageStore = .shared) -> Bool? {
        guard let entree = entry(for: sticker) else { return nil }
        return store.isFavorite(entree)
    }

    /// Épingle ou dépingle la décoration du message. Sans décoration, ne fait
    /// rien — le geste ne peut pas être offert dans ce cas, et un no-op ici est
    /// la ceinture de la règle qui l'en empêche.
    @MainActor
    static func toggle(for sticker: MessageSticker?,
                       in store: StickerUsageStore = .shared) {
        guard let entree = entry(for: sticker) else { return }
        store.toggleFavorite(entree)
    }
}
