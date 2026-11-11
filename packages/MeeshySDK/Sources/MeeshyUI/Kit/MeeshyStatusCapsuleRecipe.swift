import SwiftUI

// MARK: - Les valeurs

/// La nature de ce que la capsule dit. **Elle ne colore rien** : elle règle
/// l'haptique, la priorité de l'annonce et le rôle (loi 13 : du verre seul).
public nonisolated enum MeeshyStatusCapsuleKind: String, Sendable, Equatable, CaseIterable {
    case info
    case success
    case warning
    case failure

    /// Le retour du doigt à l'apparition : un `light` pour une information.
    public var feedback: MeeshyStatusCapsuleFeedback {
        switch self {
        case .info: return .light
        case .success: return .success
        case .warning: return .warning
        case .failure: return .error
        }
    }

    /// Seul un échec coupe la parole en cours.
    public var announcesUrgently: Bool { self == .failure }

    /// Le rôle qu'un lecteur d'écran lui donne (le web l'écrit tel quel).
    public var role: MeeshyStatusCapsuleRole { self == .failure ? .alert : .status }
}

/// Le retour haptique d'une nature, nommé comme le site unique de l'app.
public nonisolated enum MeeshyStatusCapsuleFeedback: String, Sendable, Equatable, CaseIterable {
    case light
    case success
    case warning
    case error
}

public nonisolated enum MeeshyStatusCapsuleRole: String, Sendable, Equatable, CaseIterable {
    case status
    case alert
}

/// Le bord d'où elle entre et vers lequel elle se ferme au glisser.
public nonisolated enum MeeshyStatusCapsuleEdge: String, Sendable, Equatable, CaseIterable {
    case bottom
    case top
}

/// Ce que le lecteur d'écran lit d'une capsule visible.
public nonisolated enum MeeshyStatusCapsulePart: String, Sendable, Equatable, CaseIterable {
    case text
    case action
    case close
}

/// L'haptique de l'hôte : `none` laisse l'app jouer le sien.
public nonisolated enum MeeshyStatusCapsuleHostHaptic: String, Sendable, Equatable, CaseIterable {
    case automatic
    case none
}

/// Combien de temps elle reste : `automatic` laisse la loi décider.
public nonisolated enum MeeshyStatusCapsuleDuration: Sendable, Equatable {
    case automatic
    case persistent
    case milliseconds(Int)
}

/// L'unique action : un libellé, un glyphe optionnel, ce qui part au relâcher.
/// Égale par les mots, jamais par la fermeture.
public struct MeeshyStatusCapsuleAction: Equatable {
    public let label: String
    public let systemImage: String?
    public let perform: () -> Void

    public init(label: String, systemImage: String? = nil, perform: @escaping () -> Void) {
        self.label = label
        self.systemImage = systemImage
        self.perform = perform
    }

    public static func == (lhs: MeeshyStatusCapsuleAction, rhs: MeeshyStatusCapsuleAction) -> Bool {
        lhs.label == rhs.label && lhs.systemImage == rhs.systemImage
    }
}

/// Ce que l'hôte présente : l'`id` (opaque, stable pour un même refus) et les
/// champs de la face. Égal par valeurs, jamais par fermetures : un hôte qui
/// repose le même élément ne rejoue rien. `occurrence` dit qu'un même refus est
/// redit (la borne heurtée de nouveau pendant la frappe) : l'élément change, le
/// minuteur de l'hôte repart, et le silence de 2 s par `id` tait l'haptique et
/// l'annonce.
public struct MeeshyStatusCapsuleItem: Equatable, Identifiable {
    public let id: String
    public let message: String
    public let detail: String?
    public let systemImage: String?
    public let kind: MeeshyStatusCapsuleKind
    public let action: MeeshyStatusCapsuleAction?
    public let closeLabel: String?
    public let onDismiss: (() -> Void)?
    public let tone: MeeshyGlassTone?
    public let tint: Color?
    public let duration: MeeshyStatusCapsuleDuration
    public let occurrence: Int

    public init(id: String,
                message: String,
                detail: String? = nil,
                systemImage: String? = nil,
                kind: MeeshyStatusCapsuleKind = .info,
                action: MeeshyStatusCapsuleAction? = nil,
                closeLabel: String? = nil,
                onDismiss: (() -> Void)? = nil,
                tone: MeeshyGlassTone? = nil,
                tint: Color? = nil,
                duration: MeeshyStatusCapsuleDuration = .automatic,
                occurrence: Int = 0) {
        self.id = id
        self.message = message
        self.detail = detail
        self.systemImage = systemImage
        self.kind = kind
        self.action = action
        self.closeLabel = closeLabel
        self.onDismiss = onDismiss
        self.tone = tone
        self.tint = tint
        self.duration = duration
        self.occurrence = occurrence
    }

