import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryViewerView canvas — la bande basse du composeur
//
// Sortie de `StoryViewerView+Canvas.swift` (hors budget) par RESPONSABILITÉ :
// tout ce qui POSE le composeur dans la carte — sa bande, son retrait bas, son
// panneau d'émojis — et, depuis #8431, son REPLI : le bouton ⌄ de rédaction,
// le glissé bas qu'il revendique au lecteur, le bouton de réouverture, et la
// MESURE de son bloc qui sert de sol au texte de la story.

/// Hauteur rendue du bloc du composeur. `nil` = aucun composeur monté.
struct StoryComposerBlockHeightKey: PreferenceKey {
    static var defaultValue: CGFloat? { nil }
    static func reduce(value: inout CGFloat?, nextValue: () -> CGFloat?) {
        value = nextValue() ?? value
    }
}

extension StoryCardView {

    var composerFoldPresentation: StoryComposerFold.Presentation { // internal for cross-file extension access
        StoryComposerFold.presentation(userFolded: isComposerFolded,
                                       isReplying: replyingToStoryComment != nil)
    }

    /// **Le sol du texte de la story** : le haut de la plaque du composeur
    /// (#8431). Sans composeur (story de l'auteur), la place historique.
    func captionBottomInset(geometry: GeometryProxy) -> CGFloat { // internal for cross-file extension access
        StoryCaptionPlacement.bottomInset(
            composerBlockHeight: composerBlockHeight,
            composerBottomPadding: composerBottomPadding(geometry),
            isComposerShown: chromeVisible,
            fallback: topInset + 130)
    }

