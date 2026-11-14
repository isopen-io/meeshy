import CoreGraphics
import Foundation
import MeeshySDK
import SwiftUI

nonisolated enum CallModeCarouselRule {
    static let selectedScale: CGFloat = 1
    static let neighbourScale: CGFloat = 0.78
    static let selectedOpacity: Double = 1
    static let neighbourOpacity: Double = 0.6

    static func scale(isSelected: Bool) -> CGFloat {
        isSelected ? selectedScale : neighbourScale
    }

    static func opacity(isSelected: Bool) -> Double {
        isSelected ? selectedOpacity : neighbourOpacity
    }

    /// Loi 17.10 — sous « Réduire les animations », le carrousel ne supprime pas son animation : la
    /// case choisie et l'indice s'estompent du fondu court du chrome, jamais d'une bascule sèche.
    static func animation(reduceMotion: Bool, full: Animation) -> Animation {
        reduceMotion ? .easeInOut(duration: CallChromeStow.reducedFadeDuration) : full
    }

    /// La taille d'une case ne glisse pas sous réduction : seul le fondu (`animation`) la suit.
    static func scaleAnimation(reduceMotion: Bool) -> Animation? {
        reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.8)
    }

    static func sideInset(containerWidth: CGFloat, itemWidth: CGFloat) -> CGFloat {
        max(0, (containerWidth - itemWidth) / 2)
    }

    static func stepping<Item: Equatable>(_ selection: Item, in items: [Item], by step: Int) -> Item {
        guard let index = items.firstIndex(of: selection) else { return items.first ?? selection }
        return items[min(max(index + step, 0), items.count - 1)]
    }

    // MARK: - Suivre le doigt (#8736)

    /// Un pouce posé quelques points au-dessus ou au-dessous d'un élément
    /// défile quand même : la bande de glissé ne descend jamais sous 88 pt.
    static let minimumTrackHeight: CGFloat = 88

    /// Le défilement est au repos quand le centre n'a plus bougé depuis ce
    /// délai (iOS 16 et 17, qui ne disent pas la phase du défilement).
    static let restDelayNanoseconds: UInt64 = 150_000_000

    static func trackHeight(itemHeight: CGFloat) -> CGFloat {
        max(itemHeight, minimumTrackHeight)
    }

    static func verticalMargin(itemHeight: CGFloat) -> CGFloat {
        (trackHeight(itemHeight: itemHeight) - itemHeight) / 2
    }

    /// Le centre visuel suit le doigt ; le CHOIX (l'effet envoyé à l'autre,
    /// le montage) ne part qu'au repos.
    static func commits(isInteracting: Bool) -> Bool {
        !isInteracting
    }

    /// Un défilement programmé ne se lance jamais sous le doigt.
    static func mayFollowSelection(isInteracting: Bool) -> Bool {
        !isInteracting
    }

    /// Après un toucher sur un élément lointain, le glissé qui l'amène au
    /// centre ne choisit personne en chemin : il n'est posé qu'une fois la
    /// cible au centre (miroir du `settling` du web).
    static func settled<Item: Equatable>(nearest: Item?, target: Item?) -> Bool {
        guard let target else { return true }
        return nearest == target
    }

    /// iOS 16 ne rend pas l'élément centré : il se déduit du décalage, les
    /// éléments ayant tous la même largeur et la piste une marge qui centre
    /// le premier.
    static func nearestIndex(offset: CGFloat, itemWidth: CGFloat, spacing: CGFloat, count: Int) -> Int? {
        let step = itemWidth + spacing
        guard count > 0, step > 0, offset.isFinite else { return nil }
        let index = Int((offset / step).rounded())
        return min(max(index, 0), count - 1)
    }

    /// #18192 — la place d'un élément, comptée à partir de 1, pour que la voix dise « 3 sur 12 ».
    static func ordinal<Item: Equatable>(of item: Item, in items: [Item]) -> CallModeCarouselOrdinal? {
        guard let index = items.firstIndex(of: item) else { return nil }
        return CallModeCarouselOrdinal(rank: index + 1, count: items.count)
    }
}

nonisolated struct CallModeCarouselOrdinal: Equatable, Sendable {
    let rank: Int
    let count: Int
}

nonisolated enum CallModeCarouselActivation<Item: Equatable>: Equatable {
    case apply(Item)
    case confirm
}

