import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Envoi & détection de langue
// ============================================================================
//
// Découpage mécanique du fichier (#4104, budget 800–1100 lignes/fichier) —
// porte l'acte d'envoi et ce qui l'entoure : bouton d'action (micro/envoi),
// transition tourbillon, emojis rapides, bouton d'envoi, logique d'envoi,
// détection de langue en temps réel, et l'expansion/mise au focus du
// champ. Aucun changement de comportement, seulement un déplacement de
// lignes.

extension UniversalComposerBar {

    // ========================================================================
    // MARK: - Action Button: Mic / Send
    // ========================================================================

    /// Always MOUNTS the same 44×44 slot — it never collapses, so nothing
    /// reflows the moment content lands (bug 2026-05-28: « on ne voit pas le
    /// bouton envoyer », caused by the slot disappearing entirely when
    /// empty). Directive porteur 2026-08-26 (#3920) wants the button itself
    /// gone from view until there is something to send — so idle state fades
    /// the button to fully INVISIBLE (opacity 0), not merely dimmed.
    ///
    /// #3927 — tant qu'il n'y a rien à envoyer (et hors édition), le slot
    /// affiche plutôt deux emojis rapides (`quickEmojiButtons`) au lieu du
    /// bouton invisible : l'espace réservé sert désormais à quelque chose.
    /// La bascule entre les deux contenus, et l'apparition/disparition du
    /// bouton d'envoi lui-même, passent par `tourbillonTransition` — un
    /// grossissement/rotation à l'arrivée, l'inverse au départ.
    /// **Le slot s'ÉLARGIT pour deux cibles, il ne les comprime pas**
    /// (demande porteur 2026-08-31).
    ///
    /// Il avait été taillé pour UN bouton — 44 pt — et la bascule de #3927 y a
    /// serré deux pastilles et leur gouttière : mesuré au simulateur, chacune
    /// rendait 30×30, sous le minimum tactile de 44 pt (dimension 5). La cause
    /// n'était pas la taille des pastilles mais celle du SLOT, restée celle
    /// d'avant leur arrivée.
    ///
    /// Ce que le champ de texte cède, il ne le cède QUE tant qu'il est vide :
    /// `showsQuickEmoji` retombe à la première frappe, le slot revient à 44 et
    /// le champ reprend sa largeur. La réduction porte donc exactement sur
    /// l'état où le champ n'a rien à montrer.
    static let sendSlotWidth: CGFloat = 44
    /// Deux cibles de 44 et la gouttière de 8 qui les sépare.
    static let quickEmojiSlotWidth: CGFloat = 96

    /// **Le cadre à mots servi à la pastille** — `nil` quand l'hôte ne câble
    /// pas l'envoi de sticker ou quand le catalogue ne rend rien. C'est ce
    /// `nil` qui fait retomber `ComposerActionSlot` sur le bouton d'envoi :
    /// une pastille sans destination ne se monte pas (loi 4).
    var textStickerTemplate: StickerTemplate? {
        guard onSendTextSticker != nil else { return nil }
        // Le magasin est LU, jamais observé : la barre se re-rend déjà à chaque
        // frappe, et un `@ObservedObject` sur un singleton global depuis une
        // feuille rouvrirait exactement les re-rendus que le § « Zero
        // Unnecessary Re-render » ferme.
        return ComposerTextStickerChoice.resolve(
            recents: StickerUsageStore.shared.recents,
            favorites: StickerUsageStore.shared.favorites,
            catalog: StickerTemplateCatalog.templates(family: .text)
        )
    }

    /// Ce que l'emplacement de 44 points MONTRE — la règle est dans
    /// `ComposerActionSlot`, éprouvée état par état ; ici on ne fait que la
    /// rendre.
    var actionSlot: ComposerActionSlot {
        ComposerActionSlot.resolve(
            hasText: hasText,
            hasOtherContent: effectiveIsRecording || !allAttachments.isEmpty || externalHasContent,
            isEditMode: isEditMode,
            isSending: externalIsSending,
            keyboardIsUp: isFocused,
            offersQuickEmoji: showEmoji,
            offersTextSticker: textStickerTemplate != nil
        )
    }

