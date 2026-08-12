import AVFoundation
import Photos

// MARK: - MediaPermissionState

/// Single vocabulary for every device-content authorization the app asks for
/// (camera, microphone, photo library). AVFoundation and Photos each ship their
/// own status enum with subtly different cases — call sites used to switch on
/// the raw framework enums and each one drew the "is this a grant?" line in a
/// slightly different place (`.limited` in particular was routinely treated as
/// a refusal). Mapping both into one type makes the three derived decisions —
/// can we use it, should we prompt, should we send the user to Settings —
/// answerable in exactly one place.
public enum MediaPermissionState: String, Sendable {
    case notDetermined
    case granted
    /// Photo-library-only: the user granted access to a chosen subset of assets.
    /// A grant, not a refusal.
    case limited
    case denied
    /// Blocked by policy (parental controls, MDM). Never promptable, and
    /// "open Settings" is the only possible remedy — same as `.denied`.
    case restricted

    /// True when the underlying resource can be read/used right now.
    public var isUsable: Bool { self == .granted || self == .limited }

    /// True when the system prompt has never been shown, so asking in-app is
    /// still possible.
    public var canPrompt: Bool { self == .notDetermined }

    /// True when the only remaining remedy is the Settings app.
    public var needsSettingsRedirect: Bool { self == .denied || self == .restricted }
}

// MARK: - Framework status mapping

extension MediaPermissionState {
    public init(captureStatus: AVAuthorizationStatus) {
        switch captureStatus {
        case .notDetermined: self = .notDetermined
        case .authorized: self = .granted
        case .denied: self = .denied
        case .restricted: self = .restricted
        @unknown default: self = .denied
        }
    }

    public init(photoStatus: PHAuthorizationStatus) {
        switch photoStatus {
        case .notDetermined: self = .notDetermined
        case .authorized: self = .granted
        case .limited: self = .limited
        case .denied: self = .denied
        case .restricted: self = .restricted
        @unknown default: self = .denied
        }
    }
}

// MARK: - Current state (synchronous, never prompts)

extension MediaPermissionState {
    public static var camera: MediaPermissionState {
        MediaPermissionState(captureStatus: AVCaptureDevice.authorizationStatus(for: .video))
    }

    /// Microphone state. Read through `AVCaptureDevice`'s `.audio` media type
    /// rather than `AVAudioSession.recordPermission`: both consult the same TCC
    /// record, but this one is not deprecated on iOS 17+ and returns the same
    /// four-case enum as the camera, so there is a single mapping to maintain.
    public static var microphone: MediaPermissionState {
        MediaPermissionState(captureStatus: AVCaptureDevice.authorizationStatus(for: .audio))
    }

    /// Read access to the library (browsing recent media in-app). Not needed by
    /// `PHPickerViewController`/`PhotosPicker`, which run out-of-process.
    public static var photoLibraryRead: MediaPermissionState {
        MediaPermissionState(photoStatus: PHPhotoLibrary.authorizationStatus(for: .readWrite))
    }

    /// Write-only access — saving a capture or a received attachment.
    public static var photoLibraryAdd: MediaPermissionState {
        MediaPermissionState(photoStatus: PHPhotoLibrary.authorizationStatus(for: .addOnly))
    }
}

// MARK: - Requests

/// Every request helper below is `nonisolated` and confines its callback to a
/// bare `continuation.resume`.
///
/// The system delivers these callbacks on TCC's own queue
/// (`com.avaudiosession.tccserver` and friends). Under `defaultIsolation(MainActor)`
/// — which `MeeshyUI` opts into — a closure literal passed to those APIs
/// inherits `@MainActor`, and its prologue (`swift_task_isCurrentExecutorImpl`)
/// checks the executor ON ENTRY, off the main actor, and traps
/// (`EXC_BREAKPOINT`) before any inner `Task { @MainActor in }` can run. That
/// was a real crash on the first microphone prompt (2026-06-15).
///
/// Keeping the callback free of any actor-isolated access means no check is
/// inserted; the `async` result is then consumed on the MainActor via `await`.
/// Same doctrine as `ContactSyncService.requestContactsPermission`.
public enum DevicePermissions {

    /// Requests camera access. Returns the resulting state — `.granted` when the
    /// user allowed it (or had already allowed it), the terminal state otherwise.
    public nonisolated static func requestCamera() async -> MediaPermissionState {
        await requestCapture(for: .video)
    }

    /// Requests microphone access.
    public nonisolated static func requestMicrophone() async -> MediaPermissionState {
        await requestCapture(for: .audio)
    }

    /// Requests read access to the photo library. `.limited` is a success.
    public nonisolated static func requestPhotoLibraryRead() async -> MediaPermissionState {
        await requestPhotoLibrary(for: .readWrite)
    }

    /// Requests write-only access to the photo library.
    public nonisolated static func requestPhotoLibraryAdd() async -> MediaPermissionState {
        await requestPhotoLibrary(for: .addOnly)
    }

    // MARK: - Private

    private nonisolated static func requestCapture(
        for mediaType: AVMediaType
    ) async -> MediaPermissionState {
        let current = MediaPermissionState(captureStatus: AVCaptureDevice.authorizationStatus(for: mediaType))
        guard current.canPrompt else { return current }
        let granted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
            AVCaptureDevice.requestAccess(for: mediaType) { granted in
                continuation.resume(returning: granted)
            }
        }
        return granted ? .granted : .denied
    }

    private nonisolated static func requestPhotoLibrary(
        for level: PHAccessLevel
    ) async -> MediaPermissionState {
        let current = MediaPermissionState(photoStatus: PHPhotoLibrary.authorizationStatus(for: level))
        guard current.canPrompt else { return current }
        let status = await withCheckedContinuation { (continuation: CheckedContinuation<PHAuthorizationStatus, Never>) in
            PHPhotoLibrary.requestAuthorization(for: level) { newStatus in
                continuation.resume(returning: newStatus)
            }
        }
        return MediaPermissionState(photoStatus: status)
    }
}
