import SwiftUI
import MeeshyUI
import AVFoundation
import Combine
import MeeshySDK

// MARK: - Extracted from UniversalComposerBar.swift

// ============================================================================
// MARK: - Barre d'outils du haut
// ============================================================================
//
// Découpage mécanique du fichier (#4104, budget 800–1100 lignes/fichier) —
// porte le chrome du haut : barre d'outils, pastille de sélection de
// langue, bouton d'icône générique de la barre d'outils et la poignée de
// balayage. Aucun changement de comportement, seulement un déplacement de
// lignes.

extension UniversalComposerBar {

    // ========================================================================
    // MARK: - Top Toolbar
    // ========================================================================

    var topToolbar: some View {
        ComposerToolbarStrip {
            // Ephemeral mode toggle (hidden for comments)
            if !resolvedHideEphemeral {
                ephemeralToggleButton
            }

            // Blur mode toggle
            if !hideBlur {
                blurToggleButton
            }

            // View-once mode toggle — À CÔTÉ du flou (#7472), et gardé par le
            // même genre de drapeau : les deux protections de masquage se
            // posent du même geste, au même endroit.
            if !resolvedHideViewOnce {
                viewOnceToggleButton
            }

            // Effects picker toggle (full sheet — messages only)
            if !resolvedHideEffects {
                effectsToggleButton
            }

            // Permanent effects inline toggle (comments only)
            if resolvedShowPermanentEffects {
                permanentEffectsToggleButton
            }

            // **Le sticker à la place de l'humeur** (#9082, directive porteur
            // 2026-10-02) : l'indicateur passif de tonalité laisse sa place à
            // la porte du sélecteur de stickers — rendue seulement si l'hôte
            // sait l'ouvrir (loi 4).
            if let openStickers = onRequestStickerPicker {
                glassDoorButton(
                    symbol: "rectangle.portrait.on.rectangle.portrait.angled",
                    label: String(localized: "composer.attach.sticker", defaultValue: "Sticker", bundle: .main),
                    action: openStickers)
            }

        } pinned: {
            // **La langue d'écriture ferme la bande sans y défiler** (#9254,
            // jumelle web D-164) : dernière de la bande défilante, elle passait
            // sous les portes de droite dès que la rangée débordait.
            languageSelectorPill
        } trailing: {
            // Character counter
            if let maxLen = maxLength {
                let count = text.count
                if count > Int(Double(maxLen) * 0.8) {
                    Text("\(count)/\(maxLen)")
                        .font(.system(.caption2, design: .monospaced)).fontWeight(.semibold)
                        .foregroundColor(count >= maxLen ? MeeshyColors.error : mutedColor)
                        .transition(.opacity)
                }
            }

            // **La caméra à l'angle droit du verre** (#9082), juste avant le ⌄ ;
            // la photothèque (images ET vidéos) à côté d'elle (#9120).
            // Construites ICI, sur le fil principal : le `ForEach` ne fait que
            // les relire (#9456, `AsyncRenderRow`).
            ForEach(ComposerGlassDoors.trailing(offersLibrary: onPhotoLibrary != nil,
                                                offersCamera: onCamera != nil,
                                                offersFold: resolvedFoldControl != nil)
                        .map { AsyncRenderRow(id: $0, content: trailingGlassDoor($0)) },
                    content: asyncRenderRowContent)
        }
    }

