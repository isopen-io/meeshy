import Foundation
import CoreGraphics
import MeeshySDK
import MeeshyUI

/// Valeur figée décrivant tout ce dont `FocalRow` a besoin (contrat Focal
/// §3.6). Construite par WS-6 dans `messageRegistration` à partir des `let`
/// déjà snapés — aucun calcul nouveau. `Equatable` : c'est le gate de
/// re-render (`EquatableFocalRow(row:).equatable()`, WS-4).
///
/// **RE-PREUVE (§0 avant écriture)** : ce fichier N'EXISTAIT PAS. L'esquisse
/// d'arborescence du contrat §1.1 le place sous `Focal/Core/` (propriété
/// WS-0), mais le Core gelé S1 livré (M-042/043/044) ne porte QUE
/// `ReadingModeOrchestrator`/`FocalFocusCurve`/`ScrollTimePillLaw` — WS-0 ne
/// l'a jamais livré (même constat que `FocalMetrics`, tâche 0). `Focal/Core/`
/// n'est pas gelé dans son ensemble : ce fichier est un AJOUT, jamais une
/// édition d'un fichier gelé. Créé ici (WS-4/F-083, qui en est le premier
/// et seul consommateur) plutôt que sous `Focal/Row/` pour rester fidèle au
/// domicile canonique du contrat — un futur WS-0 qui livrerait ce fichier
/// devrait le trouver là où il l'attend.
///
/// **Aucun type rival créé** — patron F-080 (`ConversationReadingMode`
/// typealias sur `ReadingModeOrchestrator.ConversationReadingMode`) :
/// `Density` reste un enum NOUVEAU, nested (2 cas `focal`/`script`), qui ne
/// duplique PAS `ReadingModeOrchestrator.ConversationReadingMode` (5 cas,
/// portée plus large — Résumé/Rivière/bulles n'ont pas de rangée plate à
/// densité). Ce n'est pas un rival : c'est une projection stricte, scoped à
/// `FocalRowInput`, exactement comme le contrat la nomme (§3.6).
///
/// **Corrections de types vs le texte littéral du contrat (RE-PREUVE)** :
/// - `allAudioItems: [AudioItem]` → `[ConversationViewModel.AudioItem]`.
///   `AudioMediaView`/`AudioCarouselView` (réutilisés par WS-3,
///   `Focal/Row/FocalAudioBlock.swift`) typent LEUR PROPRE paramètre
///   `allAudioItems` en `[ConversationViewModel.AudioItem]`
///   (`ConversationMediaViews.swift:541`, `AudioCarouselView.swift:47`) — le
///   type nested de la god view, PAS le `struct AudioItem` top-level de
///   `ConversationStateStore.swift` (qui existe aussi, homonyme, mais n'est
///   consommé par aucun composant réutilisé ici). Utiliser le mauvais des
///   deux romprait la compilation au premier appel de WS-3.
/// - `onOpenProfile: ((ProfileUser) -> Void)?` → `((ProfileSheetUser) -> Void)?`.
///   `ProfileUser` N'EXISTE NULLE PART dans le dépôt (`rg` vide,
///   `packages/MeeshySDK` + `apps/ios`). Le type réel utilisé par
///   `ThemedMessageBubble.onOpenProfile` (`:138`) est
///   `ProfileSheetUser` (`MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift`,
///   `public`).
///
/// **NON Sendable** (contrat §3.6) : embarque `BubbleContent`, qui embarque
/// des modèles applicatifs `@MainActor`-implicites (cible `Meeshy`,
/// `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`).
///
/// **F-083ter — exception NARROW et documentée au gel** : `effects:
/// MessageEffects` est AJOUTÉ (pas remodelé — un seul champ, en toute fin de
/// liste, valeur par défaut `.none`) pour porter F15 (« les effets
/// s'appliquent au bloc contenu »), qui n'a AUCUNE autre source possible
/// (`BubbleContent` ne porte pas `effects`, et `FocalRowInput` reste
/// « primitifs uniquement »). Le paramètre par défaut préserve le site de
/// montage existant (`MessageListViewController.swift:1159`, propriété
/// WS-6, hors périmètre de cette tâche — NON MODIFIÉ, continue de compiler
/// sans passer `effects`) : tant que WS-6 ne le fournit pas explicitement,
/// la rangée reçoit `.none` et ne rend aucun effet — comportement identique
/// à avant cette extension. Flagué pour confirmation orchestrateur : ajouter
/// UN champ pour honorer une consigne explicite de CE lot n'est pas un
/// remodelage de la forme figée.
struct FocalRowInput: Equatable {
    /// Les deux densités de la rangée plate (contrat Focal §3.1 :
    /// `ConversationReadingMode.usesFlatRow`). `.summary`/`.river`/`.bubbles`
    /// n'ont pas de rangée plate — jamais représentés ici.
    enum Density: String, Equatable {
        case focal
        case script
    }