    @ViewBuilder
    func composerLayer(geometry: GeometryProxy) -> some View { // internal for cross-file extension access
        VStack(spacing: 0) {
            Spacer()

            // **Toujours visible** quand l'utilisateur n'est pas l'auteur
            // de la story (un seul composer pour la story-reply ET la
            // comment-reply — spec user 2026-05-28). Quand l'overlay
            // commentaires est ouvert et qu'on tape « Répondre » sur un
            // commentaire, la reply banner apparaît au-dessus de CETTE
            // rangée de saisie via le binding `replyingToStoryComment`.
            //
            // **Auteur de sa propre story** : pas de composer permanent (on
            // ne répond pas à sa propre story), MAIS il doit pouvoir
            // répondre aux commentaires reçus. Le composer apparaît donc
            // dès que `replyingToStoryComment` est posé (tap « Répondre »
            // dans l'overlay), avec la reply banner, puis se referme à
            // l'envoi (`sendComment` remet le binding à nil) ou à la
            // fermeture de la banner (spec user 2026-06-25).
            if !isOwnStory || replyingToStoryComment != nil {
                composerBlock(geometry: geometry)
                    .background(
                        GeometryReader { proxy in
                            Color.clear.preference(key: StoryComposerBlockHeightKey.self,
                                                   value: proxy.size.height)
                        }
                    )
            }
        }
        // **CRITIQUE (hauteur)** : `maxHeight: .infinity, alignment: .bottom`
        // force la VStack à remplir la hauteur du canvas ZStack. Sans cela, le
        // `Spacer()` au top collapse à minLength: 0 et la VStack prend sa
        // hauteur intrinsèque (~150pt = composer + emoji panel). Le canvas
        // ZStack parent utilisant `alignment: .center`, une VStack courte se
        // faisait CENTRER verticalement dans le canvas 874pt → composer
        // apparaissait à y≈360pt au lieu de y≈760pt en bas (bug user
        // 2026-05-28 « le composeur est rogné au lieu d'être bien aligné »).
        //
        // **CRITIQUE (largeur)** : `maxWidth: geometry.size.width` (et NON
        // `.infinity`) borne la proposition de largeur du bloc au viewport réel.
        // Le canvas UIViewRepresentable gonfle la largeur intrinsèque du ZStack
        // parent au-delà de l'écran (~480pt vs 402pt sur iPhone 16 Pro) ; avec
        // `.infinity` le composer remplissait ces ~480pt et son bouton d'envoi
        // sortait à droite de l'écran (bug user 2026-06-03). Borné au viewport,
        // le bloc se cadre sur l'écran réel et reste centré — même principe que
        // le pin `.frame(width: geometry.size.width)` du header et du sidebar.
        .frame(maxWidth: geometry.size.width, maxHeight: .infinity, alignment: .bottom)
        .padding(.bottom, composerBottomPadding(geometry))
        .animation(.easeInOut(duration: 0.25), value: keyboard.height)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showTextEmojiPicker)
        // Glissement vers le BAS à la disparition + fondu. L'offset 240pt
        // couvre l'ensemble composer + picker emoji + safe area inférieure
        // pour les iPhones les plus grands ; le composant étant ancré
        // bottom via `Spacer()`, c'est suffisant pour le sortir totalement
        // du viewport. Hit-testing OFF en plus pour ne pas intercepter
        // les taps même invisible.
        .offset(y: chromeVisible ? 0 : 240)
        .opacity(chromeVisible ? 1 : 0)
        .allowsHitTesting(chromeVisible)
        .onPreferenceChange(StoryComposerBlockHeightKey.self) { height in
            composerBlockHeight = height
        }
        // « Répondre » depuis le rail demande le focus : un composeur replié
        // se rouvre pour le recevoir.
        .adaptiveOnChange(of: composerFocusTrigger) { _, requested in
            if requested { isComposerFolded = false }
        }
    }

    /// Le bloc entier : ⌄ en rédaction, la plaque, le panneau d'émojis — ou,
    /// replié, le seul bouton de réouverture.
    ///
    /// **Replié, la plaque reste MONTÉE**, à hauteur nulle et invisible : le
    /// texte en cours, les pièces jointes et la prise vocale vivent dans ses
    /// `@State`. La démonter jetterait le brouillon au premier glissé.
    @ViewBuilder
    private func composerBlock(geometry: GeometryProxy) -> some View {
        let isFolded = composerFoldPresentation == .folded
        VStack(spacing: 0) {
            if isFolded {
                composerUnfoldButton
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            }

            StoryComposerBarView(
                accentColor: currentGroup?.avatarColor ?? "6366F1",
                storyId: currentStory?.id,
                composerLanguage: $composerLanguage,
                commentEffects: $commentEffects,
                commentBlurEnabled: $commentBlurEnabled,
                isComposerEngaged: $isComposerEngaged,
                showTextEmojiPicker: $showTextEmojiPicker,
                hasComposerContent: $hasComposerContent,
                emojiToInject: $emojiToInject,
                composerFocusTrigger: $composerFocusTrigger,
                storyDrafts: $storyDrafts,
                replyingToStoryComment: $replyingToStoryComment,
                foldControl: composerFoldControl,
                sendComment: sendComment
            )
                // Marge latérale 16pt, alignée sur le `sideInset` (16) de
                // la carte reader (`readerCanvasFraming`) et le
                // `.padding(.trailing, 16)` du sidebar — même rythme 16pt
                // pour les trois colonnes de chrome.
                .padding(.horizontal, MeeshySpacing.lg)
                .simultaneousGesture(composerDragGesture)
                .frame(height: isFolded ? 0 : nil, alignment: .top)
                .opacity(isFolded ? 0 : 1)
                .allowsHitTesting(!isFolded)
                .accessibilityHidden(isFolded)

            // Inline emoji keyboard panel (replaces system keyboard)
            if showTextEmojiPicker && !isFolded {
                EmojiKeyboardPanel(
                    style: .dark,
                    onSelect: { emoji in
                        emojiToInject = emoji
                    }
                )
                .frame(height: max(keyboard.lastKnownHeight - geometry.safeAreaInsets.bottom, 260))
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.82), value: isFolded)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: isComposerEngaged)
    }

    /// **Le glissé né sur le composeur lui appartient** (#8431). Il revendique
    /// le vertical avant le réveil du lecteur (`composerOwnsDrag`, que le drag
    /// parent lit pour céder) — un glissé bas ne referme plus la story, il
    /// replie le composeur. La revendication est COLLANTE pour le geste : une
    /// fois prise, le lecteur ne la reprend pas en cours de route.
    private var composerDragGesture: some Gesture {
        DragGesture(minimumDistance: StoryComposerGesture.verticalClaimDistance, coordinateSpace: .local)
            .onChanged { value in
                guard !composerOwnsDrag else { return }
                composerOwnsDrag = StoryComposerGesture.owner(translation: value.translation) == .composer
            }
            .onEnded { value in
                // Le verdict se relit sur la translation, jamais sur le
                // drapeau : le `onEnded` du lecteur peut l'avoir déjà purgé
                // (`resetGestureTracking`), l'ordre des deux n'est pas garanti.
                composerOwnsDrag = false
                if StoryComposerGesture.folds(translation: value.translation) {
                    foldComposer()
                }
            }
    }

    private func foldComposer() {
        dismissComposer()
        HapticFeedback.light()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            isComposerFolded = true
        }
    }

    private func unfoldComposer() {
        HapticFeedback.light()
        withAnimation(.spring(response: 0.32, dampingFraction: 0.82)) {
            isComposerFolded = false
        }
    }

    /// **Le ⌄ vit DANS la plaque de verre** (#8642) : le lecteur ne le peint
    /// plus au-dessus d'elle, il le CONFIE à la barre, qui le pose au bout de sa
    /// rangée d'outils. La loi qui dit QUAND il existe reste celle de #8431.
    var composerFoldControl: ComposerFoldControl? {
        guard StoryComposerFold.offersFoldButton(presentation: composerFoldPresentation,
                                                 isComposerEngaged: isComposerEngaged) else { return nil }
        return ComposerFoldControl(
            symbol: StoryComposerFold.foldSymbol,
            label: String(localized: "story.composer.fold",
                          defaultValue: "Masquer la zone de commentaire", bundle: .main),
            action: foldComposer)
    }

    /// Replié, il ne reste que ce bouton, centré, à l'icône de commentaire.
    private var composerUnfoldButton: some View {
        Button(action: unfoldComposer) {
            Image(systemName: StoryComposerFold.unfoldSymbol)
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .accessibilityLabel(String(localized: "story.composer.unfold",
                                   defaultValue: "Afficher la zone de commentaire", bundle: .main))
    }
}
