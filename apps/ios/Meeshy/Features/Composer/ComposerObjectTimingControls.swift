import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - La fenêtre de temps et le plan 2D d'un objet
//
// Extraits de `ComposerObjectEditorView.swift` pour #9138 : ils servent l'éditeur
// d'objet ET le panneau qui s'ouvre à droite de la scène, depuis le haut. Deux
// copies divergeraient au premier réglage — la faute que le composer a déjà
// payée sur les légendes.

/// **La fenêtre se règle en DÉBUT et FIN** — ce que l'auteur voit — et se
/// range en début + durée, ce que le modèle stocke. `ComposerObjectTiming`
/// tient la conversion, et surtout le `nil` de « permanent », qu'une paire de
/// glissières nues perdrait au premier réglage.
struct ComposerObjectTimingControls: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let objectId: String

    var body: some View {
        let timing = ComposerObjectTimingStore.timing(viewModel: viewModel, objectId: objectId)
        let slideDuration = ComposerObjectTimingStore.slideDuration(viewModel)
        VStack(alignment: .leading, spacing: MeeshySpacing.smPlus) {
            // La diapo D'ABORD (#14257, iso Android #14255) : sa durée, sa règle
            // et la barre de l'objet — une scène sans média se lit quand même.
            ComposerObjectTimingStripView(timing: timing, slideDuration: slideDuration)

            Text(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .medium))
                .foregroundStyle(.white.opacity(0.75))
                .accessibilityLabel(ComposerObjectEditorCopy.window(timing, slideDuration: slideDuration))

            slider(titre: ComposerObjectEditorCopy.start,
                   valeur: Binding(get: { timing.start }, set: { nouvelle in
                       apply(timing.moved(to: nouvelle, slideDuration: slideDuration))
                   }),
                   borne: slideDuration)

            if let fin = timing.end {
                slider(titre: ComposerObjectEditorCopy.end,
                       valeur: Binding(get: { fin }, set: { nouvelle in
                           apply(timing.trimmingEnd(to: nouvelle, slideDuration: slideDuration))
                       }),
                       borne: slideDuration)
            }

            // **Le retour vers « permanent » est un CHEMIN, pas un défaut.**
            // Sans lui, régler une fin serait irréversible : l'interface
            // offrirait un aller sans retour, et l'auteur devrait supprimer
            // l'objet pour le refaire.
            Toggle(isOn: Binding(
                get: { timing.isPermanent },
                set: { permanent in
                    apply(permanent
                          ? timing.madePermanent
                          : timing.trimmingEnd(to: slideDuration, slideDuration: slideDuration))
                }
            )) {
                Text(ComposerObjectEditorCopy.permanent)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .regular))
                    .foregroundStyle(.white.opacity(0.85))
            }
            .tint(MeeshyColors.brandPrimary)
        }
    }

    private func slider(titre: String, valeur: Binding<Double>, borne: Double) -> some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack {
                Text(titre)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text(ComposerObjectEditorCopy.seconds(valeur.wrappedValue))
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.75))
            }
            Slider(value: valeur, in: 0...borne)
                .tint(MeeshyColors.brandPrimary)
                .accessibilityLabel(titre)
                .accessibilityValue(ComposerObjectEditorCopy.seconds(valeur.wrappedValue))
        }
    }

    private func apply(_ nouveau: ComposerObjectTiming) {
        ComposerObjectTimingStore.apply(nouveau, viewModel: viewModel, objectId: objectId)
    }
}

