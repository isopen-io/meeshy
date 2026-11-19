import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K55 porté par la commande (#19515) : l'hôte donne le raccourci UNE fois, et la même valeur devient la frappe
/// reconnue ET la touche dessinée. Une touche affichée est une promesse : jamais en largeur de téléphone, jamais
/// sans clavier, jamais sur une commande qui ne répond pas, jamais pour une combinaison que la commande ne reconnaît pas.
@Suite("MeeshyKeyShortcut")
struct MeeshyKeyShortcutTests {

    @Test("⌘M devient la frappe Commande m, depuis la même combinaison que la touche dessinée")
    func commandLetter_becomesTheRecognizedShortcut() throws {
        let shortcut = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: [.primary, .character("M")]))
        #expect(shortcut.key.character == "m")
        #expect(shortcut.modifiers == .command)
    }

    @Test("⌘↵, ⇧⌘K et Échap seule gardent leurs modificateurs, dans l'ordre de frappe")
    func namedKeysAndModifiers_mapOneToOne() throws {
        let write = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: [.primary, .enter]))
        #expect(write.key.character == KeyEquivalent.return.character)
        #expect(write.modifiers == .command)

        let search = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: [.shift, .primary, .character("k")]))
        #expect(search.key.character == "k")
        #expect(search.modifiers == [.command, .shift])

        let close = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: [.escape]))
        #expect(close.key.character == KeyEquivalent.escape.character)
        #expect(close.modifiers == [])

        let back = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: [.option, .control, .left]))
        #expect(back.key.character == KeyEquivalent.leftArrow.character)
        #expect(back.modifiers == [.option, .control])
    }

    @Test("une combinaison qu'aucune frappe ne reconnaît ne donne aucun raccourci")
    func unrecognizableCombos_giveNothing() {
        let combos: [MeeshyKeyCombo] = [[], [.primary], [.primary, .shift], [.character("a"), .character("b")],
                                        [.primary, .character("ab")], [.primary, .character("")]]
        for combo in combos {
            #expect(MeeshyKeyShortcutLaw.keyboardShortcut(for: combo) == nil, "\(combo)")
        }
    }

    @Test("la touche ne se montre que pour une commande qui répond, et seulement si la frappe la reconnaît")
    func displayedKeys_followTheCommand() {
        let map: MeeshyKeyCombo = [.primary, .character("M")]
        #expect(MeeshyKeyShortcutLaw.displayed(map, isActionable: true) == map)
        #expect(MeeshyKeyShortcutLaw.displayed(map, isActionable: false) == nil)
        #expect(MeeshyKeyShortcutLaw.displayed(nil, isActionable: true) == nil)
        #expect(MeeshyKeyShortcutLaw.displayed([.primary], isActionable: true) == nil)
    }

    @Test("un clavier branché montre les touches en largeur régulière, jamais en largeur de téléphone, jamais sans clavier")
    func hints_onlyWithAKeyboardAwayFromThePhone() {
        #expect(MeeshyKeyShortcutLaw.showsHints(isKeyboardConnected: true, isCompactWidth: false))
        #expect(!MeeshyKeyShortcutLaw.showsHints(isKeyboardConnected: true, isCompactWidth: true))
        #expect(!MeeshyKeyShortcutLaw.showsHints(isKeyboardConnected: false, isCompactWidth: false))
        #expect(!MeeshyKeyShortcutLaw.showsHints(isKeyboardConnected: false, isCompactWidth: true))
    }

    @Test("sans clavier, la légende ne rend ni barre ni libellé orphelin")
    func legend_needsAKeyboard() {
        #expect(MeeshyKeyLegendLaw.rendersContainer(itemCount: 2, hasKeyboard: true))
        #expect(!MeeshyKeyLegendLaw.rendersContainer(itemCount: 2, hasKeyboard: false))
        #expect(!MeeshyKeyLegendLaw.rendersContainer(itemCount: 0, hasKeyboard: true))
    }

    @Test("les raccourcis de la fiche : Carte est ⌘M, Écrire est ⌘↵")
    func profileShortcuts_areTheBoardKeys() throws {
        let map = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: ProfileKeyShortcuts.map))
        #expect(map.key.character == "m")
        #expect(map.modifiers == .command)
        let write = try #require(MeeshyKeyShortcutLaw.keyboardShortcut(for: ProfileKeyShortcuts.write))
        #expect(write.key.character == KeyEquivalent.return.character)
        #expect(write.modifiers == .command)
    }

    @Test("garde de source : aucun raccourci de la fiche n'est réécrit en lettres à côté de sa touche")
    func source_profileShortcutsHaveOneValue() throws {
        let url = KitAtomVectors.repositoryRoot
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileActionsFaceParts.swift")
        let source = try String(contentsOf: url, encoding: .utf8)
        #expect(!source.contains(".keyboardShortcut("), "ProfileActionsFaceParts pose un raccourci hors du kit")
        #expect(source.contains("ProfileKeyShortcuts.map"))
        let action = try KitAtomVectors.code("MeeshyLabeledAction.swift")
        #expect(action.contains("meeshyKeyShortcut(shortcut)"))
        #expect(action.contains("MeeshyKeyHint("))
    }
}