    let localId: String
    let serverId: String?
    /// Réutilisé VERBATIM (contrat §3.6) — aucune seconde résolution de
    /// langue : `content.translation` porte déjà `preferredContent`/
    /// `activeLangCode` résolus en amont par `BubbleContentBuilder`.
    let content: BubbleContent
    let density: Density

    // MARK: - Identité de tête de groupe

    let isFirstInGroup: Bool
    let senderId: String
    let senderDisplayName: String
    let senderUsername: String?
    let senderAvatarURL: String?
    let senderThumbHash: String?
    let senderColorHex: String
    let senderPresence: PresenceState
    let senderStoryRing: StoryRingState
    let senderMoodEmoji: String?

    // MARK: - Contexte visuel (primitifs uniquement — règle « leaf views »)

    let accentHex: String
    let isDark: Bool
    let isDirect: Bool
    let isRightToLeft: Bool

    // MARK: - États

    let isOptimistic: Bool
    let isAgentAuthored: Bool
    let showsAgentGrammar: Bool
    let highlightSearchTerm: String?
    let mentionDisplayNames: [String: String]
    let userLanguages: (regional: String?, custom: String?)
    let activeDisplayLangCode: String?
    let secondaryLangCode: String?
    let voiceConsentMissing: Bool

    // MARK: - Enrichissements audio (mêmes dictionnaires que la bulle)

    let transcription: String?
    let translatedAudios: [MessageTranslatedAudio]
    /// CORRIGÉ vs le texte littéral du contrat — voir doc de tête.
    let allAudioItems: [ConversationViewModel.AudioItem]
    let conversationName: String

    // MARK: - Effets (F-083ter, F15)

    /// AJOUTÉ (pas dans le contrat §3.6 littéral) — voir doc de tête pour la
    /// justification et la garantie de compatibilité du site de montage.
    let effects: MessageEffects

    // MARK: - Focus (§4.6) — la rangée ÉLUE se magnifie

    /// Cette rangée est l'élue du pass (`FocalScrollPass.focusedLocalId`).
    ///
    /// **Ce champ manquait, et c'est ce qui rendait §4.6 MORTE.** L'hôte
    /// appelle déjà `reconfigureFocusTypographyAtScrollStop()` sur le
    /// changement d'élu (ancienne + nouvelle cellule, jamais plus), aux deux
    /// arrêts de défilement ET au changement de mode — mais aucun champ ne
    /// portait le focus jusqu'ici, donc la reconfiguration reproduisait un
    /// contenu bit-à-bit identique et la « typographie 15→16 » du contrat
    /// n'était jamais rendue. Le signal entre ici, par la porte que le gate
    /// de re-render (`==`) surveille déjà.
    ///
    /// Écrit UNIQUEMENT à l'arrêt du défilement (jamais par frame) : la
    /// magnification est un changement de LAYOUT, le pass reste pur
    /// compositor (§4.6, « la typographie n'est pas de son ressort »).
    let isFocused: Bool

