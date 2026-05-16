import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas components
//
// Dedicated View structs extracted from StoryViewerView so the deeply nested
// story canvas (viewer content + story card) no longer composes into
// StoryViewerView.body's opaque type. That monolithic type exceeded the Swift
// type-checker budget and triggered a type-metadata instantiation crash on
// low-memory devices. Real structs (vs AnyView) break the type while
// preserving SwiftUI structural identity.