    @ViewBuilder
    var actionButton: some View {
        let isReady = (effectiveIsRecording || hasContent) && !externalIsSending
        let slot = actionSlot
        // `slot == .quickEmoji` implique déjà « rien à envoyer » — donc
        // `isReady == false`. Le redoubler ici ferait croire à deux conditions
        // là où il n'y en a qu'une, et la seconde ne pourrait jamais tomber.
        let showsQuickEmoji = slot == .quickEmoji

        ZStack {
            if showsQuickEmoji {
                quickEmojiButtons
                    .transition(tourbillonTransition)
            } else if slot == .textSticker, let gabarit = textStickerTemplate {
                ComposerTextStickerButton(
                    template: gabarit,
                    text: text.trimmingCharacters(in: .whitespacesAndNewlines),
                    accentColor: accentColor,
                    isDark: style == .dark,
                    onSend: { sendTextSticker(gabarit) },
                    onBrowse: { showTextStickerSheet = true }
                )
                .transition(tourbillonTransition)
            } else {
                sendButton
                    .opacity(isReady ? 1.0 : 0)
                    .allowsHitTesting(isReady)
                    .transition(tourbillonTransition)
            }
        }
        .frame(width: showsQuickEmoji ? Self.quickEmojiSlotWidth : Self.sendSlotWidth, height: 44)
        .animation(.spring(response: 0.35, dampingFraction: 0.62), value: showsQuickEmoji)
        .animation(.spring(response: 0.3, dampingFraction: 0.6), value: hasContent)
        .animation(.spring(response: 0.25, dampingFraction: 0.5), value: sendBounce)
    }

    // ========================================================================
    // MARK: - Envoi d'un cadre à mots (#5326)
    // ========================================================================

    /// **Le texte part DESSINÉ dans le cadre, et le champ se vide.**
    ///
    /// L'usage est noté ici, au moment de l'envoi, dans le MÊME magasin que la
    /// palette (`StickerUsageStore.noteUse`) : c'est ce qui rend la pastille
    /// dynamique au tour suivant (`ComposerTextStickerChoice`). L'écrire
    /// ailleurs aurait fait diverger le cadre que la pastille montre de celui
    /// que l'auteur vient d'envoyer.
    ///
    /// Le champ se vide SANS attendre l'hôte : contrairement à `handleSend`,
    /// rien ici ne peut être refusé plus loin — le texte est déjà rendu dans
    /// une image, et la même trimmed-string part au même instant. Le
    /// `textBinding` est poussé d'abord pour que l'hôte ne relise pas un
    /// brouillon que la barre vient d'effacer.
    func sendTextSticker(_ template: StickerTemplate) {
        let mots = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !mots.isEmpty, let envoi = onSendTextSticker else { return }
        onAnyInteraction?()
        StickerUsageStore.shared.noteUse(.template(template))
        envoi(template, mots)
        text = ""
        textBinding?.wrappedValue = ""
        textAnalyzer.reset()
        if let id = storyId {
            onSaveDraft?(id, "", [])
        }
        HapticFeedback.light()
    }

    // ========================================================================
    // MARK: - Tourbillon Transition
    // ========================================================================

    /// #3927 — apparition/disparition en tourbillon : grossit en tournant à
    /// l'arrivée, rétrécit en tournant en SENS INVERSE au départ. Remplace le
    /// simple fondu pour le contenu de `actionButton` (bouton d'envoi ET
    /// emojis rapides, quel que soit celui qui entre/sort).
    private var tourbillonTransition: AnyTransition {
        .asymmetric(
            insertion: .modifier(
                active: TourbillonEffect(scale: 0.05, rotation: .degrees(-250), opacity: 0),
                identity: TourbillonEffect(scale: 1, rotation: .zero, opacity: 1)
            ),
            removal: .modifier(
                active: TourbillonEffect(scale: 0.05, rotation: .degrees(250), opacity: 0),
                identity: TourbillonEffect(scale: 1, rotation: .zero, opacity: 1)
            )
        )
    }

    private struct TourbillonEffect: ViewModifier {
        let scale: CGFloat
        let rotation: Angle
        let opacity: Double

        func body(content: Content) -> some View {
            content
                .scaleEffect(scale)
                .rotationEffect(rotation)
                .opacity(opacity)
        }
    }

    // ========================================================================
    // MARK: - Quick-Send Emoji (idle-state replacement for the send button)
    // ========================================================================

    /// #3927 — deux emojis rapides occupent l'emplacement du bouton d'envoi
    /// tant qu'il n'y a rien à envoyer, sourcés par le même tracker que les
    /// réactions rapides (`EmojiUsageTracker`, `MessageOverlayMenu.swift`) —
    /// source unique du « plus utilisé », jamais une seconde liste divergente.
    private static let quickSendDefaultEmojis = ["😂", "❤️", "👍", "😮", "😢", "🔥"]

    private var quickSendEmojis: [String] {
        EmojiUsageTracker.topEmojis(count: 2, defaults: Self.quickSendDefaultEmojis)
    }

