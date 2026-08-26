import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - FocalAudioMode — décision unique (WS-3, §3 « Types purs à extraire »)

/// Les 4 modes de rendu audio du contrat §WS-3 (+ `.none`/`.standalone`,
/// résidus structurels — voir doc de `FocalAudioRouting.mode(for:)`).
/// `.none` = aucune pièce jointe audio dans `content`.
nonisolated enum FocalAudioMode: Equatable {
    case none
    /// `content.attachments == .audio(items)` pur, `items.count > 1`.
    case carousel
    /// Audio seul (`audioIsSoleContent` — miroir).
    case soleWithFooter
    /// Audio + citation (`BubbleContent.audioHostsReply`, déjà public).
    case hostsReply
    /// Audio + texte, texte en caption interne (`audioHostsCaption` — miroir).
    case hostsCaption
    /// Résidu : audio co-existe avec un contenu qui ne rentre dans aucun des
    /// 3 modes ci-dessus (ex. audio + grille visuelle, `.mixed`). N'a PAS de
    /// littéral correspondant dans la spec (« les 4 modes ») — la vraie
    /// source (`BubbleStandardLayout.swift:832-841`) rend ce cas SANS
    /// injecter de footer/caption dans le widget (`shouldInjectFooter =
    /// false`) ; ce mode reproduit fidèlement ce comportement.
    case standalone
}

// MARK: - FocalAudioRouting — routage pur (WS-3)

/// Reproduit EN UNE SEULE DÉCISION ce que `BubbleStandardLayout.swift`
/// disperse sur 3 propriétés `private` (`audioIsSoleContent`,
/// `audioHostsCaption` — ni l'une ni l'autre n'est réutilisable hors de ce
/// fichier, RE-PREUVE §0) + `BubbleContent.audioHostsReply` (public,
/// réutilisé tel quel) + le garde carrousel (`:758`, « gated to the PURE
/// `.audio` enum case »). Les deux propriétés `private` sont reconstruites
/// ici à l'identique à partir de l'API PUBLIQUE de `BubbleContent`
/// (`isEmojiOnly`, `hasTextOrNonMediaContent`, `reply`, `audioHostsReply`,
/// `visualHostsReply`) — même logique, sans dépendre d'un type `private`.
nonisolated enum FocalAudioRouting {

    /// Pièces jointes audio de `content`, quel que soit le cas
    /// (`.audio`/`.mixed`) — miroir de `audioAttachments` côté
    /// `BubbleStandardLayout` (calculé depuis `message.attachments` là-bas ;
    /// ici depuis `content.attachments`, la même source une fois résolue).
    static func audioAttachments(in content: BubbleContent) -> [MessageAttachment] {
        switch content.attachments {
        case .audio(let items): return items
        case .mixed(_, let audio, _): return audio
        case .none, .visualGrid, .nonMedia: return []
        }
    }

    static func visualAttachments(in content: BubbleContent) -> [MessageAttachment] {
        switch content.attachments {
        case .visualGrid(let items): return items
        case .mixed(let visual, _, _): return visual
        case .none, .audio, .nonMedia: return []
        }
    }

    static func mode(for content: BubbleContent) -> FocalAudioMode {
        let audios = audioAttachments(in: content)
        guard !audios.isEmpty else { return .none }

        // Carrousel : UNIQUEMENT le cas `.audio` PUR avec plus d'une piste —
        // un `.mixed` multi-audio retombe au traitement standard (même
        // garde que le code réel, `BubbleStandardLayout.swift:766-769`).
        if case .audio = content.attachments, audios.count > 1 {
            return .carousel
        }

        // Miroir de `audioIsSoleContent` (`private`, `:278`). Le
        // `&& !audioAttachments.isEmpty` de l'original est déjà garanti par
        // le `guard` ci-dessus.
        //
        // ATTENTION — le `.audio` PUR + texte tombe ICI, pas dans
        // `.hostsCaption` : `BubbleContent.hasTextOrNonMediaContent`
        // (`BubbleContent.swift:207-215`) renvoie délibérément `false` quand
        // du texte accompagne le cas `.audio` PUR (« audio-only with
        // transcription text » — le texte EST la transcription, le widget la
        // rend lui-même). C'est le comportement de la bulle, donc c'est le
        // nôtre : ne PAS « corriger » cet ordre en croyant récupérer un
        // caption perdu.
        let isSoleContent = !content.isEmojiOnly
            && !content.hasTextOrNonMediaContent
            && content.reply == nil
        if isSoleContent { return .soleWithFooter }

        if content.audioHostsReply { return .hostsReply }

        // Miroir de `audioHostsCaption` (`private`, `:301`) — atteint quand
        // le texte/lieu/pièce non-média n'est PAS une transcription : cas
        // `.mixed` sans visuel, ou `.audio` + `location`.
        let hostsCaption = !content.audioHostsReply
            && !content.visualHostsReply
            && content.hasTextOrNonMediaContent
            && content.reply == nil
            && visualAttachments(in: content).isEmpty
        if hostsCaption { return .hostsCaption }

        return .standalone
    }
}

