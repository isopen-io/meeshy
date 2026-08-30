import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Disposition & Corps
// ============================================================================
//
// Découpage mécanique du fichier (#4104, budget 800–1100 lignes/fichier) —
// porte la disposition de la barre : le corps (`body`), le bouton flottant
// minimisé, le composer déployé et son fond. Aucun changement de
// comportement, seulement un déplacement de lignes.

extension UniversalComposerBar {

    // MARK: - Body

    var body: some View {
        Group {
            if isMinimized {
                minimizedFloatingButton
                    .transition(.scale(scale: 0.6).combined(with: .opacity))
            } else {
                expandedComposer
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .offset(y: dragOffsetY)
                    .gesture(
                        DragGesture()
                            .onChanged { value in
                                if value.translation.height > 0 {
                                    dragOffsetY = value.translation.height * 0.5
                                }
                            }
                            .onEnded { value in
                                if value.translation.height > 80 {
                                    // Swipe down: dismiss whichever input surface
                                    // is up — the keyboard or the attachment
                                    // carousel — and optionally minimize.
                                    isFocused = false
                                    if showAttachOptions {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
                                            showAttachOptions = false
                                        }
                                    }
                                    if startMinimized {
                                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                            isMinimized = true
                                            dragOffsetY = 0
                                        }
                                        onCollapse?()
                                    } else {
                                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                            dragOffsetY = 0
                                        }
                                    }
                                } else {
                                    withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                                        dragOffsetY = 0
                                    }
                                }
                            }
                    )
            }
        }
        .animation(.spring(response: 0.35, dampingFraction: 0.8), value: isMinimized)
        // Cible de dépôt sur le conteneur externe : couvre toute la bande
        // (champ, barre d'outils, bandeaux édition/réponse, tiroir
        // d'attachements). Voir UniversalComposerBar+Drop.swift.
        .modifier(ComposerDropTargetModifier(accentColor: accentColor, onIngest: onIngest))
        .onAppear {
            isMinimized = startMinimized
        }
        .onDisappear {
            recordingTimer?.invalidate()
            recordingTimer = nil
        }
    }

    // MARK: - Minimized Floating Button

    private var minimizedFloatingButton: some View {
        HStack(spacing: 12) {
            // Mic button
            if resolvedShowVoice {
                Button {
                    HapticFeedback.medium()
                    expandAndStartRecording()
                } label: {
                    VStack(spacing: 3) {
                        ZStack {
                            Circle()
                                .fill(.ultraThinMaterial)
                                .frame(width: 44, height: 44)
                                .overlay(
                                    Circle().stroke(
                                        LinearGradient(
                                            colors: [MeeshyColors.error.opacity(0.5), MeeshyColors.errorDark.opacity(0.3)],
                                            startPoint: .topLeading, endPoint: .bottomTrailing
                                        ), lineWidth: 1
                                    )
                                )
                                .shadow(color: MeeshyColors.error.opacity(0.2), radius: 6, y: 2)

                            Image(systemName: "mic.fill")
                                .font(.body.weight(.medium))
                                .foregroundStyle(
                                    LinearGradient(
                                        colors: [MeeshyColors.error, MeeshyColors.errorDark],
                                        startPoint: .topLeading, endPoint: .bottomTrailing
                                    )
                                )
                        }
                        Text(String(localized: "composer.minimized.voice", defaultValue: "Vocal", bundle: .main))
                            .font(.caption2).fontWeight(.semibold)
                            .foregroundColor(style == .dark ? .white.opacity(0.5) : theme.textMuted)
                    }
                }
            }

            // Write button
            Button {
                HapticFeedback.medium()
                expandComposer()
            } label: {
                VStack(spacing: 3) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(hex: accentColor), Color(hex: secondaryColor)],
                                    startPoint: .topLeading, endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 50, height: 50)
                            .shadow(color: Color(hex: accentColor).opacity(0.4), radius: 8, y: 3)

                        Image(systemName: "square.and.pencil")
                            .font(.title3.weight(.semibold))
                            .foregroundColor(.white)
                    }
                    Text(String(localized: "composer.minimized.write", defaultValue: "\u{00C9}crire", bundle: .main))
                        .font(.caption2).fontWeight(.semibold)
                        .foregroundColor(style == .dark ? .white.opacity(0.5) : theme.textMuted)
                }
            }
        }
        .padding(.trailing, 16)
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }

    // MARK: - Expanded Composer

    private var expandedComposer: some View {
        VStack(spacing: 0) {
            // Edit banner
            if let banner = editBanner { banner }
            // Reply banner
            if let banner = replyBanner { banner }

            // Custom attachments (real thumbnails from parent) or default chips
            if let custom = customAttachmentsPreview {
                custom
                    .transition(.scale.combined(with: .opacity))
            } else if !allAttachments.isEmpty {
                attachmentsPreview
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Clipboard content preview (for pasted text > 2000 chars)
            if let clip = clipboardContent {
                clipboardContentPreview(clip)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }

            // Main composer
            VStack(spacing: 0) {
                // Swipe handle indicator
                if startMinimized {
                    swipeHandle
                }

                // Ephemeral duration picker (slides up from toolbar)
                if showEphemeralPicker {
                    ephemeralDurationPicker
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Permanent effects inline picker (for comments)
                if showPermanentEffectsPicker {
                    permanentEffectsInlinePicker
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Top toolbar (ephemeral, sentiment, language, char counter)
                // Hidden during recording for a clean, iMessage-like full-width bar
                if !effectiveIsRecording {
                    topToolbar
                        .padding(.horizontal, 8)
                        .padding(.top, 6)
                        .padding(.bottom, 2)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }

                // Composer row — either the recording bar (full-width pill, iMessage-style)
                // or the regular layout: [ (+) attach ]  [ text field ]  [ mic / send ]
                if effectiveIsRecording {
                    recordingBar
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .transition(
                            reduceMotion
                                ? .opacity
                                : .asymmetric(
                                    insertion: .opacity.combined(with: .scale(scale: 0.96)),
                                    removal: .opacity
                                )
                        )
                } else {
                    HStack(alignment: .bottom, spacing: 12) {
                        // Left: (+) attach / keyboard toggle button
                        if resolvedShowAttachment {
                            attachButton
                        }

                        // Center: text field. While the carousel is up, an
                        // overlay intercepts taps to bring the keyboard back
                        // (the field isn't focused then). When the keyboard is
                        // already up there is no overlay, so the TextField keeps
                        // its native tap-to-place-cursor behaviour.
                        textInputField
                            .overlay {
                                if showAttachOptions {
                                    Color.clear
                                        .contentShape(Rectangle())
                                        .onTapGesture { focusTextField() }
                                }
                            }

                        // Right: send (when content) or hidden (idle)
                        actionButton
                    }
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: hasContent)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 10)
                    .transition(.opacity)
                }

                // Attachment carousel — slides up in the keyboard's place when
                // the (+) toggle is active. Sized to the last known keyboard
                // height so swapping keyboard <-> carousel keeps the input row
                // perfectly still.
                if showAttachOptions && !effectiveIsRecording {
                    attachmentCarouselPanel
                        .frame(height: attachmentPanelHeight)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
            .background(composerBackground)
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showEphemeralPicker)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showPermanentEffectsPicker)
        .animation(.spring(response: 0.3, dampingFraction: 0.85), value: showAttachOptions)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: allAttachments.count)
        .animation(
            reduceMotion
                ? .easeInOut(duration: 0.2)
                : .spring(response: 0.35, dampingFraction: 0.8),
            value: effectiveIsRecording
        )
        .adaptiveOnChange(of: attachments.count) { _, _ in notifyContentChange() }
        .adaptiveOnChange(of: effectiveIsRecording) { _, _ in notifyContentChange() }
        .onAppear {
            currentLanguage = selectedLanguage
            // Load initial draft if available
            if let id = storyId, let draft = getDraft?(id) {
                text = draft.text
                attachments = draft.attachments
            }
        }
        .adaptiveOnChange(of: selectedLanguage) { _, newValue in
            currentLanguage = newValue
        }
        .adaptiveOnChange(of: storyId) { oldId, newId in
            if let oldId {
                if isRecording { forceStopRecording() }
                onSaveDraft?(oldId, text, attachments)
            }
            if let newId, let draft = getDraft?(newId) {
                text = draft.text
                attachments = draft.attachments
            } else {
                text = ""
                attachments = []
            }
            showAttachOptions = false
            isFocused = false
            textAnalyzer.reset()
            notifyContentChange()
        }
        .adaptiveOnChange(of: focusTrigger.wrappedValue) { _, shouldFocus in
            if shouldFocus {
                isFocused = true
                focusTrigger.wrappedValue = false
            }
        }
        .adaptiveOnChange(of: isFocused) { _, focused in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                focusBounce = focused
            }
            if focused {
                onAnyInteraction?()
            }
            if focused && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
            onFocusChange?(focused)
        }
        // Détection de langue en temps réel (Prisme Linguistique).
        //
        // `TextAnalyzer.performAnalysis` mute `language` ET `languageConfidence`
        // dans le **même** `DispatchQueue.main.async` — observer la confiance
        // seule suffit (elle change toujours en même temps que la langue).
        // Évite un double-fire de `applyDetectedLanguage` par cycle de
        // détection.
        //
        // Adoption au seuil 86 % (`ComposerLanguageResolver.confidenceFloor`).
        // Tant qu'aucune langue n'a atteint 86 %, le pill et la langue
        // envoyée restent sur le défaut « fr ». À 10 mots, le détecteur se
        // verrouille — la dernière langue à ≥ 86 % (ou « fr » si rien) est
        // définitive pour ce message.
        //
        // Override manuel (menu) : prioritaire, propagé immédiatement
        // (force=true) quelle que soit la confiance.
        .adaptiveOnChange(of: textAnalyzer.languageConfidence) { _, _ in
            applyDetectedLanguage()
        }
        .adaptiveOnChange(of: textAnalyzer.languageOverride?.code) { _, _ in
            applyDetectedLanguage(force: true)
        }
        .adaptiveOnChange(of: text) { _, newValue in
            onAnyInteraction?()
            notifyContentChange()
            textAnalyzer.analyze(text: newValue)
            // Texte vidé : on retombe sur le défaut (« fr ») pour que la
            // prochaine frappe parte d'un état propre. **Sauf** si la
            // langue a été choisie à la main (override) — dans ce cas on
            // respecte le choix utilisateur même quand le champ se vide,
            // sinon le pill afficherait EN (override) mais on enverrait FR.
            if newValue.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
               textAnalyzer.languageOverride == nil {
                let defaultLanguage = DefaultComposerLanguage.resolve()
                if currentLanguage != defaultLanguage {
                    currentLanguage = defaultLanguage
                    onLanguageChange?(defaultLanguage)
                }
            }
            onTextChange?(newValue)
            // Sync to external binding
            if let binding = textBinding, binding.wrappedValue != newValue {
                binding.wrappedValue = newValue
            }
            // Ripple wave on each keystroke
            if isFocused {
                typeWave = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    typeWave = false
                }
            }
            // Close attach options when typing starts
            if !newValue.isEmpty && showAttachOptions {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showAttachOptions = false
                }
            }
            // Clipboard content: auto-create when pasting 2000+ chars
            handleClipboardCheck(newValue)
        }
        .adaptiveOnChange(of: textBinding?.wrappedValue) { _, newValue in
            guard let newValue, newValue != text else { return }
            text = newValue
        }
        .sheet(isPresented: $textAnalyzer.showLanguagePicker) {
            LanguagePickerSheet(
                style: isDark ? .dark : .light,
                onSelect: { lang in
                    let detected = DetectedLanguage.find(code: lang.id) ??
                        DetectedLanguage(id: lang.id, code: lang.id, flag: lang.flag, name: lang.name)
                    textAnalyzer.lockToLanguage(detected)
                    currentLanguage = detected.code
                    onLanguageChange?(detected.code)
                },
                onDismiss: { textAnalyzer.showLanguagePicker = false }
            )
        }
        .adaptiveOnChange(of: injectedEmoji.wrappedValue) { _, emoji in
            if !emoji.isEmpty {
                text += emoji
                DispatchQueue.main.async {
                    injectedEmoji.wrappedValue = ""
                }
            }
        }
    }

    // ========================================================================
    // MARK: - Background
    // ========================================================================

    private var composerBackground: some View {
        Color.clear
    }
}
