import Foundation

// Extrait d'`OfflineQueue.swift` (#8350), hors budget : on extrait d'abord,
// on ajoute ensuite — ici, la protection des médias mis en file.

extension OfflineMessageQueueing {
    /// Shim de compatibilité source pour les appelants antérieurs au sticker
    /// (#4823) : même signature qu'avant l'ajout de `sticker` à l'exigence,
    /// délègue avec `sticker: nil`. Sur l'extension du PROTOCOLE, pas sur
    /// l'implémentation concrète : un mock voit toujours passer la valeur.
    @discardableResult
    public func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        try await enqueueMedia(
            sourceMediaURLs: sourceMediaURLs,
            kinds: kinds,
            conversationId: conversationId,
            content: content,
            clientMessageId: clientMessageId,
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId,
            sticker: nil,
            deletesSourceFiles: deletesSourceFiles,
            createdAt: createdAt,
            protection: .none
        )
    }

    /// Shim des appelants antérieurs à la protection (#8350) : un partage ou
    /// un transfert n'arme aucune protection.
    @discardableResult
    public func enqueueMedia(
        sourceMediaURLs: [URL],
        kinds: [String],
        conversationId: String,
        content: String?,
        clientMessageId: String,
        originalLanguage: String?,
        replyToId: String?,
        forwardedFromId: String?,
        forwardedFromConversationId: String?,
        copyAttachmentsFromClientMessageId: String?,
        sticker: MessageSticker?,
        deletesSourceFiles: Bool,
        createdAt: Date?
    ) async throws -> OfflineQueue.EnqueueMediaResult {
        try await enqueueMedia(
            sourceMediaURLs: sourceMediaURLs,
            kinds: kinds,
            conversationId: conversationId,
            content: content,
            clientMessageId: clientMessageId,
            originalLanguage: originalLanguage,
            replyToId: replyToId,
            forwardedFromId: forwardedFromId,
            forwardedFromConversationId: forwardedFromConversationId,
            copyAttachmentsFromClientMessageId: copyAttachmentsFromClientMessageId,
            sticker: sticker,
            deletesSourceFiles: deletesSourceFiles,
            createdAt: createdAt,
            protection: .none
        )
    }
}
