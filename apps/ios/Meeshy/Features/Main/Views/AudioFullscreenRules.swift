import Foundation
import CoreGraphics
import MeeshySDK
import MeeshyUI

// MARK: - Les lois du plein écran audio (#10383, #8916)
//
// Directive porteur du 2026-10-12 : « Le swipe left et right doivent faire
// défiler dans les attachements audio ordonnés par temps de réception ;
// lorsqu'un audio finit il passe au suivant lorsqu'on est en plein écran, dans
// l'ordre de réception simplement. »
//
// Tout ce qui DÉCIDE vit ici, sans vue : l'ordre des pages, la page qui suit,
// la file que le lecteur partagé doit jouer, le moment où le chrome s'efface et
// la disposition. `nonisolated` : la cible app compile en isolation MainActor
// par défaut, le bundle de tests non.

/// **L'ordre des vocaux du plein écran : la date de RÉCEPTION, et rien d'autre.**
///
/// Ni « non écoutés d'abord », ni l'ordre où la fenêtre les a chargés : le
/// porteur l'a dit « simplement ». À date égale — plusieurs vocaux d'un même
/// message —, l'ordre d'arrivée est gardé, pour qu'un tri ne puisse jamais
/// permuter deux pièces d'un même lot.
nonisolated enum AudioFullscreenSequence {

    static func ordered<Item>(_ items: [Item], receivedAt: (Item) -> Date) -> [Item] {
        items.enumerated()
            .sorted { lhs, rhs in
                let left = receivedAt(lhs.element)
                let right = receivedAt(rhs.element)
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)
    }

    /// Le vocal reçu juste APRÈS `id` — `nil` au dernier, ou pour une pièce
    /// absente de la suite.
    static func next(after id: String, in ids: [String]) -> String? {
        guard let index = ids.firstIndex(of: id), index + 1 < ids.count else { return nil }
        return ids[index + 1]
    }

    /// Le vocal reçu juste AVANT `id` — `nil` au premier.
    static func previous(before id: String, in ids: [String]) -> String? {
        guard let index = ids.firstIndex(of: id), index > 0 else { return nil }
        return ids[index - 1]
    }

    /// **Ce que le lecteur partagé doit jouer APRÈS `id`, tant que le plein
    /// écran est ouvert** : toute la suite, dans l'ordre de réception, écoutés
    /// compris. C'est ce qui fait que la fin d'un vocal enchaîne sur la page
    /// voisine, et non sur le prochain vocal NON ÉCOUTÉ de la conversation.
    static func upcoming(after id: String, in ids: [String]) -> [String] {
        guard let index = ids.firstIndex(of: id) else { return [] }
        return Array(ids[(index + 1)...])
    }

    /// **La page que l'écran doit rejoindre quand la piste ACTIVE change sans
    /// lui** — enchaînement en fin de vocal, « suivant » de l'écran verrouillé.
    ///
    /// `nil` quand la piste est déjà celle de la page, ou quand elle n'est pas
    /// une page de ce plein écran : un vocal d'une autre conversation ne fait
    /// pas tourner les pages de celle-ci.
    ///
    /// `nil` aussi quand la piste est celle que l'ÉCRAN vient de demander
    /// (`requestedByScreen`) : une page qu'on a déjà quittée a lancé sa piste,
    /// et l'annonce arrive après le doigt. La suivre ramènerait l'écran en
    /// arrière (#10568) — seule une piste que le LECTEUR a choisie fait tourner
    /// les pages.
    static func pageToFollow(activeAttachmentId: String?,
                             currentPageId: String?,
                             ids: [String],
                             requestedByScreen: String? = nil) -> String? {
        guard let active = activeAttachmentId,
              active != currentPageId,
              active != requestedByScreen,
              ids.contains(active) else { return nil }
        return active
    }
}

