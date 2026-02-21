import SwiftUI
import AVFoundation
import CoreLocation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Recording Views & Logic
// ============================================================================

extension UniversalComposerBar {

    // MARK: - Text Input Field (counterpart to voiceRecordingView)

    var textInputField: some View {
        HStack(spacing: 0) {
            // Mic button inside field (left) — hidden when focused
            if resolvedShowVoice && !isFocused {
                Button {
                    onAnyInteraction?()
                    HapticFeedback.light()
                    startRecording()
                } label: {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(.white.opacity(0.5))
                        .frame(width: 36, height: 36)
                }
                .padding(.leading, 4)
                .transition(.scale.combined(with: .opacity))
            }

            // Text input
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(resolvedPlaceholder)
                        .foregroundColor(.white.opacity(0.4))
                        .padding(.leading, (resolvedShowVoice && !isFocused) ? 2 : 16)
                }

                TextField("", text: $text, axis: .vertical)
                    .focused($isFocused)
                    .foregroundColor(.white)
                    .padding(.leading, (resolvedShowVoice && !isFocused) ? 2 : 16)
                    .padding(.trailing, 16)
                    .padding(.vertical, 12)
                    .lineLimit(1...5)
                    .font(.system(size: 16))
                    .onChange(of: text) { newValue in
                        if let maxLen = resolvedMaxLength, newValue.count > maxLen {
                            text = String(newValue.prefix(maxLen))
                        }
                    }
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: isFocused)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            focusBounce ?
                            LinearGradient(colors: [Color(hex: "08D9D6").opacity(0.5), Color(hex: "FF2E63").opacity(0.5)], startPoint: .leading, endPoint: .trailing) :
                                LinearGradient(colors: [Color.white.opacity(0.15), Color.white.opacity(0.1)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: focusBounce ? 1.5 : 1
                        )
                )
                .shadow(color: focusBounce ? Color(hex: "08D9D6").opacity(0.2) : Color.clear, radius: 8, x: 0, y: 0)
        )
        .scaleEffect(x: typeWave ? 1.015 : 1.0, y: typeWave ? 0.97 : 1.0)
        .scaleEffect(focusBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.2, dampingFraction: 0.35), value: typeWave)
    }

    // MARK: - Recording Indicator

    var recordingIndicator: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(Color(hex: "EF4444"))
                .frame(width: 6, height: 6)
                .opacity(recordingDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)
                .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)

            Text(formatDuration(recordingDuration))
                .font(.system(size: 11, weight: .semibold, design: .monospaced))
                .foregroundColor(Color(hex: "EF4444"))
                .contentTransition(.numericText())
        }
    }

    // MARK: - Voice Recording View (replaces text field while recording)

    var voiceRecordingView: some View {
        HStack(spacing: 12) {
            // Animated waveform bars
            HStack(spacing: 3) {
                ForEach(0..<15, id: \.self) { i in
                    ComposerWaveformBar(index: i, isRecording: isRecording, accentColor: "FF6B6B")
                }
            }

            Spacer()

            // Timer
            Text(formatDuration(recordingDuration))
                .font(.system(size: 15, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
                .contentTransition(.numericText())
                .animation(.spring(response: 0.3), value: recordingDuration)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(Color.white.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            LinearGradient(colors: [Color(hex: "FF2E63").opacity(0.5), Color(hex: "FF6B6B").opacity(0.5)], startPoint: .leading, endPoint: .trailing),
                            lineWidth: 1.5
                        )
                )
        )
        // Wave pulse synced to recording timer (~every 0.5s)
        .scaleEffect(
            x: recordingDuration.truncatingRemainder(dividingBy: 0.5) < 0.25 ? 1.012 : 1.0,
            y: recordingDuration.truncatingRemainder(dividingBy: 0.5) < 0.25 ? 0.975 : 1.0
        )
        .animation(.spring(response: 0.25, dampingFraction: 0.35), value: recordingDuration)
    }

    // MARK: - Stop Recording Button

    var stopRecordingButton: some View {
        Button {
            HapticFeedback.light()
            stopRecording()
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color(hex: "FF2E63"), Color(hex: "FF6B6B")],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: Color(hex: "FF2E63").opacity(0.5), radius: 10, y: 3)

                Image(systemName: "stop.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
            .scaleEffect(recordingDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1.08 : 1.0)
            .animation(.easeInOut(duration: 0.5).repeatForever(autoreverses: true), value: isRecording)
        }
    }

    // MARK: - Recording Logic

    func startRecording() {
        onAnyInteraction?()
        isRecording = true
        recordingDuration = 0
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            recordingDuration += 0.1
        }
        onRecordingChange?(true)
        HapticFeedback.medium()
    }

    func stopRecording() {
        onAnyInteraction?()
        guard recordingDuration > 0.5 else {
            // Too short — cancel
            isRecording = false
            recordingTimer?.invalidate()
            recordingTimer = nil
            recordingDuration = 0
            onRecordingChange?(false)
            return
        }

        let duration = recordingDuration

        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        // Add voice attachment
        let attachment = ComposerAttachment.voice(duration: duration)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            attachments.append(attachment)
        }

        // Callback for parent to handle actual audio data
        if let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
            onVoiceRecord?(url, duration)
        }

        recordingDuration = 0
        onRecordingChange?(false)
        HapticFeedback.light()
    }

    /// Force-stop recording when switching stories — always saves the voice attachment regardless of duration
    func forceStopRecording() {
        guard isRecording else { return }
        let duration = recordingDuration

        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil

        if duration > 0.3 {
            let attachment = ComposerAttachment.voice(duration: duration)
            attachments.append(attachment)
            if let url = FileManager.default.temporaryDirectory.appendingPathComponent("voice_\(Int(Date().timeIntervalSince1970)).m4a") as URL? {
                onVoiceRecord?(url, duration)
            }
        }

        recordingDuration = 0
        onRecordingChange?(false)
    }

    // MARK: - Expand & Start Recording

    func expandAndStartRecording() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isMinimized = false
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            startRecording()
        }
        onExpand?()
    }

    // MARK: - Helpers

    func formatDuration(_ seconds: TimeInterval) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}