    @ViewBuilder
    private func trailingGlassDoor(_ door: ComposerGlassDoors.TrailingDoor) -> some View {
        switch door {
        case .library:
            if let openLibrary = onPhotoLibrary {
                glassDoorButton(
                    symbol: "photo.on.rectangle.angled",
                    label: String(localized: "composer.attach.photo", defaultValue: "Photos", bundle: .main),
                    action: openLibrary)
            }
        case .camera:
            if let openCamera = onCamera {
                glassDoorButton(
                    symbol: "camera.fill",
                    label: String(localized: "composer.attach.camera", defaultValue: "Caméra", bundle: .main),
                    action: openCamera)
            }
        case .fold:
            if let fold = resolvedFoldControl {
                foldButton(fold)
                    .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .topTrailing)))
            }
        }
    }

    // ========================================================================
    // MARK: - Repli (#8642)
    // ========================================================================

    /// **Le ⌄ vit DANS le verre** (directive porteur 2026-09-29 : « doit être à
    /// l'intérieur, angle à droite de la plaque de verre »). Il flottait au-dessus
    /// de la plaque ; il ferme désormais la rangée d'outils, dont la bande
    /// `trailing` ne défile jamais — Dynamic Type ne peut pas le pousser hors de
    /// l'écran. Glyphe au format des outils (30 pt), cible de 44 pt.
    private func foldButton(_ fold: ComposerFoldControl) -> some View {
        Button(action: fold.action) {
            Image(systemName: fold.symbol)
                .font(.footnote.weight(.bold))
                .foregroundColor(iconTint)
                .frame(width: 30, height: 30)
                .adaptiveLiquidGlass(in: Circle(), interactive: true)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -7)
        .accessibilityLabel(fold.label)
    }

    /// Une porte de la bande (#9082) : glyphe au format des outils (30 pt),
    /// cible de 44 pt, à la couleur servie.
    private func glassDoorButton(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            onAnyInteraction?()
            HapticFeedback.light()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.callout.weight(ComposerGlassDoors.glyphWeight))
                .foregroundColor(iconTint)
                .frame(width: 30, height: 30)
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, -7)
        .accessibilityLabel(label)
    }

    // ========================================================================
    // MARK: - Language Selector Pill
    // ========================================================================

    private var languageSelectorPill: some View {
        Menu {
            ForEach(availableLanguages) { lang in
                Button {
                    currentLanguage = lang.code
                    onLanguageChange?(lang.code)
                    if let detected = DetectedLanguage.find(code: lang.code) {
                        textAnalyzer.lockToLanguage(detected)
                    }
                } label: {
                    HStack {
                        Text("\(lang.flag) \(lang.name)")
                        if lang.code == currentLanguage {
                            Image(systemName: "checkmark")
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: MeeshySpacing.xxs) {
                Text(currentLangOption.flag)
                    .font(.caption)
                Text(currentLangOption.code.uppercased())
                    .font(.caption2).fontWeight(.semibold)
                Image(systemName: "chevron.down")
                    .font(.caption2.weight(.bold))
            }
            .fixedSize()
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xs)
            .adaptiveLiquidGlass(in: Capsule(), tint: style == .dark ? nil : iconTint.opacity(0.18))
            .foregroundColor(iconTint)
        }
        .accessibilityLabel(String(localized: "a11y.composer.language", defaultValue: "Langue du message", bundle: .main))
        .accessibilityValue(currentLangOption.name)
        .accessibilityHint(String(localized: "a11y.composer.language.hint", defaultValue: "Choisir la langue d'envoi du message", bundle: .main))
    }

    // ========================================================================
    // MARK: - Toolbar Icon Button
    // ========================================================================

    // ========================================================================
    // MARK: - Swipe Handle
    // ========================================================================

    var swipeHandle: some View {
        HStack {
            Spacer()
            RoundedRectangle(cornerRadius: 2)
                .fill(style == .dark ? Color.white.opacity(0.2) : Color.black.opacity(0.12))
                .frame(width: 36, height: 4)
            Spacer()
        }
        .padding(.top, MeeshySpacing.sm)
        .padding(.bottom, MeeshySpacing.xxs)
    }
}

// ============================================================================
// MARK: - Bande de la barre d'outils (#7997)
// ============================================================================
//
// Un `HStack` dont aucun enfant ne se compresse (cadres de 30 pt, pastille de
// langue en `.fixedSize()`, capsules des protections) rend une largeur PLUS
// GRANDE que celle qu'on lui propose dès que Dynamic Type grossit les glyphes ;
// chaque parent non borné la reprend, et tout l'écran de conversation était
// mis en page sur 493 pt pour un iPhone de 402 pt. La bande garde la rangée
// telle quelle quand elle tient, et la fait DÉFILER horizontalement sinon :
// sa largeur ne dépasse jamais celle proposée.

/// **L'angle droit du verre** (#9082) : la caméra se pose juste avant le ⌄,
/// la photothèque à côté d'elle (#9120), et chaque porte n'existe que si
/// l'hôte sait l'ouvrir. Leur glyphe, plus grand que celui des icônes de
/// gauche (`.caption` semibold), prend un trait `.regular` pour garder la même
/// épaisseur perçue (#9173).
nonisolated enum ComposerGlassDoors {
    static let glyphWeight: Font.Weight = .regular

    enum TrailingDoor: Hashable, Sendable {
        case library
        case camera
        case fold
    }

    static func trailing(offersLibrary: Bool, offersCamera: Bool, offersFold: Bool) -> [TrailingDoor] {
        (offersLibrary ? [.library] : []) + (offersCamera ? [.camera] : []) + (offersFold ? [.fold] : [])
    }
}

/// Le repli qu'un hôte confie à la barre (#8642) : son glyphe, son libellé
/// VoiceOver et son geste. La barre le pose ; l'hôte décide QUAND il existe.
struct ComposerFoldControl {
    let symbol: String
    let label: String
    let action: () -> Void
}

/// **Ce que la bande d'outils dit de son débordement** (#9254, jumelle web
/// D-164 `useScrollsFurtherMark`) : tant qu'un outil reste au-delà du bord de
/// fin, les 44 derniers points s'estompent — une CIBLE, si bien que le fondu
/// recouvre toujours une partie d'un glyphe et dit qu'il y a plus loin.
/// Défilée jusqu'au bout, la bande s'éclaire.
nonisolated enum ComposerToolbarOverflow {
    static let fadeWidth: CGFloat = 44

    static func scrollsFurther(offset: CGFloat, contentWidth: CGFloat, viewportWidth: CGFloat) -> Bool {
        viewportWidth > 0 && contentWidth - viewportWidth - abs(offset) > 0.5
    }
}

/// La rangée d'outils du composeur : les outils (`leading`), la pastille qui
/// les ferme (`pinned`) et l'angle droit du verre (`trailing`).
///
/// Quand tout tient, la rangée se lit d'un bloc, pastille accolée aux outils.
/// Sinon, SEULS les outils défilent : la pastille et l'angle droit gardent
/// leur place et leur largeur (#9254), et la bande signale qu'elle défile
/// (`ComposerToolbarOverflow`). Sa largeur ne dépasse jamais celle proposée
/// (#7997).
struct ComposerToolbarStrip<Leading: View, Pinned: View, Trailing: View>: View {
    @ViewBuilder let leading: Leading
    @ViewBuilder let pinned: Pinned
    @ViewBuilder let trailing: Trailing

    @State private var contentWidth: CGFloat = 0
    @State private var viewportWidth: CGFloat = 0
    @State private var scrollsFurther = false
    @State private var lastOffset = ComposerToolbarOffsetBox()

    private static var scrollSpace: String { "composer.toolbar.strip" }

    var body: some View {
        HStack(spacing: 6) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) {
                    leading
                    pinned
                    Spacer(minLength: 0)
                }
                HStack(spacing: 6) {
                    scrollingTools
                    pinned
                }
            }
            trailing
        }
    }

    /// Le décalage se lit par le cadre du contenu dans la fenêtre défilante
    /// jusqu'à iOS 17, par `onScrollGeometryChange` à partir d'iOS 18. Il est
    /// gardé hors du rendu (`ComposerToolbarOffsetBox`) : la bande ne se
    /// réévalue qu'au moment où le fondu s'allume ou s'éteint, jamais à chaque
    /// image du défilement.
    ///
    /// **Aucun `GeometryReader`** (#9456) : ce candidat du `ViewThatFits` est
    /// mesuré sur le rendu asynchrone d'iOS 26 quand le clavier ou Dynamic
    /// Type change la largeur, et la fermeture d'un `GeometryReader`, isolée au
    /// main actor, y trapperait. `onGeometryChange` prend une transformation
    /// `@Sendable` — non isolée — et rend son action sur le fil principal.
    private var scrollingTools: some View {
        let space = Self.scrollSpace
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) { leading }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(space)) } action: { frame in
                    contentWidth = frame.width
                    record(offset: -frame.minX)
                }
        }
        .coordinateSpace(name: space)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
            viewportWidth = width
            refreshFade()
        }
        .trackScrollContentOffsetX { record(offset: $0) }
        .mask {
            HStack(spacing: 0) {
                Rectangle()
                LinearGradient(colors: [.black, .black.opacity(0)], startPoint: .leading, endPoint: .trailing)
                    .flipsForRightToLeftLayoutDirection(true)
                    .frame(width: scrollsFurther ? ComposerToolbarOverflow.fadeWidth : 0)
            }
        }
    }

    private func record(offset: CGFloat) {
        lastOffset.value = offset
        refreshFade()
    }

    private func refreshFade() {
        let next = ComposerToolbarOverflow.scrollsFurther(
            offset: lastOffset.value, contentWidth: contentWidth, viewportWidth: viewportWidth)
        if next != scrollsFurther { scrollsFurther = next }
    }
}

/// Le dernier décalage lu, tenu HORS du graphe de rendu : le muter ne
/// réévalue rien.
nonisolated final class ComposerToolbarOffsetBox {
    var value: CGFloat = 0
}
