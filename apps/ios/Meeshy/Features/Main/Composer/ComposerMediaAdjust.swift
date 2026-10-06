import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - ◐ RÉGLER une image ou une vidéo posée, dans la scène (#9175, #9169)

/// **Ce que la scène MONTRE pendant qu'on compare** (appui maintenu sur
/// « Comparer ») — la slide du modèle, dont l'image comparée a perdu son filtre
/// et ses réglages : son ORIGINAL, à sa place, à sa taille.
///
/// Une PROJECTION, jamais une écriture : le modèle n'est pas touché, donc ni
/// l'historique (débouncé sur `slides`) ni l'autosave ne voient la comparaison,
/// et relâcher rend exactement ce qui était là. L'éditeur d'image plein écran
/// comparait de la même façon — par l'image « géométrie seule » — mais hors de
/// la scène ; ici l'original se lit DANS sa composition.
nonisolated enum ComposerLookComparison {

    static func shown(_ slide: StorySlide, comparing id: String?) -> StorySlide {
        guard let id, let index = slide.effects.mediaObjects?.firstIndex(where: { $0.id == id }) else {
            return slide
        }
        var montree = slide
        montree.effects.mediaObjects?[index].filter = nil
        montree.effects.mediaObjects?[index].adjustments = nil
        return montree
    }

    /// **Ce qu'une écriture de la scène rend au modèle PENDANT la comparaison.**
    /// La scène réécrit la slide qu'elle a reçue — la projection, sans filtre ni
    /// réglage. Sans ce retour, la moindre écriture (une mesure de ratio, un
    /// geste) effacerait pour de bon ce qu'on est en train de comparer.
    static func written(_ slide: StorySlide, over model: StorySlide, comparing id: String?) -> StorySlide {
        guard let id,
              let index = slide.effects.mediaObjects?.firstIndex(where: { $0.id == id }),
              let source = model.effects.mediaObjects?.first(where: { $0.id == id }) else {
            return slide
        }
        var rendue = slide
        rendue.effects.mediaObjects?[index].filter = source.filter
        rendue.effects.mediaObjects?[index].adjustments = source.adjustments
        return rendue
    }
}

/// Les mots du sous-outil. Une clé LITTÉRALE par réglage : le catalogue
/// n'accepte que des clés qu'un `grep` retrouve (`check_localization.py`).
nonisolated enum ComposerAdjustCopy {

    static var title: String {
        String(localized: "composer.object.editor.adjust", defaultValue: "Réglages", bundle: .main)
    }

    static var reset: String {
        String(localized: "composer.object.editor.adjust.reset", defaultValue: "Réinitialiser", bundle: .main)
    }

    static var compare: String {
        String(localized: "composer.object.editor.adjust.compare",
               defaultValue: "Maintenir pour comparer", bundle: .main)
    }

    /// L'indice VoiceOver de « Comparer », qui nomme le média comparé (#9169).
    static func compareHint(for kind: StoryMediaKind?) -> String {
        guard kind == .video else {
            return String(localized: "composer.object.editor.adjust.compare.hint",
                          defaultValue: "Affiche l’image d’origine tant que vous maintenez", bundle: .main)
        }
        return String(localized: "composer.object.editor.adjust.compare.hint.video",
                      defaultValue: "Affiche la vidéo d’origine tant que vous maintenez", bundle: .main)
    }

    /// Ce que VoiceOver annonce quand la scène montre l'original (#9169).
    static func original(for kind: StoryMediaKind?) -> String {
        guard kind == .video else {
            return String(localized: "composer.object.editor.adjust.original", defaultValue: "Image d’origine",
                          bundle: .main)
        }
        return String(localized: "composer.object.editor.adjust.original.video", defaultValue: "Vidéo d’origine",
                      bundle: .main)
    }

    static func label(_ kind: AdjustmentKind) -> String {
        switch kind {
        case .exposure:
            return String(localized: "composer.object.editor.adjust.exposure", defaultValue: "Exposition", bundle: .main)
        case .brightness:
            return String(localized: "composer.object.editor.adjust.brightness", defaultValue: "Luminosité", bundle: .main)
        case .contrast:
            return String(localized: "composer.object.editor.adjust.contrast", defaultValue: "Contraste", bundle: .main)
        case .saturation:
            return String(localized: "composer.object.editor.adjust.saturation", defaultValue: "Saturation", bundle: .main)
        case .vibrance:
            return String(localized: "composer.object.editor.adjust.vibrance", defaultValue: "Vibrance", bundle: .main)
        case .temperature:
            return String(localized: "composer.object.editor.adjust.temperature", defaultValue: "Température", bundle: .main)
        case .sharpness:
            return String(localized: "composer.object.editor.adjust.sharpness", defaultValue: "Netteté", bundle: .main)
        case .blur:
            return String(localized: "composer.object.editor.adjust.blur", defaultValue: "Flou", bundle: .main)
        case .vignette:
            return String(localized: "composer.object.editor.adjust.vignette", defaultValue: "Vignette", bundle: .main)
        }
    }

    /// **La valeur LUE, de −100 à +100, zéro au neutre** — quelle que soit la
    /// plage du réglage (un contraste vit entre 0,5 et 1,5, une exposition entre
    /// −2 et +2). L'auteur lit un écart à l'original, jamais une unité CoreImage.
    static func displayValue(_ kind: AdjustmentKind, _ value: Float) -> Int {
        let ecart = value - kind.neutralValue
        let course = ecart >= 0 ? kind.range.upperBound - kind.neutralValue : kind.neutralValue - kind.range.lowerBound
        guard course > 0 else { return 0 }
        return Int((ecart / course * 100).rounded())
    }

    /// La valeur écrite comme on la lit : signée, zéro sans signe.
    static func signed(_ lue: Int) -> String {
        lue > 0 ? "+\(lue)" : "\(lue)"
    }
}

/// **Le panneau du sous-outil RÉGLER — un réglage à la fois** (#9495).
///
/// Neuf curseurs empilés prenaient 330 × 686 pt à 402 pt de large : le panneau
/// couvrait la scène, l'image réglée était CACHÉE pendant le geste, et
/// « Comparer » ne comparait rien qu'on puisse voir. Le panneau suit désormais
/// la grammaire de l'éditeur Photos : une rangée défilante de réglages — glyphe
/// et intitulé sous lui, un point quand le réglage s'écarte de l'original —, UN
/// curseur pour le réglage choisi, et au-dessus, quand l'image porte un rendu,
/// comparer (appui maintenu) et tout réinitialiser. Sa hauteur ne dépend plus du
/// nombre de réglages, et le meuble le range du côté qui laisse voir l'objet
/// (`ComposerInlinePanelLayout.edge`).
///
/// Chaque curseur écrit sur l'OBJET (`setMediaObjectAdjustment`) : la scène, qui
/// peint le même objet, suit le doigt image par image. Toucher deux fois la
/// valeur remet le réglage choisi à zéro — le geste de l'éditeur Photos, sans
/// bouton de plus.
struct ComposerMediaAdjustPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let mediaId: String
    /// Vrai pendant l'appui maintenu sur « Comparer » : le meuble montre alors
    /// l'original dans la scène (`ComposerLookComparison`). `nil` ⇒ la surface
    /// ne sait pas montrer l'original, et le contrôle ne se peint pas (loi 4).
    var onCompare: ((Bool) -> Void)?

    @State private var comparing = false
    @State private var chosen: AdjustmentKind?

    /// **Les curseurs qu'un média offre** — ceux qu'il PEINT (#9169) : une
    /// vidéo n'a ni netteté ni flou (`AdjustmentKind.served(for:)`). Un genre
    /// inconnu garde la liste de l'image, celle d'avant #9169.
    nonisolated static func kinds(for mediaKind: StoryMediaKind?) -> [AdjustmentKind] {
        AdjustmentKind.served(for: mediaKind ?? .image)
    }

    /// **Le réglage que le curseur unique pilote** : celui qu'on a touché, tant
    /// que le média le peint ; sinon le premier de la rangée.
    nonisolated static func shown(_ chosen: AdjustmentKind?, among kinds: [AdjustmentKind]) -> AdjustmentKind? {
        guard let chosen, kinds.contains(chosen) else { return kinds.first }
        return chosen
    }

    private var mediaKind: StoryMediaKind? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == mediaId }?.kind
    }

    var body: some View {
        let reglages = viewModel.mediaObjectAdjustments(id: mediaId)
        let porteUnRendu = reglages.activeCount > 0 || viewModel.mediaObjectFilter(id: mediaId) != nil
        let offerts = Self.kinds(for: mediaKind)
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if porteUnRendu {
                actions(canReset: reglages.activeCount > 0)
            }
            if let kind = Self.shown(chosen, among: offerts) {
                slider(kind, value: reglages[kind])
            }
            kindStrip(offerts, adjustments: reglages)
        }
        .onDisappear { release() }
    }

    // MARK: Comparer · Réinitialiser

    /// Glyphe ET intitulé court quand ils tiennent ; le glyphe seul sinon (grand
    /// Dynamic Type, écran étroit) — l'intitulé reste lu par VoiceOver.
    private func actions(canReset: Bool) -> some View {
        ViewThatFits(in: .horizontal) {
            actionRow(canReset: canReset, titled: true)
            actionRow(canReset: canReset, titled: false)
        }
    }

    private func actionRow(canReset: Bool, titled: Bool) -> some View {
        HStack(spacing: MeeshySpacing.sm) {
            if onCompare != nil { compareControl(titled: titled) }
            if canReset { resetControl(titled: titled) }
            Spacer(minLength: 0)
        }
    }

    private func compareControl(titled: Bool) -> some View {
        capsule(ComposerAdjustCopy.compare, symbol: "square.split.2x1", isOn: comparing, titled: titled)
            .onLongPressGesture(minimumDuration: .infinity, maximumDistance: 60, perform: {}, onPressingChanged: { appuye in
                appuye ? hold() : release()
            })
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(ComposerAdjustCopy.compare))
            .accessibilityHint(Text(ComposerAdjustCopy.compareHint(for: mediaKind)))
            .accessibilityAddTraits(comparing ? [.isButton, .isSelected] : .isButton)
            // VoiceOver ne maintient pas : l'action bascule, et la fermeture du
            // panneau rend toujours l'image réglée.
            .accessibilityAction { comparing ? release() : hold() }
    }

    private func resetControl(titled: Bool) -> some View {
        Button {
            viewModel.applyMediaObjectAdjustments(id: mediaId, .neutral)
            HapticFeedback.light()
        } label: {
            capsule(ComposerAdjustCopy.reset, symbol: "arrow.uturn.backward", isOn: false, titled: titled)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerAdjustCopy.reset))
    }

    private func capsule(_ title: String, symbol: String, isOn: Bool, titled: Bool) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: symbol).font(MeeshyFont.relative(13, weight: .semibold))
            if titled {
                Text(title).font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .foregroundStyle(isOn ? Color.white : Color.white.opacity(0.85))
        .padding(.horizontal, titled ? MeeshySpacing.mdPlus : 0)
        .frame(minWidth: 44, minHeight: 44)
        .background {
            if isOn {
                Capsule().fill(MeeshyColors.brandGradient)
            } else {
                Capsule().fill(Color.white.opacity(0.12))
            }
        }
        .contentShape(Capsule())
    }

    // MARK: Le curseur du réglage choisi

    private func slider(_ kind: AdjustmentKind, value: Float) -> some View {
        let ecart = ComposerAdjustCopy.displayValue(kind, value)
        let lue = ComposerAdjustCopy.signed(ecart)
        return HStack(spacing: MeeshySpacing.sm) {
            Slider(value: Binding(
                get: { Double(value) },
                set: { viewModel.setMediaObjectAdjustment(id: mediaId, kind, to: Float($0)) }
            ), in: Double(kind.range.lowerBound)...Double(kind.range.upperBound))
            .tint(Color.white)
            .frame(minHeight: 44)
            .accessibilityLabel(Text(ComposerAdjustCopy.label(kind)))
            .accessibilityValue(Text(lue))
            .accessibilityAction(named: Text(ComposerAdjustCopy.reset)) { resetOne(kind) }
            Text(lue)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold).monospacedDigit())
                .foregroundStyle(Color.white.opacity(ecart == 0 ? 0.55 : 0.92))
                .lineLimit(1)
                .fixedSize()
                .frame(minWidth: 36, minHeight: 44, alignment: .trailing)
                .contentShape(Rectangle())
                .onTapGesture(count: 2) { resetOne(kind) }
                .accessibilityHidden(true)
        }
    }

    private func resetOne(_ kind: AdjustmentKind) {
        viewModel.setMediaObjectAdjustment(id: mediaId, kind, to: kind.neutralValue)
        HapticFeedback.light()
    }

    // MARK: La rangée des réglages

    private func kindStrip(_ kinds: [AdjustmentKind], adjustments: ImageAdjustments) -> some View {
        let actif = Self.shown(chosen, among: kinds)
        return ScrollViewReader { defilement in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: MeeshySpacing.xs) {
                    ForEach(kinds) { kind in
                        kindChip(kind, isChosen: kind == actif, isAdjusted: adjustments.isActive(kind),
                                 value: ComposerAdjustCopy.displayValue(kind, adjustments[kind]))
                            .id(kind)
                    }
                }
            }
            .adaptiveOnChange(of: actif) { _, nouveau in
                guard let nouveau else { return }
                withAnimation(.easeOut(duration: 0.2)) { defilement.scrollTo(nouveau, anchor: .center) }
            }
        }
    }

    private func kindChip(_ kind: AdjustmentKind, isChosen: Bool, isAdjusted: Bool, value: Int) -> some View {
        Button {
            chosen = kind
            HapticFeedback.light()
        } label: {
            VStack(spacing: 3) {
                Image(systemName: kind.icon)
                    .font(MeeshyFont.relative(15, weight: .semibold))
                    .overlay(alignment: .topTrailing) {
                        if isAdjusted {
                            Circle().fill(Color.white).frame(width: 5, height: 5).offset(x: 5, y: -2)
                        }
                    }
                Text(ComposerAdjustCopy.label(kind))
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .semibold))
                    .lineLimit(1)
                    .fixedSize()
            }
            .foregroundStyle(isChosen ? Color.white : Color.white.opacity(0.78))
            .padding(.horizontal, MeeshySpacing.sm)
            .frame(minWidth: 52, minHeight: 52)
            .background {
                if isChosen {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                        .fill(MeeshyColors.brandGradient)
                } else {
                    RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous)
                        .fill(Color.white.opacity(0.08))
                }
            }
            .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerAdjustCopy.label(kind)))
        .accessibilityValue(Text(ComposerAdjustCopy.signed(value)))
        .accessibilityAddTraits(isChosen ? [.isButton, .isSelected] : .isButton)
    }

    // MARK: Comparaison

    private func hold() {
        guard !comparing else { return }
        comparing = true
        onCompare?(true)
        HapticFeedback.light()
        UIAccessibility.post(notification: .announcement, argument: ComposerAdjustCopy.original(for: mediaKind))
    }

    private func release() {
        guard comparing else { return }
        comparing = false
        onCompare?(false)
    }
}
