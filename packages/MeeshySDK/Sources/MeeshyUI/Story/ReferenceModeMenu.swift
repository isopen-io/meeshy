import SwiftUI
import MeeshySDK

public extension PostReferenceDisplay {

    /// Les modes qu'un CLIENT peut déclarer. INLINE en est absent : le serveur
    /// le dérive du texte.
    static var declarable: [PostReferenceDisplay] { declarable(forCanvas: true) }

    /// Les modes proposables selon que le contenu a un canevas ou non.
    ///
    /// PINNED n'a de sens que là où une couche de positionnement existe —
    /// aujourd'hui la seule STORY. Proposer un badge sur un POST, un RÉEL ou un
    /// STATUT promettrait un affichage qui n'arriverait jamais ; l'option
    /// revient quand la convergence des composers aura donné un canevas à tous
    /// les types.
    static func declarable(forCanvas hasCanvas: Bool) -> [PostReferenceDisplay] {
        hasCanvas ? [.pinned, .note, .silent] : [.note, .silent]
    }

    /// Ce que l'appui long propose depuis la liste `@`. INLINE en tête, parce
    /// que c'est ce que le tap fait déjà : le nommer est ce qui rend le reste
    /// du menu compréhensible.
    static func textListMenu(forCanvas hasCanvas: Bool) -> [PostReferenceDisplay] {
        [.inline] + declarable(forCanvas: hasCanvas)
    }

    /// Une pastille par mode, la même dans le composer, dans la feuille et dans
    /// la rangée de gestion — c'est ce qui rend le mode lisible d'un coup d'œil
    /// sans jamais écrire son nom dans le rendu final.
    var symbolName: String {
        switch self {
        case .inline: return "at"
        case .pinned: return "person.crop.square"
        case .note:   return "text.append"
        case .silent: return "bell"
        }
    }

    /// Le libellé n'existe QUE dans le menu de choix, là où l'auteur décide. Le
    /// rendu final, lui, ne nomme jamais le mode : le badge, la rangée ou le
    /// silence SONT l'affichage.
    var menuLabel: String {
        switch self {
        case .inline:
            return String(localized: "reference.mode.inline", defaultValue: "Insérer dans le texte", bundle: .module)
        case .pinned:
            return String(localized: "reference.mode.pinned", defaultValue: "Poser un badge", bundle: .module)
        case .note:
            return String(localized: "reference.mode.note", defaultValue: "Référencer", bundle: .module)
        case .silent:
            return String(localized: "reference.mode.silent", defaultValue: "Notifier seulement", bundle: .module)
        }
    }
}

/// Le menu d'appui long, identique partout.
///
/// Paramétré et agnostique : il reçoit les modes à proposer et rend le choix.
/// Aucun singleton, aucune règle « quand » — c'est le composer appelant qui
/// décide quoi en faire (règle de pureté SDK).
public struct ReferenceModeMenu: View {
    let modes: [PostReferenceDisplay]
    let onSelect: (PostReferenceDisplay) -> Void

    public init(modes: [PostReferenceDisplay], onSelect: @escaping (PostReferenceDisplay) -> Void) {
        self.modes = modes
        self.onSelect = onSelect
    }

    public var body: some View {
        ForEach(modes, id: \.self) { mode in
            Button {
                onSelect(mode)
                HapticFeedback.light()
            } label: {
                Label(mode.menuLabel, systemImage: mode.symbolName)
            }
        }
    }
}
