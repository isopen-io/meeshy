import SwiftUI
import UIKit

/// L'emplacement vide, comparable : un `EmptyView` ne l'est pas.
public struct MeeshyModeNoSlot: View, Equatable {
    public init() {}

    public var body: some View {
        EmptyView()
    }
}

/// **L'en-tête d'un mode plein écran** (K16) : « Quitter » en capsule de verre au bord de début,
/// l'emplacement `center` au milieu du cadre, l'`accessory` juste avant la validation, et la validation
/// en capsule blanche au bord de fin. Aucun titre peint : le nom du mode (`label`) vit dans
/// l'accessibilité et est annoncé à l'entrée.
///
/// Atome opaque : l'hôte fournit les actions ; le cadre ne sait ni ce que Quitter défait ni ce que Valider
/// garde. Hors des capsules il laisse passer tous les touchers. Échap, le geste d'échappement du lecteur
/// d'écran valent Quitter ; ⌘ + Entrée vaut la validation.
///
/// Quand il ne tient plus, la loi `MeeshyModeHeaderFit` réduit dans l'ordre : le centre en glyphe, la
/// validation en coche, puis les libellés à 80 % et leur troncature, Quitter en dernier.
///
/// `Equatable` quand ses emplacements le sont : un hôte qui se re-rend à paramètres égaux ne le re-rend pas.
public struct MeeshyModeHeader<Center: View, Accessory: View>: View {
    let label: String
    let exit: MeeshyModeAction
    let confirm: MeeshyModeAction?
    let presence: MeeshyModeChromePresence
    let tone: MeeshyGlassTone?
    let inset: CGFloat
    let exitOnEscape: Bool
    let confirmShortcut: Bool
    let center: Center
    let accessory: Accessory

    @Environment(\.layoutDirection) private var layoutDirection

    public init(
        label: String,
        exit: MeeshyModeAction,
        confirm: MeeshyModeAction? = nil,
        presence: MeeshyModeChromePresence = .shown,
        tone: MeeshyGlassTone? = nil,
        headerInset: CGFloat = MeeshyModeChromeRecipe.headerInset,
        exitOnEscape: Bool = true,
        confirmShortcut: Bool = true,
        @ViewBuilder center: () -> Center,
        @ViewBuilder accessory: () -> Accessory
    ) {
        assert(!label.isEmpty, "MeeshyModeHeader : le nom du mode est obligatoire et non vide")
        self.label = label
        self.exit = exit
        self.confirm = confirm
        self.presence = presence
        self.tone = tone
        self.inset = headerInset
        self.exitOnEscape = exitOnEscape
        self.confirmShortcut = confirmShortcut
        self.center = center()
        self.accessory = accessory()
    }

    static var hasCenter: Bool { Center.self != EmptyView.self && Center.self != MeeshyModeNoSlot.self }
    static var hasAccessory: Bool { Accessory.self != EmptyView.self && Accessory.self != MeeshyModeNoSlot.self }

    private var rule: MeeshyModeChromeRule {
        MeeshyModeChromeRule.resolve(
            hasConfirm: confirm != nil, hasCenter: Self.hasCenter, hasAccessory: Self.hasAccessory,
            hasPlate: false, presence: presence
        )
    }

    public var body: some View {
        MeeshyModePresence(presence: presence, edge: .top) {
            toned(framed)
        }
    }

    private var framed: some View {
        MeeshyGlassGroup(spacing: MeeshyModeChromeRecipe.itemGap) {
            ViewThatFits(in: .horizontal) {
                row(.full)
                row(.centerGlyph)
                row(.confirmGlyph)
                row(.compact)
            }
        }
        .padding(.top, inset)
        .padding(.horizontal, inset)
        .modifier(MeeshyModeKeyboard(exit: exit, confirm: confirm, exitOnEscape: exitOnEscape, confirmShortcut: confirmShortcut))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(label)
        .onAppear { UIAccessibility.post(notification: .screenChanged, argument: label) }
    }

    @ViewBuilder
    private func toned<V: View>(_ view: V) -> some View {
        if let tone {
            view.meeshyGlassTone(tone)
        } else {
            view
        }
    }

    private func row(_ step: MeeshyModeHeaderFit.Step) -> some View {
        MeeshyModeHeaderLayout(isRightToLeft: layoutDirection == .rightToLeft) {
            MeeshyModeCapsule(exit, kind: .glass)
                .disabled(!exit.isEnabled)
                .meeshyModeRole(.exit)
            if rule.showsCenter {
                center
                    .environment(\.meeshyModeReducesToGlyph, step.reducesCenter)
                    .meeshyModeRole(.center)
            }
            if rule.showsAccessory {
                accessory
                    .meeshyModeRole(.accessory)
            }
            if let confirm, rule.showsConfirm {
                MeeshyModeCapsule(confirm, kind: .solid)
                    .disabled(!confirm.isEnabled)
                    .environment(\.meeshyModeReducesToGlyph, step.reducesConfirm)
                    .meeshyModeRole(.confirm)
            }
        }
        .environment(\.meeshyModeLabelScale, step.labelScale)
    }
}

// MARK: - Les inits sans emplacement vide

public extension MeeshyModeHeader where Center == EmptyView, Accessory == EmptyView {
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
            center: { EmptyView() }, accessory: { EmptyView() }
        )
    }
}

public extension MeeshyModeHeader where Accessory == EmptyView {
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
            center: center, accessory: { EmptyView() }
        )
    }
}

extension MeeshyModeHeader: Equatable where Center: Equatable, Accessory: Equatable {
    public static func == (lhs: MeeshyModeHeader, rhs: MeeshyModeHeader) -> Bool {
        lhs.label == rhs.label && lhs.exit.values == rhs.exit.values && lhs.confirm?.values == rhs.confirm?.values
            && lhs.presence == rhs.presence && lhs.tone == rhs.tone && lhs.inset == rhs.inset
            && lhs.exitOnEscape == rhs.exitOnEscape && lhs.confirmShortcut == rhs.confirmShortcut
            && lhs.center == rhs.center && lhs.accessory == rhs.accessory
    }
}

// MARK: - Le clavier et le lecteur d'écran

/// Échap, le retour du lecteur d'écran valent Quitter ; ⌘ + Entrée vaut la validation. Un seul chemin :
/// `MeeshyModeAction.perform`, celui du toucher.
private struct MeeshyModeKeyboard: ViewModifier {
    let exit: MeeshyModeAction
    let confirm: MeeshyModeAction?
    let exitOnEscape: Bool
    let confirmShortcut: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if exitOnEscape {
            shortcut(content.dismissOnEscape { exit.perform() })
        } else {
            shortcut(content)
        }
    }

    @ViewBuilder
    private func shortcut<V: View>(_ view: V) -> some View {
        if confirmShortcut, let confirm {
            view.background {
                Button("") { confirm.perform() }
                    .keyboardShortcut(.return, modifiers: .command)
                    .opacity(0)
                    .frame(width: 0, height: 0)
                    .accessibilityHidden(true)
            }
        } else {
            view
        }
    }
}
