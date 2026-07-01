import SwiftUI
import UIKit
import os
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import MeeshySDK

// MARK: - Story Background Picker Palette

public enum StoryBackgroundPalette {
    public static let colors: [String] = [
        "0F0C29", "302B63", "24243E", "1A1A2E", "16213E",
        "FF2E63", "E94057", "F27121", "F8B500", "2ECC71",
        "08D9D6", "3498DB", "9B59B6", "45B7D1", "FF6B6B",
        "000000", "FFFFFF"
    ]

    public static let gradients: [(String, String)] = [
        ("FF2E63", "08D9D6"),
        ("9B59B6", "FF6B6B"),
        ("F8B500", "FF2E63"),
        ("0F0C29", "302B63"),
        ("1A1A2E", "E94057"),
        ("2ECC71", "3498DB"),
    ]

    public static func randomBackgroundColor() -> String {
        // Soft pastel palette : low saturation + very high brightness keeps
        // each pick desaturated enough that the picker tiles + text overlays
        // stay clearly legible on top. Higher saturation (>0.25) tinted the
        // canvas too strongly and washed out the tile contents. Aligned with
        // the glass-aesthetic shift (commit `59b90364`).
        let existingSet = Set(colors.map { $0.uppercased() })
        var hex: String
        repeat {
            let hue = Double.random(in: 0...1)
            let saturation = Double.random(in: 0.14...0.24)
            let brightness = Double.random(in: 0.93...0.98)
            let color = UIColor(hue: hue, saturation: saturation, brightness: brightness, alpha: 1.0)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
            color.getRed(&r, green: &g, blue: &b, alpha: nil)
            hex = String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
        } while existingSet.contains(hex)
        return hex
    }

    /// SwiftUI-friendly variant of `randomBackgroundColor()`.
    /// Returns the same random HSB pick as a `Color` so callers (story
    /// notification thumbnails, in-feed placeholders) can pass it straight
    /// into a SwiftUI gradient or `.fill(...)` without re-parsing the hex.
    public static func randomBackgroundColorAsColor() -> Color {
        Color(hex: randomBackgroundColor())
    }
}

// MARK: - Story Composer Draft

struct StoryComposerDraft: Codable {
    let slides: [StorySlide]
    let visibilityPreference: String
    static let userDefaultsKey = "storyComposerDraft"
}

// MARK: - Slide Publish Action

public enum SlidePublishAction: Sendable {
    case retry, skip, cancel
}

// MARK: - Audio Editor Item Wrapper

struct AudioEditorItemWrapper: Identifiable {
    let id = UUID()
    let url: URL
    /// Language tagged at record time (recorder strip); seeds the editor's
    /// transcription language. `nil` for file imports → editor default.
    var language: String? = nil
}

// MARK: - Media Editor Wrappers

struct PendingImageWrapper: Identifiable {
    let id = UUID()
    let image: UIImage
}

struct EditingMediaImage: Identifiable {
    let id = UUID()
    let elementId: String
    let image: UIImage
}

struct EditingMediaVideo: Identifiable {
    let id = UUID()
    let elementId: String
    let url: URL
}