    /// Date d'envoi — la rangée élue affiche « jour · heure », pas l'heure
    /// seule. `BubbleContent.Meta` ne porte qu'un `timeString` déjà formaté
    /// (aucun `Date`), et le contrat interdit de refabriquer un formateur :
    /// la date brute entre donc ici, où l'hôte l'a sous la main
    /// (`message.createdAt`).
    let sentAt: Date

    /// Le défilement est en cours ⇒ les heures des rangées non focalisées
    /// se montrent, puis s'effacent à l'arrêt.
    ///
    /// Remplace la pilule flottante « jour · heure » (`ScrollTimePillOverlay`),
    /// qui affichait UN horodatage détaché en haut d'écran pendant que chaque
    /// rangée portait déjà le sien en permanence — trois chromes temporels
    /// concurrents pour une seule information. La loi de fenêtre
    /// (`ScrollTimePillLaw`, `lingerMs = 900`) est CONSERVÉE et pilote
    /// désormais ce booléen : même tempo, autre support.
    ///
    /// La rangée focalisée ne le lit pas — elle montre date ET heure en
    /// permanence (`isFocused`), défilement ou pas.
    let revealsTimestamp: Bool

    init(
        localId: String,
        serverId: String?,
        content: BubbleContent,
        density: Density,
        isFirstInGroup: Bool,
        senderId: String,
        senderDisplayName: String,
        senderUsername: String?,
        senderAvatarURL: String?,
        senderThumbHash: String?,
        senderColorHex: String,
        senderPresence: PresenceState,
        senderStoryRing: StoryRingState,
        senderMoodEmoji: String?,
        accentHex: String,
        isDark: Bool,
        isDirect: Bool,
        isRightToLeft: Bool,
        isOptimistic: Bool,
        isAgentAuthored: Bool,
        showsAgentGrammar: Bool,
        highlightSearchTerm: String?,
        mentionDisplayNames: [String: String],
        userLanguages: (regional: String?, custom: String?),
        activeDisplayLangCode: String?,
        secondaryLangCode: String?,
        voiceConsentMissing: Bool,
        transcription: String?,
        translatedAudios: [MessageTranslatedAudio],
        allAudioItems: [ConversationViewModel.AudioItem],
        conversationName: String,
        effects: MessageEffects = .none,
        isFocused: Bool = false,
        sentAt: Date = .distantPast,
        revealsTimestamp: Bool = false
    ) {
        self.localId = localId
        self.serverId = serverId
        self.content = content
        self.density = density
        self.isFirstInGroup = isFirstInGroup
        self.senderId = senderId
        self.senderDisplayName = senderDisplayName
        self.senderUsername = senderUsername
        self.senderAvatarURL = senderAvatarURL
        self.senderThumbHash = senderThumbHash
        self.senderColorHex = senderColorHex
        self.senderPresence = senderPresence
        self.senderStoryRing = senderStoryRing
        self.senderMoodEmoji = senderMoodEmoji
        self.accentHex = accentHex
        self.isDark = isDark
        self.isDirect = isDirect
        self.isRightToLeft = isRightToLeft
        self.isOptimistic = isOptimistic
        self.isAgentAuthored = isAgentAuthored
        self.showsAgentGrammar = showsAgentGrammar
        self.highlightSearchTerm = highlightSearchTerm
        self.mentionDisplayNames = mentionDisplayNames
        self.userLanguages = userLanguages
        self.activeDisplayLangCode = activeDisplayLangCode
        self.secondaryLangCode = secondaryLangCode
        self.voiceConsentMissing = voiceConsentMissing
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.allAudioItems = allAudioItems
        self.conversationName = conversationName
        self.effects = effects
        self.isFocused = isFocused
        self.sentAt = sentAt
        self.revealsTimestamp = revealsTimestamp
    }

