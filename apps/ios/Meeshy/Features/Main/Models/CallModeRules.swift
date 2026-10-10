import CoreGraphics
import Foundation

enum CallModeCarouselRule {
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
}

/// #8736 — l'état du défilement d'un carrousel : qui le fait bouger (le
/// doigt, ou le carrousel qui amène au centre un élément touché), et ce que
/// le repos choisit.
struct CallModeCarouselMotion<Item: Equatable> {
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

enum CallEffectsCategory: String, CaseIterable, Sendable {
    case face
    case color
}

enum CallEffectsModeRule {
    static let faces: [CallFaceEffect] = CallFaceEffect.allCases
    static let colors: [VideoFilterPreset] = VideoFilterPreset.allCases

    static func colorSelection(of config: VideoFilterConfig) -> VideoFilterPreset {
        config.activePreset ?? .natural
    }

    static func applying(color preset: VideoFilterPreset, to config: VideoFilterConfig) -> VideoFilterConfig {
        config.applyingPreset(preset == .natural ? nil : preset)
    }

    static func exiting(validated: Bool, current: VideoFilterConfig, original: VideoFilterConfig) -> VideoFilterConfig {
        validated ? current : original
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
        LocalizedNumber.duration(seconds: elapsed, locale: locale)
    }
}
