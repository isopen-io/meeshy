import Foundation
import SwiftUI
import MeeshySDK

public extension PostReferenceDisplay {
    /// SF Symbol representing this reference mode in UI menus and badges.
    var symbolName: String {
        switch self {
        case .inline: return "at"
        case .pinned: return "pin.fill"
        case .note: return "note.text"
        case .silent: return "bell.slash.fill"
        }
    }

    /// Modes the user can explicitly pick when tagging someone (excluding INLINE which is derived from text).
    static var declarable: [PostReferenceDisplay] {
        [.pinned, .note, .silent]
    }

    /// Localized menu label describing this reference mode.
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
