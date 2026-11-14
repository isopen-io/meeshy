import CoreGraphics
import Foundation
import MeeshyUI

/// #17343 — ce que la pilule porte de TEXTE au-dessus de sa rangée de base. Les
/// sous-titres et le journal vivent DANS son verre, en duo comme en groupe ; le
/// journal s'ouvre à la place des sous-titres ; (…) les range tous deux et refermer
/// les actions les rend ; un toucher qui range la pilule laisse les sous-titres dans
/// un verre sans rangée (loi 11 de `docs/product/appels-vue-finale.md`).
enum CallPillText: Equatable, Sendable {
    /// Rien au-dessus de la rangée de base.
    case none
    /// Les deux dernières phrases, dans le verre de la pilule.
    case captions
    /// Tout l'appel, à la place des sous-titres.
    case journal
    /// La pilule est rangée : les sous-titres restent, dans un verre sans rangée de base.
    case captionsAlone

    /// `isCaptionsEnabled` : le réglage Sous-titres de l'utilisateur. Le journal, lui,
    /// garde tout l'appel sous-titres allumés ou non (#17342).
    static func resolve(isCaptionsEnabled: Bool, layer: CallScreenLayer, isChromeRevealed: Bool) -> CallPillText {
        guard !layer.freesTheScreen else { return .none }
        guard isChromeRevealed else { return isCaptionsEnabled ? .captionsAlone : .none }
        if layer.pillPanel == .journal { return .journal }
        return isCaptionsEnabled && layer == .idle ? .captions : .none
    }

    /// Seule la pilule rangée laisse les sous-titres sans leur rangée de base.
    var hasBaseRow: Bool {
        self != .captionsAlone
    }

    /// Les sous-titres sont dans le verre : au repos, ou seuls quand la pilule est rangée.
    var showsCaptionsBand: Bool {
        self == .captions || self == .captionsAlone
    }

    /// Loi 11 · 17 — rangée, la pilule ne s'efface pas : son verre reste à l'écran, privé de sa
    /// rangée de base, et se resserre autour des sous-titres. Pas de second verre.
    var staysWhenChromeStowed: Bool {
        self == .captionsAlone
    }

    /// U2.9 — en plein écran de groupe, la pilule est rangée avec les contrôles : seul son verre de
    /// sous-titres, privé de sa rangée de base, reste sur la scène. Hors plein écran, elle y est toujours.
    func isOnStage(isStageFullScreen: Bool) -> Bool {
        !isStageFullScreen || staysWhenChromeStowed
    }

    /// Le journal prend une part de la fenêtre (`CallJournalSizing`) : en audio,
    /// l'avatar se resserre alors en en-tête compact pour lui laisser la place.
    var compactsAudioLayout: Bool {
        self == .journal
    }
}

/// P9b.15 (#17529, #18206) — en duo audio, le journal ouvert dans la pilule RÉDUIT l'avatar de 120 à
/// 56 pt en en-tête compact, le nom et la durée à côté. Le passage est un morphisme : UNE vue
/// d'avatar, dessinée à sa taille de repos et réduite par une échelle, glisse vers l'en-tête pendant
/// que le nom et la durée la rejoignent en fondu (≈ 200 ms) ; « Réduire les animations » en fait un
/// fondu court, sans déplacement ni échelle. Mêmes vecteurs qu'Android (`CallAudioStageLayout`).
nonisolated enum CallAudioStageLayout {
    static let fullAvatarSize: CGFloat = 120
    static let compactAvatarSize: CGFloat = 56
    static let morphDuration: TimeInterval = 0.2

    static var shrinkScale: CGFloat { compactAvatarSize / fullAvatarSize }

    static func avatarSize(isCompact: Bool) -> CGFloat {
        isCompact ? compactAvatarSize : fullAvatarSize
    }

    static func faceScale(isCompact: Bool) -> CGFloat {
        isCompact ? shrinkScale : 1
    }

    static func morphs(reduceMotion: Bool) -> Bool {
        !reduceMotion
    }

    static func transitionDuration(reduceMotion: Bool) -> TimeInterval {
        morphs(reduceMotion: reduceMotion) ? morphDuration : CallChromeStow.reducedFadeDuration
    }

    /// Une identité pour les deux dispositions tant que l'avatar se déplace ; sous « Réduire les
    /// animations », une par disposition, qui se fondent sur place.
    static func identity(isCompact: Bool, reduceMotion: Bool) -> Int {
        guard !morphs(reduceMotion: reduceMotion) else { return 0 }
        return isCompact ? 2 : 1
    }

    /// #18488 — la hauteur qu'il faut au repos sous la rangée d'en-tête : l'avatar de 120 pt et son
    /// marge, le nom, la durée, la rangée d'états et leurs trois interlignes.
    static let restContentHeight: CGFloat = 270

    /// #18488 — la forme de la scène audio : celle du repos, celle du journal ouvert dans la pilule
    /// (P9b), ou la même forme compacte quand c'est la HAUTEUR qui manque (iPad en fenêtre basse).
    nonisolated enum Form: Equatable, Sendable {
        case rest, journal, lowHeight

        var isCompact: Bool { self != .rest }

        /// Hauteur courte seulement : les états (micro coupé, reconnexion…) restent sous la durée. Sous
        /// le journal, P9b.2 n'en pose aucune.
        var showsStatuses: Bool { self == .lowHeight }
    }

    /// Le journal ouvert garde sa forme. Sinon la scène passe à la forme compacte dès qu'elle ne tient
    /// plus sous la rangée d'en-tête (`stageHeight` : celle de la scène, mesurée ; 0 = pas encore mesurée).
    static func form(isJournalOpen: Bool, stageHeight: CGFloat, topClearance: CGFloat) -> Form {
        guard !isJournalOpen else { return .journal }
        guard stageHeight > 0, stageHeight < topClearance + restContentHeight else { return .rest }
        return .lowHeight
    }

    static func avatarSize(form: Form) -> CGFloat { avatarSize(isCompact: form.isCompact) }

    static func faceScale(form: Form) -> CGFloat { faceScale(isCompact: form.isCompact) }

    static func identity(form: Form, reduceMotion: Bool) -> Int {
        identity(isCompact: form.isCompact, reduceMotion: reduceMotion)
    }
}