// MARK: - FocalAudioBlock (WS-3)

/// Bloc audio NU de la rangée plate — retrait `29`
/// (`FocalMetrics.Text.indent`), routage par `FocalAudioRouting.mode(for:)`.
///
/// **Réutilise** `AudioMediaView`/`AudioCarouselView` (contrat §WS-3) —
/// TELS QUELS, sans les modifier (§1.3). Les deux exigent un `Message`
/// complet (`let message: Message`, non optionnel) que `BubbleContent` seul
/// ne porte pas (règle « leaf views, primitifs uniquement », contrat §3.6) —
/// résolu en le DÉRIVANT de `allAudioItems` (déjà une entrée de
/// `FocalRowInput`, contrat §3.6 : chaque `ConversationViewModel.AudioItem`
/// porte SON `message`, la même instance pour toutes les pistes d'UN
/// message). Pas de champ `message` ajouté à `FocalRowInput` : la donnée
/// existe déjà dans `allAudioItems`, RE-PREUVE avant d'étendre le contrat.
///
/// `footerModel: nil, footerActions: .none` : le footer du widget audio est
/// SUPPRIMÉ EN ENTIER — heure/accusé (portés par `FocalMetaRow`/
/// `FocalIdentityHeader`, WS-4) ET bande de drapeaux interne. `.empty`
/// laissait passer cette bande (`audioFooter` la construit dès que le modèle
/// est non-nil) : un SECOND basculeur de langue, local au widget, qui
/// contredisait l'arbitrage user 2026-08-18 (« plus de bande de drapeaux —
/// le seul indicateur est le drapeau-toggle de la rangée, l'exploration vit
/// dans le menu d'appui long ») et pouvait diverger de la piste jouée par le
/// coordinateur (état jamais remonté au VM).
///
/// « Transcription traduite en italique sous le player » (critère §WS-3) :
/// portée NATIVEMENT par `AudioMediaView` (transcription karaoke
/// synchronisée, cf. sa doc de tête) via `transcription`/`translatedAudios`
/// — pas réimplémentée ici.
struct FocalAudioBlock: View, Equatable {
    let content: BubbleContent
    let accentHex: String
    let isDark: Bool
    /// Contrat §3.6 : `FocalRowInput.allAudioItems`.
    let allAudioItems: [ConversationViewModel.AudioItem]
    let translatedAudios: [MessageTranslatedAudio]
    let mentionDisplayNames: [String: String]
    let conversationName: String
    /// Bascule manuelle du drapeau de la rangée (`activeDisplayLangCode`) —
    /// `nil` = résolution Prisme. Transmis au widget audio pour que la
    /// piste jouée et les segments karaoké SUIVENT le drapeau (user
    /// 2026-08-18 : « switcher le drapeau doit switcher l'audio »).
    var activeAudioLanguage: String? = nil
    var voiceConsentMissing: Bool = false
    var onPlayAudio: ((String) -> Void)? = nil
    var onRequestTranslation: ((String, String) -> Void)? = nil
    var onShowTranslationDetail: ((String) -> Void)? = nil
    var onReplyTap: ((String) -> Void)? = nil
    var onStoryReplyTap: ((String) -> Void)? = nil
    /// LOI DES ZONES (2026-08-24) — ZONES 1 et 2 de la citation. Un message
    /// audio qui REPOND heberge sa citation DANS le widget
    /// (`content.audioHostsReply`), et la rangee plate ne la rend donc pas
    /// elle-meme : sans ces deux fils, cette citation-la resterait la seule du
    /// mode Script a n'offrir ni avatar ni zone media, alors que sa jumelle
    /// rendue par `FocalQuotedReplyView` les porte.
    var onQuotedAuthorTap: ((ReplyReference) -> Void)? = nil
    var onQuotedMediaTap: ((ReplyReference) -> Void)? = nil
    var audioQueueTailProvider: ((String) -> [QueuedAudio])? = nil
    var onTapConsentNotice: (() -> Void)? = nil
    var onScrollToMessage: ((String) -> Void)? = nil

    static func == (lhs: FocalAudioBlock, rhs: FocalAudioBlock) -> Bool {
        lhs.content == rhs.content
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.allAudioItems.map(\.id) == rhs.allAudioItems.map(\.id)
            && lhs.translatedAudios == rhs.translatedAudios
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
            && lhs.conversationName == rhs.conversationName
            && lhs.activeAudioLanguage == rhs.activeAudioLanguage
            && lhs.voiceConsentMissing == rhs.voiceConsentMissing
    }

