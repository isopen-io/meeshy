import SwiftUI
import MeeshySDK

/// Captions / transcription controller.
///
/// The spoken-language picker is sourced exclusively from
/// `LanguageData.allLanguages` — the app's single canonical language list —
/// so the editor never maintains a parallel list.
struct VideoEditorCaptionsPanel: View {
    @ObservedObject var viewModel: VideoEditorViewModel
    @Environment(\.theme) private var theme

    @State private var languageCode: String = "fr"

    private var accent: Color { Color(hex: viewModel.accentColor) }

    private var language: LanguageInfo? {
        LanguageData.info(for: languageCode)
    }

    var body: some View {
        VStack(spacing: 10) {
            languageRow
            stateView
        }
        .padding(.bottom, 4)
        .onAppear {
            if let saved = viewModel.document.captionLanguageCode {
                languageCode = saved
            }
        }
    }

    // MARK: Language picker

    private var languageRow: some View {
        HStack {
            Text("Langue parlée")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(theme.textSecondary)
            Spacer()
            Menu {
                ForEach(LanguageData.allLanguages, id: \.code) { info in
                    Button {
                        languageCode = info.code
                        HapticFeedback.light()
                    } label: {
                        Text(verbatim: "\(info.flag)  \(info.nativeName)")
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(language?.flag ?? "🌐")
                    Text(language?.nativeName ?? languageCode.uppercased())
                        .font(.system(size: 12, weight: .semibold))
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(theme.textPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(Capsule().fill(accent.opacity(0.14)))
            }
        }
    }

    // MARK: State

    @ViewBuilder
    private var stateView: some View {
        switch viewModel.transcription {
        case .idle:
            transcribeButton(title: "Transcrire l'audio", icon: "waveform")
        case .running:
            runningView
        case .done:
            doneView
        case .failed(let message):
            failedView(message)
        }
    }

    private var runningView: some View {
        HStack(spacing: 10) {
            ProgressView()
                .tint(accent)
            Text("Analyse de l'audio…")
                .font(.system(size: 12))
                .foregroundStyle(theme.textSecondary)
            Spacer()
            Button {
                viewModel.cancelTranscription()
            } label: {
                Text("Annuler")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(theme.error)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }

    private var doneView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("\(viewModel.document.captions.count) sous-titres", systemImage: "captions.bubble.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(accent)
                Spacer()
                Button {
                    viewModel.clearCaptions()
                } label: {
                    Text("Effacer")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(theme.error)
                }
                .buttonStyle(.plain)
            }
            ScrollView(.vertical, showsIndicators: false) {
                Text(viewModel.document.transcriptionText ?? "")
                    .font(.system(size: 13))
                    .foregroundStyle(theme.textPrimary.opacity(0.9))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 96)
            transcribeButton(title: "Transcrire à nouveau", icon: "arrow.clockwise")
        }
    }

    private func failedView(_ message: String) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(theme.warning)
                Text(message)
                    .font(.system(size: 11))
                    .foregroundStyle(theme.textSecondary)
                    .lineLimit(2)
            }
            transcribeButton(title: "Réessayer", icon: "arrow.clockwise")
        }
    }

    private func transcribeButton(title: String, icon: String) -> some View {
        Button {
            viewModel.transcribe(languageCode: languageCode)
        } label: {
            HStack(spacing: 6) {
                Image(systemName: icon)
                Text(title)
            }
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 11)
            .background(
                RoundedRectangle(cornerRadius: 11, style: .continuous)
                    .fill(MeeshyColors.brandGradient)
            )
        }
        .buttonStyle(.plain)
    }
}
