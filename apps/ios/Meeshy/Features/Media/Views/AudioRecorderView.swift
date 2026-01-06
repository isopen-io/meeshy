//
//  AudioRecorderView.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import SwiftUI
import AVFoundation

struct AudioRecorderView: View {
    @StateObject private var viewModel = AudioRecorderViewModel()
    @State private var dragOffset: CGFloat = 0
    @State private var isLocked = false
    let onRecordingComplete: (URL) -> Void
    let onCancel: () -> Void

    var body: some View {
        HStack(spacing: 16) {
            if viewModel.isRecording && !isLocked {
                // Cancel indicator
                HStack(spacing: 8) {
                    Image(systemName: "chevron.left")
                        .font(.caption)
                    Text("Cancel")
                        .font(.subheadline)
                }
                .foregroundColor(.red)
                .opacity(cancelOpacity)
            }

            // Recording indicator and waveform
            if viewModel.isRecording {
                HStack(spacing: 12) {
                    // Recording dot
                    Circle()
                        .fill(Color.red)
                        .frame(width: 12, height: 12)

                    // Waveform
                    WaveformView(levels: viewModel.soundLevels)
                        .frame(height: 40)

                    // Duration
                    Text(viewModel.recordingDuration)
                        .font(.system(.body, design: .monospaced))
                        .foregroundColor(.primary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(
                    Capsule()
                        .fill(Color(.systemGray6))
                )
            }

            Spacer()

            // Record button
            recordButton
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .gesture(
            DragGesture()
                .onChanged { value in
                    if viewModel.isRecording && !isLocked {
                        dragOffset = value.translation.width

                        // Lock recording if dragged up
                        if value.translation.height < -80 {
                            isLocked = true
                            dragOffset = 0
                        }
                    }
                }
                .onEnded { value in
                    if viewModel.isRecording && !isLocked {
                        if value.translation.width < -100 {
                            // Cancel recording
                            viewModel.cancelRecording()
                            onCancel()
                        } else {
                            // Send recording
                            if let url = viewModel.stopRecording() {
                                onRecordingComplete(url)
                            }
                        }
                        dragOffset = 0
                    }
                }
        )
        .overlay(
            lockIndicator
                .opacity(lockIndicatorOpacity),
            alignment: .top
        )
    }

    // MARK: - Record Button

    private var recordButton: some View {
        Button {
            if viewModel.isRecording && isLocked {
                // Send recording
                if let url = viewModel.stopRecording() {
                    onRecordingComplete(url)
                }
                isLocked = false
            } else if viewModel.isRecording {
                // This shouldn't happen with drag gesture
            } else {
                // Start recording
                Task {
                    await viewModel.startRecording()
                }
            }
        } label: {
            ZStack {
                Circle()
                    .fill(viewModel.isRecording ? Color.blue : Color.blue.opacity(0.1))
                    .frame(width: 48, height: 48)

                if viewModel.isRecording && isLocked {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                } else {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 20))
                        .foregroundColor(viewModel.isRecording ? .white : .blue)
                }
            }
        }
        .offset(x: dragOffset)
    }

    // MARK: - Lock Indicator

    private var lockIndicator: some View {
        VStack(spacing: 8) {
            Image(systemName: isLocked ? "lock.fill" : "lock.open.fill")
                .font(.system(size: 24))
                .foregroundColor(isLocked ? .blue : .secondary)

            Image(systemName: "chevron.up")
                .font(.caption)
                .foregroundColor(.secondary)

            Text(isLocked ? "Recording locked" : "Slide up to lock")
                .font(.caption2)
                .foregroundColor(.secondary)
        }
        .padding()
    }

    // MARK: - Helpers

    private var cancelOpacity: Double {
        min(abs(dragOffset) / 100.0, 1.0)
    }

    private var lockIndicatorOpacity: Double {
        viewModel.isRecording && !isLocked ? 1.0 : 0.0
    }
}

// MARK: - Audio Recorder ViewModel

@MainActor
final class AudioRecorderViewModel: NSObject, ObservableObject {
    @Published var isRecording = false
    @Published var recordingDuration = "0:00"
    @Published var soundLevels: [CGFloat] = Array(repeating: 0.1, count: 20)

    private var audioRecorder: AVAudioRecorder?
    private var recordingTimer: Timer?
    private var levelTimer: Timer?
    private var recordingStartTime: Date?
    private var recordingURL: URL?

    // MARK: - Start Recording

    func startRecording() async {
        guard await checkMicrophonePermission() else { return }

        let audioSession = AVAudioSession.sharedInstance()

        do {
            try audioSession.setCategory(.record, mode: .default)
            try audioSession.setActive(true)

            // Setup recording
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("m4a")

            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 44100,
                AVNumberOfChannelsKey: 1,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
            ]

            audioRecorder = try AVAudioRecorder(url: url, settings: settings)
            audioRecorder?.isMeteringEnabled = true
            audioRecorder?.record()

            recordingURL = url
            isRecording = true
            recordingStartTime = Date()

            // Start timers
            startTimers()

        } catch {
            print("Failed to start recording: \(error)")
        }
    }

    // MARK: - Stop Recording

    func stopRecording() -> URL? {
        audioRecorder?.stop()
        stopTimers()

        isRecording = false
        recordingDuration = "0:00"
        soundLevels = Array(repeating: 0.1, count: 20)

        let url = recordingURL
        recordingURL = nil

        return url
    }

    // MARK: - Cancel Recording

    func cancelRecording() {
        audioRecorder?.stop()
        stopTimers()

        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
        }

        isRecording = false
        recordingDuration = "0:00"
        soundLevels = Array(repeating: 0.1, count: 20)
        recordingURL = nil
    }

    // MARK: - Timers

    private func startTimers() {
        // Duration timer
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.updateDuration()
        }

        // Level timer
        levelTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
            self?.updateSoundLevels()
        }
    }

    private func stopTimers() {
        recordingTimer?.invalidate()
        levelTimer?.invalidate()
        recordingTimer = nil
        levelTimer = nil
    }

    private func updateDuration() {
        guard let startTime = recordingStartTime else { return }
        let duration = Date().timeIntervalSince(startTime)
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        recordingDuration = String(format: "%d:%02d", minutes, seconds)
    }

    private func updateSoundLevels() {
        audioRecorder?.updateMeters()

        let averagePower = audioRecorder?.averagePower(forChannel: 0) ?? -160
        let normalizedValue = CGFloat(pow(10, averagePower / 20))

        // Shift array and add new value
        soundLevels.removeFirst()
        soundLevels.append(min(max(normalizedValue, 0.1), 1.0))
    }

    // MARK: - Permission

    private func checkMicrophonePermission() async -> Bool {
        await PermissionManager.shared.requestMicrophoneAccess()
    }
}
