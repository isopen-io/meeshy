import SwiftUI
import AVFoundation
import CoreLocation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Recording Views & Logic
// ============================================================================

extension UniversalComposerBar {

    // MARK: - Text Input Field (shown when not recording)

    var textInputField: some View {
        let accent = Color(hex: accentColor)
        let bgFill = style == .dark
            ? Color.white.opacity(0.08)
            : accent.opacity(0.06)
        let borderDefault: [Color] = style == .dark
            ? [Color.white.opacity(0.15), Color.white.opacity(0.1)]
            : [accent.opacity(0.2), accent.opacity(0.15)]
        let borderFocused: [Color] = [Color(hex: "08D9D6").opacity(0.5), Color(hex: "FF2E63").opacity(0.5)]

        return HStack(spacing: 0) {
            // Mic button inside field (left) — hidden when focused
            if resolvedShowVoice && !isFocused {
                Button {
                    onAnyInteraction?()
                    HapticFeedback.light()
                    startRecording()
                } label: {
                    Image(systemName: "mic.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(mutedColor)
                        .frame(width: 36, height: 36)
                }
                .padding(.leading, 4)
                .transition(.scale.combined(with: .opacity))
            }

            // Text input
            ZStack(alignment: .leading) {
                if text.isEmpty {
                    Text(resolvedPlaceholder)
                        .foregroundColor(placeholderColor)
                        .padding(.leading, (resolvedShowVoice && !isFocused) ? 2 : 16)
                }

                TextField("", text: $text, axis: .vertical)
                    .focused($isFocused)
                    .foregroundColor(textColor)
                    .padding(.leading, (resolvedShowVoice && !isFocused) ? 2 : 16)
                    .padding(.trailing, 16)
                    .padding(.vertical, 12)
                    .lineLimit(1...5)
                    .font(.system(size: 16))
                    .onChange(of: text) { _, newValue in
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
                .fill(bgFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(
                            focusBounce ?
                            LinearGradient(colors: borderFocused, startPoint: .leading, endPoint: .trailing) :
                                LinearGradient(colors: borderDefault, startPoint: .leading, endPoint: .trailing),
                            lineWidth: focusBounce ? 1.5 : 1
                        )
                )
                .shadow(color: focusBounce ? Color(hex: "08D9D6").opacity(0.2) : Color.clear, radius: 8, x: 0, y: 0)
        )
        .scaleEffect(x: typeWave ? 1.015 : 1.0, y: typeWave ? 0.97 : 1.0)
        .scaleEffect(focusBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.2, dampingFraction: 0.35), value: typeWave)
    }

    // MARK: - Recording Bar (full-width iMessage-style pill)
    //
    // When recording starts, this thin unified pill replaces the entire composer row:
    //   [ X ]  ░▅▂▇▃█▅▂▆▄▃▇▅▂▆▇▃▅▄  • 0:12  [ ↑ ]
    //  cancel        live waveform       timer  send
    //
    // Reference: iOS 17+ iMessage voice message UI.

    var recordingBar: some View {
        let isDark = style == .dark
        let bgFill = isDark
            ? Color.white.opacity(0.08)
            : Color(hex: accentColor).opacity(0.06)
        let borderColor: Color = isDark
            ? Color.white.opacity(0.15)
            : Color(hex: accentColor).opacity(0.2)
        let timerColor = isDark ? Color.white : theme.textPrimary
        let waveformColor = isDark ? "FFFFFF" : accentColor

        return HStack(spacing: 10) {
            // Cancel (X) button — discards the recording without sending.
            // Hit area expanded to 44x44pt per Apple HIG while keeping the
            // visible pill at 32pt.
            Button {
                HapticFeedback.light()
                cancelRecording()
            } label: {
                ZStack {
                    Circle()
                        .fill(Color(hex: "FF2E63").opacity(0.14))
                        .frame(width: 32, height: 32)
                    Image(systemName: "xmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(hex: "FF2E63"))
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("Annuler l'enregistrement")
            .accessibilityHint("Supprime le message vocal en cours")

            // Live waveform — fills available horizontal space.
            // Marked accessibilityHidden: purely decorative, timer conveys state.
            waveformStrip(color: waveformColor)
                .frame(maxWidth: .infinity)
                .frame(height: 28)
                .accessibilityHidden(true)

            // Recording indicator + timer — grouped for VoiceOver.
            HStack(spacing: 5) {
                Circle()
                    .fill(Color(hex: "EF4444"))
                    .frame(width: 6, height: 6)
                    .opacity(effectiveDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)
                    .animation(
                        .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                        value: effectiveIsRecording
                    )

                Text(formatDuration(effectiveDuration))
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundColor(timerColor)
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3), value: effectiveDuration)
            }
            .frame(width: 54, alignment: .trailing)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Enregistrement en cours, \(formatDuration(effectiveDuration))")

            // Send button — stops recording and sends.
            // For delegated recording (ConversationView), handleSend() dispatches
            // to onCustomSend which stops the recorder and sends. For internal
            // recording (stories, comments), we must materialize the voice
            // attachment ourselves by calling stopRecording() first.
            Button {
                HapticFeedback.medium()
                if onCustomSend == nil && isRecording {
                    stopRecording()
                }
                handleSend()
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 32, height: 32)
                        .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 6, y: 2)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundColor(.white)
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel("Envoyer le message vocal")
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 22)
                .fill(bgFill)
                .overlay(
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(borderColor, lineWidth: 1)
                )
        )
    }

    // MARK: - Waveform strip used inside the recording bar

    private func waveformStrip(color colorHex: String) -> some View {
        let barWidth: CGFloat = 2.5
        let barSpacing: CGFloat = 2.5
        let barGradient: [Color] = [
            Color(hex: colorHex).opacity(0.95),
            Color(hex: colorHex).opacity(0.55)
        ]

        return GeometryReader { geo in
            let availableWidth = geo.size.width
            let barCount = max(1, Int(availableWidth / (barWidth + barSpacing)))
            HStack(spacing: barSpacing) {
                if let levels = externalAudioLevels, !levels.isEmpty {
                    // Linearly interpolate the sampled levels across the full
                    // bar count so the waveform reads as a single continuous
                    // curve (no tiled repetition). Left = oldest, right = newest.
                    ForEach(0..<barCount, id: \.self) { i in
                        let level = interpolatedLevel(at: i, barCount: barCount, levels: levels)
                        RoundedRectangle(cornerRadius: 1.25)
                            .fill(LinearGradient(colors: barGradient, startPoint: .top, endPoint: .bottom))
                            .frame(width: barWidth, height: effectiveIsRecording ? 3 + 22 * level : 3)
                            .animation(.spring(response: 0.08, dampingFraction: 0.6), value: level)
                    }
                } else {
                    ForEach(0..<barCount, id: \.self) { i in
                        ComposerWaveformBar(index: i, isRecording: effectiveIsRecording, accentColor: colorHex)
                    }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        }
    }

    /// Linear interpolation of audio `levels` onto `barCount` evenly-spaced points.
    /// Returns a smooth curve with no tiling artifacts even when `barCount > levels.count`.
    private func interpolatedLevel(at index: Int, barCount: Int, levels: [CGFloat]) -> CGFloat {
        guard levels.count > 1, barCount > 1 else { return levels.first ?? 0 }
        let position = CGFloat(index) * CGFloat(levels.count - 1) / CGFloat(barCount - 1)
        let lowIndex = Int(position.rounded(.down))
        let highIndex = min(lowIndex + 1, levels.count - 1)
        let t = position - CGFloat(lowIndex)
        return levels[lowIndex] * (1 - t) + levels[highIndex] * t
    }

    // MARK: - Recording Logic

    func startRecording() {
        onAnyInteraction?()
        // Delegated recording: parent manages real AVAudioRecorder
        if let onStartRecording {
            onStartRecording()
            isRecording = true
            onRecordingChange?(true)
            HapticFeedback.medium()
            return
        }
        // Internal recording (stories, etc.)
        isRecording = true
        recordingDuration = 0
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { _ in
            Task { @MainActor in self.recordingDuration += 0.1 }
        }
        onRecordingChange?(true)
        HapticFeedback.medium()
    }

    func stopRecording() {
        onAnyInteraction?()
        // Delegated recording: parent handles stop
        if let onStopRecording {
            onStopRecording()
            isRecording = false
            onRecordingChange?(false)
            HapticFeedback.light()
            return
        }
        // Internal recording (stories, etc.)
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

    /// Cancel recording — discard audio without creating an attachment.
    /// Delegates to parent if `onCancelRecording` is provided; otherwise resets internal state.
    func cancelRecording() {
        onAnyInteraction?()
        if let onCancelRecording {
            onCancelRecording()
            isRecording = false
            onRecordingChange?(false)
            return
        }
        isRecording = false
        recordingTimer?.invalidate()
        recordingTimer = nil
        recordingDuration = 0
        onRecordingChange?(false)
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
