import SwiftUI
import Combine

// MARK: - In-app accessibility preferences (user-configurable)

/// Settings the *app* lets the user tune on top of the OS accessibility
/// settings. Generic and extensible — add fields here (e.g. an in-app
/// increase-contrast or bold-text override) as the remediation progresses.
public struct MeeshyAccessibilitySettings: Codable, Equatable, Sendable {
    /// When `true`, the app behaves as if system Reduce Motion were on, even if
    /// it isn't. The override can only *add* motion reduction — it never
    /// re-enables animations the OS asked to suppress (see `MeeshyMotion`).
    public var reduceMotion: Bool

    public init(reduceMotion: Bool = false) {
        self.reduceMotion = reduceMotion
    }

    public static let defaults = MeeshyAccessibilitySettings()
}

/// Persists `MeeshyAccessibilitySettings` in `UserDefaults` and publishes
/// changes. Pattern mirrors `MediaDownloadPreferencesStore` (debounced save).
@MainActor
public final class MeeshyAccessibilityPreferences: ObservableObject {
    public static let shared = MeeshyAccessibilityPreferences()

    @Published public var settings: MeeshyAccessibilitySettings

    public static let storageKey = "me.meeshy.accessibilityPreferences"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.settings = Self.load()
        $settings
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.save($0) }
            .store(in: &cancellables)
    }

    /// Convenience pass-through for the most common toggle.
    public var reduceMotion: Bool {
        get { settings.reduceMotion }
        set { settings.reduceMotion = newValue }
    }

    public static func load(userDefaults: UserDefaults = .standard) -> MeeshyAccessibilitySettings {
        guard let data = userDefaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(MeeshyAccessibilitySettings.self, from: data)
        else { return .defaults }
        return decoded
    }

    public static func save(_ settings: MeeshyAccessibilitySettings, userDefaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(settings) else { return }
        userDefaults.set(data, forKey: storageKey)
    }
}

// MARK: - Reduce Motion resolution

/// Pure resolution of "should we suppress motion right now" — testable without a
/// running app. The app override can only *strengthen* the OS preference.
public enum MeeshyMotion {
    public nonisolated static func shouldReduce(system: Bool, userForced: Bool) -> Bool {
        system || userForced
    }
}

/// App-level Reduce Motion override, injected at the root from
/// `MeeshyAccessibilityPreferences`. Defaults to `false` so SDK views behave
/// exactly like system-only Reduce Motion when the app never sets it.
private struct MeeshyForceReduceMotionKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    var meeshyForceReduceMotion: Bool {
        get { self[MeeshyForceReduceMotionKey.self] }
        set { self[MeeshyForceReduceMotionKey.self] = newValue }
    }
}

// MARK: - Motion-aware animation

private struct MeeshyAnimationModifier<V: Equatable>: ViewModifier {
    @Environment(\.accessibilityReduceMotion) private var systemReduce
    @Environment(\.meeshyForceReduceMotion) private var userForced
    let animation: Animation?
    let value: V

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduce, userForced: userForced)
        return content.animation(reduce ? nil : animation, value: value)
    }
}

public extension View {
    /// Drop-in replacement for `.animation(_:value:)` that suppresses the
    /// animation when Reduce Motion is active (system **or** the in-app
    /// override). Use everywhere instead of raw `.animation(_:value:)` for any
    /// non-essential motion.
    func meeshyAnimation<V: Equatable>(_ animation: Animation?, value: V) -> some View {
        modifier(MeeshyAnimationModifier(animation: animation, value: value))
    }

    /// Hide a purely decorative element from the accessibility tree. Clearer at
    /// the call site than a bare `.accessibilityHidden(true)`.
    func accessibilityDecorative() -> some View {
        accessibilityHidden(true)
    }

    /// Guarantee a ≥ `minSize` square hit region (Apple HIG minimum is 44pt)
    /// while keeping the visible glyph at its design size.
    func meeshyTapTarget(_ minSize: CGFloat = 44) -> some View {
        frame(minWidth: minSize, minHeight: minSize)
            .contentShape(Rectangle())
    }
}

// MARK: - Dynamic Type typography

public extension MeeshyFont {
    /// The relative text style whose default point size is closest to `size`.
    /// Used to migrate fixed `.font(.system(size:))` call sites to scaling fonts.
    nonisolated static func textStyle(for size: CGFloat) -> Font.TextStyle {
        switch size {
        case ..<11.5: return .caption2     // ~10, 11
        case ..<12.5: return .caption      // 12
        case ..<13.5: return .footnote     // 13
        case ..<15.5: return .subheadline  // 14, 15
        case ..<16.5: return .callout      // 16
        case ..<18.5: return .body         // 17, 18 (headline weight passed separately)
        case ..<20.5: return .title3       // 19, 20
        case ..<24.5: return .title2       // 21–24
        case ..<31:   return .title        // 25–30
        default:      return .largeTitle   // 31+
        }
    }

    /// Dynamic-Type-aware replacement for `.system(size:weight:design:)`.
    ///
    /// Maps the legacy point size to the nearest relative text style so the font
    /// scales with the user's Dynamic Type setting, while preserving the caller's
    /// weight and design. Migration is a mechanical swap:
    /// `.font(.system(size: 15, weight: .medium))` → `.font(MeeshyFont.relative(15, weight: .medium))`.
    ///
    /// For a custom size that must scale with absolute precision, prefer
    /// `@ScaledMetric` in the view instead.
    nonisolated static func relative(
        _ size: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .default
    ) -> Font {
        Font.system(textStyle(for: size), design: design).weight(weight)
    }
}

// MARK: - Accessibility identifiers (UI / E2E test hooks)

/// Stable accessibility identifiers shared by the app and UI tests — the single
/// source of truth so a renamed control updates both sides at once. Apply with
/// `.accessibilityIdentifier(MeeshyA11yID.composerSend)`.
public enum MeeshyA11yID {
    // Auth
    public static let loginSubmit = "login.submit"

    // Conversation / composer
    public static let composerSend = "composer.send"
    public static let composerTextField = "composer.textField"
    public static let conversationMessageList = "conversation.messageList"
    public static let conversationScrollToBottom = "conversation.scrollToBottom"
    public static let conversationRow = "conversation.row"

    // Transient feedback
    public static let toastContainer = "toast.container"

    // Calls (safety-critical)
    public static let callControlEnd = "call.control.end"
    public static let callControlAnswer = "call.control.answer"
    public static let callControlDecline = "call.control.decline"
    public static let callControlMute = "call.control.mute"
    public static let callControlSpeaker = "call.control.speaker"

    // Join / community
    public static let joinSubmit = "join.submit"
    public static let communityCreateSubmit = "community.create.submit"
}