    /// La décision « quelle tenue pour quelle rangée » vit ICI (app), le SDK
    /// ne fait que rendre la tenue reçue (SDK Purity). RETRAIT FOCAL iOS
    /// (2026-08-18) : sans élection, la tenue plate COMPLÈTE (vitesse,
    /// drapeaux, %, re-transcrire) sert TOUTES les rangées — la matrice §5
    /// voulait « le player rendu nu dans la rangée », pas une version
    /// amputée réservée à un élu disparu.
    nonisolated static let flatChrome: AudioPlayerChrome = .flatFocused

    private var mode: FocalAudioMode { FocalAudioRouting.mode(for: content) }
    private var audios: [MessageAttachment] { FocalAudioRouting.audioAttachments(in: content) }
    private var visuals: [MessageAttachment] { FocalAudioRouting.visualAttachments(in: content) }

    private func audioItem(for attachmentId: String) -> ConversationViewModel.AudioItem? {
        allAudioItems.first { $0.id == attachmentId }
    }

    var body: some View {
        Group {
            switch mode {
            case .none:
                EmptyView()
            case .carousel:
                carouselBody
            default:
                standaloneBody
            }
        }
        .padding(.leading, FocalMetrics.Text.indent)
    }

    @ViewBuilder
    private var carouselBody: some View {
        // `message` DÉRIVÉ de `allAudioItems` (voir doc de tête) — toutes
        // les pistes d'`audios` appartiennent au MÊME message.
        if let message = audioItem(for: audios.first?.id ?? "")?.message {
            let perPageTranscriptions = Dictionary(
                uniqueKeysWithValues: audios.compactMap { att in
                    audioItem(for: att.id)?.transcription.map { (att.id, $0) }
                }
            )
            let perPageTranslatedAudios = Dictionary(
                uniqueKeysWithValues: audios.map { att in
                    (att.id, audioItem(for: att.id)?.translatedAudios ?? [])
                }
            )
            AudioCarouselView(
                items: audios,
                message: message,
                contactColor: accentHex,
                isDark: isDark,
                accentColor: accentHex,
                transcriptions: perPageTranscriptions,
                translatedAudios: perPageTranslatedAudios,
                textTranslations: [],
                allAudioItems: allAudioItems,
                mentionDisplayNames: mentionDisplayNames,
                // Le carrousel garde `.empty` (param non-optionnel) : ses
                // drapeaux par-piste désignent la PAGE visible d'un message
                // multi-pistes — une information de navigation, pas le
                // basculeur de version retiré du chemin standalone.
                footerModel: .empty,
                footerActions: .none,
                activeAudioLanguage: activeAudioLanguage,
                onScrollToMessage: onScrollToMessage,
                onShareFile: nil,
                onShowTranslationDetail: onShowTranslationDetail,
                onRequestTranslation: onRequestTranslation,
                onPlayAudio: onPlayAudio,
                conversationName: conversationName,
                audioQueueTailProvider: audioQueueTailProvider,
                parentIsMe: content.isMe,
                voiceConsentMissing: voiceConsentMissing,
                onTapConsentNotice: onTapConsentNotice
            )
        }
    }

    @ViewBuilder
    private var standaloneBody: some View {
        ForEach(audios) { attachment in
            if let message = audioItem(for: attachment.id)?.message {
                AudioMediaView(
                    attachment: attachment,
                    message: message,
                    contactColor: accentHex,
                    visualAttachments: visuals,
                    isDark: isDark,
                    accentColor: accentHex,
                    chrome: Self.flatChrome,
                    transcription: audioItem(for: attachment.id)?.transcription,
                    translatedAudios: audioItem(for: attachment.id)?.translatedAudios ?? translatedAudios,
                    allAudioItems: allAudioItems,
                    mentionDisplayNames: mentionDisplayNames,
                    onScrollToMessage: onScrollToMessage,
                    onShowTranslationDetail: onShowTranslationDetail,
                    onRequestTranslation: onRequestTranslation,
                    activeAudioLanguageOverride: activeAudioLanguage,
                    footerModel: nil,
                    footerActions: .none,
                    replyReference: mode == .hostsReply ? content.reply?.reference : nil,
                    replyIsStory: mode == .hostsReply ? (content.reply?.isStory ?? false) : false,
                    parentIsMe: content.isMe,
                    onReplyTap: onReplyTap,
                    onStoryReplyTap: onStoryReplyTap,
                    onQuotedAuthorTap: onQuotedAuthorTap,
                    onQuotedMediaTap: onQuotedMediaTap,
                    onPlayAudio: onPlayAudio,
                    conversationName: conversationName,
                    audioQueueTailProvider: audioQueueTailProvider,
                    embedsCaptionInWidget: mode == .hostsCaption,
                    voiceConsentMissing: voiceConsentMissing,
                    onTapConsentNotice: onTapConsentNotice
                )
                .equatable()
            }
        }
    }
}