    public static func == (lhs: MeeshyStatusCapsuleItem, rhs: MeeshyStatusCapsuleItem) -> Bool {
        lhs.id == rhs.id && lhs.message == rhs.message && lhs.detail == rhs.detail
            && lhs.systemImage == rhs.systemImage && lhs.kind == rhs.kind && lhs.action == rhs.action
            && lhs.closeLabel == rhs.closeLabel && (lhs.onDismiss == nil) == (rhs.onDismiss == nil)
            && lhs.tone == rhs.tone && lhs.tint == rhs.tint && lhs.duration == rhs.duration
            && lhs.occurrence == rhs.occurrence
    }
}

// MARK: - La loi du temps

/// **Combien de temps elle reste, et quand elle se tait** (K14) : une loi pure,
/// la même sur les trois plateformes (`K14-MeeshyStatusCapsule.vectors.json`).
public nonisolated enum MeeshyStatusCapsuleTiming {
    public static let automaticMilliseconds = 4000
    public static let screenReaderMilliseconds = 6000
    public static let silenceMilliseconds = 2000

    /// Ce que l'hôte a dit en dernier : l'`id` et l'instant.
    public nonisolated struct Spoken: Equatable, Sendable {
        public let id: String
        public let at: Date

        public init(id: String, at: Date) {
            self.id = id
            self.at = at
        }
    }

    /// La durée visible, en millisecondes ; `nil` ⇒ elle reste tant que l'hôte
    /// ne la retire pas. `automatic` : 4 s sans action, persistante avec une
    /// action ; sous lecteur d'écran, jamais moins de 6 s. Une durée imposée par
    /// l'hôte l'emporte, relevée à 6 s sous lecteur d'écran.
    public static func visibleMilliseconds(duration: MeeshyStatusCapsuleDuration,
                                           hasAction: Bool,
                                           isScreenReaderOn: Bool) -> Int? {
        switch duration {
        case .persistent:
            return nil
        case .automatic:
            guard !hasAction else { return nil }
            return isScreenReaderOn ? screenReaderMilliseconds : automaticMilliseconds
        case .milliseconds(let value):
            return isScreenReaderOn ? max(value, screenReaderMilliseconds) : value
        }
    }

    /// Vrai sauf si le MÊME `id` a parlé il y a moins de 2 s : redit pendant la
    /// même frappe, la borne ne vibrerait qu'une fois par caractère.
    public static func speaks(id: String, at now: Date, last: Spoken?) -> Bool {
        guard let last, last.id == id else { return true }
        return now.timeIntervalSince(last.at) * 1000 >= Double(silenceMilliseconds)
    }
}

// MARK: - La recette

