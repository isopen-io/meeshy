import SwiftUI
import AVFoundation
import CoreLocation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Models
// ============================================================================

enum ComposerAttachmentType: String, Equatable {
    case image, file, voice, location, video
}

struct ComposerAttachment: Identifiable, Equatable {
    let id: String
    let type: ComposerAttachmentType
    let name: String
    var url: URL?
    var size: Int?
    var duration: TimeInterval?
    var latitude: Double?
    var longitude: Double?
    var thumbnailColor: String = "808080"

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.id == rhs.id }

    // Convenience factories
    static func voice(duration: TimeInterval) -> ComposerAttachment {
        ComposerAttachment(
            id: "voice-\(Int(Date().timeIntervalSince1970 * 1000))",
            type: .voice,
            name: "Message vocal (\(Self.formatDur(duration)))",
            duration: duration,
            thumbnailColor: "FF6B6B"
        )
    }

    static func location(lat: Double, lng: Double) -> ComposerAttachment {
        ComposerAttachment(
            id: "location-\(Int(Date().timeIntervalSince1970 * 1000))",
            type: .location,
            name: "Position actuelle",
            latitude: lat,
            longitude: lng,
            thumbnailColor: "2ECC71"
        )
    }

    static func image(url: URL? = nil, name: String = "Photo", color: String = "9B59B6") -> ComposerAttachment {
        ComposerAttachment(
            id: "image-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .image,
            name: name,
            url: url,
            thumbnailColor: color
        )
    }

    static func file(url: URL? = nil, name: String = "Fichier", size: Int? = nil, color: String = "45B7D1") -> ComposerAttachment {
        ComposerAttachment(
            id: "file-\(Int(Date().timeIntervalSince1970 * 1000))-\(Int.random(in: 0...9999))",
            type: .file,
            name: name,
            url: url,
            size: size,
            thumbnailColor: color
        )
    }

    private static func formatDur(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

struct LanguageOption: Identifiable {
    var id: String { code }
    let code: String
    let name: String
    let flag: String

    static let defaults: [LanguageOption] = [
        LanguageOption(code: "fr", name: "Fran\u{00E7}ais", flag: "\u{1F1EB}\u{1F1F7}"),
        LanguageOption(code: "en", name: "English", flag: "\u{1F1EC}\u{1F1E7}"),
        LanguageOption(code: "es", name: "Espa\u{00F1}ol", flag: "\u{1F1EA}\u{1F1F8}"),
        LanguageOption(code: "de", name: "Deutsch", flag: "\u{1F1E9}\u{1F1EA}"),
        LanguageOption(code: "it", name: "Italiano", flag: "\u{1F1EE}\u{1F1F9}"),
        LanguageOption(code: "pt", name: "Portugu\u{00EA}s", flag: "\u{1F1E7}\u{1F1F7}"),
        LanguageOption(code: "ja", name: "\u{65E5}\u{672C}\u{8A9E}", flag: "\u{1F1EF}\u{1F1F5}"),
        LanguageOption(code: "zh", name: "\u{4E2D}\u{6587}", flag: "\u{1F1E8}\u{1F1F3}"),
        LanguageOption(code: "ko", name: "\u{D55C}\u{AD6D}\u{C5B4}", flag: "\u{1F1F0}\u{1F1F7}"),
        LanguageOption(code: "ar", name: "\u{0627}\u{0644}\u{0639}\u{0631}\u{0628}\u{064A}\u{0629}", flag: "\u{1F1F8}\u{1F1E6}"),
    ]
}

// ============================================================================
// MARK: - Keyboard Observer
// ============================================================================

class KeyboardObserver: ObservableObject {
    @Published var height: CGFloat = 0
    @Published var isVisible = false

    /// Last non-zero keyboard height — useful for sizing emoji panel
    var lastKnownHeight: CGFloat = 280

    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)
            .sink { [weak self] notification in
                guard let self = self,
                      let endFrame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
                      let duration = notification.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
                else { return }

                let screenHeight = UIScreen.main.bounds.height
                let newHeight = max(screenHeight - endFrame.origin.y, 0)

                if newHeight > 0 {
                    self.lastKnownHeight = newHeight
                }

                withAnimation(.easeInOut(duration: max(duration, 0.15))) {
                    self.height = newHeight
                    self.isVisible = newHeight > 0
                }
            }
            .store(in: &cancellables)
    }
}

// ============================================================================
// MARK: - Location Helper
// ============================================================================

class ComposerLocationHelper: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    var onLocationReceived: ((Double, Double) -> Void)?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
    }

    func requestLocation() {
        let status = manager.authorizationStatus
        if status == .notDetermined {
            manager.requestWhenInUseAuthorization()
        }
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if let loc = locations.first {
            onLocationReceived?(loc.coordinate.latitude, loc.coordinate.longitude)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        print("ComposerLocationHelper error:", error.localizedDescription)
    }
}

// ============================================================================
// MARK: - Waveform Bar Animation
// ============================================================================

struct ComposerWaveformBar: View {
    let index: Int
    let isRecording: Bool
    let accentColor: String

    @State private var height: CGFloat = 4

    var body: some View {
        RoundedRectangle(cornerRadius: 2)
            .fill(
                LinearGradient(
                    colors: [Color(hex: accentColor).opacity(0.8), Color(hex: accentColor).opacity(0.4)],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .frame(width: 3, height: height)
            .onAppear { animate() }
            .onChange(of: isRecording) { rec in
                if rec { animate() } else { height = 4 }
            }
    }

    private func animate() {
        guard isRecording else { return }
        let delay = Double(index) * 0.05
        withAnimation(
            .easeInOut(duration: Double.random(in: 0.3...0.6))
            .repeatForever(autoreverses: true)
            .delay(delay)
        ) {
            height = CGFloat.random(in: 6...24)
        }
    }
}