/// **Ce qu'un balayage coûte** (#10568) — la fenêtre de rendu et le moment où
/// la piste change.
///
/// Un pager paresseux réalise à la demande et ne libère jamais (leçon 292) :
/// sans fenêtre, chaque vocal traversé garde son onde, ses abonnements et sa
/// transcription vivants, et le balayage ralentit avec le chemin parcouru.
nonisolated enum AudioFullscreenPaging {

    /// La page visible et ses deux voisines : exactement ce qu'un glissement en
    /// cours peut montrer.
    static let renderRadius = 1

    /// La position de la page REGARDÉE dans la liste du moment. La liste bouge
    /// sous l'écran ouvert (vocal expiré, supprimé pour tous) : une position
    /// gardée telle quelle glissait sur le vocal voisin, qui recevait alors la
    /// réaction ou la réponse.
    static func index(of pageID: String?, in ids: [String]) -> Int? {
        guard let pageID else { return nil }
        return ids.firstIndex(of: pageID)
    }

    static func renders(index: Int, current: Int) -> Bool {
        abs(index - current) <= renderRadius
    }

    /// Le temps qu'une page doit rester POSÉE avant que sa piste parte.
    static let settleDelay: TimeInterval = 0.16

    /// **La piste change une fois la page posée, jamais au milieu du geste.**
    ///
    /// Le pager annonce la nouvelle page au franchissement de la mi-course, le
    /// doigt encore sur l'écran : y lancer la lecture arrêtait le moteur et en
    /// chargeait un autre pendant le glissement, et un aller-retour relançait
    /// deux fois. La page d'ENTRÉE, elle, part sans attendre — on l'a touchée
    /// pour l'écouter.
    static func playbackDelay(turnedTo: Bool) -> TimeInterval {
        turnedTo ? settleDelay : 0
    }
}

/// **Quand le chrome s'efface de lui-même** — la loi du SDK
/// (`FullscreenChromeState.autoHideDelay`), plus une exception que l'audio
/// rend nécessaire.
///
/// Sans image, l'écran d'un vocal se lit au lecteur d'écran autant qu'à l'œil :
/// un bouton qui s'efface sous VoiceOver disparaît de la rotation pendant qu'on
/// la parcourt. Le chrome ne s'efface donc JAMAIS sous VoiceOver.
nonisolated enum AudioFullscreenChromeTiming {

    static func autoHideDelay(state: FullscreenChromeState,
                              isPlaying: Bool,
                              voiceOverRunning: Bool) -> Double? {
        guard !voiceOverRunning else { return nil }
        return state.autoHideDelay(isPlaying: isPlaying)
    }
}

