import SwiftUI
import MeeshySDK

/// Panneau de l'outil actif de l'éditeur audio (rognage, coupe, fondu,
/// vitesse, volume, transcription). Lit et écrit le contrôleur ; l'aperçu
/// de vitesse est relayé au propriétaire du lecteur par `onSpeedChange`.
struct AudioEditorToolPanel: View {

    let tool: AudioEditorTool
    @ObservedObject var controller: AudioEditorController
    @ObservedObject private var theme = ThemeManager.shared
    let accent: Color
    let isDark: Bool
    let onSpeedChange: () -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.md) {
            switch tool {
            case .trim:
                selectionHint(
                    text: String(localized: "audio.editor.trim.hint",
                                 defaultValue: "Glissez les poign\u{00E9}es pour garder une portion.",
                                 bundle: .module),
                    resetTitle: String(localized: "audio.editor.reset",
                                       defaultValue: "R\u{00E9}initialiser", bundle: .module),
                    reset: {
                        controller.trimStart = 0
                        controller.trimEnd = controller.activeDuration
                    }
                )
            case .split:
                selectionHint(
                    text: String(localized: "audio.editor.split.hint",
                                 defaultValue: "S\u{00E9}lectionnez la section \u{00E0} supprimer.",
                                 bundle: .module),
                    resetTitle: String(localized: "audio.editor.reset",
                                       defaultValue: "R\u{00E9}initialiser", bundle: .module),
                    reset: {
                        let d = controller.activeDuration
                        controller.splitStart = d * 0.4
                        controller.splitEnd = d * 0.6
                    }
                )
            case .fade:
                fadePanel
            case .speed:
                speedPanel
            case .volume:
                volumePanel
            case .transcribe:
                transcribePanel
            }
        }
        .padding(MeeshySpacing.mdPlus)
        .background(panelBackground)
    }

    private var panelBackground: some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous)
            .fill(isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.035))
            .overlay(
                RoundedRectangle(cornerRadius: MeeshyRadius.lgPlus, style: .continuous)
                    .strokeBorder(isDark ? Color.white.opacity(0.08)
                                  : Color.black.opacity(0.06), lineWidth: 1)
            )
    }

    private func selectionHint(text: String, resetTitle: String,
                               reset: @escaping () -> Void) -> some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            Button {
                HapticFeedback.light()
                reset()
            } label: {
                Text(resetTitle)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .foregroundColor(accent)
            }
            .buttonStyle(.plain)
        }
    }

    private var fadePanel: some View {
        VStack(spacing: MeeshySpacing.smPlus) {
            Toggle(isOn: $controller.fadeIn) {
                Label(String(localized: "audio.editor.fade.in",
                             defaultValue: "Fondu d'entr\u{00E9}e", bundle: .module),
                      systemImage: "arrow.up.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }
            .tint(accent)
            Toggle(isOn: $controller.fadeOut) {
                Label(String(localized: "audio.editor.fade.out",
                             defaultValue: "Fondu de sortie", bundle: .module),
                      systemImage: "arrow.down.right")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(theme.textPrimary)
            }
            .tint(accent)
        }
    }

    private var speedPanel: some View {
        let speeds: [Double] = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
        return HStack(spacing: MeeshySpacing.sm) {
            ForEach(speeds, id: \.self) { value in
                let isActive = abs(controller.speed - value) < 0.001
                Button {
                    HapticFeedback.light()
                    controller.speed = value
                    onSpeedChange()
                } label: {
                    Text(speedLabel(value))
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .monospaced))
                        .foregroundColor(isActive ? .white : theme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, MeeshySpacing.sm)
                        .background(
                            RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                                .fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                                      : AnyShapeStyle(isDark ? Color.white.opacity(0.06)
                                                      : Color.black.opacity(0.04)))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var volumePanel: some View {
        VStack(spacing: MeeshySpacing.sm) {
            HStack {
                Image(systemName: "speaker.fill")
                    .font(.system(size: MeeshyIconSize.xs))
                    .foregroundColor(theme.textMuted)
                Slider(value: $controller.gain, in: 0...2, step: 0.05)
                    .tint(accent)
                Image(systemName: "speaker.wave.3.fill")
                    .font(.system(size: MeeshyIconSize.xs))
                    .foregroundColor(theme.textMuted)
            }
            Text(volumeLabel(controller.gain))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold, design: .monospaced))
                .foregroundColor(accent)
        }
    }

    // MARK: - Transcribe Panel

    private var transcribePanel: some View {
        VStack(spacing: MeeshySpacing.md) {
            transcribeLanguageStrip
            transcribeAction
            transcribeResult
        }
    }

    private var transcribeLanguageStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(transcribableLanguages, id: \.code) { language in
                    let isActive = controller.transcriptionLanguage == language.code
                    Button {
                        HapticFeedback.light()
                        controller.transcriptionLanguage = language.code
                    } label: {
                        HStack(spacing: MeeshySpacing.xs) {
                            Text(language.flag)
                            Text(language.nativeName)
                                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                                .lineLimit(1)
                        }
                        .foregroundColor(isActive ? .white : theme.textSecondary)
                        .padding(.horizontal, MeeshySpacing.smPlus)
                        .padding(.vertical, MeeshySpacing.xsPlus)
                        .background(
                            Capsule().fill(isActive ? AnyShapeStyle(MeeshyColors.brandGradient)
                                           : AnyShapeStyle(isDark ? Color.white.opacity(0.06)
                                                           : Color.black.opacity(0.04)))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, MeeshySpacing.xxs)
        }
    }

    @ViewBuilder
    private var transcribeAction: some View {
        if controller.transcription == .running {
            HStack(spacing: MeeshySpacing.sm) {
                ProgressView().tint(accent)
                Text(String(localized: "audio.editor.transcription.running",
                            defaultValue: "Transcription en cours\u{2026}", bundle: .module))
                    .font(.system(size: 12))
                    .foregroundColor(theme.textMuted)
            }
        } else {
            Button {
                HapticFeedback.medium()
                controller.transcribe()
            } label: {
                HStack(spacing: MeeshySpacing.xsPlus) {
                    Image(systemName: "waveform")
                    Text(transcribeButtonTitle)
                }
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(accent)
                .frame(maxWidth: .infinity)
                .padding(.vertical, MeeshySpacing.smPlus)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.smPlus)
                        .strokeBorder(accent.opacity(0.35), lineWidth: 1)
                )
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var transcribeResult: some View {
        switch controller.transcription {
        case .done(let text, _):
            ScrollView {
                Text(text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize))
                    .foregroundColor(theme.textPrimary.opacity(0.85))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 110)
        case .failed(let reason):
            transcribeMessage(icon: "exclamationmark.triangle.fill",
                              text: reason, tint: MeeshyColors.warning)
        case .permissionDenied:
            transcribeMessage(
                icon: "lock.fill",
                text: String(localized: "audio.editor.transcription.denied",
                             defaultValue: "Acc\u{00E8}s \u{00E0} la reconnaissance vocale refus\u{00E9}. Activez-le dans R\u{00E9}glages.",
                             bundle: .module),
                tint: MeeshyColors.error
            )
        case .idle, .running:
            EmptyView()
        }
    }

    private func transcribeMessage(icon: String, text: String, tint: Color) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: icon)
                .font(.system(size: MeeshyIconSize.xs))
                .foregroundColor(tint)
            Text(text)
                .font(MeeshyFont.relative(MeeshyFont.smallSize))
                .foregroundColor(theme.textSecondary)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
        }
    }

    // MARK: - Derived

    private var transcribableLanguages: [LanguageInfo] {
        let supported = controller.transcribableLanguageCodes
        let catalog = controller.languageCatalog.filter { supported.contains($0.code) }
        return catalog.isEmpty ? controller.languageCatalog : catalog
    }

    private var transcribeButtonTitle: String {
        switch controller.transcription {
        case .done, .failed, .permissionDenied:
            return String(localized: "audio.editor.transcription.retry",
                          defaultValue: "Transcrire \u{00E0} nouveau", bundle: .module)
        default:
            return String(localized: "audio.editor.transcription.start",
                          defaultValue: "Transcrire", bundle: .module)
        }
    }

    private func speedLabel(_ value: Double) -> String {
        value == 1.0 ? "1\u{00D7}" : String(format: "%g\u{00D7}", value)
    }

    private func volumeLabel(_ value: Double) -> String {
        value == 1.0
            ? String(localized: "audio.editor.volume.normal",
                     defaultValue: "Normal", bundle: .module)
            : String(format: "%.0f%%", value * 100)
    }
}
