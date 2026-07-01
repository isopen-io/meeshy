import SwiftUI
import Combine
import UIKit
import MeeshySDK
import PencilKit

// MARK: - Safe Array Access

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
