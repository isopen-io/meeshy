import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Media Asset

enum MediaAsset {
    case image(UIImage)
    case videoURL(URL)
    case audioURL(URL)
}