/// **La disposition d'une page audio** — mesurée sur le conteneur réel, jamais
/// sur l'écran (Split View, iPad, paysage).
nonisolated struct AudioFullscreenLayout: Equatable, Sendable {

    enum Arrangement: Equatable, Sendable {
        /// Portrait : le portrait de l'auteur, la forme d'onde, puis le texte.
        case stacked
        /// Paysage d'un téléphone : deux colonnes, sans quoi la transcription
        /// n'aurait plus de hauteur.
        case sideBySide
    }

    let arrangement: Arrangement
    /// Le diamètre du portrait de l'auteur, au cœur de la page.
    let heroDiameter: CGFloat
    /// La hauteur que la transcription peut prendre avant de défiler.
    let transcriptMaxHeight: CGFloat
    /// La largeur au-delà de laquelle le contenu ne s'étire plus (iPad).
    let contentMaxWidth: CGFloat
    /// Le corps des paroles.
    let lyricSize: CGFloat

    static let minHero: CGFloat = 72
    static let maxHero: CGFloat = 168
    static let minTranscript: CGFloat = 72
    static let maxTranscript: CGFloat = 240
    static let readableWidth: CGFloat = 600
    /// L'écart entre deux blocs de la page empilée.
    static let stackSpacing: CGFloat = 12
    /// Le plancher des paroles : trois lignes en grand corps.
    static let minLyrics: CGFloat = 120
    /// Le corps de la transcription avant le 2026-10-13.
    static let baseTranscriptSize: CGFloat = 14
    /// Les paroles, par rapport à ce corps : quatre fois (première directive du
    /// 2026-10-13), puis « diminue de 0,4 » le même soir — 4 × 0,6.
    static let lyricScale: CGFloat = 2.4

    /// **Ce que la page empilée occupe SANS le cadran**, à la taille de texte
    /// par défaut : barre du haut, identité, transport, les paroles à leur
    /// plancher, la rangée des langues, plus les écarts. Le rail d'actions
    /// flotte sur les paroles : il ne prend aucune hauteur.
    static let stackedChrome: CGFloat = 52 + 44 + 64 + minLyrics + 60 + stackSpacing * 4

    /// La hauteur minimale d'une page empilée pour ce portrait, cadran compris.
    static func stackedMinimumHeight(heroDiameter: CGFloat) -> CGFloat {
        stackedChrome + heroDiameter + AudioFullscreenDialRule.band * 2
    }

    /// **Les paroles se lisent de loin** : `lyricScale` fois le corps d'avant
    /// sur un grand téléphone, ramené à la largeur sur un petit pour qu'un mot
    /// long tienne sur sa ligne.
    static func lyricSize(forWidth width: CGFloat) -> CGFloat {
        clamp((width * 0.078).rounded(), baseTranscriptSize * 1.6, (baseTranscriptSize * lyricScale).rounded())
    }

    /// **La rangée du bas se pose au-dessus de la barre d'accueil.** La page du
    /// pager descend jusqu'au bord de l'écran : mesurée sur l'iPhone du porteur
    /// (2026-10-13), la rangée des langues passait sous la barre d'accueil. Un
    /// conteneur qui n'annonce aucune marge garde un plancher.
    static func bottomInset(safeArea: CGFloat) -> CGFloat {
        max(safeArea, 28) + 8
    }

    /// **Où se pose le mot en cours**, en fraction de la hauteur de la page : au
    /// premier tiers de la bande restée libre entre l'en-tête et le pied — les
    /// paroles défilent SOUS eux, le centre de l'écran serait sous le flou.
    static func lyricAnchor(header: CGFloat, footer: CGFloat, height: CGFloat) -> CGFloat {
        guard height > 0 else { return 0.5 }
        let free = max(0, height - header - footer)
        return min(1, max(0, (header + free / 3) / height))
    }

    /// **Le portrait prend ce qui reste, jamais ce qui manque** (#10568).
    ///
    /// Il était un pourcentage de la hauteur, additionné à une transcription en
    /// pourcentage elle aussi et à des blocs fixes : la somme dépassait la
    /// hauteur utile, et la barre du haut comme le rail sortaient de l'écran.
    /// Le portrait se mesure désormais sur ce que les blocs fixes laissent, et
    /// les paroles remplissent le reste.
    static func resolve(for size: CGSize) -> AudioFullscreenLayout {
        let sideBySide = size.width > size.height && size.height < 560
        let room = size.height - stackedChrome - AudioFullscreenDialRule.band * 2
        let hero = sideBySide
            ? clamp(size.height * 0.30, minHero, maxHero)
            : clamp(room * 0.36, minHero, maxHero)
        let transcript = clamp(size.height * (sideBySide ? 0.42 : 0.20), minTranscript, maxTranscript)
        return AudioFullscreenLayout(
            arrangement: sideBySide ? .sideBySide : .stacked,
            heroDiameter: hero.rounded(),
            transcriptMaxHeight: transcript.rounded(),
            contentMaxWidth: readableWidth,
            lyricSize: sideBySide
                ? baseTranscriptSize * 2
                : lyricSize(forWidth: min(size.width, readableWidth))
        )
    }

    private static func clamp(_ value: CGFloat, _ lower: CGFloat, _ upper: CGFloat) -> CGFloat {
        min(max(value, lower), upper)
    }
}