/// **La recette de K14 en VALEURS** : toute mesure de la capsule vit ici, nulle
/// part ailleurs. Un `View` ne s'inspecte pas, sa recette si.
public nonisolated enum MeeshyStatusCapsuleRecipe {
    public static func font(size: CGFloat, weight: Font.Weight) -> Font {
        .system(size: size, weight: weight)
    }

    public static let radius: CGFloat = MeeshyRadius.xlPlus
    public static let maxWidth: CGFloat = 350
    public static let paddingVertical: CGFloat = MeeshySpacing.smPlus
    public static let paddingHorizontal: CGFloat = MeeshySpacing.mdPlus
    public static let gap: CGFloat = MeeshySpacing.smPlus
    public static let iconSize: CGFloat = MeeshyIconSize.lg
    public static let messageSize: CGFloat = MeeshyFont.subheadSize
    public static let detailSize: CGFloat = MeeshyFont.smallSize

    public static let actionHeight: CGFloat = MeeshyControlSize.regular
    public static let actionPaddingHorizontal: CGFloat = MeeshySpacing.lg
    public static let actionGap: CGFloat = MeeshySpacing.xsPlus
    public static let actionGlyphSize: CGFloat = MeeshyIconSize.sm
    public static let actionSize: CGFloat = MeeshyFont.subheadSize
    public static let tapTarget: CGFloat = MeeshyControlSize.tapTarget
    /// Ce dont la cible de l'action déborde son dessin de chaque côté.
    public static let actionHitSlack: CGFloat = (MeeshyControlSize.tapTarget - MeeshyControlSize.regular) / 2

    /// Le ✕ se dessine en 28 et se touche en 44.
    public static let closeSize: CGFloat = MeeshyControlSize.small
    public static let closeGlyphSize: CGFloat = MeeshyIconSize.xs
    public static let closeHitSlack: CGFloat = (MeeshyControlSize.tapTarget - MeeshyControlSize.small) / 2

    /// L'écart à la barre de l'hôte et la marge latérale ; la place reste à l'hôte.
    public static let edgeGap: CGFloat = MeeshySpacing.mdPlus
    public static let sideMargin: CGFloat = MeeshySpacing.xl

    public static let slideOffset: CGFloat = 8
    public static let reducedFadeSeconds: Double = 0.15
    public static let dismissThreshold: CGFloat = 24
    /// Le doigt doit bouger de cette distance avant que le glisser commence.
    public static let dragStart: CGFloat = 8

    public static let detailOpacity: Double = MeeshyOpacity.intense
    public static let actionPressedOpacity: Double = 0.78

    public static func messageLines(isAccessibilitySize: Bool) -> Int {
        isAccessibilitySize ? 4 : 2
    }

    /// En grande police, l'action passe sous le texte, alignée à la fin.
    public static func actionIsBelowText(isAccessibilitySize: Bool) -> Bool {
        isAccessibilitySize
    }

    /// Un message vide ne fait pas de capsule.
    public static func isVisible(message: String) -> Bool {
        !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// Un détail vide n'existe pas.
    public static func visibleDetail(_ detail: String?) -> String? {
        guard let detail, !detail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return detail
    }

    /// Le nom du texte pour le lecteur d'écran, et l'annonce : « message, détail ».
    public static func spokenText(message: String, detail: String?) -> String {
        guard let detail = visibleDetail(detail) else { return message }
        return "\(message), \(detail)"
    }

    /// Le détail à 85 % sur le verre sombre ; en encre pleine sur `onLight`,
    /// où 85 % ne tient pas 4,5:1.
    public static func detailInkOpacity(tone: MeeshyGlassTone) -> Double {
        tone == .onLight ? 1 : detailOpacity
    }

    /// Sans action ni fermeture, elle ne prend aucun doigt : le toucher
    /// traverse jusqu'à la scène.
    public static func takesTouches(hasAction: Bool, hasDismiss: Bool) -> Bool {
        hasAction || hasDismiss
    }

    /// L'ordre de lecture, quelle que soit la disposition : le texte, puis
    /// l'action, puis ✕ — même quand la grande police pose l'action dessous.
    public static func readingOrder(_ part: MeeshyStatusCapsulePart) -> Double {
        switch part {
        case .text: return 3
        case .action: return 2
        case .close: return 1
        }
    }

    // MARK: Glisser pour fermer

    /// Où elle se tient sous le doigt : elle suit vers son bord seulement.
    public static func dragOffset(translation: CGFloat, edge: MeeshyStatusCapsuleEdge) -> CGFloat {
        switch edge {
        case .bottom: return max(0, translation)
        case .top: return min(0, translation)
        }
    }

    /// 24 pt vers son bord ferment ; en deçà, elle revient.
    public static func shouldDismiss(translation: CGFloat, edge: MeeshyStatusCapsuleEdge) -> Bool {
        abs(dragOffset(translation: translation, edge: edge)) >= dismissThreshold
    }

    // MARK: Contraste

    /// Le contraste du message (blanc) sur le verre, au PIRE : sur blanc pur,
    /// sans flou. Calculé depuis la recette de K01, jamais recopié.
    public static func messageContrast(tone: MeeshyGlassTone) -> Double {
        guard tone != .theme else { return actionContrast() }
        return contrast(inkGray: 1, backdropGray: worstBackdropGray(tone: tone))
    }

    /// Le contraste du détail à son opacité de ton.
    public static func detailContrast(tone: MeeshyGlassTone) -> Double {
        guard tone != .theme else { return actionContrast() }
        let backdrop = worstBackdropGray(tone: tone)
        let opacity = detailInkOpacity(tone: tone)
        return contrast(inkGray: opacity + (1 - opacity) * backdrop, backdropGray: backdrop)
    }

    /// L'encre de l'action (`indigo950`) sur son fond blanc plein.
    public static func actionContrast() -> Double {
        CanvasChromeScheme.contrastRatio(Double(MeeshyColors.indigo950.luminance), 1)
    }

    /// Le gris du verre posé sur du blanc pur : le remplissage de la recette
    /// dense, mêlé au blanc qui passe à travers.
    private static func worstBackdropGray(tone: MeeshyGlassTone) -> Double {
        let glass = MeeshyGlassRecipe.resolve(
            tone: tone, density: .dense, isTinted: false, isInteractive: false,
            isPressed: false, material: .drawn, reduceMotion: false
        )
        let fillGray: Double = glass.fill == .light ? 1 : 0
        return fillGray * glass.fillOpacity + (1 - glass.fillOpacity)
    }

    private static func contrast(inkGray: Double, backdropGray: Double) -> Double {
        CanvasChromeScheme.contrastRatio(grayLuminance(inkGray), grayLuminance(backdropGray))
    }

    private static func grayLuminance(_ value: Double) -> Double {
        CanvasChromeScheme.luminance(red: value, green: value, blue: value)
    }
}
