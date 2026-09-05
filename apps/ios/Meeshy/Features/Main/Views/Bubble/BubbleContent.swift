import Foundation
import MeeshySDK

/// Décrit ce que CE message doit rendre. Construit une fois par cellule,
/// puis lu par les sous-vues. Aucune sous-vue ne lit `MeeshyMessage` directement —
/// elles lisent `BubbleContent`. Cela garantit qu'un message simple ne paie
/// que pour ce qu'il affiche.
nonisolated struct BubbleContent: Equatable {
    enum Kind: Equatable {
        case standard
        case deleted
        case burned
        case ephemeralExpired
        /// System notice rendered as a centered capsule (no avatar, no L/R
        /// alignment) — e.g. the call-summary messages "Appel vidéo · 04:32".
        /// Driven by `messageSource == .system`.
        case system
    }

    enum Attachments: Equatable {
        case none
        case visualGrid([MeeshyMessageAttachment])    // images + videos
        /// One OR MORE audio tracks of the SAME message. A single track renders
        /// as the existing audio widget; two or more render as a horizontal
        /// `AudioCarouselView` (multi-track carousel — spec lot A4).
        case audio([MeeshyMessageAttachment])
        case nonMedia([MeeshyMessageAttachment])      // file + location
        /// Mixed content: any combination of visual + non-media + audio
        /// when more than one category is present. Mirrors legacy bubble
        /// rendering which composed visualMediaGrid + audio standalone +
        /// non-media attachments inside a single bubble. `audio` carries all
        /// audio tracks of the message (empty when the mix has no audio).
        case mixed(visual: [MeeshyMessageAttachment], audio: [MeeshyMessageAttachment], nonMedia: [MeeshyMessageAttachment])

        static func == (lhs: Attachments, rhs: Attachments) -> Bool {
            switch (lhs, rhs) {
            case (.none, .none):
                return true
            case (.visualGrid(let a), .visualGrid(let b)):
                guard a.map(\.id) == b.map(\.id) else { return false }
                return zip(a, b).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            case (.audio(let a), .audio(let b)):
                guard a.map(\.id) == b.map(\.id) else { return false }
                return zip(a, b).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            case (.nonMedia(let a), .nonMedia(let b)):
                return a.map(\.id) == b.map(\.id)
            case (.mixed(let av, let aa, let an), .mixed(let bv, let ba, let bn)):
                guard av.map(\.id) == bv.map(\.id),
                      aa.map(\.id) == ba.map(\.id),
                      an.map(\.id) == bn.map(\.id) else { return false }
                return zip(av, bv).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
                    && zip(aa, ba).allSatisfy { Self.attachmentsHaveSameState($0.0, $0.1) }
            default:
                return false
            }
        }

        /// Compares mutation-prone server-side fields that can change after initial delivery
        /// (thumbnail generation, blur reveal, view-once, per-image reactions, media metadata).
        /// Called only when IDs already match, so identity is not re-checked here.
        private static func attachmentsHaveSameState(
            _ a: MeeshyMessageAttachment,
            _ b: MeeshyMessageAttachment
        ) -> Bool {
            a.thumbnailUrl == b.thumbnailUrl
                && a.fileUrl == b.fileUrl
                && a.isBlurred == b.isBlurred
                && a.viewOnceCount == b.viewOnceCount
                && a.duration == b.duration
                && a.width == b.width
                && a.height == b.height
                && a.reactionSummary == b.reactionSummary
                && a.currentUserReactions == b.currentUserReactions
        }
    }

    struct Text: Equatable {
        let raw: String
        let isEmojiOnly: Bool
        let emojiFontSize: CGFloat?
        /// Première URL détectée dans `raw`, précalculée UNE fois par le builder
        /// (plutôt que jusqu'à 2× dans le body de chaque bulle texte). Le
        /// `NSDataDetector` sous-jacent est désormais partagé (static) côté
        /// `LinkPreviewFetcher`, donc plus d'instanciation par cellule au scroll.
        let firstLinkURL: String?
        /// Vidéo embeddable (YouTube) résolue depuis `firstLinkURL`, précalculée
        /// une fois par le builder. Non-nil → la bulle affiche un player façade
        /// (`VideoEmbedContainer`) au lieu de l'aperçu OpenGraph (`LinkPreviewCard`).
        let embeddedVideo: EmbeddedVideo?
        /// `[rawURL: token]` outbound-link tracking map for this message
        /// (`Message.trackedLinkMap`). Passed into every `MessageTextRenderer.render`
        /// call so raw URLs become tappable `/l/<token>` links. Empty → no rewrite.
        let trackedLinks: [String: String]
        /// Tracked destination for the embedded video façade, derived ONCE by the
        /// builder from `firstLinkURL` → `trackedLinks[firstLinkURL]` →
        /// `https://meeshy.me/l/<token>`. `nil` → façade opens the canonical watchURL.
        let embedTrackedURL: URL?
    }

    struct Translation: Equatable {
        let preferredContent: String?      // contenu affiché (peut == raw si pas traduit)
        let activeLangCode: String         // langue actuellement affichée
        let originalLangCode: String
        /// Langue que le Prisme du LECTEUR choisirait (cible de la
        /// traduction préférée) — `nil` quand aucune traduction ne matche
        /// ses préférences. Sert au drapeau-toggle de la rangée plate :
        /// c'est « la langue configurée sur le profil » vers laquelle on
        /// revient depuis la V.O.
        let preferredLangCode: String?
        let availableFlags: [String]       // dédupliqué, ordonné
        let secondaryLangCode: String?     // panneau inline ouvert ?
        let secondaryContent: String?
    }

    struct Reply: Equatable {
        let reference: ReplyReference
        let isStory: Bool

        /// Trois groupes plutôt qu'une seule chaîne de `&&` : la projection
        /// compare dix-huit champs, et une conjonction de cette longueur est ce
        /// que l'inféreur de types met le plus longtemps à résoudre. Chaque
        /// groupe dit AUSSI ce qu'il garde — identité, média cité, story.
        static func == (lhs: Reply, rhs: Reply) -> Bool {
            lhs.isStory == rhs.isStory
                && sameIdentity(lhs, rhs)
                && sameQuotedMedia(lhs, rhs)
                && sameStory(lhs, rhs)
        }

        private static func sameIdentity(_ lhs: Reply, _ rhs: Reply) -> Bool {
            lhs.reference.messageId == rhs.reference.messageId
                && lhs.reference.previewText == rhs.reference.previewText
                // L'avatar de l'auteur cite est une ZONE TACTILE de la citation
                // (porte vers le profil) : il influence le rendu. Arrivant apres
                // coup (refresh serveur, hydratation du cache), son absence de
                // ce comparateur figeait la citation en initiales pour toujours.
                && lhs.reference.authorAvatarUrl == rhs.reference.authorAvatarUrl
                && lhs.reference.moodEmoji == rhs.reference.moodEmoji
        }

        private static func sameQuotedMedia(_ lhs: Reply, _ rhs: Reply) -> Bool {
            // Le GENRE du média cité — il décide du glyphe, du badge play, et
            // depuis #4946 du fait qu'un document n'annonce pas de pixels. Il
            // manquait à ce comparateur alors que la peau bulle le porte dans
            // sa projection depuis toujours : une bulle optimiste posant le
            // rawValue court (« image ») puis un écho serveur posant le MIME
            // (« image/jpeg ») laissaient la rangée plate sur son premier rendu.
            lhs.reference.attachmentType == rhs.reference.attachmentType
                && lhs.reference.attachmentThumbnailUrl == rhs.reference.attachmentThumbnailUrl
                // La protection DECIDE si cette vignette est rendue et si la
                // zone 2 est armee : elle influence le rendu autant que l'URL
                // au-dessus. Absente d'ici, une citation figee sur une
                // premiere resolution silencieuse (blob de cache ancien) ne se
                // redessinerait jamais quand la protection arrive enfin.
                && lhs.reference.attachmentIsProtected == rhs.reference.attachmentIsProtected
                // Les SEPT faits du média cité (#4945) : le flou ThumbHash de la
                // miniature et la ligne « 1024×768 · 0:42 · 1,2 Mo » que la
                // citation rend depuis #4946. Ils arrivent APRÈS coup — la bulle
                // optimiste ne connaît que ce que l'appareil tient, l'écho
                // serveur apporte le reste. Absents de ce comparateur, la
                // citation resterait figée sur sa PREMIÈRE résolution, exactement
                // comme l'avatar et la protection avant eux.
                && lhs.reference.attachmentThumbHash == rhs.reference.attachmentThumbHash
                && lhs.reference.attachmentWidth == rhs.reference.attachmentWidth
                && lhs.reference.attachmentHeight == rhs.reference.attachmentHeight
                && lhs.reference.attachmentDurationMs == rhs.reference.attachmentDurationMs
                && lhs.reference.attachmentFileSize == rhs.reference.attachmentFileSize
                && lhs.reference.attachmentPageCount == rhs.reference.attachmentPageCount
                && lhs.reference.attachmentMimeType == rhs.reference.attachmentMimeType
        }

        private static func sameStory(_ lhs: Reply, _ rhs: Reply) -> Bool {
            lhs.reference.storyPublishedAt == rhs.reference.storyPublishedAt
                && lhs.reference.storyThumbnailUrl == rhs.reference.storyThumbnailUrl
                && lhs.reference.storyReactionCount == rhs.reference.storyReactionCount
                && lhs.reference.storyCommentCount == rhs.reference.storyCommentCount
                && lhs.reference.storyShareCount == rhs.reference.storyShareCount
        }
    }

    struct Ephemeral: Equatable {
        let expiresAt: Date
    }

    struct Meta: Equatable {
        let timeString: String
        let deliveryStatus: MeeshyMessage.DeliveryStatus?  // nil si reçu
    }

    /// Resolved facts for a call-summary system message — everything the leaf
    /// `BubbleCallNoticeView` needs as primitives so it re-renders only when
    /// these change. `isOutgoing` is pre-resolved per viewer at build time
    /// (depends on the current user id) so the leaf view stays singleton-free.
    struct CallNotice: Equatable {
        let summary: CallSummaryMetadata
        /// Current user initiated this call (emitted) vs received it.
        let isOutgoing: Bool
        /// Gateway-localized label ("Appel vidéo · 04:32", "Appel audio manqué"),
        /// used as the human title base + VoiceOver fallback.
        let fallbackText: String
        /// Short clock label ("18:41") shown inline in the compact bubble — same
        /// resolved value as the standard bubble's meta timestamp.
        let timeString: String
        /// Full call timestamp, formatted (date + time) in the long-press detail
        /// sheet. Kept as a `Date` so the sheet controls its own formatting.
        let timestamp: Date
    }

    /// Faits résolus d'un avis d'ARRIVÉE — tout ce dont la feuille
    /// `BubbleJoinNoticeView` a besoin, en primitifs, pour ne se réévaluer que
    /// sur changement réel. Même convention que `CallNotice`.
    struct JoinNotice: Equatable {
        /// `Participant.id` de l'arrivant — il est l'auteur de son propre avis.
        ///
        /// La métadonnée le portait déjà ; le value model le perdait, et l'avis
        /// restait le seul endroit du fil où un nom ne menait nulle part.
        let participantId: String
        let displayName: String
        /// L'arrivant n'a pas de compte — c'est ce que le glyphe dit.
        let isAnonymous: Bool
        /// Entré par un lien de partage plutôt qu'ajouté par un membre.
        let viaShareLink: Bool
        /// Repli français écrit par le gateway, servi aux surfaces sans rendu
        /// dédié et aux lecteurs plus anciens que ce `kind`.
        let fallbackText: String
        /// Pseudo stable (`ano_…` pour un visiteur sans compte).
        let username: String?
        /// Nom humain donné au formulaire d'entrée, s'il existe.
        let givenName: String?
        /// Ce que le lien d'entrée autorise — absent hors lien de partage.
        let linkRules: JoinNoticeMetadata.LinkRules?
    }

    /// **Ce qu'un sticker de conversation DESSINE** (#4823) — la projection en
    /// primitifs de `MessageSticker`, pour que `BubbleSticker` reste une
    /// feuille `Equatable` sans lire `MeeshyMessage`.
    ///
    /// Le PNG rendu par l'expéditeur voyage en pièce jointe image ORDINAIRE :
    /// c'est le REPLI d'un lecteur qui ne sait pas dessiner le gabarit. Il est
    /// projeté ici en `Picture` — et non transporté en `MeeshyMessageAttachment`,
    /// qui n'est pas `Equatable` — puis EXCLU de `attachments` par le builder,
    /// sinon la grille visuelle le rendrait une seconde fois sous le sticker.
    struct Sticker: Equatable {
        /// La pièce jointe PNG, réduite à ce que `ProgressiveCachedImage` lit.
        struct Picture: Equatable {
            let attachmentId: String
            let fileUrl: String
            let thumbnailUrl: String?
            let thumbHash: String?
            let thumbnailColor: String
        }

        /// Gabarit du `StickerTemplateCatalog`. `nil` ou vide = sticker emoji.
        let templateId: String?
        /// Les valeurs FIGÉES des emplacements du gabarit.
        let slots: [String: String]
        /// Le mouvement de la décoration — `nil` = immobile.
        let animation: StickerAnimation?
        /// L'emoji du sticker, ou le repli d'un gabarit.
        let emoji: String?
        /// Le PNG rendu par l'expéditeur, s'il est arrivé.
        let picture: Picture?
    }

    let messageId: String
    let kind: Kind
    let text: Text?
    let translation: Translation?
    let reply: Reply?
    let attachments: Attachments
    /// Lieu partagé porté par `message.location` (hissé côté serveur depuis
    /// `locationJson`). C'est la SEULE voie que le serveur produit encore :
    /// `MessageAttachment` n'a aucun champ géographique en Prisma, donc une
    /// pièce jointe `.location` ne peut venir que d'anciennes lignes du cache
    /// local. Le builder garantit l'exclusivité : quand `location != nil`, les
    /// pièces jointes `.location` sont exclues de `attachments` pour qu'un
    /// message portant les deux ne rende le lieu qu'UNE fois.
    let location: SharedPlace?
    let ephemeral: Ephemeral?
    let isBlurred: Bool                    // gates le composant de blur reveal
    let isViewOnce: Bool
    let isPinned: Bool
    /// **Qui est nommé sous un message transféré — DÉJÀ TRANCHÉ** (#5058).
    ///
    /// `nil` ⇒ le message n'a pas été transféré. Un booléen à côté d'une
    /// attribution serait la paire redondante que le dépôt proscrit ; ici
    /// l'absence EST le fait, et `isForwarded` n'en est qu'une lecture.
    ///
    /// **Pourquoi la valeur est résolue en amont et non par la peau.** Ce champ
    /// portait `isForwarded: Bool`, et les trois peaux n'en tiraient pas la même
    /// chose : la bulle appelait `ForwardBadgePolicy.attribution(for:)` sur le
    /// `Message` qu'elle avait sous la main, la rangée plate ne l'avait PAS et
    /// retombait sur `.anonymous`. Le doc-comment de `FocalRow` nommait
    /// l'écart et son motif — « écart signalé, pas une seconde résolution
    /// inventée » —, et le repli était le bon : jamais celui qui nommerait
    /// quelqu'un. Mais ce qui manquait était en AMONT, pas dans la peau.
    ///
    /// Une règle de CONFIDENTIALITÉ résolue à deux endroits est une règle qui
    /// divergera : la liste blanche de `ForwardBadgePolicy` échoue FERMÉ, et
    /// une peau qui la contourne pour « faire pareil » ouvrirait la fuite que
    /// la liste existe pour fermer. Un seul site résout, trois peaux rendent.
    let forwardAttribution: ForwardAttribution?

    /// Lecture de commodité — dérivée, jamais stockée à côté.
    var isForwarded: Bool { forwardAttribution != nil }
    let editedAt: Date?
    let isEditSaving: Bool
    let hasEditHistory: Bool
    let reactions: [MeeshyReactionSummary]
    let meta: Meta
    let isMe: Bool
    let senderName: String?
    /// Present for `.system` call-summary messages carrying structured metadata
    /// (`messageSource == .system` + `callSummary != nil`). When nil, a `.system`
    /// message falls back to the plain centered notice.
    let callNotice: CallNotice?
    /// Présent pour un message système d'ARRIVÉE (`metadata.kind ==
    /// "member-joined"`). Quand nil, un `.system` retombe sur la notice
    /// centrée ordinaire.
    let joinNotice: JoinNotice?
    /// Présent pour un message-sticker RENDABLE (`message.sticker?.ifRenderable`).
    /// Quand non nil, `ThemedMessageBubble` monte `BubbleSticker` à la place
    /// de la bulle standard — sans chrome, comme un emoji libre.
    ///
    /// `var … = nil` et non `let` : l'init memberwise sert encore une dizaine
    /// de témoins (`Unit/Focal/…`) qui énumèrent chaque champ ; une valeur par
    /// défaut garde leur appel intact, un `let` sans défaut les casserait tous.
    var sticker: Sticker? = nil

    /// Convenience pour tests + branch logic du body.
    var isEmojiOnly: Bool { text?.isEmojiOnly ?? false }
    /// Mirrors legacy `ThemedMessageBubble.hasTextOrNonMediaContent`:
    /// "audio-only with transcription text" returns false (audio bubble
    /// renders the transcription itself; no separate text bubble).
    /// Otherwise: true if text is non-empty OR non-media is present.
    var hasTextOrNonMediaContent: Bool {
        let hasText = !(text?.raw.isEmpty ?? true)
        let hasNonMedia: Bool = {
            // Un lieu porté par `message.location` compte comme contenu
            // non-média : exactement la sémantique qu'avait une pièce jointe
            // `.location` (les anciennes lignes du cache local), pour qu'un
            // message « lieu seul » atteigne bien la bulle texte qui l'héberge.
            if location != nil { return true }
            switch attachments {
            case .nonMedia: return true
            case .mixed(_, _, let nm): return !nm.isEmpty
            case .none, .visualGrid, .audio: return false
            }
        }()
        // Audio-only with transcription text: legacy renders the transcription
        // inside the audio bubble, so the text bubble must be suppressed.
        let isAudioOnlyWithText: Bool = {
            guard hasText else { return false }
            switch attachments {
            case .audio: return true
            default: return false
            }
        }()
        if isAudioOnlyWithText { return false }
        return hasText || hasNonMedia
    }

    /// Routing pur : un audio seul en reply héberge sa citation dans le widget
    /// audio (topSlot), pas de chat bubble parasite. True iff `reply != nil`,
    /// not emoji-only, no text/non-media content, et `.audio` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var audioHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .audio = attachments { return true }
        return false
    }

    /// Routing pur : un visual-grid seul en reply rend la citation et la grille
    /// dans un conteneur unifié bordé, pas de chat bubble séparée. True iff
    /// `reply != nil`, not emoji-only, no text/non-media content, et
    /// `.visualGrid` attachments.
    /// Spec : `docs/superpowers/specs/2026-05-20-ios-reply-no-bubble-around-media-design.md` §4.4
    var visualHostsReply: Bool {
        guard reply != nil, !isEmojiOnly else { return false }
        guard !hasTextOrNonMediaContent else { return false }
        if case .visualGrid = attachments { return true }
        return false
    }

    static func == (lhs: BubbleContent, rhs: BubbleContent) -> Bool {
        lhs.messageId == rhs.messageId
            && lhs.kind == rhs.kind
            && lhs.text == rhs.text
            && lhs.translation == rhs.translation
            && lhs.reply == rhs.reply
            && lhs.attachments == rhs.attachments
            && lhs.location == rhs.location
            && lhs.ephemeral == rhs.ephemeral
            && lhs.isBlurred == rhs.isBlurred
            && lhs.isViewOnce == rhs.isViewOnce
            && lhs.isPinned == rhs.isPinned
            && lhs.forwardAttribution == rhs.forwardAttribution
            && lhs.editedAt == rhs.editedAt
            && lhs.isEditSaving == rhs.isEditSaving
            && lhs.hasEditHistory == rhs.hasEditHistory
            && lhs.reactions.map(\.emoji) == rhs.reactions.map(\.emoji)
            && lhs.reactions.map(\.count) == rhs.reactions.map(\.count)
            && lhs.reactions.map(\.includesMe) == rhs.reactions.map(\.includesMe)
            && lhs.meta == rhs.meta
            && lhs.isMe == rhs.isMe
            && lhs.senderName == rhs.senderName
            && lhs.callNotice == rhs.callNotice
            && lhs.joinNotice == rhs.joinNotice
            && lhs.sticker == rhs.sticker
    }
}
