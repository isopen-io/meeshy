import SwiftUI
import MeeshySDK

/// **Le chrome de protection d'un message — UN point d'entrée pour les cinq
/// modes de lecture, et pour ceux qui viendront** (#7452).
///
/// ## Pourquoi un composant, et pas un badge de plus
///
/// La conversation se lit de cinq façons (`focal`, `script`, `summary`,
/// `river`, `bubbles`). Relevé sur `dev` 3ff99d3aa3 : le décompte d'un
/// éphémère n'existait qu'en Focal/Script (`FocalEphemeralBadge`) et en Bulle
/// (`BubbleEphemeralBadge`) — deux implémentations distinctes du même badge —
/// et **pas du tout** en Résumé ni en Rivière. Un message qui allait disparaître
/// dans trente secondes ne le disait donc pas à deux lecteurs sur cinq.
///
/// Ce n'était pas un oubli isolé : rien ne RELIAIT les modes. Chaque surface
/// relisait `expiresAt` / `isViewOnce` / `isBlurred` et se peignait un badge.
/// Un sixième mode aurait recommencé. La directive porteur nomme exactement ce
/// risque — « il est important de s'assurer que cette feature a un décompte en
/// Script, Focal ou bulle **ou tout autre affichage plus tard** » — donc le
/// correctif n'est pas d'ajouter deux badges, c'est de n'en avoir qu'un.
///
/// ## Aucun minuteur
///
/// `Text(timerInterval:)` fait battre la seconde **côté système** : aucune
/// passe SwiftUI, aucun `Timer.publish` par cellule (dimension 4). Le seul
/// instant qui demande une décision — celui où le message QUITTE l'écran — est
/// ordonnancé une fois pour toute la conversation par
/// `EphemeralExpirySchedule`, chez l'hôte. Ce composant ne possède donc ni
/// état, ni horloge, ni abonnement.
public struct MessageProtectionChrome: View, Equatable {

    public let descriptor: MessageProtectionDescriptor
    public let isDark: Bool
    /// Rendu compact : pictogrammes seuls, sans libellé — pour une ligne de
    /// liste ou une bulle étroite. Le décompte reste lisible dans les deux.
    public let isCompact: Bool

    public init(descriptor: MessageProtectionDescriptor, isDark: Bool, isCompact: Bool = false) {
        self.descriptor = descriptor
        self.isDark = isDark
        self.isCompact = isCompact
    }

    public static func == (lhs: MessageProtectionChrome, rhs: MessageProtectionChrome) -> Bool {
        lhs.descriptor == rhs.descriptor && lhs.isDark == rhs.isDark && lhs.isCompact == rhs.isCompact
    }

    public var body: some View {
        if descriptor.isEmpty {
            // « Plan vide ⇒ vue intacte » : l'écrasante majorité des messages
            // n'a aucune protection et ne paie pas une pile de capsules vides.
            EmptyView()
        } else {
            HStack(spacing: 4) {
                // `enumerated()` plutôt qu'un `id: \.self` : deux badges de même
                // forme (impossible aujourd'hui, mais rien ne l'interdit) ne
                // doivent pas se voler leur identité de vue. Le rang est stable
                // — l'ordre des badges l'est par construction.
                ForEach(Array(descriptor.badges.enumerated()), id: \.offset) { item in
                    capsule(for: item.element)
                }
            }
        }
    }

    // MARK: - Les capsules

    /// Ce qu'une capsule MONTRE (#7599) : un pictogramme, une teinte du code
    /// commun, et — dans la seule dernière minute d'un éphémère — le décompte.
    /// Aucun libellé : l'état se lit par sa couleur, et la phrase complète
    /// reste au lecteur d'écran (`accessibilityLabels(for:)`).
    public struct Presentation: Equatable, Sendable {
        public let symbol: String
        public let tintHex: String
        public let tint: Color
        public let showsCountdown: Bool
    }

    public static func presentation(for badge: MessageProtectionDescriptor.Badge) -> Presentation {
        switch badge {
        case .ephemeral(let state):
            let isImminent: Bool
            if case .imminent = state { isImminent = true } else { isImminent = false }
            return Presentation(symbol: MessageProtectionSymbols.ephemeral,
                                tintHex: MeeshyColors.stateEphemeralHex,
                                tint: MeeshyColors.stateEphemeral,
                                showsCountdown: isImminent)
        case .viewOnce:
            return Presentation(symbol: MessageProtectionSymbols.viewOnceFilled,
                                tintHex: MeeshyColors.stateViewOnceHex,
                                tint: MeeshyColors.stateViewOnce,
                                showsCountdown: false)
        case .blurred:
            return Presentation(symbol: MessageProtectionSymbols.blurred,
                                tintHex: MeeshyColors.stateConcealedHex,
                                tint: MeeshyColors.stateConcealed,
                                showsCountdown: false)
        }
    }

