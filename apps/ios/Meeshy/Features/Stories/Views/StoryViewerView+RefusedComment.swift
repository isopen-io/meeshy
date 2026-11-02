import SwiftUI
import MeeshyUI

/// **Un commentaire de story que la file refuse n'est pas perdu** (#9743,
/// audit M1) — extrait de `StoryViewerView+Content.swift`, hors budget.
///
/// Ni envoyé ni confié à la file (bascule de compte en cours, base non
/// prouvée), il revient dans le brouillon de SA story, texte et pièce, et le
/// composeur se rouvre dessus.
extension StoryViewerView {

    func returnRefusedStoryComment(storyId: String, text: String, medias: [PendingCommentMedia]) {
        HapticFeedback.error()
        CommentSendTrace.log("story : refusé par la file — texte et \(medias.count) pièce(s) rendus au composeur")
        storyDrafts[storyId] = StoryRefusedComment.draft(text: text, medias: medias, at: Date())
        isComposerEngaged = true
        if !text.isEmpty { emojiToInject = text }
        composerFocusTrigger = true
    }
}

/// La règle, sans état.
enum StoryRefusedComment {
    static func draft(text: String, medias: [PendingCommentMedia], at date: Date) -> StoryDraft {
        StoryDraft(text: text, attachments: medias.map(CommentComposerStaging.attachment(from:)), refusedAt: date)
    }
}
