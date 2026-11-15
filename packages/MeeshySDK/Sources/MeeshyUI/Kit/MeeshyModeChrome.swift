import SwiftUI

/// **Le cadre d'un mode plein écran** (K16) : l'en-tête (Quitter · centre · accessoire · Valider) en haut,
/// UNE plaque de verre basse pour les réglages de l'outil, et rien d'autre. Il se pose EN SURIMPRESSION du
/// contenu de l'hôte, dans le cadre que l'hôte lui donne (la scène sur téléphone) ; le contenu reste
/// manipulable derrière : hors des capsules et de la plaque, tous les touchers passent.
///
/// - Loi 13 : pas de validation sans `confirm`, pas de centre ni d'accessoire sans emplacement garni, pas
///   de plaque (ni verre, ni bande vide) sans contenu, jamais de titre peint, jamais de légende sous un bouton.
/// - `presence: .stowed` (on filme) : ni en-tête ni plaque, aucun toucher reçu.
/// - Le bas de la plaque suit la zone sûre (`max(zone sûre + 12, 28)`) et ne remonte jamais avec le clavier.
/// - Sur grand écran l'hôte pose `MeeshyModeHeader` et `MeeshyModePlate` séparément (I3).
///
/// Atome opaque : ni composer, ni appel, ni singleton nommé Meeshy. Ce que Quitter défait et ce que Valider
/// garde, la confirmation d'abandon, le ton du verre sont à l'hôte.
public struct MeeshyModeChrome<Center: View, Accessory: View, Plate: View>: View {
    private let label: String
    private let exit: MeeshyModeAction
    private let confirm: MeeshyModeAction?
    private let presence: MeeshyModeChromePresence
    private let tone: MeeshyGlassTone?
    private let headerInset: CGFloat
    private let plateLabel: String?
    private let plateMaxWidth: CGFloat?
    private let isPlateScrollLocked: Bool
    private let plateContentKey: AnyHashable?
    private let exitOnEscape: Bool
    private let confirmShortcut: Bool
    private let center: Center
    private let accessory: Accessory
    private let plate: Plate

    @State private var safeBottom: CGFloat = 0

    public init(
        label: String,
        exit: MeeshyModeAction,
        confirm: MeeshyModeAction? = nil,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        headerInset: CGFloat = MeeshyModeChromeRecipe.headerInset,
        plateLabel: String? = nil,
        plateMaxWidth: CGFloat? = nil,
        isPlateScrollLocked: Bool = false,
        plateContentKey: AnyHashable? = nil,
        exitOnEscape: Bool = true,
        confirmShortcut: Bool = true,
        @ViewBuilder center: () -> Center,
        @ViewBuilder accessory: () -> Accessory,
        @ViewBuilder plate: () -> Plate
    ) {
        assert(!label.isEmpty, "MeeshyModeChrome : le nom du mode est obligatoire et non vide")
        self.label = label
        self.exit = exit
        self.confirm = confirm
        self.presence = presence
        self.tone = tone
        self.headerInset = headerInset
        self.plateLabel = plateLabel
        self.plateMaxWidth = plateMaxWidth
        self.isPlateScrollLocked = isPlateScrollLocked
        self.plateContentKey = plateContentKey
        self.exitOnEscape = exitOnEscape
        self.confirmShortcut = confirmShortcut
        self.center = center()
        self.accessory = accessory()
        self.plate = plate()
        assert(Plate.self == EmptyView.self || !(plateLabel ?? "").isEmpty,
               "MeeshyModeChrome : plateLabel est obligatoire dès qu'il y a une plaque")
    }

    private static var hasPlate: Bool { Plate.self != EmptyView.self }

    private var rule: MeeshyModeChromeRule {
        MeeshyModeChromeRule.resolve(
            hasConfirm: confirm != nil,
            hasCenter: MeeshyModeHeader<Center, Accessory>.hasCenter,
            hasAccessory: MeeshyModeHeader<Center, Accessory>.hasAccessory,
            hasPlate: Self.hasPlate, presence: presence
        )
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            Spacer(minLength: 0)
            if Self.hasPlate { platePiece }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { safeBottom = $0 }
        .ignoresSafeArea(.keyboard, edges: .bottom)
    }

    private var header: some View {
        MeeshyModeHeader(
            label: label, exit: exit, confirm: confirm, presence: presence, tone: tone, headerInset: headerInset,
            exitOnEscape: exitOnEscape, confirmShortcut: confirmShortcut,
            center: { center }, accessory: { accessory }
        )
    }

    private var platePiece: some View {
        MeeshyModePlate(
            label: plateLabel ?? label, maxWidth: plateMaxWidth, isScrollLocked: isPlateScrollLocked,
            presence: presence, tone: tone, contentKey: plateContentKey
        ) { plate }
        .padding(.horizontal, MeeshyModeChromeRecipe.plateEdge)
        .padding(.bottom, max(MeeshyModePlateMetrics.bottomMargin(safeBottom: safeBottom) - safeBottom, 0))
    }
}

// MARK: - Les inits sans emplacement vide

public extension MeeshyModeChrome where Center == EmptyView, Accessory == EmptyView, Plate == EmptyView {
    init(
        label: String,
        exit: MeeshyModeAction,
        confirm: MeeshyModeAction? = nil,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        headerInset: CGFloat = MeeshyModeChromeRecipe.headerInset,
        exitOnEscape: Bool = true,
        confirmShortcut: Bool = true
    ) {
        self.init(
            label: label, exit: exit, confirm: confirm, presence: presence, tone: tone, headerInset: headerInset,
            exitOnEscape: exitOnEscape, confirmShortcut: confirmShortcut,
            center: { EmptyView() }, accessory: { EmptyView() }, plate: { EmptyView() }
        )
    }
}

public extension MeeshyModeChrome where Center == EmptyView, Accessory == EmptyView {
    init(
        label: String,
        exit: MeeshyModeAction,
        confirm: MeeshyModeAction? = nil,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        headerInset: CGFloat = MeeshyModeChromeRecipe.headerInset,
        plateLabel: String,
        plateMaxWidth: CGFloat? = nil,
        isPlateScrollLocked: Bool = false,
        plateContentKey: AnyHashable? = nil,
        exitOnEscape: Bool = true,
        confirmShortcut: Bool = true,
        @ViewBuilder plate: () -> Plate
    ) {
        self.init(
            label: label, exit: exit, confirm: confirm, presence: presence, tone: tone, headerInset: headerInset,
            plateLabel: plateLabel, plateMaxWidth: plateMaxWidth, isPlateScrollLocked: isPlateScrollLocked,
            plateContentKey: plateContentKey, exitOnEscape: exitOnEscape, confirmShortcut: confirmShortcut,
            center: { EmptyView() }, accessory: { EmptyView() }, plate: plate
        )
    }
}

public extension MeeshyModeChrome where Accessory == EmptyView, Plate == EmptyView {
    init(
        label: String,
        exit: MeeshyModeAction,
        confirm: MeeshyModeAction? = nil,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        headerInset: CGFloat = MeeshyModeChromeRecipe.headerInset,
        exitOnEscape: Bool = true,
        confirmShortcut: Bool = true,
        @ViewBuilder center: () -> Center
    ) {
        self.init(
            label: label, exit: exit, confirm: confirm, presence: presence, tone: tone, headerInset: headerInset,
            exitOnEscape: exitOnEscape, confirmShortcut: confirmShortcut,
            center: center, accessory: { EmptyView() }, plate: { EmptyView() }
        )
    }
}