/// #17343 — UNE largeur pour le verre : la pilule qui porte du texte et le verre
/// des sous-titres rangés sont limités à 560 pt pour que l'œil ne balaie pas tout
/// l'écran (paysage, tablette) ; la pilule au repos garde ses 440 pt.
/// #17935 — UNE borne pour toute pilule agrandie, duo comme groupe : les rangées du
/// groupe ou une option dépliées au-dessus de la rangée de base la prennent aussi.
/// C'est la loi du verre partagée (K10, `MeeshyGlassPillRecipe.width`) : un dessus
/// porte le plafond agrandi, une rangée seule le plafond réparti.
enum CallPillWidth {
    static let resting: CGFloat = MeeshyGlassPillRecipe.spreadMaxWidth
    static let text: CGFloat = MeeshyGlassPillRecipe.expandedMaxWidth

    static func maxWidth(for content: CallPillText, unfoldsAbove: Bool) -> CGFloat {
        MeeshyGlassPillRecipe.width(
            layout: .spread(maxWidth: resting),
            hasAbove: content != .none || unfoldsAbove,
            place: .greatestFiniteMagnitude,
            naturalWidth: 0,
            expandedMaxWidth: text
        )
    }
}

/// #17343 — la hauteur du journal dans la pilule : une part de la fenêtre, jamais
/// sous un plancher lisible ni au-dessus d'un plafond (la grille de groupe garde ainsi
/// sa place).
enum CallJournalSizing {
    static let share: CGFloat = 0.45
    static let minimum: CGFloat = 160
    static let maximum: CGFloat = 440

    static func height(windowHeight: CGFloat) -> CGFloat {
        min(max(windowHeight * share, minimum), maximum)
    }

    /// #18488 — ce que le journal du duo audio laisse aux autres : l'espace entre l'avatar compact et le
    /// journal, son titre et son pied (« Journal » en disque blanc), la rangée de base et l'encart bas.
    static let compactHeaderGap: CGFloat = MeeshySpacing.md
    static let panelChrome: CGFloat = 84
    static let baseRowHeight: CGFloat = 68
    /// Plancher lisible quand la fenêtre est basse : environ deux phrases, jamais zéro.
    static let compactMinimum: CGFloat = 56

    static func reservedAround(topClearance: CGFloat, bottomInset: CGFloat) -> CGFloat {
        topClearance + CallAudioStageLayout.compactAvatarSize + compactHeaderGap + panelChrome + baseRowHeight + bottomInset
    }

    /// Le journal ne prend que ce qu'il reste dans la fenêtre : la pilule entière, (…) compris, y
    /// reste ; seul le plancher lisible peut la dépasser.
    static func height(windowHeight: CGFloat, reservedAround: CGFloat) -> CGFloat {
        max(compactMinimum, min(height(windowHeight: windowHeight), windowHeight - reservedAround))
    }

    /// Le groupe garde la part de la fenêtre (sa grille a sa propre loi) ; le duo audio ne prend que ce
    /// qu'il reste autour de l'avatar compact et de la pilule.
    static func listHeight(isGroup: Bool, windowHeight: CGFloat, topClearance: CGFloat, bottomInset: CGFloat) -> CGFloat {
        guard !isGroup else { return height(windowHeight: windowHeight) }
        return height(windowHeight: windowHeight, reservedAround: reservedAround(topClearance: topClearance, bottomInset: bottomInset))
    }
}

/// #17343 — le pied des sous-titres : ce que les lignes disent de leur traduction, à
/// côté du bouton Journal. Un seul composant pour le duo et le groupe : une paire de
/// langues dit « EN → FR · toucher = original », plusieurs paires « Traduit · N langues »,
/// et une traduction attendue « EN · traduction en cours » (planche, vues P3 et P13).
enum CallCaptionsFooter: Equatable, Sendable {
    case none
    case translating(language: String)
    case touchForOriginal(pair: String)
    case translatedLanguages(count: Int)

    /// `lines` : les lignes déjà `settled(at:)`, pour qu'une attente échue ne parle plus.
    static func resolve(lines: [CallCaptionLine]) -> CallCaptionsFooter {
        let speech = lines.filter { !$0.isEvent }
        if let waiting = speech.last(where: \.isAwaitingTranslation)?.originLanguage {
            return .translating(language: waiting)
        }
        let pairs = speech.compactMap { line in
            line.originLanguage.flatMap { origin in line.servedLanguage.map { (origin, $0) } }
        }
        guard let newest = pairs.last else { return .none }
        let distinct = Set(pairs.map { "\($0.0)>\($0.1)" })
        guard distinct.count > 1 else { return .touchForOriginal(pair: "\(newest.0) → \(newest.1)") }
        return .translatedLanguages(count: Set(pairs.flatMap { [$0.0, $0.1] }).count)
    }

    /// #17964 — le pied du journal ouvert dans la pilule, à côté de « Journal » qui le referme :
    /// le même pied que celui des sous-titres, sans attente — le journal n'en dessine aucune.
    static func journal(lines: [CallCaptionLine]) -> CallCaptionsFooter {
        resolve(lines: lines.map { $0.settled(at: .distantFuture) })
    }
}
