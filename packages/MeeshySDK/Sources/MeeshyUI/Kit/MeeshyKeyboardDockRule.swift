import CoreGraphics
import Foundation

/// **Les lois du dock** (K17), pures et testées sans écran : ce qui est monté (loi 13), « clavier OU
/// panneau, jamais les deux », la hauteur du clavier retenue pour que le panneau prenne exactement sa
/// place, la mesure du clavier et la réserve publiée à l'hôte.
public nonisolated enum MeeshyKeyboardDockRule {

    // MARK: - Loi 13

    public struct Resolution: Equatable, Sendable {
        public let input: MeeshyKeyboardDockInput
        public let showsBar: Bool
        public let showsKeyboard: Bool
        public let showsPanel: Bool
        public let showsBand: Bool
        public let bandGap: CGFloat
        public let receivesTouches: Bool
        public let attachesToField: Bool
    }

    /// Inactif : ni barre, ni bande, ni panneau, aucun toucher, rien d'accroché au champ. Actif : jamais le
    /// clavier ET un panneau ; un panneau dont l'outil a disparu, n'ouvre rien ou est désactivé rend le
    /// clavier ; ni bande ni écart sans `above`.
    public static func resolve(
        isActive: Bool,
        input: MeeshyKeyboardDockInput,
        items: [MeeshyKeyboardDockItem],
        hasAbove: Bool
    ) -> Resolution {
        guard isActive else {
            return Resolution(
                input: .keyboard, showsBar: false, showsKeyboard: false, showsPanel: false, showsBand: false,
                bandGap: 0, receivesTouches: false, attachesToField: false
            )
        }
        let elected = electedInput(input, items: items)
        let isPanel = elected != .keyboard
        return Resolution(
            input: elected, showsBar: true, showsKeyboard: !isPanel, showsPanel: isPanel, showsBand: hasAbove,
            bandGap: hasAbove ? MeeshyKeyboardDockRecipe.aboveGap : 0, receivesTouches: true, attachesToField: true
        )
    }

    private static func electedInput(
        _ input: MeeshyKeyboardDockInput,
        items: [MeeshyKeyboardDockItem]
    ) -> MeeshyKeyboardDockInput {
        guard let id = input.panelID,
              let item = items.first(where: { $0.id == id }),
              item.opensPanel, item.isEnabled else { return .keyboard }
        return input
    }

    public static func visibleItems(_ items: [MeeshyKeyboardDockItem]) -> [MeeshyKeyboardDockItem] {
        Array(items.prefix(MeeshyKeyboardDockRecipe.maxItems))
    }

    // MARK: - Les gestes

    /// Toucher un outil à panneau l'ouvre, passe d'un outil à l'autre, ou referme le panneau de cet outil.
    /// Une action simple, ou un outil désactivé, ne change pas l'entrée.
    public static func tapped(_ item: MeeshyKeyboardDockItem, in input: MeeshyKeyboardDockInput) -> MeeshyKeyboardDockInput {
        guard item.opensPanel, item.isEnabled else { return input }
        return input == .panel(item.id) ? .keyboard : .panel(item.id)
    }

    /// Toucher le champ, ou le clavier qui remonte de lui-même, rend le clavier.
    public static func fieldTouched(_ input: MeeshyKeyboardDockInput) -> MeeshyKeyboardDockInput {
        .keyboard
    }

    /// Échap : un panneau ouvert rend le clavier ; sinon la touche va à l'hôte (`nil`).
    public static func escaped(_ input: MeeshyKeyboardDockInput) -> MeeshyKeyboardDockInput? {
        input == .keyboard ? nil : .keyboard
    }

    /// Le rangement du clavier par le système ne se dit que clavier levé : jamais à l'ouverture d'un panneau.
    public static func reportsDismissal(input: MeeshyKeyboardDockInput) -> Bool {
        input == .keyboard
    }

    /// Un toucher d'outil : l'hôte entend l'outil actif UNE fois ; l'entrée élue ne part que pour un outil à
    /// panneau. Un outil désactivé n'entend rien.
    public static func activate(
        _ item: MeeshyKeyboardDockItem,
        input: MeeshyKeyboardDockInput,
        onItem: (String) -> Void,
        onInputChange: (MeeshyKeyboardDockInput) -> Void
    ) {
        guard item.isEnabled else { return }
        onItem(item.id)
        guard item.opensPanel else { return }
        onInputChange(tapped(item, in: input))
    }

    // MARK: - Accessibilité

    /// L'ouverture d'un panneau annonce son nom ; le retour au clavier ne dit rien.
    public static func announcement(for input: MeeshyKeyboardDockInput, items: [MeeshyKeyboardDockItem]) -> String? {
        guard let id = input.panelID else { return nil }
        return items.first { $0.id == id }?.label
    }

    /// Un outil à panneau est annoncé développé ou réduit ; une action simple ne l'est pas.
    public static func activation(for item: MeeshyKeyboardDockItem, openItem: String?) -> MeeshyGlassButtonActivation {
        item.opensPanel ? .expanded(openItem == item.id) : .none
    }

    // MARK: - Le clavier

    /// **La hauteur du clavier, sans la barre**, retenue pour que le panneau prenne exactement sa place.
    /// Seul un clavier d'au moins 160 se retient, jamais le panneau lui-même (`input` n'est plus `keyboard`).
    public static func retainedKeyboardHeight(
        previous: CGFloat,
        overlap: CGFloat,
        accessoryHeight: CGFloat,
        input: MeeshyKeyboardDockInput
    ) -> CGFloat {
        guard input == .keyboard else { return previous }
        let keyboard = overlap - accessoryHeight
        return keyboard >= MeeshyKeyboardDockRecipe.minimumKeyboardHeight ? keyboard : previous
    }

    /// Le repli quand aucun clavier n'a été mesuré : 291, borné à 45 % de la fenêtre.
    public static func fallbackHeight(windowHeight: CGFloat?) -> CGFloat {
        guard let windowHeight, windowHeight > 0 else { return MeeshyKeyboardDockRecipe.fallbackKeyboardHeight }
        return min(MeeshyKeyboardDockRecipe.fallbackKeyboardHeight, MeeshyKeyboardDockRecipe.fallbackShare * windowHeight)
    }

    public static func panelHeight(retained: CGFloat, windowHeight: CGFloat?) -> CGFloat {
        retained >= MeeshyKeyboardDockRecipe.minimumKeyboardHeight ? retained : fallbackHeight(windowHeight: windowHeight)
    }

    public struct Measure: Equatable, Sendable {
        public let overlap: CGFloat
        public let isFloating: Bool

        public init(overlap: CGFloat, isFloating: Bool) {
            self.overlap = overlap
            self.isFloating = isFloating
        }
    }

    /// **Ce que le clavier cache réellement de la fenêtre.** La hauteur brute de la trame n'est vraie que
    /// pour un clavier d'iPhone ancré sous une fenêtre plein écran : un clavier flottant ou scindé ne
    /// recouvre pas le bas de la fenêtre, une fenêtre Stage Manager s'arrête au-dessus du bas de l'écran, un
    /// clavier physique n'annonce que sa barre. Les deux trames sont en coordonnées d'écran ; une trame
    /// dégénérée n'annonce rien et laisse `current`.
    public static func measure(keyboardEndFrame keyboard: CGRect, windowFrame: CGRect?, current: CGFloat) -> Measure {
        guard keyboard.width > 0, keyboard.height > 0 else { return Measure(overlap: current, isFloating: false) }
        let area = windowFrame ?? CGRect(x: 0, y: 0, width: keyboard.maxX, height: keyboard.maxY)
        guard keyboard.maxY >= area.maxY - 1, keyboard.minY < area.maxY else {
            return Measure(overlap: 0, isFloating: keyboard.minY < area.maxY)
        }
        return Measure(overlap: min(area.maxY - max(keyboard.minY, area.minY), area.height), isFloating: false)
    }

    /// La réserve que l'hôte lit : le recouvrement et l'écart de scène ; 0 quand rien ne recouvre.
    public static func reserve(overlap: CGFloat) -> CGFloat {
        overlap > 0 ? overlap + MeeshyKeyboardDockRecipe.sceneGap : 0
    }

    public static func place(measure: Measure, retained: CGFloat, durationMs: Int) -> MeeshyKeyboardDockPlace {
        MeeshyKeyboardDockPlace(
            reserve: reserve(overlap: measure.overlap), keyboard: retained,
            durationMs: durationMs, isFloating: measure.isFloating
        )
    }

    /// La durée du mouvement annoncée par le système, 250 ms à défaut.
    public static func durationMs(seconds: Double?) -> Int {
        guard let seconds, seconds > 0 else { return MeeshyKeyboardDockRecipe.fallbackKeyboardDurationMs }
        return Int((seconds * 1000).rounded())
    }
}
