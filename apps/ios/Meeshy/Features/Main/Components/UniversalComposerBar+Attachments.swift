import SwiftUI
import MeeshyUI
import AVFoundation
import CoreLocation
import Combine

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Attachment Views & Logic
// ============================================================================

extension UniversalComposerBar {

    // MARK: - Attachments Preview

    var attachmentsPreview: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(allAttachments) { attachment in
                    attachmentChip(attachment)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
        }
    }

    func attachmentChip(_ attachment: ComposerAttachment) -> some View {
        HStack(spacing: 6) {
            // Type icon
            Image(systemName: iconForType(attachment.type))
                .font(.caption)
                .foregroundColor(Color(hex: attachment.thumbnailColor))

            Text(attachment.name)
                .font(.caption.weight(.medium))
                .lineLimit(1)
                .frame(maxWidth: 120)

            if let size = attachment.size {
                Text(formatFileSize(size))
                    .font(.caption2)
                    .opacity(0.6)
            }

            // Remove button
            Button {
                HapticFeedback.light()
                withAnimation(.spring(response: 0.25, dampingFraction: 0.7)) {
                    attachments.removeAll { $0.id == attachment.id }
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.caption2.weight(.bold))
                    .foregroundColor(mutedColor)
                    .frame(width: 18, height: 18)
                    .background(
                        Circle().fill(style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.15))
                    )
            }
            .accessibilityLabel(String(localized: "composer.a11y.removeAttachment", defaultValue: "Retirer la pi\u{00E8}ce jointe", bundle: .main))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
            Capsule()
                .fill(style == .dark ? Color.white.opacity(0.12) : theme.inputBackground)
                .overlay(
                    Capsule()
                        .stroke(
                            style == .dark ? Color.white.opacity(0.15) : theme.textMuted.opacity(0.2),
                            lineWidth: 0.5
                        )
                )
        )
        .foregroundColor(style == .dark ? .white : theme.textPrimary)
    }

    // MARK: - Attachment Carousel Panel
    //
    // Replaces the legacy vertical ladder that dropped out of the (+) button.
    // When the user taps (+), the keyboard resigns and this horizontal carousel
    // of attachment types slides up *in the keyboard's place* (sized to the last
    // known keyboard height by the parent). Tapping the now-keyboard-icon swaps
    // it back for the system keyboard. See `attachButton` and the panel host in
    // `UniversalComposerBar.swift`.

    var attachmentCarouselPanel: some View {
        let tiles = carouselTiles

        return VStack(spacing: 0) {
            mediaPanelGrabHandle

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(Array(tiles.enumerated()), id: \.element.id) { index, tile in
                        carouselTile(tile, index: index)
                    }
                }
                .padding(.horizontal, 18)
                .padding(.vertical, 12)
            }

            // Inline recent photos/videos — selectable straight into the
            // attachment tray, with a leading "+" to open the full library. The
            // strip fills the remaining panel height (iPad shows a roomy
            // scrollable grid); only hosts WITHOUT it need the trailing spacer.
            if let onRecentMediaSelected {
                Divider().opacity(0.4).padding(.horizontal, 14)
                RecentMediaStrip(
                    accentColor: accentColor,
                    onOpenLibrary: { openFullPhotoLibrary(preselecting: $0) },
                    onSelect: onRecentMediaSelected,
                    onEdit: onRecentMediaEdit,
                    onSelectionChanged: { recentStripSelectionIds = $0 }
                )
            } else {
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity)
        .background(
            (style == .dark ? Color.black.opacity(0.18) : theme.inputBackground.opacity(0.6))
        )
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(localized: "composer.a11y.attachCarousel", defaultValue: "Types de pi\u{00E8}ces jointes", bundle: .main))
    }

    // MARK: - Grab Handle

    /// Poignée du panneau. Décorative tant qu'il n'y a pas d'aperçu photothèque
    /// en dessous ; dès que le strip est monté, elle devient le raccourci vers
    /// la photothèque COMPLÈTE — celle du système, avec ses onglets Photos /
    /// Albums en haut, exactement le picker que le composer de story ouvre.
    ///
    /// Le geste est directionnel et reprend la grammaire de la feuille système :
    /// tirer vers le HAUT agrandit (on passe de l'aperçu de 8 vignettes à toute
    /// la photothèque), tirer vers le BAS referme le panneau. Sans la branche
    /// « bas », la poignée avalerait le drag et casserait le swipe-to-dismiss
    /// que le geste global de `expandedComposer` assure partout ailleurs.
    ///
    /// La sélection multiple en cours est reportée au picker : partir vers la
    /// photothèque ne doit jamais faire perdre ses choix à l'utilisateur — même
    /// invariant que la tuile « + » du strip.
    @ViewBuilder
    var mediaPanelGrabHandle: some View {
        // Branche explicite plutôt que `highPriorityGesture(optionnel)` : la
        // surcharge qui accepte un geste `nil` n'existe qu'à partir d'iOS 18 et
        // l'app plancher à 16.
        if onRecentMediaSelected != nil {
            grabHandleCapsule(emphasis: 0.55)
                // Bande tactile confortable : 4 pt de haut ne s'attrapent pas.
                .contentShape(Rectangle().inset(by: -12))
                // `highPriority` : sans ça, le `DragGesture` global de
                // `expandedComposer` gagne l'arbitrage et le geste vers le haut
                // n'arrive jamais jusqu'ici.
                .highPriorityGesture(mediaPanelHandleDrag)
                .accessibilityElement()
                .accessibilityLabel(String(localized: "composer.a11y.panelHandle", defaultValue: "Poign\u{00E9}e du panneau", bundle: .main))
                .accessibilityHint(String(localized: "composer.a11y.panelHandleHint", defaultValue: "Glisser vers le haut pour ouvrir toute la phototh\u{00E8}que", bundle: .main))
                // VoiceOver ne peut pas produire le drag : il lui faut l'action
                // nommée, sinon le raccourci n'existe que pour la souris/doigt.
                .accessibilityAction(named: Text(String(localized: "composer.a11y.openFullLibrary", defaultValue: "Ouvrir toute la phototh\u{00E8}que", bundle: .main))) {
                    openFullPhotoLibrary(preselecting: recentStripSelectionIds)
                }
        } else {
            grabHandleCapsule(emphasis: 0.4)
                .accessibilityHidden(true)
        }
    }

    private func grabHandleCapsule(emphasis: Double) -> some View {
        Capsule()
            .fill(mutedColor.opacity(emphasis))
            .frame(width: 36, height: 4)
            .padding(.top, 8)
            .padding(.bottom, 4)
    }

    /// La décision vit dans `ComposerPanelHandleLaw` (pure, testée) ; ce geste
    /// ne fait que lui passer position et vélocité projetée, puis exécuter.
    private var mediaPanelHandleDrag: some Gesture {
        DragGesture(minimumDistance: 10)
            .onEnded { value in
                switch ComposerPanelHandleLaw.outcome(
                    translation: value.translation.height,
                    predicted: value.predictedEndTranslation.height
                ) {
                case .openFullLibrary:
                    HapticFeedback.medium()
                    openFullPhotoLibrary(preselecting: recentStripSelectionIds)
                case .closePanel:
                    closeAttachMenu()
                case .ignore:
                    break
                }
            }
    }

    /// Point unique d'ouverture de la photothèque système, partagé par la tuile
    /// « + » du strip, la poignée et l'action VoiceOver. `fire` referme d'abord
    /// le panneau, sinon la feuille se présenterait par-dessus un clavier de
    /// substitution encore monté.
    func openFullPhotoLibrary(preselecting ids: [String]) {
        fire {
            if let onPhotoLibraryPreselecting {
                onPhotoLibraryPreselecting(ids)
            } else {
                onPhotoLibrary?()
            }
        }
    }

    /// The attachment types offered by the carousel. Each tile is included only
    /// when the host actually wired its callback (or, for voice, when the mode
    /// allows it) — so a context like comments that only wires photo/file/voice
    /// never shows a dead camera or emoji tile.
    private var carouselTiles: [CarouselTile] {
        var tiles: [CarouselTile] = []
        // The dedicated "Photos" tile is only listed when there is NO recent-media
        // strip below (the strip already exposes photo/video picking + a tile to
        // open the full library). Hosts without the strip keep this tile so photo
        // access never disappears.
        if onPhotoLibrary != nil && onRecentMediaSelected == nil {
            tiles.append(CarouselTile(
                id: "photo", icon: "photo.fill", color: "9B59B6",
                label: String(localized: "composer.attach.photo", defaultValue: "Photos", bundle: .main)
            ) { fire { onPhotoLibrary?() } })
        }
        if onCamera != nil {
            tiles.append(CarouselTile(
                id: "camera", icon: "camera.fill", color: "F8B500",
                label: String(localized: "composer.attach.camera", defaultValue: "Cam\u{00E9}ra", bundle: .main)
            ) { fire { onCamera?() } })
        }
        if onFilePicker != nil {
            tiles.append(CarouselTile(
                id: "file", icon: "doc.fill", color: "45B7D1",
                label: String(localized: "composer.attach.file", defaultValue: "Fichier", bundle: .main)
            ) { fire { onFilePicker?() } })
        }
        if showLocation && onLocationRequest != nil {
            tiles.append(CarouselTile(
                id: "location", icon: "location.fill", color: "2ECC71",
                label: String(localized: "composer.attach.location", defaultValue: "Position", bundle: .main)
            ) { fire { onLocationRequest?() } })
        }
        if resolvedShowVoice {
            tiles.append(CarouselTile(
                id: "voice", icon: "mic.fill", color: "E74C3C",
                label: String(localized: "composer.attach.voice", defaultValue: "Vocal", bundle: .main)
            ) {
                // Voice records inline (the recording bar takes over the row),
                // so the carousel must step aside immediately.
                closeAttachMenu()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { startRecording() }
            })
        }
        if showEmoji && onRequestTextEmoji != nil {
            tiles.append(CarouselTile(
                id: "emoji", icon: "face.smiling.fill", color: "FF9F43",
                label: String(localized: "composer.attach.emoji", defaultValue: "Emoji", bundle: .main)
            ) { fire { onRequestTextEmoji?() } })
        }
        return tiles
    }

    /// Closes the carousel then runs `action` on the next runloop tick so the
    /// dismissal animation and any presented picker sheet don't fight.
    private func fire(_ action: @escaping () -> Void) {
        closeAttachMenu()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { action() }
    }

    struct CarouselTile: Identifiable {
        let id: String
        let icon: String
        let color: String
        let label: String
        let action: () -> Void
    }

    func carouselTile(_ tile: CarouselTile, index: Int) -> some View {
        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            tile.action()
        } label: {
            VStack(spacing: 7) {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(hex: tile.color), Color(hex: tile.color).opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 58, height: 58)
                        .shadow(color: Color(hex: tile.color).opacity(0.4), radius: 8, y: 3)

                    Image(systemName: tile.icon)
                        .font(.title3.weight(.semibold))
                        .foregroundColor(.white)
                }
                Text(tile.label)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(style == .dark ? .white.opacity(0.85) : theme.textSecondary)
                    .lineLimit(1)
            }
        }
        .menuAnimation(showMenu: showAttachOptions, delay: Double(index) * 0.04)
        .accessibilityLabel(tile.label)
    }

    // MARK: - Attach / Keyboard Toggle Button

    /// The left-side composer control. It toggles between the text keyboard and
    /// the attachment carousel:
    /// - When the carousel is hidden it shows a `plus` — tapping resigns the
    ///   keyboard and slides the carousel up in its place.
    /// - When the carousel is shown it shows a `keyboard` glyph — tapping hides
    ///   the carousel and brings the system keyboard back.
    var attachButton: some View {
        let accent = Color(hex: accentColor)
        let iconColor = style == .dark ? Color.white.opacity(0.7) : accent
        let bgFill = style == .dark ? Color.white.opacity(0.1) : accent.opacity(0.1)
        let borderColor = style == .dark ? Color.white.opacity(0.2) : accent.opacity(0.2)

        return Button(action: {
            onAnyInteraction?()
            HapticFeedback.light()
            if showAttachOptions {
                showAttachmentCarousel(false)
                isFocused = true
            } else {
                showAttachmentCarousel(true)
            }
        }) {
            Image(systemName: showAttachOptions ? "keyboard" : "plus")
                .font((showAttachOptions ? Font.callout : Font.title3).weight(.semibold))
                .foregroundColor(iconColor)
                .rotationEffect(.degrees(showAttachOptions ? 0 : attachRotation))
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(bgFill)
                        .overlay(
                            Circle()
                                .stroke(borderColor, lineWidth: 1)
                        )
                )
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showAttachOptions)
        }
        .accessibilityLabel(showAttachOptions
            ? String(localized: "composer.a11y.showKeyboard", defaultValue: "Afficher le clavier", bundle: .main)
            : String(localized: "composer.a11y.openAttachMenu", defaultValue: "Ouvrir le menu des pi\u{00E8}ces jointes", bundle: .main))
    }

    // MARK: - Carousel <-> Keyboard switching

    /// Shows or hides the attachment carousel. Showing it resigns the keyboard
    /// first so the carousel can occupy the freed keyboard space.
    func showAttachmentCarousel(_ show: Bool) {
        if show {
            attachRotation += 90
            isFocused = false
            // Let the host dismiss any other bottom surface (e.g. an emoji
            // panel) so the carousel never stacks on top of it.
            onShowAttachments?()
        }
        withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) {
            showAttachOptions = show
        }
    }

    // MARK: - Close Attach Menu

    func closeAttachMenu() {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showAttachOptions = false
        }
    }

    // MARK: - Clipboard Content Handling

    func handleClipboardCheck(_ newText: String) {
        // Detect if a paste of 2000+ chars just happened
        let delta = newText.count - (text.count - (newText.count - text.count))
        if newText.count > 2000 && delta > 500 {
            // Likely a paste — create clipboard content
            let clip = ClipboardContent(text: newText)
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                clipboardContent = clip
            }
            // Clear the text field since it's now an attachment
            DispatchQueue.main.async {
                text = ""
            }
            onClipboardContent?(clip)
            HapticFeedback.medium()
        }
    }

    func clipboardContentPreview(_ clip: ClipboardContent) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "doc.plaintext.fill")
                .font(.body)
                .foregroundColor(MeeshyColors.indigo500)

            VStack(alignment: .leading, spacing: 2) {
                Text(String(localized: "composer.clipboard.title", defaultValue: "Contenu du presse-papier", bundle: .main))
                    .font(.caption2.weight(.bold))
                    .foregroundColor(style == .dark ? .white : theme.textPrimary)

                Text(clip.truncatedPreview)
                    .font(.caption2)
                    .foregroundColor(style == .dark ? .white.opacity(0.6) : theme.textSecondary)
                    .lineLimit(2)

                Text(String(localized: "composer.clipboard.charCount", defaultValue: "\(clip.charCount) caract\u{00E8}res", bundle: .main))
                    .font(.caption2.weight(.medium))
                    .foregroundColor(MeeshyColors.indigo500)
            }

            Spacer()

            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    clipboardContent = nil
                }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.callout)
                    .foregroundColor(MeeshyColors.error)
            }
            .accessibilityLabel(String(localized: "composer.a11y.removeClipboardContent", defaultValue: "Retirer le contenu du presse-papier", bundle: .main))
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(style == .dark ? Color.white.opacity(0.06) : Color.black.opacity(0.03))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(MeeshyColors.indigo500.opacity(0.3), lineWidth: 1)
                )
        )
        .padding(.horizontal, 12)
        .padding(.bottom, 4)
    }

    // MARK: - Helpers

    func iconForType(_ type: ComposerAttachmentType) -> String {
        switch type {
        case .voice: return "mic.fill"
        case .location: return "location.fill"
        case .image: return "photo.fill"
        case .file: return "doc.fill"
        case .video: return "video.fill"
        }
    }

    func formatFileSize(_ bytes: Int) -> String {
        Int64(bytes).formatted(.byteCount(style: .file))
    }
}
