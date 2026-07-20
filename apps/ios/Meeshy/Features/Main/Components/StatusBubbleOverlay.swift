import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct StatusBubbleOverlay: View {
    let status: StatusEntry
    let anchorPoint: CGPoint
    @Binding var isPresented: Bool
    var onRepublish: ((StatusEntry) -> Void)? = nil
    /// Touché du CONTENU du mood (pas la zone extérieure) → amorce la réponse.
    var onReplyTapped: (() -> Void)? = nil

    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @StateObject private var audioPlayer = AudioPlaybackManager()
    @State private var appearAnimation = false

    private var screenHeight: CGFloat { UIScreen.main.bounds.height }
    private var screenWidth: CGFloat { UIScreen.main.bounds.width }
    private var showAbove: Bool { anchorPoint.y > screenHeight * 0.45 }

    var body: some View {
        GeometryReader { parentGeo in
            let parentOrigin = parentGeo.frame(in: .global).origin
            let anchor = CGPoint(
                x: anchorPoint.x - parentOrigin.x,
                y: anchorPoint.y - parentOrigin.y
            )
            let bounds = parentGeo.size
            let bubbleW: CGFloat = min(screenWidth - 48, 250)
            // Décalé à droite de l'avatar : bord gauche de la bulle à anchor.x + 12
            let bubbleX = min(anchor.x + 12 + bubbleW / 2, bounds.width - bubbleW / 2 - 16)
            let dir: CGFloat = showAbove ? -1 : 1
            let dx = bubbleX - anchor.x

            ZStack {
                // Tap-to-dismiss — transparent, laisse passer les scrolls
                Color.clear
                    .contentShape(Rectangle())
                    .ignoresSafeArea()
                    .onTapGesture { dismiss() }
                    .simultaneousGesture(
                        DragGesture(minimumDistance: 3)
                            .onChanged { _ in dismiss() }
                    )
                    .allowsHitTesting(appearAnimation)

                thoughtCircle(size: 4)
                    .position(x: anchor.x + dx * 0.08, y: anchor.y + dir * 7)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7), value: appearAnimation)

                thoughtCircle(size: 7)
                    .position(x: anchor.x + dx * 0.22, y: anchor.y + dir * 15)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7).delay(0.03), value: appearAnimation)

                thoughtCircle(size: 10)
                    .position(x: anchor.x + dx * 0.42, y: anchor.y + dir * 24)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.22, dampingFraction: 0.7).delay(0.06), value: appearAnimation)

                bubbleContent
                    .frame(width: bubbleW)
                    .fixedSize(horizontal: false, vertical: true)
                    .contentShape(Rectangle())
                    .onTapGesture { replyTapped() }
                    // Un seul élément VoiceOver pour la bulle : le tap-pour-répondre est un
                    // `.onTapGesture` (invisible à VoiceOver) et le contenu imbrique des boutons
                    // (lecture audio, republier) qui seraient soit avalés par un `.combine`, soit
                    // inatteignables. `children: .ignore` + action par défaut = répondre, actions
                    // nommées (rotor) = lire l'audio / republier. Idiome 183i (CommunityLinksView).
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(bubbleAccessibilityLabel)
                    .accessibilityValue(bubbleAccessibilityValue)
                    .accessibilityHint(onReplyTapped != nil
                        ? String(localized: "status.bubble.reply_hint", defaultValue: "Toucher pour répondre à cette humeur", bundle: .main)
                        : "")
                    .accessibilityAddTraits(onReplyTapped != nil ? .isButton : [])
                    .accessibilityAction { replyTapped() }
                    .accessibilityActions { bubbleAccessibilityActions }
                    .position(x: bubbleX, y: anchor.y + dir * 52)
                    .scaleEffect(appearAnimation ? 1 : 0.2, anchor: showAbove ? .bottomLeading : .topLeading)
                    .opacity(appearAnimation ? 1 : 0)
                    .animation(.spring(response: 0.28, dampingFraction: 0.72).delay(0.05), value: appearAnimation)
            }
            // Geste d'échappement VoiceOver (scrub à deux doigts) : la bulle est un overlay ZStack,
            // pas une sheet système — sans ceci, un utilisateur VoiceOver n'a aucun moyen standard
            // de la fermer (le tap-to-dismiss extérieur est un `Color.clear` non focalisable).
            .accessibilityAction(.escape) { dismiss() }
        }
        .onAppear {
            appearAnimation = true
        }
        .onDisappear {
            // Stop-à-la-sortie déterministe : si la bulle est retirée sans passer par
            // dismiss()/replyTapped() (ex: currentEntry vidé ailleurs), l'audio d'humeur
            // ne doit pas fuir sur l'écran suivant (sinon dépend de la dealloc ARC).
            audioPlayer.stop()
        }
    }

    // MARK: - Thought Circle

    private func thoughtCircle(size: CGFloat) -> some View {
        Circle()
            .fill(.ultraThinMaterial)
            .frame(width: size, height: size)
            .overlay(
                Circle().stroke(Color(hex: status.avatarColor).opacity(0.3), lineWidth: 0.5)
            )
            .shadow(color: Color.black.opacity(0.06), radius: 2, y: 1)
    }

    // MARK: - Bubble Content

    private var bubbleContent: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let audioUrl = status.audioUrl, !audioUrl.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    audioPlayerRow(urlString: audioUrl)
                    Text(status.timeAgo)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    if let content = status.content, !content.isEmpty {
                        Text(content)
                            .font(MeeshyFont.relative(13))
                            .foregroundColor(theme.textPrimary)
                            .lineLimit(3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 4)
                    Text(status.timeAgo)
                        .font(MeeshyFont.relative(10, weight: .medium))
                        .foregroundColor(theme.textMuted)
                }
            }

            // "via @username" for republished statuses
            if let via = status.viaUsername {
                Text(String(localized: "status.bubble.via", defaultValue: "via @\(via)", bundle: .main))
                    .font(MeeshyFont.relative(11))
                    .foregroundColor(theme.textMuted)
            }

            // Republish button (only for other users' statuses)
            if onRepublish != nil {
                Divider().opacity(0.3)
                Button {
                    dismiss()
                    onRepublish?(status)
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.2.squarepath")
                            .font(MeeshyFont.relative(11))
                        Text(String(localized: "status.bubble.republish", defaultValue: "Republier", bundle: .main))
                            .font(MeeshyFont.relative(12, weight: .medium))
                    }
                    .foregroundColor(MeeshyColors.indigo400)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        // iOS 26 Liquid Glass — floating mood bubble. The SDK Compatibility wrapper
        // owns the gating + the .ultraThinMaterial fallback. The avatar-tinted
        // gradient hairline + elevation shadow stay as overlays ON the glass
        // (same idiom as FloatingCallPillView: adaptiveGlass + stroke overlay + shadow).
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(
                    LinearGradient(
                        colors: [Color(hex: status.avatarColor).opacity(0.3), Color.white.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 0.5
                )
        )
        .shadow(color: Color.black.opacity(0.1), radius: 10, y: 4)
    }

    // MARK: - Audio Player

    private func audioPlayerRow(urlString: String) -> some View {
        HStack(spacing: 6) {
            Button {
                audioPlayer.togglePlayPause()
            } label: {
                // Glyphe dans un cercle de dimension fixe 18×18 : figé (déborderait s'il scalait, doctrine 86i) ; le bouton porte le libellé
                Image(systemName: audioPlayer.isPlaying ? "stop.fill" : "play.fill")
                    .font(.system(size: 8, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 18, height: 18)
                    .background(Circle().fill(Color(hex: status.avatarColor)))
            }
            // VoiceOver : cette rangée est agrégée par le conteneur `bubbleContent`
            // (`children: .ignore`) ; l'étiquette lecture/arrêt vit dans l'action nommée
            // du conteneur (`bubbleAccessibilityActions`). Pas de label ici (inerte).

            ProgressView(value: audioPlayer.progress)
                .progressViewStyle(.linear)
                .tint(Color(hex: status.avatarColor))
                .frame(maxWidth: .infinity)
                .scaleEffect(y: 0.6, anchor: .center)
        }
        .onAppear {
            audioPlayer.play(urlString: urlString)
        }
    }

    // MARK: - Accessibility

    private var hasAudio: Bool {
        guard let audioUrl = status.audioUrl else { return false }
        return !audioUrl.isEmpty
    }

    /// Libellé combiné de la bulle : contenu (texte ou « Humeur audio ») + ancienneté
    /// + « via @… » éventuel. Un seul élément VoiceOver (`children: .ignore`).
    private var bubbleAccessibilityLabel: String {
        var parts: [String] = []
        if hasAudio {
            parts.append(String(localized: "status.bubble.audio.a11yLabel", defaultValue: "Humeur audio", bundle: .main))
        } else if let content = status.content, !content.isEmpty {
            parts.append(content)
        }
        parts.append(status.timeAgo)
        if let via = status.viaUsername {
            parts.append(String(localized: "status.bubble.via", defaultValue: "via @\(via)", bundle: .main))
        }
        return parts.joined(separator: ", ")
    }

    /// Progression de lecture audio, formatée en pourcentage locale-aware (0 clé i18n).
    /// Vide pour une humeur texte (pas de valeur d'état à annoncer).
    private var bubbleAccessibilityValue: String {
        guard hasAudio else { return "" }
        return audioPlayer.progress.formatted(.percent.precision(.fractionLength(0)))
    }

    /// Actions secondaires exposées via le rotor VoiceOver (l'action par défaut = répondre).
    @ViewBuilder private var bubbleAccessibilityActions: some View {
        if hasAudio {
            Button(audioPlayer.isPlaying
                ? String(localized: "status.bubble.audio.stop", defaultValue: "Arrêter l'écoute", bundle: .main)
                : String(localized: "status.bubble.audio.play", defaultValue: "Écouter l'humeur", bundle: .main)
            ) {
                audioPlayer.togglePlayPause()
            }
        }
        if onRepublish != nil {
            Button(String(localized: "status.bubble.republish", defaultValue: "Republier", bundle: .main)) {
                dismiss()
                onRepublish?(status)
            }
        }
    }

    // MARK: - Reply

    private func replyTapped() {
        guard let onReplyTapped else { return }
        HapticFeedback.light()
        audioPlayer.stop()
        onReplyTapped()
    }

    // MARK: - Dismiss

    private func dismiss() {
        audioPlayer.stop()
        appearAnimation = false
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isPresented = false
        }
    }
}