/// **La vision dans le plan** — l'objet parmi les autres, sur l'axe du temps.
/// C'est `Plan2DView` du SDK, monté tel quel : en écrire une version simplifiée
/// ici perdrait les poignées de bord, le verrou des fonds et le signal de
/// blocage du scroll, que l'atelier a déjà.
struct ComposerObjectPlanControls: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let objectId: String
    /// **Taper une autre piste ouvre CET objet-là** : le plan montre toute la
    /// slide, et le seul geste qu'on attend d'une barre voisine est « celle-ci
    /// maintenant ». Sans ce branchement, le tap serait un contrôle inerte.
    /// Toute famille posée s'y désigne (#9144) ; une piste synthétique (le
    /// fond image de l'atelier) n'est pas un objet de la slide et ne mène nulle
    /// part.
    let onSelectObject: (String) -> Void
    /// **Le plan TIENT le geste, donc le scroller doit lâcher.** L'hôte le lit
    /// pour figer son défilement pendant qu'une barre se rogne.
    @Binding var holdsGesture: Bool

    @State private var zoom: Plan2DZoom = .fit
    @State private var moveOrigin: Double?

    var body: some View {
        let slideDuration = ComposerObjectTimingStore.slideDuration(viewModel)
        GeometryReader { geo in
            Plan2DView(
                tracks: Plan2DLayout.tracks(from: viewModel.currentEffects,
                                            slideDuration: slideDuration),
                zoom: zoom,
                laneWidth: max(120, geo.size.width),
                slideDuration: slideDuration,
                isDark: true,
                selectedTrackId: objectId,
                onSelectTrack: { id in
                    guard id != objectId, viewModel.currentSlide.sceneObject(id: id) != nil else { return }
                    onSelectObject(id)
                },
                // Les keyframes s'éditent à l'Inspecteur de l'atelier, que ce
                // meuble ne monte pas (#4082) : DÉSIGNER un keyframe ici
                // n'ouvrirait rien. Le rappel reste vide et le dit — un geste
                // armé sans destination est un contrôle qui ment.
                onSelectKeyframe: { _ in },
                // Même raison : l'index rendu est absolu dans `tracks`, tous
                // plans confondus, et le traduire en mutation de plan/z est
                // exactement ce que `Plan2DView` laisse à l'appelant.
                onReorder: { _, _ in },
                onTrimStart: { id, delta in
                    guard id == objectId else { return }
                    let timing = currentTiming
                    apply(timing.trimmingStart(to: timing.start + delta))
                },
                onTrimEnd: { id, delta in
                    guard id == objectId else { return }
                    let timing = currentTiming
                    apply(timing.trimmingEnd(to: (timing.end ?? slideDuration) + delta,
                                             slideDuration: slideDuration))
                },
                onMove: { id, cumule in
                    guard id == objectId else { return }
                    // Le déplacement est CUMULÉ depuis le début du geste :
                    // l'origine se capture au premier appel, sans quoi les
                    // deltas s'additionneraient en boule de neige.
                    let origine = moveOrigin ?? currentTiming.start
                    if moveOrigin == nil { moveOrigin = origine }
                    apply(currentTiming.moved(to: origine + cumule, slideDuration: slideDuration))
                },
                onMoveEnded: { _ in moveOrigin = nil },
                onScrollLockChanged: { tenu in holdsGesture = tenu }
            )
        }
        .frame(height: 120)
    }

    private var currentTiming: ComposerObjectTiming {
        ComposerObjectTimingStore.timing(viewModel: viewModel, objectId: objectId)
    }

    private func apply(_ nouveau: ComposerObjectTiming) {
        ComposerObjectTimingStore.apply(nouveau, viewModel: viewModel, objectId: objectId)
    }
}

/// **La fenêtre se LIT du modèle à chaque rendu et s'y RANGE** — jamais
/// recopiée dans un état de vue, qui divergerait de ce que le plan 2D dessine.
@MainActor
enum ComposerObjectTimingStore {

    /// **Générique depuis #4937** : `MeeshySceneObject` expose `startTime` et
    /// `duration` pour les cinq familles, en uniformisant le `Float?` de
    /// l'audio. Lire le seul texte aurait rendu la fenêtre d'un sticker
    /// « permanente » quelle que soit sa vraie valeur.
    static func timing(viewModel: StoryComposerViewModel, objectId: String) -> ComposerObjectTiming {
        let objet = viewModel.currentSlide.sceneObject(id: objectId)
        return ComposerObjectTiming.timing(start: objet?.startTime, duration: objet?.duration)
    }