    /// Manuelle (pas synthétisée) : `userLanguages` est un TUPLE — les
    /// tuples ne conforment à aucun protocole nominal, `Equatable` ne peut
    /// donc pas être auto-synthétisé sur un type qui en porte un en
    /// propriété stockée (même raison documentée par le contrat, qui déclare
    /// cette signature explicitement plutôt que de laisser `Equatable`
    /// implicite). `allAudioItems`/`content` comparés par identité/valeur
    /// (`ConversationViewModel.AudioItem` n'est PAS `Equatable` — comparé
    /// par `id` seul, comme tout gate de re-render dans ce dépôt qui touche
    /// des collections issues du ViewModel, ex. `BubbleContent.Attachments`).
    static func == (lhs: FocalRowInput, rhs: FocalRowInput) -> Bool {
        lhs.localId == rhs.localId
            && lhs.serverId == rhs.serverId
            && lhs.content == rhs.content
            && lhs.density == rhs.density
            && lhs.isFirstInGroup == rhs.isFirstInGroup
            && lhs.senderId == rhs.senderId
            && lhs.senderDisplayName == rhs.senderDisplayName
            && lhs.senderUsername == rhs.senderUsername
            && lhs.senderAvatarURL == rhs.senderAvatarURL
            && lhs.senderThumbHash == rhs.senderThumbHash
            && lhs.senderColorHex == rhs.senderColorHex
            && lhs.senderPresence == rhs.senderPresence
            && lhs.senderStoryRing == rhs.senderStoryRing
            && lhs.senderMoodEmoji == rhs.senderMoodEmoji
            && lhs.accentHex == rhs.accentHex
            && lhs.isDark == rhs.isDark
            && lhs.isDirect == rhs.isDirect
            && lhs.isRightToLeft == rhs.isRightToLeft
            && lhs.isOptimistic == rhs.isOptimistic
            && lhs.isAgentAuthored == rhs.isAgentAuthored
            && lhs.showsAgentGrammar == rhs.showsAgentGrammar
            && lhs.highlightSearchTerm == rhs.highlightSearchTerm
            && lhs.mentionDisplayNames == rhs.mentionDisplayNames
            && lhs.userLanguages == rhs.userLanguages
            && lhs.activeDisplayLangCode == rhs.activeDisplayLangCode
            && lhs.secondaryLangCode == rhs.secondaryLangCode
            && lhs.voiceConsentMissing == rhs.voiceConsentMissing
            && lhs.transcription == rhs.transcription
            && lhs.translatedAudios == rhs.translatedAudios
            && lhs.allAudioItems.map(\.id) == rhs.allAudioItems.map(\.id)
            && lhs.conversationName == rhs.conversationName
            && lhs.effects == rhs.effects
            && lhs.isFocused == rhs.isFocused
            && lhs.sentAt == rhs.sentAt
            && lhs.revealsTimestamp == rhs.revealsTimestamp
    }
}