/// #18192 — sous VoiceOver, le carrousel est UN élément ajustable : la position PARCOURUE (ce que
/// la voix annonce) est distincte de l'effet APPLIQUÉ. Balayer haut/bas déplace la position sans rien
/// poser ; l'activation applique ce qui est annoncé — ou, si c'est déjà l'effet posé, se contente de
/// confirmer (la barre rend son menu de base, C1 généralisée) ; quitter l'élément oublie la position.
/// Un `variant` (la déclinaison d'un cadre) se parcourt de même, à partir de celle qui est posée.
nonisolated struct CallModeCarouselBrowse<Item: Equatable>: Equatable {
    private(set) var browsed: Item?
    private(set) var variant: Item?

    init() {}

    var isBrowsing: Bool {
        browsed != nil || variant != nil
    }

    func position(applied: Item) -> Item {
        browsed ?? applied
    }

    @discardableResult
    mutating func step(by offset: Int, in items: [Item], applied: Item) -> Bool {
        let from = position(applied: applied)
        let next = CallModeCarouselRule.stepping(from, in: items, by: offset)
        guard next != from else { return false }
        browsed = next
        variant = nil
        return true
    }

    @discardableResult
    mutating func stepVariant(by offset: Int, applied: Item, variants: (Item) -> [Item], current: (Item) -> Item) -> Bool {
        let base = position(applied: applied)
        let list = variants(base)
        let from = variant ?? current(base)
        guard list.count > 1, list.contains(from) else { return false }
        let next = CallModeCarouselRule.stepping(from, in: list, by: offset)
        guard next != from else { return false }
        browsed = base
        variant = next
        return true
    }

    func activation(applied: Item, current: (Item) -> Item = { $0 }) -> CallModeCarouselActivation<Item> {
        if let variant {
            return variant == current(position(applied: applied)) ? .confirm : .apply(variant)
        }
        let target = position(applied: applied)
        return target == applied ? .confirm : .apply(target)
    }

    mutating func leave() {
        browsed = nil
        variant = nil
    }
}

/// #8736 — l'état du défilement d'un carrousel : qui le fait bouger (le
/// doigt, ou le carrousel qui amène au centre un élément touché), et ce que
/// le repos choisit.
nonisolated struct CallModeCarouselMotion<Item: Equatable> {
    private(set) var settling: Item?
    private(set) var isInteracting = false

    init() {}

    /// Le centre a changé. Pendant un trajet programmé, seule l'arrivée
    /// compte ; sinon, sans phase de défilement lisible, c'est le doigt.
    mutating func moved(to nearest: Item?, infersInteraction: Bool) {
        guard settling == nil else {
            if CallModeCarouselRule.settled(nearest: nearest, target: settling) { settling = nil }
            return
        }
        if infersInteraction { isInteracting = true }
    }

    /// La phase du défilement (iOS 18) : un doigt qui glisse reprend la main
    /// sur le trajet en cours.
    mutating func userScrolling(_ scrolling: Bool) {
        isInteracting = scrolling
        if scrolling { settling = nil }
    }

    /// Un toucher reconnu : le doigt ne défile pas.
    mutating func tapped() {
        isInteracting = false
        settling = nil
    }

    /// Amener la sélection au centre, si le doigt le permet ; la cible est
    /// retenue pour que le trajet ne choisisse personne.
    mutating func follows(_ selection: Item, from nearest: Item?) -> Bool {
        guard CallModeCarouselRule.mayFollowSelection(isInteracting: isInteracting), nearest != selection else { return false }
        settling = selection
        return true
    }

    /// Le défilement s'arrête : l'élément au centre est choisi — sauf au
    /// milieu d'un trajet programmé, qui n'a choisi personne en chemin.
    mutating func rests(on nearest: Item?, selection: Item) -> Item? {
        let target = settling
        settling = nil
        guard CallModeCarouselRule.commits(isInteracting: isInteracting),
              CallModeCarouselRule.settled(nearest: nearest, target: target),
              let nearest, nearest != selection else { return nil }
        return nearest
    }
}

nonisolated enum CallEffectsCategory: String, CaseIterable, Sendable {
    case face
    case color

    var kind: CallEffectKind {
        switch self {
        case .face: return .face
        case .color: return .color
        }
    }

    init?(kind: CallEffectKind) {
        switch kind {
        case .face: self = .face
        case .color: self = .color
        case .frame, .landscape, .voice: return nil
        }
    }
}

enum CallEffectsModeRule {
    static let faces: [CallFaceEffect] = CallFaceEffect.allCases
    static let colors: [VideoFilterPreset] = VideoFilterPreset.catalog