/// **La vitesse d'écoute : une pastille qui fait le tour des paliers.**
///
/// Cinq pastilles côte à côte occupaient une rangée entière pour un réglage
/// qu'on touche rarement ; une seule, qui avance d'un palier par toucher, dit la
/// vitesse en cours et laisse la place à ce qu'on écoute (« discret »).
///
/// Isolée au MainActor (défaut de la cible) : `PlaybackSpeed` vit dans
/// MeeshyUI, dont l'isolation par défaut est MainActor — son `Equatable`
/// l'est donc aussi (SE-0470).
enum AudioFullscreenSpeed {

    static var steps: [PlaybackSpeed] { [.x1_0, .x1_25, .x1_5, .x1_75, .x2_0] }

    /// Le palier suivant ; après le dernier, on revient à la vitesse normale.
    /// Une vitesse hors des paliers (posée ailleurs) repart de la normale.
    static func next(after speed: PlaybackSpeed) -> PlaybackSpeed {
        guard let index = steps.firstIndex(of: speed) else { return .x1_0 }
        return steps[(index + 1) % steps.count]
    }

    /// Le palier précédent, pour l'action « diminuer » de VoiceOver.
    static func previous(before speed: PlaybackSpeed) -> PlaybackSpeed {
        guard let index = steps.firstIndex(of: speed), index > 0 else { return .x1_0 }
        return steps[index - 1]
    }
}

/// **Ce que le plein écran audio offre de FAIRE de la pièce** (#8916) —
/// réagir, répondre, créer avec ce son.
///
/// Des fermetures, et non un chemin que la vue prendrait elle-même : elle ne
/// connaît que des sources audio, jamais le `Message` qui les porte. Résoudre
/// le porteur, citer, envoyer et armer le composer sont l'affaire de l'hôte —
/// les MÊMES chemins que la galerie (`ConversationMediaGalleryLayer`), jamais
/// des jumeaux.
///
/// `nil` sur la vue ⇒ aucun bouton (loi 4 : un contrôle existe s'il a un
/// effet). C'est le cas des surfaces SOCIALES, dont le serveur n'expose ni
/// réaction ni réponse par média.
struct AudioFullscreenActions {
    /// Réagir — au MESSAGE qui porte le vocal : c'est sa réaction que la bulle
    /// d'un vocal affiche (aucune pastille par pièce n'existe sur un audio).
    let react: (AudioFullscreenSource, String) -> Void
    /// Répondre sans quitter le plein écran : `(source, texte, langue)`.
    let sendReply: (AudioFullscreenSource, String, String) -> Void
    /// La citation peinte au-dessus de la barre de saisie ; `nil` ⇒ pas de barre.
    let replyCitation: (AudioFullscreenSource) -> ReplyReference?
    /// « Créer avec ce média » : le composer, ce son posé comme son de la scène.
    let compose: (AudioFullscreenSource) -> Void
    /// Ce que la pièce offre, résolu par l'hôte (porteur connu, loi de sortie).
    let offer: (AudioFullscreenSource) -> AudioFullscreenOffer
}

/// Le verdict d'offre d'UNE pièce. Les gardes de protection sont lues ici une
/// fois, pour les trois actions.
nonisolated struct AudioFullscreenOffer: Equatable, Sendable {
    let react: Bool
    let reply: Bool
    let compose: Bool

    static let none = AudioFullscreenOffer(react: false, reply: false, compose: false)

    /// - Parameters:
    ///   - isProtected: la pièce est à vue unique, floutée ou chiffrée
    ///     (`ComposableAttachment.isProtected`) — elle ne se cite pas et ne
    ///     reçoit pas de réaction depuis le plein écran ;
    ///   - hasCarrier: l'hôte connaît le message qui la porte ;
    ///   - composable: la loi de sortie du porteur offre la publication.
    static func resolve(isProtected: Bool, hasCarrier: Bool, composable: Bool) -> AudioFullscreenOffer {
        guard hasCarrier else { return .none }
        return AudioFullscreenOffer(react: !isProtected,
                                    reply: !isProtected,
                                    compose: composable && !isProtected)
    }

    var isEmpty: Bool { !react && !reply && !compose }
}