/// Sac de callbacks — EXCLU de l'`Equatable` (patron `BubbleFooterActions`).
struct FocalRowActions {
    var onToggleReaction: ((String) -> Void)?
    var onAddReaction: ((String) -> Void)?
    var onOpenReactPicker: ((String) -> Void)?
    var onShowReactions: ((String) -> Void)?
    var onShowReadStatus: ((String) -> Void)?
    var onRetry: ((String) -> Void)?
    var onReplyTap: ((String) -> Void)?
    var onStoryReplyTap: ((String) -> Void)?
    var onMediaTap: ((MessageAttachment) -> Void)?
    var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    var onReactToAttachment: ((String, String) -> Void)?
    var onRequestTranslation: ((String, String) -> Void)?
    var onShowTranslationDetail: ((String) -> Void)?
    var onSetActiveDisplayLanguage: ((String, String?) -> Void)?
    var onSetSecondaryLanguage: ((String, String?) -> Void)?
    var onPlayAudio: ((String) -> Void)?
    /// CORRIGÉ vs le texte littéral du contrat (`ProfileUser`, inexistant
    /// dans le dépôt) — voir doc de tête de fichier.
    var onOpenProfile: ((ProfileSheetUser) -> Void)?
    /// Ouvre le menu complet du message (édition, suppression, signalement,
    /// traduction détaillée…) depuis la barre de contrôles de la rangée élue.
    /// Câblé sur le MÊME gestionnaire que l'appui long — la barre est une
    /// affordance supplémentaire vers le menu existant, jamais une seconde
    /// liste d'actions.
    var onMore: ((String) -> Void)?
    var onViewStory: ((String) -> Void)?
    var onCallBack: ((String) -> Void)?
    var onLongPressCallDetail: ((String) -> Void)?
    /// File de lecture continue : `ConversationViewModel.audioQueueTail(after:)`
    /// verbatim — la même que le chemin bulle, jamais redéfinie. Sans elle,
    /// une piste jouée depuis Focal s'arrêtait à sa fin au lieu d'enchaîner.
    var audioQueueTailProvider: ((String) -> [QueuedAudio])?
    /// Tap sur l'avertissement de consentement vocal (message à soi avec
    /// clonage non consenti) — pousse les Réglages, comme côté bulle.
    var onTapConsentNotice: (() -> Void)?

    init(
        onToggleReaction: ((String) -> Void)? = nil,
        onAddReaction: ((String) -> Void)? = nil,
        onOpenReactPicker: ((String) -> Void)? = nil,
        onShowReactions: ((String) -> Void)? = nil,
        onShowReadStatus: ((String) -> Void)? = nil,
        onRetry: ((String) -> Void)? = nil,
        onReplyTap: ((String) -> Void)? = nil,
        onStoryReplyTap: ((String) -> Void)? = nil,
        onMediaTap: ((MessageAttachment) -> Void)? = nil,
        onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)? = nil,
        onReactToAttachment: ((String, String) -> Void)? = nil,
        onRequestTranslation: ((String, String) -> Void)? = nil,
        onShowTranslationDetail: ((String) -> Void)? = nil,
        onSetActiveDisplayLanguage: ((String, String?) -> Void)? = nil,
        onSetSecondaryLanguage: ((String, String?) -> Void)? = nil,
        onPlayAudio: ((String) -> Void)? = nil,
        onOpenProfile: ((ProfileSheetUser) -> Void)? = nil,
        onViewStory: ((String) -> Void)? = nil,
        onCallBack: ((String) -> Void)? = nil,
        onLongPressCallDetail: ((String) -> Void)? = nil,
        audioQueueTailProvider: ((String) -> [QueuedAudio])? = nil,
        onTapConsentNotice: (() -> Void)? = nil
    ) {
        self.onToggleReaction = onToggleReaction
        self.onAddReaction = onAddReaction
        self.onOpenReactPicker = onOpenReactPicker
        self.onShowReactions = onShowReactions
        self.onShowReadStatus = onShowReadStatus
        self.onRetry = onRetry
        self.onReplyTap = onReplyTap
        self.onStoryReplyTap = onStoryReplyTap
        self.onMediaTap = onMediaTap
        self.onConsumeViewOnce = onConsumeViewOnce
        self.onReactToAttachment = onReactToAttachment
        self.onRequestTranslation = onRequestTranslation
        self.onShowTranslationDetail = onShowTranslationDetail
        self.onSetActiveDisplayLanguage = onSetActiveDisplayLanguage
        self.onSetSecondaryLanguage = onSetSecondaryLanguage
        self.onPlayAudio = onPlayAudio
        self.onOpenProfile = onOpenProfile
        self.onViewStory = onViewStory
        self.onCallBack = onCallBack
        self.onLongPressCallDetail = onLongPressCallDetail
        self.audioQueueTailProvider = audioQueueTailProvider
        self.onTapConsentNotice = onTapConsentNotice
    }
}
