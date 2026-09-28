import SwiftUI
import MeeshySDK
import MeeshyUI

// **La frise de la scène ANIMÉE, telle que la maquette la dessine** (#8370,
// lot 6 — `docs/product/composer-plein-ecran/Main.dc.html`, bloc « plan
// temps » ; directive porteur 2026-09-27 : « il faut bien intégrer toute la
// partie animated en respectant LE MOCK »).
//
// Une plaque de verre, rien d'autre : lecture, « 1.2 s / 6 s », « Entre ici » /
// « Sort ici » quand un objet est choisi, une règle qu'on touche pour déplacer
// la tête, puis une piste par objet — la toucher choisit l'objet ET y pose la
// tête. La tête est ambre. L'éditeur de montage complet (zoom, transitions,
// images-clés) reste celui de l'atelier : la scène n'en porte que le geste
// nominal, sur le MÊME projet (`TimelineViewModel.sceneFriseTracks`).
struct ComposerSceneFrise: View {
    @ObservedObject var timeline: TimelineViewModel
    let plateauTint: Color
    /// **Rendre la fenêtre réglée à la SLIDE, tout de suite** : le canvas lit
    /// les fenêtres de la slide, pas celles de la frise. Sans ce rendu, « Entre
    /// ici » ne changeait rien à la scène avant la fermeture de la frise — le
    /// texte restait visible à une seconde où il n'existe pas encore.
    var onWindowEdited: () -> Void = {}

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            transport
            pistes
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 12)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 20, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerSceneFriseCopy.panel))
    }

    // MARK: - Transport

    private var transport: some View {
        HStack(spacing: 8) {
            Button {
                HapticFeedback.light()
                timeline.togglePlayback()
            } label: {
                Image(systemName: timeline.isPlaying ? "pause.fill" : "play.fill")
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(Color.black.opacity(0.9))
                    .frame(width: 36, height: 36)
                    .background(Circle().fill(Color.white))
                    .frame(width: 44, height: 44)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(timeline.isPlaying ? ComposerSceneFriseCopy.pause : ComposerSceneFriseCopy.play))

            Text(ComposerSceneFriseMetrics.timeLabel(current: timeline.currentTime, total: duree))
                .font(MeeshyFont.relative(12, weight: .bold).monospacedDigit())
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                .frame(maxWidth: .infinity, alignment: .leading)

            if let choisi = pisteChoisie, !timeline.isPlaying {
                jeton(ComposerSceneFriseCopy.entry) {
                    timeline.setClipEntry(id: choisi.id, to: timeline.currentTime)
                    onWindowEdited()
                }
                jeton(ComposerSceneFriseCopy.exit) {
                    timeline.setClipExit(id: choisi.id, to: timeline.currentTime)
                    onWindowEdited()
                }
            }
        }
    }

    private func jeton(_ titre: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(titre)
                .font(MeeshyFont.relative(12, weight: .semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                .padding(.horizontal, 12)
                .frame(height: 32)
                .adaptiveGlass(in: Capsule(), tint: plateauTint.opacity(0.55))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Règle, pistes, tête

    private var pistes: some View {
        VStack(alignment: .leading, spacing: 4) {
            regle
            if timeline.sceneFriseTracks.isEmpty {
                Text(ComposerSceneFriseCopy.empty)
                    .font(MeeshyFont.relative(12, weight: .regular))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true).opacity(0.7))
                    .padding(.vertical, 4)
            } else {
                ForEach(timeline.sceneFriseTracks) { piste in
                    ligne(piste)
                }
            }
        }
        .overlay(alignment: .topLeading) { tete }
    }

    private var regle: some View {
        GeometryReader { geo in
            Capsule()
                .fill(Color.white.opacity(0.12))
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0).onChanged { valeur in
                    timeline.scrub(to: temps(x: valeur.location.x, largeur: geo.size.width))
                })
        }
        .frame(height: 14)
        .padding(.leading, ComposerSceneFriseMetrics.labelLane)
        .accessibilityElement()
        .accessibilityLabel(Text(ComposerSceneFriseCopy.ruler))
        .accessibilityValue(Text(ComposerSceneFriseMetrics.timeLabel(current: timeline.currentTime, total: duree)))
        .accessibilityAdjustableAction { sens in
            let pas: Float = sens == .increment ? 0.5 : -0.5
            timeline.scrub(to: max(0, min(duree, timeline.currentTime + pas)))
        }
    }

    private func ligne(_ piste: SceneFriseTrack) -> some View {
        let choisie = piste.id == timeline.selection.selectedClipId
        return HStack(spacing: 8) {
            Text(ComposerSceneFriseCopy.label(for: piste))
                .font(MeeshyFont.relative(11, weight: .regular))
                .foregroundStyle(Color(hex: "D4D4D8"))
                .lineLimit(1)
                .truncationMode(.tail)
                .frame(width: ComposerSceneFriseMetrics.labelLane - 8, alignment: .leading)
            GeometryReader { geo in
                let debut = CGFloat(ComposerSceneFriseMetrics.fraction(piste.start, of: duree))
                let fin = CGFloat(ComposerSceneFriseMetrics.fraction(piste.end, of: duree))
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                        .fill(choisie ? MeeshyColors.brandPrimary : Color.white.opacity(0.35))
                        .frame(width: max(4, (fin - debut) * geo.size.width))
                        .offset(x: debut * geo.size.width)
                        .padding(.vertical, 3)
                }
                .contentShape(Rectangle())
                .onTapGesture(coordinateSpace: .local) { point in
                    HapticFeedback.light()
                    timeline.selectClip(id: piste.id)
                    timeline.scrub(to: temps(x: point.x, largeur: geo.size.width))
                }
            }
            .frame(height: 22)
        }
        .frame(minHeight: 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ComposerSceneFriseCopy.label(for: piste)))
        .accessibilityValue(Text(ComposerSceneFriseMetrics.windowLabel(piste)))
        .accessibilityAddTraits(choisie ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction {
            timeline.selectClip(id: piste.id)
        }
    }

    /// La tête AMBRE (`#fbbf24` de la maquette) court sur la règle et les
    /// pistes, sans jamais intercepter un toucher.
    private var tete: some View {
        GeometryReader { geo in
            let piste = geo.size.width - ComposerSceneFriseMetrics.labelLane
            Capsule()
                .fill(Color(hex: "FBBF24"))
                .frame(width: 2, height: geo.size.height)
                .offset(x: ComposerSceneFriseMetrics.labelLane
                        + CGFloat(ComposerSceneFriseMetrics.fraction(timeline.currentTime, of: duree)) * max(0, piste) - 1)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    // MARK: - Lecture du projet

    private var duree: Float { max(timeline.project.slideDuration, ClipWindowResolver.minimumDuration) }

    private var pisteChoisie: SceneFriseTrack? {
        guard let id = timeline.selection.selectedClipId else { return nil }
        return timeline.sceneFriseTracks.first { $0.id == id }
    }

    private func temps(x: CGFloat, largeur: CGFloat) -> Float {
        guard largeur > 0 else { return 0 }
        return Float(max(0, min(1, x / largeur))) * duree
    }
}

nonisolated enum ComposerSceneFriseMetrics {
    /// La colonne des NOMS de piste — 72 pt de la maquette (64 de texte + 8
    /// d'écart) ; la règle et la tête s'alignent sur elle.
    static let labelLane: CGFloat = 72

    static func fraction(_ seconds: Float, of total: Float) -> Float {
        guard total > 0, seconds.isFinite else { return 0 }
        return max(0, min(1, seconds / total))
    }

    /// « 1.2 s / 6 s » — la maquette écrit la seconde courante au dixième, la
    /// durée entière quand elle l'est.
    static func timeLabel(current: Float, total: Float) -> String {
        "\(String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), Double(current))) s / \(seconds(total)) s"
    }

    static func windowLabel(_ piste: SceneFriseTrack) -> String {
        "\(seconds(piste.start)) s – \(seconds(piste.end)) s"
    }

    private static func seconds(_ value: Float) -> String {
        let arrondi = (Double(value) * 10).rounded() / 10
        return arrondi == arrondi.rounded()
            ? String(Int(arrondi))
            : String(format: "%.1f", locale: Locale(identifier: "en_US_POSIX"), arrondi)
    }
}

nonisolated enum ComposerSceneFriseCopy {
    static var panel: String { String(localized: "composer.frise.panel", defaultValue: "Plan temps", bundle: .main) }
    static var play: String { String(localized: "composer.frise.play", defaultValue: "Lire", bundle: .main) }
    static var pause: String { String(localized: "composer.frise.pause", defaultValue: "Pause", bundle: .main) }
    static var entry: String { String(localized: "composer.frise.entry", defaultValue: "Entre ici", bundle: .main) }
    static var exit: String { String(localized: "composer.frise.exit", defaultValue: "Sort ici", bundle: .main) }
    static var ruler: String {
        String(localized: "composer.frise.ruler", defaultValue: "Déplacer la tête de lecture", bundle: .main)
    }
    static var empty: String {
        String(localized: "composer.frise.empty",
               defaultValue: "Posez un texte ou un sticker : chaque objet devient une piste.", bundle: .main)
    }
    static var media: String { String(localized: "composer.frise.media", defaultValue: "Média", bundle: .main) }
    static var video: String { String(localized: "composer.frise.video", defaultValue: "Vidéo", bundle: .main) }
    static var sound: String { String(localized: "composer.frise.sound", defaultValue: "Son", bundle: .main) }
    static var place: String { String(localized: "composer.frise.place", defaultValue: "Lieu", bundle: .main) }
    static var timeButton: String { String(localized: "composer.frise.time", defaultValue: "Temps", bundle: .main) }

    static func label(for piste: SceneFriseTrack) -> String {
        let nom = piste.label.trimmingCharacters(in: .whitespacesAndNewlines)
        if !nom.isEmpty { return nom }
        switch piste.kind {
        case .image, .text, .sticker: return media
        case .video: return video
        case .audio: return sound
        case .place: return place
        }
    }
}
