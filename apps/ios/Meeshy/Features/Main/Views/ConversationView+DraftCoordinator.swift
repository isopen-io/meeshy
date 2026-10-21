import SwiftUI
import MeeshySDK

// MARK: - Le brouillon de la conversation : sauvegarde et reprise
//
// Extrait de `ConversationView.swift` (cohésion). Le brouillon a UNE
// responsabilité — ce que l'on garde de la rédaction en cours quand l'app est
// tuée en pleine phrase, et ce que l'on en rend à l'ouverture. La vue reste
// propriétaire de `composerState` et du modèle de texte : elle les remet au
// coordinateur (valeur en lecture pour sauvegarder, `inout` pour reprendre).

struct ConversationDraftCoordinator {
    let viewModel: ConversationViewModel
    let isDirect: Bool
    let participantUserId: String?

    /// Ce que la reprise rend à la vue : le composeur repeint, et les pièces dont
    /// la vue régénère les vignettes (hors du MainActor, #7006) — `nil` quand le
    /// brouillon n'en portait aucune.
    struct Restoration {
        let composerState: ConversationComposerState
        let media: (attachments: [MessageAttachment], files: [String: URL])?
    }

    /// Persist the whole compose state (text, inline reply, selected language,
    /// effects, blur, ephemeral duration) so the user never loses context when
    /// the app is killed mid-sentence. Empty drafts are purged from
    /// `UserDefaults` by `DraftStore.save(_:for:)`.
    func persist(text: String, attachmentRefs: [DraftAttachmentRef]? = nil, composerState: ConversationComposerState) {
        let ref = composerState.pendingReplyReference
        // Les refs de pièces jointes sont l'autorité du handler background
        // (copie durable) : une frappe intermédiaire les PRÉSERVE au lieu de
        // les écraser — sinon chaque lettre tapée perdrait les pièces du
        // brouillon persisté.
        let refs = attachmentRefs
            ?? DraftStore.shared.load(for: viewModel.conversationId)?.attachments
        let draft = MessageDraft.composing(
            text: composerState.persistedDraftText(composing: text),
            reply: ref,
            selectedLanguage: composerState.selectedLanguage,
            effectFlags: viewModel.pendingEffects.flags.rawValue,
            isBlurEnabled: viewModel.isBlurEnabled,
            ephemeralDurationRawValue: viewModel.ephemeralChoice?.storageValue,
            attachments: (refs?.isEmpty ?? true) ? nil : refs
        )
        DraftStore.shared.save(draft, for: viewModel.conversationId)
    }

    /// Copie durable des pièces jointes du tray au passage en background,
    /// puis re-save du brouillon avec leurs références. Rebuild complet à
    /// chaque background : une pièce retirée du tray ne ressuscite jamais.
    func persistAttachmentsForBackground(text: String, composerState: ConversationComposerState) {
        guard let userId = AuthManager.shared.currentUser?.id else { return }
        let refs = MessageDraftMediaStore.persist(
            attachments: composerState.pendingAttachments, files: composerState.pendingMediaFiles,
            assetLinks: composerState.libraryAssetLinks,
            userId: userId,
            conversationId: viewModel.conversationId
        )
        persist(text: text, attachmentRefs: refs, composerState: composerState)
    }

    /// Rend au composer le brouillon enregistré, s'il y en a un et que le champ
    /// est encore vide. La vue reste propriétaire de `composerState` : elle le
    /// remet en lecture et n'écrit que si une reprise a eu lieu (`nil` ⇒ rien à
    /// écrire, aucune invalidation inutile à chaque `onAppear`).
    func restore(from current: ConversationComposerState, composerText: ConversationComposerTextModel) -> Restoration? {
        guard composerText.text.isEmpty, let draft = DraftStore.shared.load(for: viewModel.conversationId) else { return nil }
        var composerState = current
        composerText.text = draft.text
        // La citation du brouillon revient telle qu'on l'a laissée —
        // sans écraser une réponse à une story qui vient d'ouvrir la
        // conversation, et jamais une story hors du DM de son auteur (#7883).
        if composerState.pendingReplyReference == nil {
            composerState.pendingReplyReference = draft.restoredReply(conversationIsDirect: isDirect, participantUserId: participantUserId)
        }
        if let lang = draft.selectedLanguage {
            composerState.selectedLanguage = lang
        }
        if draft.effectFlags != 0 {
            viewModel.pendingEffects.flags = MessageEffectFlags(rawValue: draft.effectFlags)
        }
        if draft.isBlurEnabled {
            viewModel.isBlurEnabled = true
        }
        if let raw = draft.ephemeralDurationRawValue,
           let choice = EphemeralChoice(storageValue: raw) {
            viewModel.ephemeralChoice = choice
        }
        // Pièces jointes du brouillon (copiées en durable au
        // background) : restaure les survivantes dans le tray —
        // un fichier purgé est sauté silencieusement, le texte
        // reste intact. Vignettes régénérées HORS du MainActor (#7006).
        guard let refs = draft.attachments, !refs.isEmpty,
              composerState.pendingAttachments.isEmpty,
              let userId = AuthManager.shared.currentUser?.id else {
            return Restoration(composerState: composerState, media: nil)
        }
        let restored = MessageDraftMediaStore.restore(
            refs: refs,
            userId: userId,
            conversationId: viewModel.conversationId
        )
        composerState.adoptRestoredDraft(attachments: restored.attachments, files: restored.files,
                                         assetLinks: MessageDraftMediaStore.assetLinks(of: refs, restored: restored.attachments.map(\.id)))
        return Restoration(composerState: composerState, media: (restored.attachments, restored.files))
    }
}
