import Foundation

extension MeeshyConversation {
    /// B1 — applies the Prisme Linguistique to `lastMessagePreview`.
    ///
    /// Twin of `resolveLastMessagePreview` in
    /// `packages/shared/utils/conversation-helpers.ts` — both platforms render
    /// the same row from the same REST payload, so any divergence here would
    /// show one account two different texts depending on the client.
    ///
    /// 1. Walk the viewer's preferred languages IN ORDER.
    /// 2. The original language competes at its own RANK: reaching it returns
    ///    the raw preview (the message already IS in that language).
    /// 3. Otherwise, return the first matching translation found in
    ///    `lastMessageTranslations`.
    /// 4. If no preferred language is served, return the original
    ///    `lastMessagePreview` (the message in its source language).
    ///
    /// **Critical Prisme rule**: never fall back to `translations.first`.
    /// The absence of a preferred-language translation means the content
    /// is already in that language OR no translation has been generated —
    /// surfacing an unrelated language would be worse than the original.
    ///
    /// `preferredLanguages` must be ordered: systemLanguage first, then
    /// regionalLanguage, then customDestinationLanguage. Empty/nil entries
    /// are tolerated and skipped.
    public func resolvedLastMessagePreview(preferredLanguages: [String]) -> String? {
        guard let translations = lastMessageTranslations, !translations.isEmpty else {
            return lastMessagePreview
        }
        // La descente elle-même vit dans `PrismTranslationResolver` — UNE
        // fonction, dont cette ligne de liste est une projection, comme la
        // citation (`APIMessageReplyTo.toReplyReference`). C'est la
        // réécriture de la boucle qui a produit trois familles divergentes.
        return PrismTranslationResolver.resolve(
            originalLanguage: lastMessageOriginalLanguage,
            translations: translations,
            preferredLanguages: preferredLanguages
        )?.text ?? lastMessagePreview
    }

    /// Vide TOUT ce que la ligne de liste dit du dernier message — ce lecteur
    /// n'en a plus AUCUN de visible ici.
    ///
    /// Le seul geste qui produit cet état est PERSONNEL (suppression pour soi
    /// ou purge d'historique portant sur le dernier message restant) : la
    /// conversation n'est pas supprimée, elle n'a simplement plus rien à
    /// montrer à ce lecteur. Le serveur le dit en posant `lastMessageId` à
    /// `null` sur `conversation:updated` (cf. `LastMessageIdentity`).
    ///
    /// Central, et non recopié dans chaque consommateur : la ligne dit bien
    /// plus que son texte — pastille de pièce jointe, nom d'expéditeur, épingle
    /// de position, et le libellé que `lastMessageSummaryKind` compose depuis
    /// les drapeaux éphémères. Un vidage PARTIEL est pire que pas de vidage :
    /// il laisse « Message expiré » ou une épingle décrire un message que le
    /// lecteur ne voit plus, ce qui se lit comme un bug plutôt que comme un
    /// résidu.
    ///
    /// `lastMessageAt` ne bouge délibérément PAS : il porte le RANG de la
    /// conversation dans la liste, une donnée GLOBALE
    /// (`Conversation.lastMessageAt`, non nullable en base) qu'un masquage
    /// personnel ne change pour personne. Un `GET /conversations` juste après
    /// rendrait exactement la valeur conservée ici — la reculer ferait plonger
    /// la ligne au fond de la liste jusqu'à la synchro suivante, qui la
    /// remonterait.
    ///
    /// Rend `false` quand il n'y avait déjà rien à vider, pour qu'un doublon
    /// d'événement ne republie pas la ligne.
    @discardableResult
    public mutating func clearLastMessage() -> Bool {
        let hadLastMessage = lastMessageId != nil
            || lastMessagePreview != nil
            || lastMessageTranslations != nil
            || lastMessageOriginalLanguage != nil
            || !lastMessageAttachments.isEmpty
            || lastMessageAttachmentCount != 0
            || lastMessageSenderName != nil
            || lastMessageSenderUserId != nil
            || lastMessageIsBlurred
            || lastMessageIsViewOnce
            || lastMessageExpiresAt != nil
            || lastMessageLocation != nil
            || lastMessageNature != nil
        guard hadLastMessage else { return false }

        lastMessageId = nil
        lastMessagePreview = nil
        lastMessageTranslations = nil
        lastMessageOriginalLanguage = nil
        lastMessageAttachments = []
        lastMessageAttachmentCount = 0
        lastMessageSenderName = nil
        lastMessageSenderUserId = nil
        lastMessageIsBlurred = false
        lastMessageIsViewOnce = false
        lastMessageExpiresAt = nil
        lastMessageLocation = nil
        lastMessageNature = nil
        return true
    }
}