    @ViewBuilder
    private var quickEmojiButtons: some View {
        HStack(spacing: 8) {
            ForEach(quickSendEmojis, id: \.self) { emoji in
                Button {
                    sendQuickEmoji(emoji)
                } label: {
                    Text(emoji)
                        .font(.system(size: 24))
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(mutedColor.opacity(0.12)))
                }
                .accessibilityLabel(
                    String(localized: "composer.quickEmoji.label", defaultValue: "Envoyer directement", bundle: .main) + " " + emoji
                )
                .accessibilityIdentifier(MeeshyA11yID.composerQuickEmoji)
            }
        }
    }

    /// Envoi direct d'un emoji : pose `text` puis réutilise `handleSend()` —
    /// SOURCE UNIQUE du dispatch (`onCustomSend`/`onSendMessage`/`onSend`),
    /// identique au bouton d'envoi. Ne réimplémente jamais cette
    /// ramification : les hôtes réels (ex. `ConversationView`) câblent
    /// toujours `onCustomSend`, qui lit l'état courant du champ — le
    /// contourner enverrait le champ VIDE au lieu de l'emoji.
    ///
    /// `text = emoji` seul ne suffit PAS (retour porteur 2026-08-27, bug
    /// vécu : le tap laissait l'emoji DANS le champ au lieu d'envoyer) :
    /// `text` est un `@State` LOCAL, synchronisé vers `textBinding` (source
    /// lue par `onCustomSend` chez l'hôte, ex. `composerText.text`) par un
    /// `.adaptiveOnChange(of: text)` — donc APRÈS ce tour de run loop.
    /// `handleSend()` appelle `onCustomSend()` SYNCHRONEMENT, avant que ce
    /// sync différé n'ait tourné : l'hôte lisait encore l'ancien texte (vide).
    /// Pousser `textBinding` ICI, à la MÊME frappe, ferme cet écart.
    ///
    /// Vider `text` (local) APRÈS `handleSend()` est tout aussi nécessaire :
    /// sans ça, `text` reste à `emoji` pour ce tour de run loop, et le MÊME
    /// `.adaptiveOnChange(of: text)` — désormais différé — re-pousse `emoji`
    /// dans `textBinding` APRÈS que l'hôte l'a vidé (`composerText.text =
    /// ""` dans `sendMessageWithAttachments()`), ressuscitant l'emoji dans
    /// le champ juste après l'envoi. `text` transite `"" → emoji → ""` dans
    /// la MÊME passe synchrone : SwiftUI ne diffuse que le changement NET
    /// au prochain rendu, donc ce second `onChange` ne se déclenche jamais.
    private func sendQuickEmoji(_ emoji: String) {
        EmojiUsageTracker.recordUsage(emoji: emoji)
        text = emoji
        textBinding?.wrappedValue = emoji
        handleSend()
        text = ""
    }

    // See UniversalComposerBar+Recording.swift for textInputField

    // ========================================================================
    // MARK: - Send Button
    // ========================================================================

    var sendButton: some View {
        let editColors = [MeeshyColors.warning, MeeshyColors.warning.opacity(0.75)]
        // Le bouton d'envoi porte l'accent de la CONVERSATION (ou du post /
        // de la story qui héberge le composer), miroir exact du bouton
        // « Écrire » de la variante minimisée. `editColors` reste sémantique.
        let sendColors = [Color(hex: accentColor), Color(hex: secondaryColor)]
        let colors = isEditMode ? editColors : sendColors
        let icon = isEditMode ? "checkmark" : "paperplane.fill"

        return Button {
            withAnimation(.spring(response: 0.25, dampingFraction: 0.5)) {
                sendBounce = true
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
                sendBounce = false
                handleSend()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: colors,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)
                    .shadow(color: colors[0].opacity(0.4), radius: sendBounce ? 12 : 8, x: 0, y: 4)

                Image(systemName: icon)
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.white)
                    .rotationEffect(isEditMode ? .zero : .degrees(sendBounce ? 55 : 45))
                    .offset(
                        x: isEditMode ? 0 : (sendBounce ? 2 : -1),
                        y: isEditMode ? 0 : (sendBounce ? -2 : 1)
                    )
            }
            .scaleEffect(sendBounce ? 1.2 : 1)
        }
        .frame(width: 44, height: 44)
        .accessibilityLabel(isEditMode
            ? String(localized: "composer.send.editLabel", defaultValue: "Enregistrer les modifications", bundle: .main)
            : String(localized: "composer.send.label", defaultValue: "Envoyer le message", bundle: .main))
        .accessibilityHint(isEditMode
            ? ""
            : String(localized: "composer.send.hint", defaultValue: "Envoie le texte saisi", bundle: .main))
        .accessibilityIdentifier(MeeshyA11yID.composerSend)
    }

    // ========================================================================
    // MARK: - Send Logic
    // ========================================================================

    func handleSend() {
        onAnyInteraction?()

        // Custom send (edit mode, recording, or parent-managed send)
        if let onCustomSend {
            onCustomSend()
            // **Le champ ressuscitait son texte juste après l'envoi** (#5961).
            //
            // `text` est un `@State` LOCAL, poussé vers `textBinding` par un
            // `.adaptiveOnChange(of: text)` — donc APRÈS ce tour de run loop.
            // `onCustomSend()` vient de rendre la main : l'hôte a vidé SA
            // source (`composerText.text = ""`), et la synchro différée y
            // re-pousserait l'ancien `text`. Le texte réapparaît, l'auteur tape
            // la suite, et l'envoi suivant emporte tout — un message par
            // accumulation, mesuré le 2026-09-10.
            //
            // Le dépôt connaissait ce piège : le doc-comment de
            // `sendQuickEmoji` le décrit mot pour mot et le referme, pour
            // l'emoji SEUL. Le geste d'envoi ordinaire, son voisin, ne l'avait
            // jamais reçu.
            //
            // **On ALIGNE, on ne vide pas.** Vider inconditionnellement
            // perdrait la saisie quand l'hôte REFUSE l'envoi — une édition
            // qu'il garde pour correction. La barre ne suit qu'une décision
            // déjà prise : si l'hôte a vidé sa source, elle s'aligne.
            if ComposerSendAlignment.shouldClearLocalText(hostText: textBinding?.wrappedValue,
                                                          localText: text) {
                text = ""
                textAnalyzer.reset()
            }
            HapticFeedback.light()
            return
        }

        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty || !allAttachments.isEmpty else { return }

        // Rich callback (full parity with web MessageComposer)
        if let onSendMessage = onSendMessage {
            onSendMessage(trimmed, allAttachments, currentLanguage)
        }

        // Simple callback (backward compatible)
        if let onSend = onSend, !trimmed.isEmpty {
            onSend(trimmed)
        }

        // Clear state + remove draft for this story
        text = ""
        attachments.removeAll()
        isFocused = false
        textAnalyzer.reset()
        if let id = storyId {
            onSaveDraft?(id, "", [])
        }
        HapticFeedback.light()
    }

    // ========================================================================
    // MARK: - Helpers
    // ========================================================================

    var mutedColor: Color {
        style == .dark ? .white.opacity(0.5) : theme.textMuted
    }

    /// Notify parent that composer has content requiring timer pause (text, attachments, or recording).
    func notifyContentChange() {
        onHasContentChange?(hasText || !attachments.isEmpty || effectiveIsRecording)
    }

    // ========================================================================
    // MARK: - Language detection
    // ========================================================================

    /// Propagate the detected language (or an explicit user override) to
    /// `currentLanguage` and notify the parent. Called in real-time as
    /// `TextAnalyzer.language` updates — restores the « detection visible
    /// before the 18-word lock » behaviour that was previously gated on
    /// `isLanguageLocked` alone.
    ///
    /// - Parameter force: skip the confidence floor (used when the analyzer
    ///   transitions to locked or the user picks a language explicitly).
    func applyDetectedLanguage(force: Bool = false) {
        let resolution = ComposerLanguageResolver.resolve(
            current: currentLanguage,
            override: textAnalyzer.languageOverride?.code,
            detected: textAnalyzer.language?.code,
            confidence: textAnalyzer.languageConfidence,
            force: force
        )
        guard let next = resolution else { return }
        currentLanguage = next
        onLanguageChange?(next)
    }

    // ========================================================================
    // MARK: - Minimize / Expand Logic
    // ========================================================================

    func expandComposer() {
        withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
            isMinimized = false
        }
        // Show keyboard after a short delay. The attachment carousel and the
        // keyboard are now mutually exclusive surfaces, so expanding goes
        // straight to the keyboard — the user opens the carousel via (+).
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            isFocused = true
        }
        onExpand?()
    }

    // MARK: - Focus the text field (bring the keyboard back)

    /// Brings the system keyboard back, dismissing the attachment carousel if it
    /// was open. Wired to a tap on the text field so the user can always summon
    /// the keyboard by tapping where they type — even mid-carousel.
    func focusTextField() {
        if showAttachOptions {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                showAttachOptions = false
            }
        }
        if !isFocused {
            isFocused = true
        }
    }
}
