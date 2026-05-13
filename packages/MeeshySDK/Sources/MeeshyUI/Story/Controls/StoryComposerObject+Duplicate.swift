import Foundation
import CoreGraphics
import MeeshySDK

extension StoryTextObject {
    func duplicated(withNewId newId: String, offsetBy delta: CGPoint) -> StoryTextObject {
        var clone = self
        clone.id = newId
        clone.x = x + Double(delta.x) / 1080.0
        clone.y = y + Double(delta.y) / 1920.0
        return clone
    }
}

extension StoryMediaObject {
    func duplicated(withNewId newId: String, offsetBy delta: CGPoint) -> StoryMediaObject {
        var clone = self
        clone.id = newId
        clone.x = x + Double(delta.x) / 1080.0
        clone.y = y + Double(delta.y) / 1920.0
        return clone
    }
}

extension StorySticker {
    func duplicated(withNewId newId: String, offsetBy delta: CGPoint) -> StorySticker {
        var clone = self
        clone.id = newId
        clone.x = x + Double(delta.x) / 1080.0
        clone.y = y + Double(delta.y) / 1920.0
        return clone
    }
}
