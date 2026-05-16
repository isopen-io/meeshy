import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView sidebar & header components
//
// Dedicated View structs extracted from StoryViewerView so the action sidebar
// and the story header no longer compose into StoryViewerView.body's opaque
// type. Real structs (vs AnyView) break the type while preserving SwiftUI
// structural identity.