    @ViewBuilder
    private func capsule(for badge: MessageProtectionDescriptor.Badge) -> some View {
        switch badge {
        case .ephemeral(.notEphemeral), .ephemeral(.expired):
            EmptyView()
        default:
            let presentation = Self.presentation(for: badge)
            let tint = presentation.tint
            chrome(tint: tint) {
                Image(systemName: presentation.symbol)
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(tint)
                if presentation.showsCountdown, case .ephemeral(.imminent(let deadline)) = badge {
                    // Le battement est rendu PAR LE SYSTÈME : aucune passe
                    // SwiftUI, aucune horloge de cellule, et il n'est monté que
                    // dans la dernière minute (#7467). La borne haute est forcée
                    // dans le futur : `ClosedRange` piège sur `lower > upper`.
                    Text(timerInterval: Date()...max(deadline, Date().addingTimeInterval(1)),
                         pauseTime: nil, countsDown: true)
                        .font(.system(.caption2, design: .monospaced).weight(.bold))
                        .foregroundColor(tint)
                        .monospacedDigit()
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Self.accessibilityLabel(for: badge) ?? "")
        }
    }

    @ViewBuilder
    private func chrome<Content: View>(tint: Color, @ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 4) { content() }
            .padding(.horizontal, isCompact ? 6 : 8)
            .padding(.vertical, 4)
            .background(
                Capsule()
                    .fill(tint.opacity(isDark ? 0.15 : 0.1))
                    .overlay(Capsule().stroke(tint.opacity(0.3), lineWidth: 0.5))
            )
    }

    // MARK: - Libellés (catalogue MeeshyUI, 7 langues)

    public static var viewOnceLabel: String {
        String(localized: "protection.view_once", defaultValue: "Vue unique", bundle: .module)
    }

    public static var viewOnceA11y: String {
        String(localized: "protection.view_once.a11y", defaultValue: "Vue unique", bundle: .module)
    }

    public static var blurredLabel: String {
        String(localized: "protection.blurred", defaultValue: "Flouté", bundle: .module)
    }

    /// « disparaît dans 4 minutes » — la formulation du lecteur d'écran est
    /// RELATIVE et lisible, là où la capsule montre « 3:59 ».
    public static func ephemeralA11y(deadline: Date, now: Date = Date()) -> String {
        let formatter = DateComponentsFormatter()
        formatter.unitsStyle = .full
        formatter.allowedUnits = [.hour, .minute, .second]
        formatter.maximumUnitCount = 1
        let remaining = formatter.string(from: max(0, deadline.timeIntervalSince(now))) ?? ""
        return String(
            localized: "protection.ephemeral.a11y",
            defaultValue: "Message éphémère, disparaît dans \(remaining)",
            bundle: .module
        )
    }

    public static func awaitingLabel(duration: TimeInterval) -> String {
        let formatter = DateComponentsFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.allowedUnits = [.hour, .minute, .second]
        formatter.maximumUnitCount = 1
        return formatter.string(from: duration) ?? ""
    }

    public static func awaitingA11y(duration: TimeInterval) -> String {
        String(
            localized: "protection.ephemeral.awaiting.a11y",
            defaultValue: "Message éphémère de \(awaitingLabel(duration: duration)), en attente de réception",
            bundle: .module
        )
    }
}

// MARK: - La phrase du lecteur d'écran

public extension MessageProtectionChrome {

    /// Ce que VoiceOver dit d'un message protégé — « Message éphémère,
    /// disparaît dans 4 minutes », « Vue unique » (#7452, dimension 5).
    ///
    /// Les composeurs de libellé de l'application (bulle, rangée plate) et la
    /// capsule elle-même lisent CETTE fonction. Avant elle, la bulle disait
    /// « Message éphémère » sans échéance (`a11y.message.ephemeral`, gaté sur
    /// `message.expiresAt != nil`) et la vue unique n'était annoncée nulle
    /// part : la protection la plus forte du produit était la seule invisible
    /// au lecteur d'écran.
    static func accessibilityLabels(
        for descriptor: MessageProtectionDescriptor,
        now: Date = Date()
    ) -> [String] {
        descriptor.badges.compactMap { accessibilityLabel(for: $0, now: now) }
    }

    /// La phrase d'UN badge — celle que la capsule porte, et celle que les
    /// composeurs de libellé des bulles et des rangées reprennent.
    static func accessibilityLabel(
        for badge: MessageProtectionDescriptor.Badge,
        now: Date = Date()
    ) -> String? {
        switch badge {
        // Le libellé accessible donne TOUJOURS le temps restant, seuil ou
        // pas (#7467) : un lecteur d'écran ne voit pas la flamme, et
        // « Message éphémère » sans échéance ne dit pas quand.
        case .ephemeral(.running(let deadline)), .ephemeral(.imminent(let deadline)):
            return ephemeralA11y(deadline: deadline, now: now)
        case .ephemeral(.awaitingReception(let duration)):
            return awaitingA11y(duration: duration)
        case .ephemeral:
            return nil
        case .viewOnce:
            return viewOnceA11y
        case .blurred:
            return blurredLabel
        }
    }
}