    static func colorSelection(of config: VideoFilterConfig) -> VideoFilterPreset {
        config.activePreset ?? .natural
    }

    static func applying(color preset: VideoFilterPreset, to config: VideoFilterConfig) -> VideoFilterConfig {
        config.applyingPreset(preset == .natural ? nil : preset)
    }
}

/// P8b.6 — Réglages ouvert, la bande de looks et les puces partent en fondu pendant que le
/// panneau monte depuis la barre resserrée, ≈ 200 ms ; il y redescend au retour.
/// « Réduire les animations » garde un fondu court, sans montée : l'écran ne change jamais d'un coup.
nonisolated enum CallEffectsSettingsMotion {
    static let rise: CGFloat = 20

    static func duration(reduceMotion: Bool) -> Double {
        reduceMotion ? 0.15 : 0.2
    }

    static func panelRise(reduceMotion: Bool) -> CGFloat {
        reduceMotion ? 0 : rise
    }
}

/// #17811 · C1.12 — la barre et le carrousel du Montage montent depuis le bas et y
/// redescendent, sur la couche qui fond. Effets garde le seul fondu de la couche :
/// la loi 17 l'excepte (« Effets emprunte au composer », loi 9). « Réduire les
/// animations » ne laisse que ce fondu court.
enum CallModeChromeMotion {
    static func risesFromBottom(_ mode: CallScreenMode, reduceMotion: Bool) -> Bool {
        switch mode {
        case .montage: return !reduceMotion
        case .effects: return false
        }
    }
}

enum CallModeGesture: CaseIterable, Sendable {
    case tap
    case doubleTap
    case longPress
}

enum CallModeGestureOutcome: Equatable, Sendable {
    case select
    case capturePhoto
    case startRecording
    case none
}

/// #8625 — le style choisi SE déclenche : deux tapes prennent la photo, un
/// appui long filme ; un autre style se choisit d'un simple toucher. Pendant
/// l'enregistrement, seul le bouton stop du gabarit l'arrête.
enum CallModeGestureRule {
    static let longPressDuration: Double = 0.45

    static func outcome(of gesture: CallModeGesture, isSelected: Bool, isRecording: Bool) -> CallModeGestureOutcome {
        guard isSelected else { return .select }
        guard !isRecording else { return .none }
        switch gesture {
        case .tap: return .none
        case .doubleTap: return .capturePhoto
        case .longPress: return .startRecording
        }
    }

    static func listensForShots(isSelected: Bool, isRecording: Bool) -> Bool {
        isSelected && !isRecording
    }

    static func showsHint(hasSeenHint: Bool, isRecording: Bool) -> Bool {
        !hasSeenHint && !isRecording
    }

    static func clock(_ elapsed: TimeInterval, locale: Locale = .current) -> String {
        MediaFormat.duration(elapsed, locale: locale)
    }
}

/// OPUS-4 — avant la connexion, le bouton « Effets » ouvre le MÊME mode que
/// l'appel établi. Ce que ce mode montre et permet tant que l'autre n'a pas
/// décroché se lit ici, sans vue.
enum CallPreConnectEffectsRule {
    /// Le mode Effets se pose hors de l'appel établi : appel vidéo sortant qui
    /// sonne, offre envoyée, connexion en cours (des deux côtés) ou établie
    /// sans média négocié. Jamais sur la sonnerie ENTRANTE : l'écran d'appel
    /// entrant n'a pas de bouton Effets, et rien de ma caméra n'y est montré.
    static func showsMode(
        _ mode: CallScreenMode?,
        state: CallState,
        isVideoEnabled: Bool,
        showsConnectedLayout: Bool
    ) -> Bool {
        guard case .effects? = mode, isVideoEnabled, !showsConnectedLayout else { return false }
        switch state {
        case .ringing(let isOutgoing): return isOutgoing
        case .offering, .connecting, .connected, .reconnecting: return true
        case .idle, .ended: return false
        }
    }

    /// Photo et film de mon image n'existent qu'une fois l'appel établi :
    /// avant, il n'y a rien à garder de l'appel, et la capture ne s'arme pas
    /// (aucune trame tirée de la piste locale pour rien).
    static func capturesMyImage(showsConnectedLayout: Bool) -> Bool {
        showsConnectedLayout
    }

    /// Les vignettes des autres au-dessus du carrousel (#8737) n'ont de sens
    /// qu'à plusieurs : avant le décroché, personne n'est encore là.
    static func showsCompanions(showsConnectedLayout: Bool) -> Bool {
        showsConnectedLayout
    }
}