    static func slideDuration(_ viewModel: StoryComposerViewModel) -> Double {
        max(1, viewModel.currentSlide.duration)
    }

    /// **Elle passe par le VERBE du viewModel** (#9144), seul site qui sait
    /// écrire dans `currentEffects` — son setter est privé au SDK, et c'est une
    /// bonne clôture : une vue qui reconstruirait le tableau d'effets pour
    /// changer un champ écraserait tout ce qu'un autre chemin y aurait posé
    /// entre-temps. Le verbe sert les cinq familles ; le binding du texte, qui
    /// était le seul chemin, réservait la fenêtre et le plan au texte.
    static func apply(_ nouveau: ComposerObjectTiming, viewModel: StoryComposerViewModel, objectId: String) {
        viewModel.setSceneObjectTiming(id: objectId,
                                       startTime: nouveau.storedStartTime,
                                       duration: nouveau.storedDuration)
    }
}

/// **La diapo, lue d'un coup d'œil** (#14257) : sa durée, la règle graduée de
/// la frise et la barre de l'objet, de son entrée à sa sortie. Les glissières
/// dessous la règlent ; elle se redessine depuis le même `ComposerObjectTiming`.
nonisolated enum ComposerObjectTimingStrip {
    /// La barre en fractions de la diapo, 0 au début et 1 à la fin.
    struct Bar: Equatable {
        let start: Double
        let end: Double
    }

    static func bar(_ timing: ComposerObjectTiming, slideDuration: Double) -> Bar {
        guard slideDuration > 0, slideDuration.isFinite else { return Bar(start: 0, end: 1) }
        let debut = min(max(timing.start / slideDuration, 0), 1)
        let fin = min(max((timing.end ?? slideDuration) / slideDuration, debut), 1)
        return Bar(start: debut, end: fin)
    }

    static func durationLabel(_ slideDuration: Double, locale: Locale = .current) -> String {
        ComposerObjectChips.timecode(slideDuration, locale: locale)
    }

    static func ruler(slideDuration: Double, width: CGFloat) -> [ComposerSceneFriseRuler.Tick] {
        ComposerSceneFriseRuler.ticks(duration: Float(slideDuration), width: width)
    }
}

struct ComposerObjectTimingStripView: View {
    let timing: ComposerObjectTiming
    let slideDuration: Double

    var body: some View {
        let barre = ComposerObjectTimingStrip.bar(timing, slideDuration: slideDuration)
        let duree = ComposerObjectTimingStrip.durationLabel(slideDuration)
        VStack(alignment: .leading, spacing: MeeshySpacing.xxs) {
            HStack {
                Text(ComposerAnchoredSheetCopy.duration)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                    .foregroundStyle(.white.opacity(0.55))
                Spacer()
                Text(duree)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .medium).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.85))
            }
            GeometryReader { geo in
                let graduations = ComposerObjectTimingStrip.ruler(slideDuration: slideDuration, width: geo.size.width)
                Canvas { contexte, taille in
                    ComposerSceneFriseRuler.draw(graduations, in: .whole(Float(slideDuration)),
                                                 context: contexte, size: taille)
                }
            }
            .frame(height: ComposerSceneFriseRuler.height)
            GeometryReader { geo in
                let largeur = geo.size.width
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(Color.white.opacity(0.08))
                    RoundedRectangle(cornerRadius: MeeshyRadius.sm)
                        .fill(MeeshyColors.brandPrimary)
                        .frame(width: max(4, CGFloat(barre.end - barre.start) * largeur))
                        .offset(x: CGFloat(barre.start) * largeur)
                }
            }
            .frame(height: 24)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ComposerAnchoredSheetCopy.duration)
        .accessibilityValue(duree)
        .accessibilityIdentifier("composer.timing.strip")
    }
}
