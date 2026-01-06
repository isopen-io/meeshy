//
//  PermissionManager.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import AVFoundation
import Photos
import CoreLocation
import SwiftUI

enum PermissionStatus {
    case notDetermined
    case granted
    case denied
    case restricted

    var isGranted: Bool {
        self == .granted
    }
}

@MainActor
final class PermissionManager: NSObject, ObservableObject {
    static let shared = PermissionManager()

    // MARK: - Published Properties

    @Published var cameraStatus: PermissionStatus = .notDetermined
    @Published var photoLibraryStatus: PermissionStatus = .notDetermined
    @Published var microphoneStatus: PermissionStatus = .notDetermined
    @Published var locationStatus: PermissionStatus = .notDetermined

    // MARK: - Private Properties

    private var locationManager: CLLocationManager?

    private override init() {
        super.init()
        checkAllPermissions()
    }

    // MARK: - Check All Permissions

    func checkAllPermissions() {
        checkCameraStatus()
        checkPhotoLibraryStatus()
        checkMicrophoneStatus()
        checkLocationStatus()
    }

    // MARK: - Camera Permission

    func checkCameraStatus() {
        cameraStatus = convertAVAuthorizationStatus(
            AVCaptureDevice.authorizationStatus(for: .video)
        )
    }

    func requestCameraAccess() async -> Bool {
        let granted = await AVCaptureDevice.requestAccess(for: .video)
        checkCameraStatus()
        return granted
    }

    // MARK: - Photo Library Permission

    func checkPhotoLibraryStatus() {
        photoLibraryStatus = convertPHAuthorizationStatus(
            PHPhotoLibrary.authorizationStatus(for: .readWrite)
        )
    }

    func requestPhotoLibraryAccess() async -> Bool {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        checkPhotoLibraryStatus()
        return status == .authorized || status == .limited
    }

    // MARK: - Microphone Permission

    func checkMicrophoneStatus() {
        // iOS 17+ uses AVAudioApplication, fallback to AVAudioSession for older versions
        if #available(iOS 17.0, *) {
            let status = AVAudioApplication.shared.recordPermission
            switch status {
            case .undetermined:
                microphoneStatus = .notDetermined
            case .granted:
                microphoneStatus = .granted
            case .denied:
                microphoneStatus = .denied
            @unknown default:
                microphoneStatus = .denied
            }
        } else {
            microphoneStatus = convertAVAuthorizationStatus(
                AVAudioSession.sharedInstance().recordPermission
            )
        }
    }

    func requestMicrophoneAccess() async -> Bool {
        if #available(iOS 17.0, *) {
            // iOS 17+ uses AVAudioApplication
            let granted = await AVAudioApplication.requestRecordPermission()
            checkMicrophoneStatus()
            return granted
        } else {
            // iOS 16 uses AVAudioSession with callback
            // Use a nonisolated wrapper to avoid actor isolation issues
            let granted = await withCheckedContinuation { (continuation: CheckedContinuation<Bool, Never>) in
                AVAudioSession.sharedInstance().requestRecordPermission { granted in
                    continuation.resume(returning: granted)
                }
            }
            // Update status on main actor after continuation resumes
            checkMicrophoneStatus()
            return granted
        }
    }

    // MARK: - Location Permission

    func checkLocationStatus() {
        if locationManager == nil {
            locationManager = CLLocationManager()
            locationManager?.delegate = self
        }

        let status = locationManager?.authorizationStatus ?? .notDetermined
        locationStatus = convertCLAuthorizationStatus(status)
    }

    func requestLocationAccess() async -> Bool {
        if locationManager == nil {
            locationManager = CLLocationManager()
            locationManager?.delegate = self
        }

        let currentStatus = locationManager?.authorizationStatus ?? .notDetermined

        if currentStatus == .notDetermined {
            locationManager?.requestWhenInUseAuthorization()
            // Wait for delegate callback
            return await withCheckedContinuation { continuation in
                // Store continuation for delegate callback
                self.locationContinuation = continuation
            }
        } else {
            checkLocationStatus()
            return locationStatus.isGranted
        }
    }

    private var locationContinuation: CheckedContinuation<Bool, Never>?

    // MARK: - Open Settings

    func openSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }

    // MARK: - Status Converters

    private func convertAVAuthorizationStatus(_ status: AVAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .notDetermined: return .notDetermined
        case .authorized: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .denied
        }
    }

    private func convertAVAuthorizationStatus(_ status: AVAudioSession.RecordPermission) -> PermissionStatus {
        switch status {
        case .undetermined: return .notDetermined
        case .granted: return .granted
        case .denied: return .denied
        @unknown default: return .denied
        }
    }

    private func convertPHAuthorizationStatus(_ status: PHAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .notDetermined: return .notDetermined
        case .authorized, .limited: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .denied
        }
    }

    private func convertCLAuthorizationStatus(_ status: CLAuthorizationStatus) -> PermissionStatus {
        switch status {
        case .notDetermined: return .notDetermined
        case .authorizedWhenInUse, .authorizedAlways: return .granted
        case .denied: return .denied
        case .restricted: return .restricted
        @unknown default: return .denied
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension PermissionManager: CLLocationManagerDelegate {
    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            checkLocationStatus()
            locationContinuation?.resume(returning: locationStatus.isGranted)
            locationContinuation = nil
        }
    }
}

// MARK: - Permission Alert View

struct PermissionAlertView: View {
    let permissionType: String
    let onOpenSettings: () -> Void
    @Environment(\.dismiss) private var dismiss: DismissAction

    init(permissionType: String, onOpenSettings: @escaping () -> Void) {
        self.permissionType = permissionType
        self.onOpenSettings = onOpenSettings
    }

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: iconName)
                .font(.system(size: 60))
                .foregroundColor(.blue)

            Text("\(permissionType) Access Required")
                .font(.title2)
                .fontWeight(.bold)

            Text("Please allow access to \(permissionType.lowercased()) in Settings to use this feature.")
                .font(.body)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            VStack(spacing: 12) {
                Button {
                    onOpenSettings()
                } label: {
                    Text("Open Settings")
                        .font(.headline)
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.blue)
                        .cornerRadius(12)
                }

                Button {
                    dismiss()
                } label: {
                    Text("Cancel")
                        .font(.headline)
                        .foregroundColor(.blue)
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .background(Color.gray.opacity(0.1))
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal)
        }
        .padding()
    }

    private var iconName: String {
        switch permissionType {
        case "Camera": return "camera.fill"
        case "Photo Library": return "photo.fill"
        case "Microphone": return "mic.fill"
        case "Location": return "location.fill"
        default: return "exclamationmark.triangle.fill"
        }
    }
}
