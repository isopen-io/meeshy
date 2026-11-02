import SwiftUI

/// La zone sûre du haut de la surface — la barre haute s'y loge (#8370).
struct ComposerSafeTopKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

/// Le cadre de la scène libre, en repère global comme celui de la carte (#10542).
struct ComposerFreeZoneFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .null
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let suivant = nextValue()
        if !suivant.isNull { value = suivant }
    }
}

/// La hauteur des étages du bas de la scène (#8712).
struct ComposerLowerFloorsHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
