import SwiftUI
import PhotosUI
import MeeshySDK

// Extrait de `ConversationView.swift` (3 029 lignes, hors budget 800-1100 de
// la directive 2026-08-28, qui interdit d'AJOUTER à un fichier hors budget).
// Le lot #4823 ajoute une porte de présentation à cet état : on extrait
// d'abord, on ajoute ensuite. Responsabilité tenue ici : l'ÉTAT du composer
// de conversation — pièces en attente, pickers, lieu, langue, réponse et
// édition — et rien d'autre. Les vues qui le lisent restent chez elles.

struct ConversationComposerState {
    /// Plafond de sélection média du composer de conversation.
    ///
    /// Relevé de 10 à 199 (2026-08-14). Le planner ne découpe PAS par lot :
    /// `MultiAttachmentSendPlanner` produit UNE bulle par type (audio /
    /// visuel), donc 199 photos restent un seul message — la montée de plafond
    /// ne multiplie pas les bulles, elle lève juste la contrainte de saisie.
    /// L'envoi lui-même est borné par la concurrence d'upload, pas par ce
    /// nombre (cf. `TusUploadManager.maxConcurrent`).
    ///
    /// Cette dernière phrase n'est vraie que depuis le 2026-08-16 : la boucle
    /// d'upload attendait chaque fichier avant de lancer le suivant, donc le
    /// pool de l'acteur ne dépassait jamais un actif et 199 photos partaient
    /// l'une après l'autre. `sendMessageWithAttachments` confie désormais le
    /// groupe entier au manager, qui borne réellement.
    static let maxMediaSelection = 199

    var showOptions = false
    var actionAlert: String? = nil
    var forwardMessage: Message? = nil
    /// **Transfert groupé (#4005).** Vide pour les DEUX sites d'ouverture
    /// historiques (longpress simple, swipe) — `forwardMessage` seul porte
    /// alors tout. Non vide UNIQUEMENT depuis le mode sélection multiple :
    /// `endSelectionMode()`-adjacent, posée puis effacée avec
    /// `forwardMessage` par le MÊME `onDismiss` de la feuille.
    var forwardAdditionalMessages: [Message] = []
    /// La cible de « Composer » — le média reçu que la porte va semer.
    /// Non-nil = la porte est présentée.
    var composeMediaTarget: ComposableMessageTarget? = nil
    /// La même cible, RETENUE le temps qu'une feuille se referme.
    ///
    /// Le second déclencheur de « Composer » vit dans la feuille de transfert,
    /// et présenter un plein écran pendant qu'une feuille se démonte est la
    /// course que ce dépôt a déjà payée (« Attempt to present … which is
    /// already presenting »). La promotion se fait donc dans l'`onDismiss` de
    /// la feuille — la primitive SwiftUI prévue pour ce cas exact, là où un
    /// délai n'est qu'un pari.
    var pendingComposeTarget: ComposableMessageTarget? = nil
    var showConversationInfo = false

    // Popup consentement vocal à l'envoi d'audio (2026-07-08) : proposé UNE
    // fois par session de conversation ; quelle que soit la décision, l'envoi
    // repart — le refus envoie l'audio sans transcription/traduction.
    var showVoiceAutoTranslateConsent = false
    var voiceConsentPromptedThisSession = false
    
    // Attachment state
    var pendingAttachments: [MessageAttachment] = []
    var pendingMediaFiles: [String: URL] = [:]
    var pendingThumbnails: [String: UIImage] = [:]
    var isLoadingMedia = false

    /// In-flight attachment preparations (decompression → compression →
    /// thumbnailing → ThumbHash). Each entry renders an `AttachmentLoadingTile`
    /// in the composer tray until it transitions to `.ready`, at which point
    /// the result is moved into `pendingAttachments`/`pendingMediaFiles`/
    /// `pendingThumbnails` and the handle is dropped from this array.
    var preparingAttachments: [PreparingAttachment] = []
    
    // Pickers
    var showPhotoPicker = false
    var showCamera = false
    var showFilePicker = false
    var selectedPhotoItems: [PhotosPickerItem] = []
    /// True while `selectedPhotoItems` is being primed with the recent-media
    /// strip's multi-selection before presenting the PhotosPicker. Priming
    /// fires the selection onChange once — this flag swallows that echo so
    /// items are only ingested when the user actually confirms in the picker.
    var photoPickerPriming = false
    
    // Location & Upload
    var isLoadingLocation = false
    var isUploading = false
    var uploadProgress: UploadQueueProgress? = nil
    var showLocationPicker = false
    /// Lieu choisi via le picker, en attente d'envoi. `SharedPlace` porte le
    /// nom et l'adresse — `MessageAttachment.location` ne les portait pas et
    /// n'est plus le véhicule (Task 11/12, 2026-07-29).
    var pendingPlace: SharedPlace? = nil
    
    // Language (source language for outgoing messages).
    // Resolved via DefaultComposerLanguage: keyboard layout > "fr" fallback.
    // TextAnalyzer overrides this once the user types enough characters.
    var selectedLanguage: String = DefaultComposerLanguage.resolve()

    // Reply & Edit
    var pendingReplyReference: ReplyReference? = nil
    var editingMessageId: String? = nil
    var editingOriginalContent: String? = nil
    /// **Le brouillon en cours au moment d'entrer en édition (#4003).** Sans
    /// lui, `beginEdit` écrase silencieusement ce que l'auteur était en train
    /// de composer, et `cancelEdit`/`submitEdit` ne pouvaient rien restituer.
    /// Posé UNE fois par `beginEdit` (jamais réécrit tant qu'une édition est
    /// en cours), consommé et effacé par `cancelEdit`.
    var draftBeforeEdit: String? = nil

    // Reply attachment preview
    var previewMedia: PreviewMedia? = nil

    // Misc Pickers
    var showContactPicker = false
    var showTextEmojiPicker = false
    var emojiToInject = ""
    /// Palette de stickers (#4823) — présentée en feuille depuis la tuile
    /// « Sticker » du carrousel ; ce qu'elle rend part comme un MESSAGE (voir
    /// `ConversationView+Sticker.swift`), jamais dans le champ de texte.
    var showStickerPicker = false
}

extension ConversationComposerState {
    /// Replaces the audio attachment `attachmentId` in place with the freshly
    /// edited recording. Editing a media attachment must never spawn a second
    /// tray chip — this mirrors the image editor's replace-by-id contract
    /// (`pendingAttachments[idx] = …`). Returns the now-stale audio file URL so
    /// the caller can delete it from disk.
    @discardableResult
    mutating func applyEditedAudio(attachmentId: String, editedURL: URL, durationMs: Int) -> URL? {
        let staleURL = pendingMediaFiles[attachmentId]
        let duration = max(durationMs, 500)
        pendingMediaFiles[attachmentId] = editedURL
        if let index = pendingAttachments.firstIndex(where: { $0.id == attachmentId }) {
            pendingAttachments[index] = MessageAttachment(
                id: attachmentId,
                mimeType: "audio/mp4",
                duration: duration,
                channels: 2,
                thumbnailColor: pendingAttachments[index].thumbnailColor
            )
        } else {
            pendingAttachments.append(
                MessageAttachment(id: attachmentId, mimeType: "audio/mp4", duration: duration, channels: 2)
            )
        }
        return staleURL == editedURL ? nil : staleURL
    }
}
