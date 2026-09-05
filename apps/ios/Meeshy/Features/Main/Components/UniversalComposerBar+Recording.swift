import SwiftUI
import MeeshyUI
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
        let borderFocused: [Color] = [MeeshyColors.indigo400.opacity(0.5), MeeshyColors.indigo600.opacity(0.5)]

        return HStack(spacing: 0) {
            // Mic button inside field (left) — hidden when focused
            if resolvedShowVoice && !isFocused {
                Button {
                    onAnyInteraction?()
                    HapticFeedback.light()
                    startRecording()
                } label: {
                    Image(systemName: "mic.fill")
                        .font(.callout.weight(.medium))
                        .foregroundColor(mutedColor)
                        .frame(width: 36, height: 36)
                }
                .accessibilityLabel(String(localized: "composer.a11y.startRecording", defaultValue: "Enregistrer un message vocal", bundle: .main))
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
                    .font(.callout)
                    // **La touche RETOUR ENVOIE, et elle porte l'accent**
                    // (directive porteur 2026-09-05).
                    //
                    // `.submitLabel(.send)` remplace « retour » par « envoi » et
                    // fait peindre au système sa touche PROÉMINENTE — celle qui
                    // prend la couleur de teinte plutôt que le gris des autres.
                    // `.tint` la fixe à l'accent de la conversation, le MÊME que
                    // le bouton d'envoi rond douze points plus loin : deux
                    // chemins vers le même geste ne doivent pas avoir deux
                    // couleurs.
                    .submitLabel(.send)
                    .tint(Color(hex: accentColor))
                    // `.onSubmit` est posé POUR les versions qui l'honorent sur
                    // un champ à axe vertical ; il ne suffit pas, et la règle
                    // ci-dessous dit pourquoi. Les deux chemins mènent au même
                    // `handleSend`, qui est idempotent sur un texte vide.
                    .onSubmit { handleSend() }
                    .accessibilityLabel(String(localized: "a11y.composer.textField", defaultValue: "Champ de message", bundle: .main))
                    .accessibilityValue(text.isEmpty ? resolvedPlaceholder : text)
                    .accessibilityIdentifier(MeeshyA11yID.composerTextField)
                    .adaptiveOnChange(of: text) { oldValue, newValue in
                        // **Le saut de ligne qu'un doigt vient d'insérer** — sur
                        // un `TextField(axis: .vertical)`, la touche Retour
                        // INSÈRE au lieu de soumettre, et ce comportement varie
                        // avec la version d'iOS sur la plage servie (16 → 26).
                        // La règle regarde ce que le champ observe toujours :
                        // son propre texte. Elle refuse un collage
                        // multi-lignes, dont l'envoi serait irréversible.
                        if ComposerReturnKey.submits(previous: oldValue, current: newValue) {
                            text = ComposerReturnKey.stripped(newValue)
                            handleSend()
                            return
                        }
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
                .shadow(color: focusBounce ? MeeshyColors.indigo400.opacity(0.2) : Color.clear, radius: 8, x: 0, y: 0)
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
        let canSend = effectiveDuration >= Self.minimumSendableDuration
        let dotOpacity: Double = reduceMotion
            ? 1
            : (effectiveDuration.truncatingRemainder(dividingBy: 1) < 0.5 ? 1 : 0.3)

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
                        .fill(MeeshyColors.errorStrong.opacity(0.14))
                        .frame(width: 32, height: 32)
                    Image(systemName: "xmark")
                        .font(.caption.weight(.bold))
                        .foregroundColor(MeeshyColors.errorStrong)
                }
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(String(localized: "composer.recording.cancel", defaultValue: "Annuler l'enregistrement", bundle: .main))
            .accessibilityHint(String(localized: "composer.recording.cancel.hint", defaultValue: "Supprime le message vocal en cours", bundle: .main))

            // Live waveform — fills available horizontal space.
            // Marked accessibilityHidden: purely decorative, timer conveys state.
            waveformStrip(color: waveformColor)
                .frame(maxWidth: .infinity)
                .frame(height: 28)
                .accessibilityHidden(true)

            // Recording indicator + timer — grouped for VoiceOver.
            HStack(spacing: 5) {
                Circle()
                    .fill(MeeshyColors.error)
                    .frame(width: 6, height: 6)
                    .opacity(dotOpacity)
                    .animation(
                        reduceMotion
                            ? nil
                            : .easeInOut(duration: 0.5).repeatForever(autoreverses: true),
                        value: effectiveIsRecording
                    )

                Text(formatDuration(effectiveDuration))
                    .font(.system(.footnote, design: .monospaced).weight(.semibold))
                    .foregroundColor(timerColor)
                    .contentTransition(.numericText())
                    .animation(.spring(response: 0.3), value: effectiveDuration)
            }
            .frame(width: 54, alignment: .trailing)
            .accessibilityElement(children: .combine)
            .accessibilityLabel(String(localized: "composer.recording.inProgress", defaultValue: "Enregistrement en cours", bundle: .main))
            .accessibilityValue(LocalizedNumber.spokenDuration(seconds: effectiveDuration))
            .accessibilityAddTraits(.updatesFrequently)

            // Stop → attachments button — stops recording and drops the audio
            // into the composer's attachment tray, editable before sending.
            // Disabled below the minimum duration like the send button.
            Button {
                guard canSend else {
                    HapticFeedback.error()
                    return
                }
                HapticFeedback.medium()
                stopRecordingToAttachment()
            } label: {
                ZStack {
                    Circle()
                        .fill(isDark
                            ? Color.white.opacity(0.14)
                            : Color(hex: accentColor).opacity(0.12))
                        .frame(width: 32, height: 32)
                    Image(systemName: "stop.fill")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(isDark ? .white : Color(hex: accentColor))
                }
                .opacity(canSend ? 1 : 0.4)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .animation(.easeInOut(duration: 0.2), value: canSend)
            .accessibilityLabel(String(localized: "composer.recording.stopAndAttach", defaultValue: "Arrêter et ajouter aux pièces jointes", bundle: .main))
            .accessibilityHint(String(localized: "composer.recording.stopAndAttach.hint", defaultValue: "Place le message vocal dans les pièces jointes pour l'éditer avant l'envoi", bundle: .main))

            // Send button — stops recording and sends the message immediately
            // (raw, no preview). Disabled below the minimum duration to prevent
            // accidental unusably-short voice messages.
            Button {
                guard canSend else {
                    HapticFeedback.error()
                    return
                }
                HapticFeedback.medium()
                sendRecording()
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
                        .shadow(
                            color: Color(hex: accentColor).opacity(canSend ? 0.4 : 0),
                            radius: 6, y: 2
                        )
                    Image(systemName: "arrow.up")
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(.white)
                }
                .opacity(canSend ? 1 : 0.4)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
            }
            .animation(.easeInOut(duration: 0.2), value: canSend)
            .accessibilityLabel(String(localized: "composer.recording.send", defaultValue: "Envoyer le message vocal", bundle: .main))
            .accessibilityHint(canSend
                ? "Termine et envoie l'enregistrement"
                : "Maintenez encore pour atteindre la duree minimum")
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
        let barAnimation: Animation? = reduceMotion
            ? nil
            : .spring(response: 0.08, dampingFraction: 0.6)

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
                            .animation(barAnimation, value: level)
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

    /// **Démarrer — la prise appartient au parent.**
    ///
    /// Il n'y a plus de « chemin interne ». Celui qui vivait ici n'enregistrait
    /// rien : un `Timer` qui incrémentait un compteur, puis une pièce jointe
    /// `voice` et une URL fabriquée depuis l'horloge. Voir le doc-comment des
    /// quatre relais sur `UniversalComposerBar` (#4560).
    func startRecording() {
        onAnyInteraction?()
        onStartRecording()
        HapticFeedback.medium()
    }

    /// Arrêter et poser l'audio dans le tiroir — le contrôle `[stop]`. Ce qui
    /// est posé est ce que le PARENT a enregistré ; la barre ne fabrique aucune
    /// pièce jointe.
    func stopRecordingToAttachment() {
        onAnyInteraction?()
        onStopRecordingToAttachment()
        HapticFeedback.light()
    }

    /// Arrêter et envoyer tout de suite — le contrôle `[↑]`. Ni aperçu, ni
    /// éditeur.
    func sendRecording() {
        onAnyInteraction?()
        onSendRecording()
        HapticFeedback.medium()
    }

    /// Annuler — l'audio est jeté, aucune pièce jointe n'est créée.
    func cancelRecording() {
        onAnyInteraction?()
        onCancelRecording()
    }

    /// **Arrêt FORCÉ, au changement de story.**
    ///
    /// Elle ne consultait aucun relais et faisait le travail interne
    /// elle-même — donc, sous délégation, elle jetait la prise du parent en
    /// silence tout en croyant « toujours sauver le vocal ». Elle pose
    /// désormais l'audio comme le contrôle `[stop]`, ce que son nom promet.
    func forceStopRecording() {
        guard effectiveIsRecording else { return }
        onStopRecordingToAttachment()
    }


    // MARK: - Déplier puis démarrer

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
        LocalizedNumber.duration(seconds: seconds)
    }
}
