import SwiftUI
import AVFoundation
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
    /// **Dupliquer depuis la frise** (#14215) : l'hôte passe par la duplication
    /// de la SCÈNE — un pas d'annulation, la copie sélectionnée —, puis
    /// recharge les pistes. `nil` ⇒ le jeton n'est pas servi.
    var onDuplicate: ((String) -> Void)?
    /// **Le mode plein écran** (#17110, planche S9) : posé, la frise porte
    /// « Quitter · Valider » au lieu de son bouton Agrandir.
    var fullScreen: ComposerSceneFriseFullScreen?

    /// La frise agrandie, et le repère d'annulation pris à son ouverture.
    @State private var pleinEcran = false
    @State private var repereDOuverture: TimelineUndoMark?

    /// **La fenêtre qu'un doigt est en train de régler** — l'aperçu du geste,
    /// jamais le projet : le projet ne reçoit la fenêtre qu'au lâcher, en UNE
    /// entrée d'annulation (un réglage par image en empilerait soixante).
    @State private var enCours: (id: String, fenetre: ComposerSceneFriseMetrics.Window, accroche: Float?)?

    /// La tête qu'un doigt promène sur la règle : seek tolérant pendant le
    /// geste, précis au lâcher (`beginScrub` / `endScrub`), sinon chaque image
    /// demande un seek exact et la vidéo se fige.
    @State private var regleTenue: Float?

    /// **La portion du temps que la frise montre** (#14213) : `nil`, la slide
    /// entière ; le pincement la resserre, le glissé du fond la fait défiler.
    @State private var vue: ComposerSceneFriseViewport?
    /// La fenêtre au début du pincement ou du défilement en cours.
    @State private var vueDuGeste: ComposerSceneFriseViewport?

    /// La direction de l'INTERFACE, rendue aux noms de piste : l'axe du temps,
    /// lui, reste de gauche à droite dans toutes les langues (#14212).
    @Environment(\.layoutDirection) private var interfaceDirection

    var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xsPlus) {
            if let fullScreen { enTetePleinEcran(fullScreen) }
            transport
            pistes
            if vue == nil, !timeline.sceneFriseTracks.isEmpty { invitePincer }
            if fullScreen != nil { Spacer(minLength: 0) }
        }
        .fullScreenCover(isPresented: $pleinEcran) { friseAgrandie }
        .adaptiveOnChange(of: timeline.isPlaying) { _, _ in
            guard vue != nil else { return }
            vue = visible.showing(timeline.currentTime, duration: duree)
        }
        .padding(.vertical, MeeshySpacing.smPlus)
        .padding(.horizontal, MeeshySpacing.md)
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous),
                       tint: plateauTint.opacity(0.55))
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerSceneFriseCopy.panel))
    }

    // MARK: - Transport

    private var transport: some View {
        HStack(spacing: MeeshySpacing.sm) {
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

            // Seul ce libellé lit la tête (#9874) : le reste de la frise ne
            // se réévalue plus à chaque tick du moteur.
            PlayheadTimeReader(clock: timeline.playhead) { maintenant in
                Text(ComposerSceneFriseMetrics.timeLabel(current: maintenant, total: duree))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold).monospacedDigit())
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if fullScreen == nil {
                glyphe("arrow.up.left.and.arrow.down.right", libelle: ComposerTimeCopy.expand) {
                    HapticFeedback.light()
                    repereDOuverture = TimelineUndoMark.taken(on: timeline)
                    pleinEcran = true
                }
            }

            // Choisir une piste pendant la lecture est permis (retour porteur
            // 2026-09-28) : les jetons suivent la sélection, pas le transport.
            if let choisi = pisteChoisie {
                jeton(ComposerSceneFriseCopy.entry) {
                    timeline.setClipEntry(id: choisi.id, to: timeline.currentTime)
                    onWindowEdited()
                }
                jeton(ComposerSceneFriseCopy.exit) {
                    timeline.setClipExit(id: choisi.id, to: timeline.currentTime)
                    onWindowEdited()
                }
                couper(choisi)
                if let onDuplicate, ComposerSceneFriseMetrics.canDuplicate(choisi) {
                    glyphe("plus.square.on.square", libelle: ComposerSelectionCopy.label(.duplicate)) {
                        HapticFeedback.light()
                        onDuplicate(choisi.id)
                    }
                }
                if ComposerSceneFriseMetrics.canRemove(choisi) { retirer(choisi) }
            }
        }
    }

    /// **« Couper » à la tête** (#14215) : la piste devient deux objets qui se
    /// suivent, en un pas d'annulation. Servi seulement quand la tête est DANS
    /// la fenêtre ; la tête se lit à chaque tick, seul ce jeton se réévalue.
    private func couper(_ piste: SceneFriseTrack) -> some View {
        PlayheadTimeReader(clock: timeline.playhead) { maintenant in
            if ComposerSceneFriseMetrics.canSplit(piste, at: maintenant) {
                jeton(ComposerSceneFriseCopy.split) {
                    timeline.splitSelectedAtPlayhead()
                    onWindowEdited()
                }
            }
        }
    }

    /// **Retirer depuis la frise** (#14215) : l'objet quitte la scène en un
    /// pas d'annulation, sans quitter la frise.
    private func retirer(_ piste: SceneFriseTrack) -> some View {
        glyphe("trash", libelle: ComposerSelectionCopy.label(.remove)) {
            HapticFeedback.medium()
            timeline.deleteClip(id: piste.id)
            onWindowEdited()
        }
    }

    private func glyphe(_ symbole: String, libelle: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbole)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                .frame(width: 32, height: 32)
                .adaptiveGlass(in: Circle(), tint: plateauTint.opacity(0.55))
                .frame(width: 44, height: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(libelle))
    }

    private func jeton(_ titre: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Text(titre)
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
                .padding(.horizontal, MeeshySpacing.md)
                .frame(height: 32)
                .adaptiveGlass(in: Capsule(), tint: plateauTint.opacity(0.55))
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Règle, pistes, tête

    private var pistes: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.xs) {
            regle
            if timeline.sceneFriseTracks.isEmpty {
                Text(ComposerSceneFriseCopy.empty)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .regular))
                    .foregroundStyle(MeeshyColors.textPrimary(isDark: true).opacity(0.7))
                    .padding(.vertical, MeeshySpacing.xs)
            } else {
                ForEach(timeline.sceneFriseTracks) { piste in
                    ligne(piste)
                }
            }
        }
        .overlay(alignment: .topLeading) { tete }
        .simultaneousGesture(pincer)
        .accessibilityZoomAction { action in
            vue = visible.zoomed(by: action.direction == .zoomIn ? 2 : 0.5,
                                 around: timeline.currentTime, duration: duree)
        }
        .environment(\.layoutDirection, .leftToRight)
    }

    /// **Pincer zoome autour de la tête** (#14213), comme un éditeur vidéo :
    /// l'instant lu garde sa place sous le doigt pendant que l'échelle change.
    private var pincer: some Gesture {
        MagnificationGesture()
            .onChanged { echelle in
                let depart = vueDuGeste ?? visible
                if vueDuGeste == nil { vueDuGeste = depart }
                vue = depart.zoomed(by: Float(echelle), around: timeline.currentTime, duration: duree)
            }
            .onEnded { _ in
                vueDuGeste = nil
                if let fin = vue, fin.span >= duree { vue = nil }
            }
    }

    /// **Glisser le fond d'une piste fait défiler** la frise zoomée.
    private func defiler(largeur: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 8)
            .onChanged { valeur in
                guard vue != nil, largeur > 0 else { return }
                let depart = vueDuGeste ?? visible
                if vueDuGeste == nil { vueDuGeste = depart }
                vue = depart.panned(by: Float(valeur.translation.width / largeur), duration: duree)
            }
            .onEnded { _ in vueDuGeste = nil }
    }

    /// **La règle se gradue** (#14211) : des graduations au pas lisible, leur
    /// temps écrit au-dessus, dessinées en UN `Canvas` — une scène de deux
    /// heures n'y monte pas plus de vues qu'une scène de six secondes.
    private var regle: some View {
        PlayheadTimeReader(clock: timeline.playhead) { maintenant in
            GeometryReader { geo in
                let graduations = ComposerSceneFriseRuler.ticks(in: visible, width: geo.size.width)
                Canvas { contexte, taille in
                    dessiner(graduations, dans: contexte, taille: taille)
                }
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 0)
                    .onChanged { valeur in
                        promener(vers: temps(x: valeur.location.x, largeur: geo.size.width), largeur: geo.size.width)
                    }
                    .onEnded { _ in
                        regleTenue = nil
                        timeline.endScrub()
                    })
            }
            .frame(height: ComposerSceneFriseRuler.height)
            .padding(.leading, ComposerSceneFriseMetrics.labelLane)
            .accessibilityElement()
            .accessibilityLabel(Text(ComposerSceneFriseCopy.ruler))
            .accessibilityValue(Text(ComposerSceneFriseMetrics.timeLabel(current: maintenant, total: duree)))
            .accessibilityAdjustableAction { sens in
                let pas: Float = sens == .increment ? 0.5 : -0.5
                timeline.scrub(to: max(0, min(duree, timeline.currentTime + pas)))
            }
        }
    }

    private func dessiner(_ graduations: [ComposerSceneFriseRuler.Tick],
                          dans contexte: GraphicsContext, taille: CGSize) {
        let couleur = Color.white
        ComposerSceneFriseRuler.draw(graduations, in: visible, context: contexte, size: taille)
        guard vue != nil, duree > 0 else { return }
        let ascenseur = CGRect(x: CGFloat(visible.start / duree) * taille.width, y: taille.height - 1.5,
                               width: max(6, CGFloat(visible.span / duree) * taille.width), height: 1.5)
        contexte.fill(Path(roundedRect: ascenseur, cornerRadius: ascenseur.height / 2), with: .color(couleur.opacity(0.8)))
    }

    private func promener(vers secondes: Float, largeur: CGFloat) {
        if let depart = regleTenue {
            let pas = ComposerSceneFriseRuler.majorStep(duration: visible.span, width: largeur)
            if ComposerSceneFriseRuler.crossesMajor(from: depart, to: secondes, step: pas) {
                HapticFeedback.light()
            }
        } else {
            timeline.beginScrub()
        }
        regleTenue = secondes
        timeline.scrub(to: secondes)
    }

    /// **Une piste se règle à la main** (retour porteur 2026-09-28) : la
    /// toucher choisit l'objet et y pose la tête ; glisser sa barre la DÉPLACE
    /// dans le temps ; tirer ses poignées de début et de fin allonge ou
    /// raccourcit son apparition. Tout marche aussi pendant la lecture.
    private func ligne(_ piste: SceneFriseTrack) -> some View {
        let choisie = piste.id == timeline.selection.selectedClipId
        let fenetre = enCours?.id == piste.id
            ? enCours!.fenetre
            : ComposerSceneFriseMetrics.Window(start: piste.start, end: piste.end)
        return HStack(spacing: MeeshySpacing.sm) {
            nomDePiste(piste)
            GeometryReader { geo in
                let largeur = geo.size.width
                let debut = CGFloat(visible.fraction(fenetre.start)) * largeur
                let fin = CGFloat(visible.fraction(fenetre.end)) * largeur
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxs, style: .continuous)
                        .fill(Color.white.opacity(0.07))
                        .contentShape(Rectangle())
                        .onTapGesture(coordinateSpace: .local) { point in
                            choisir(piste, a: temps(x: point.x, largeur: largeur))
                        }
                        .gesture(defiler(largeur: largeur))
                    barre(piste, choisie: choisie, largeur: max(4, fin - debut))
                        .padding(.vertical, MeeshySpacing.xs)
                        .contentShape(Rectangle())
                        .offset(x: debut)
                        .onTapGesture(coordinateSpace: .local) { point in
                            choisir(piste, a: temps(x: debut + point.x, largeur: largeur))
                        }
                        .gesture(glisser(piste, prise: .move, largeur: largeur))
                    if choisie {
                        poignee(piste, prise: .start, largeur: largeur).offset(x: debut - ComposerSceneFriseMetrics.handleHit / 2)
                        poignee(piste, prise: .end, largeur: largeur).offset(x: fin - ComposerSceneFriseMetrics.handleHit / 2)
                    }
                }
                .overlay(alignment: .topLeading) { etiquetteDAccroche(piste, largeur: largeur) }
            }
            .frame(height: ComposerSceneFriseMetrics.trackHeight)
            .clipped()
        }
        .frame(minHeight: ComposerSceneFriseMetrics.trackHeight + 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(ComposerSceneFriseCopy.label(for: piste)))
        .accessibilityValue(Text(ComposerSceneFriseMetrics.windowLabel(piste)))
        .accessibilityAddTraits(choisie ? [.isButton, .isSelected] : .isButton)
        .accessibilityAction {
            timeline.selectClip(id: piste.id)
        }
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.later)) {
            deplacer(piste, de: ComposerSceneFriseMetrics.accessibilityStep)
        }
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.earlier)) {
            deplacer(piste, de: -ComposerSceneFriseMetrics.accessibilityStep)
        }
        // **L'entrée et la sortie se règlent aussi sans les poignées** (#14216) :
        // une poignée ne se saisit pas au VoiceOver, ses quatre pas si.
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.entryEarlier)) {
            deplacer(piste, prise: .start, de: -ComposerSceneFriseMetrics.accessibilityStep)
        }
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.entryLater)) {
            deplacer(piste, prise: .start, de: ComposerSceneFriseMetrics.accessibilityStep)
        }
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.exitEarlier)) {
            deplacer(piste, prise: .end, de: -ComposerSceneFriseMetrics.accessibilityStep)
        }
        .accessibilityAction(named: Text(ComposerSceneFriseCopy.exitLater)) {
            deplacer(piste, prise: .end, de: ComposerSceneFriseMetrics.accessibilityStep)
        }
    }

    /// **Le couloir d'icône et le nom** de la piste (planche S8), dans la
    /// direction de l'interface.
    private func nomDePiste(_ piste: SceneFriseTrack) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: ComposerSceneFriseMetrics.familySymbol(kind: piste.kind))
                .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                .foregroundStyle(ComposerSceneFriseMetrics.familyColor(kind: piste.kind))
                .frame(width: 16)
                .accessibilityHidden(true)
            Text(ComposerSceneFriseCopy.label(for: piste))
                .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                .foregroundStyle(MeeshyColors.textSecondary(isDark: true))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .frame(width: ComposerSceneFriseMetrics.labelLane - 8, alignment: .leading)
        .environment(\.layoutDirection, interfaceDirection)
    }

    /// **La barre et son VRAI contenu**, à la couleur de sa famille ; choisie,
    /// elle s'opacifie et se cerne de blanc.
    private func barre(_ piste: SceneFriseTrack, choisie: Bool, largeur: CGFloat) -> some View {
        let forme = RoundedRectangle(cornerRadius: MeeshyRadius.xs, style: .continuous)
        return forme
            .fill(ComposerSceneFriseMetrics.familyColor(kind: piste.kind).opacity(choisie ? 0.95 : 0.6))
            .frame(width: largeur)
            .overlay {
                ComposerSceneFriseBarContent(kind: piste.kind,
                                             url: timeline.loadedURL(for: piste.id),
                                             publishedSamples: ondePubliee(piste),
                                             window: SceneFriseSourceWindow.of(piste.id, in: timeline),
                                             caption: ComposerSceneFriseCopy.label(for: piste))
                    .clipShape(forme)
            }
            .overlay { forme.strokeBorder(Color.white.opacity(choisie ? 0.95 : 0), lineWidth: 2) }
    }

    /// La poignée : un trait blanc de 4 pt dans une cible de 24 × 30 — assez
    /// pour le pouce sans recouvrir une barre courte.
    private func poignee(_ piste: SceneFriseTrack,
                         prise: ComposerSceneFriseMetrics.Grip,
                         largeur: CGFloat) -> some View {
        Capsule()
            .fill(Color.white)
            .frame(width: 4, height: ComposerSceneFriseMetrics.trackHeight * 0.6)
            .frame(width: ComposerSceneFriseMetrics.handleHit, height: ComposerSceneFriseMetrics.trackHeight)
            .contentShape(Rectangle())
            .gesture(glisser(piste, prise: prise, largeur: largeur))
            .accessibilityHidden(true)
    }

    /// **Le bord qui bouge s'aimante** (#14210) sur la tête, les bords de la
    /// slide et ceux des autres pistes ; le doigt sent l'accroche UNE fois, au
    /// passage « libre → accroché », jamais à chaque image.
    private func glisser(_ piste: SceneFriseTrack,
                         prise: ComposerSceneFriseMetrics.Grip,
                         largeur: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { valeur in
                if enCours == nil {
                    HapticFeedback.light()
                    timeline.selectClip(id: piste.id)
                }
                let delta = largeur > 0 ? Float(valeur.translation.width / largeur) * visible.span : 0
                let geste = ComposerSceneFriseMetrics.dragged(
                    ComposerSceneFriseMetrics.Window(start: piste.start, end: piste.end),
                    grip: prise, by: delta, duration: duree,
                    snapping: ComposerSceneFriseMetrics.snapCandidates(
                        tracks: timeline.sceneFriseTracks, excluding: piste.id,
                        playhead: timeline.currentTime, duration: duree),
                    tolerance: ComposerSceneFriseMetrics.snapTolerance(duration: visible.span, width: largeur))
                if geste.isSnapped, enCours?.accroche == nil { HapticFeedback.light() }
                enCours = (piste.id, geste.window, geste.snappedTime)
            }
            .onEnded { _ in
                guard let fini = enCours, fini.id == piste.id else { return }
                enCours = nil
                appliquer(fini.fenetre, a: piste, prise: prise)
            }
    }

    private func appliquer(_ fenetre: ComposerSceneFriseMetrics.Window,
                           a piste: SceneFriseTrack,
                           prise: ComposerSceneFriseMetrics.Grip) {
        switch prise {
        case .move:  timeline.setClipStart(id: piste.id, to: fenetre.start)
        case .start: timeline.setClipEntry(id: piste.id, to: fenetre.start)
        case .end:   timeline.setClipExit(id: piste.id, to: fenetre.end)
        }
        onWindowEdited()
    }

    private func deplacer(_ piste: SceneFriseTrack,
                          prise: ComposerSceneFriseMetrics.Grip = .move,
                          de delta: Float) {
        let fenetre = ComposerSceneFriseMetrics.dragged(
            ComposerSceneFriseMetrics.Window(start: piste.start, end: piste.end),
            grip: prise, by: delta, duration: duree)
        appliquer(fenetre, a: piste, prise: prise)
        UIAccessibility.post(notification: .announcement,
                             argument: ComposerSceneFriseMetrics.windowLabel(
                                SceneFriseTrack(id: piste.id, kind: piste.kind, label: piste.label,
                                                start: fenetre.start, end: fenetre.end)))
    }

    private func choisir(_ piste: SceneFriseTrack, a secondes: Float) {
        HapticFeedback.light()
        timeline.selectClip(id: piste.id)
        timeline.scrub(to: secondes)
    }

    /// **La tête BLANCHE et son bouton** (planches S8, S9) court sur la règle et
    /// les pistes, sans jamais intercepter un toucher. Seule elle lit l'horloge :
    /// elle suit la lecture image par image sans réévaluer les pistes.
    private var tete: some View {
        PlayheadTimeReader(clock: timeline.playhead) { maintenant in
            GeometryReader { geo in
                let piste = geo.size.width - ComposerSceneFriseMetrics.labelLane
                let place = visible.fraction(maintenant)
                VStack(spacing: 0) {
                    Circle().fill(Color.white).frame(width: 11, height: 11)
                    Capsule().fill(Color.white).frame(width: 2)
                }
                .frame(width: 11, height: geo.size.height)
                .shadow(color: .black.opacity(0.45), radius: 1.5)
                .offset(x: ComposerSceneFriseMetrics.labelLane + CGFloat(place) * max(0, piste) - 5.5)
                .opacity(place >= 0 && place <= 1 ? 1 : 0)
            }
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    // MARK: - Premium : accroche, invite, plein écran (#17110)

    /// « aimanté · 9,0 s », posé sur le bord qui s'accroche pendant le geste.
    @ViewBuilder
    private func etiquetteDAccroche(_ piste: SceneFriseTrack, largeur: CGFloat) -> some View {
        if let geste = enCours, geste.id == piste.id, let accroche = geste.accroche {
            Text(ComposerSceneFriseMetrics.snapLabel(accroche))
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .bold).monospacedDigit())
                .foregroundStyle(Color.black)
                .padding(.horizontal, MeeshySpacing.xs)
                .background(Capsule().fill(Color.white))
                .fixedSize()
                .offset(x: min(max(0, CGFloat(visible.fraction(accroche)) * largeur - 30), max(0, largeur - 60)))
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    private var invitePincer: some View {
        Label(ComposerTimeCopy.pinchHint, systemImage: "arrow.left.and.right")
            .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .medium))
            .foregroundStyle(MeeshyColors.textSecondary(isDark: true))
            .frame(maxWidth: .infinity, alignment: .trailing)
            .accessibilityHidden(true)
    }

    private func enTetePleinEcran(_ actions: ComposerSceneFriseFullScreen) -> some View {
        HStack {
            jeton(ComposerTimeCopy.quit, action: actions.onQuit)
            Spacer(minLength: 0)
            Text(ComposerSceneFriseCopy.panel)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: true))
            Spacer(minLength: 0)
            Button(action: actions.onValidate) {
                Text(ComposerTimeCopy.validate)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold))
                    .foregroundStyle(Color.black)
                    .padding(.horizontal, MeeshySpacing.md)
                    .frame(height: 32)
                    .background(Capsule().fill(Color.white))
                    .frame(minHeight: 44)
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }

    /// La MÊME frise, sur tout l'écran : « Quitter » défait ce qu'elle a
    /// réglé depuis l'ouverture (`TimelineUndoMark.rewind`), « Valider » le garde.
    private var friseAgrandie: some View {
        ComposerSceneFrise(timeline: timeline, plateauTint: plateauTint, onWindowEdited: onWindowEdited,
                           onDuplicate: onDuplicate,
                           fullScreen: ComposerSceneFriseFullScreen(
                            onQuit: {
                                HapticFeedback.light()
                                repereDOuverture?.rewind(timeline)
                                onWindowEdited()
                                pleinEcran = false
                            },
                            onValidate: {
                                HapticFeedback.light()
                                onWindowEdited()
                                pleinEcran = false
                            }))
            .padding(MeeshySpacing.md)
            .background(Color.black.ignoresSafeArea())
    }

    // MARK: - Lecture du projet

    private var duree: Float { max(timeline.project.slideDuration, ClipWindowResolver.minimumDuration) }

    /// La forme d'onde publiée d'un son — le repli d'un brouillon rouvert.
    private func ondePubliee(_ piste: SceneFriseTrack) -> [Float] {
        guard piste.kind == .audio else { return [] }
        return timeline.project.audioPlayerObjects.first { $0.id == piste.id }?.waveformSamples ?? []
    }

    /// La fenêtre montrée, toujours ramenée dans la slide courante.
    private var visible: ComposerSceneFriseViewport {
        (vue ?? .whole(duree)).clamped(to: duree)
    }

    private var pisteChoisie: SceneFriseTrack? {
        guard let id = timeline.selection.selectedClipId else { return nil }
        return timeline.sceneFriseTracks.first { $0.id == id }
    }

    private func temps(x: CGFloat, largeur: CGFloat) -> Float {
        guard largeur > 0 else { return 0 }
        return visible.time(atFraction: Float(x / largeur))
    }
}

nonisolated enum ComposerSceneFriseMetrics {
    struct Window: Equatable {
        let start: Float
        let end: Float
    }

    /// Ce que le doigt tient : la barre entière, ou l'une de ses poignées.
    enum Grip: Equatable { case move, start, end }

    /// La cible d'une poignée, en largeur.
    static let handleHit: CGFloat = 24

    /// Le pas d'un déplacement VoiceOver (« Plus tôt » / « Plus tard »).
    static let accessibilityStep: Float = 0.5

    /// **La fenêtre après un glissement de `delta` secondes.** Déplacer garde
    /// la durée et reste dans la slide ; une poignée ne franchit jamais
    /// l'autre (`ClipWindowResolver.minimumDuration` les sépare) ni les bords.
    static func dragged(_ fenetre: Window, grip: Grip, by delta: Float, duration: Float) -> Window {
        let total = max(duration, 0)
        let pas = delta.isFinite ? delta : 0
        let plancher = ClipWindowResolver.minimumDuration
        switch grip {
        case .move:
            let longueur = fenetre.end - fenetre.start
            let debut = max(0, min(fenetre.start + pas, total - longueur))
            return Window(start: debut, end: debut + longueur)
        case .start:
            return Window(start: max(0, min(fenetre.start + pas, fenetre.end - plancher)), end: fenetre.end)
        case .end:
            return Window(start: fenetre.start, end: min(total, max(fenetre.end + pas, fenetre.start + plancher)))
        }
    }

    /// Un glissé aimanté : la fenêtre, et si le bord qui bouge est accroché.
    struct Drag: Equatable {
        let window: Window
        /// L'instant où le bord qui bouge s'est accroché ; `nil`, libre.
        let snappedTime: Float?
        var isSnapped: Bool { snappedTime != nil }
    }

    /// **Le glissé AIMANTÉ** (#14210, miroir de `FriseBarDrag.resolve`
    /// Android) : le bord qui bouge — début, fin, ou le plus proche des deux
    /// pour la barre entière — s'accroche au candidat le plus proche dans la
    /// tolérance, puis la fenêtre est bornée comme un glissé libre.
    static func dragged(_ fenetre: Window, grip: Grip, by delta: Float, duration: Float,
                        snapping candidats: [SnapCandidate], tolerance: Float) -> Drag {
        let pas = delta.isFinite ? delta : 0
        let aimant = SnapEngine(toleranceSeconds: tolerance)
        let corrige: Float?
        let parLaFin: Bool
        switch grip {
        case .start:
            corrige = ecart(aimant.snap(rawTime: fenetre.start + pas, candidates: candidats), depuis: fenetre.start + pas)
            parLaFin = false
        case .end:
            corrige = ecart(aimant.snap(rawTime: fenetre.end + pas, candidates: candidats), depuis: fenetre.end + pas)
            parLaFin = true
        case .move:
            let tete = ecart(aimant.snap(rawTime: fenetre.start + pas, candidates: candidats), depuis: fenetre.start + pas)
            let queue = ecart(aimant.snap(rawTime: fenetre.end + pas, candidates: candidats), depuis: fenetre.end + pas)
            corrige = [tete, queue].compactMap { $0 }.min { abs($0) < abs($1) }
            parLaFin = corrige != nil && corrige != tete
        }
        let resultat = dragged(fenetre, grip: grip, by: pas + (corrige ?? 0), duration: duration)
        return Drag(window: resultat,
                    snappedTime: corrige == nil ? nil : (parLaFin ? resultat.end : resultat.start))
    }

    /// **« aimanté · 9,0 s »** : l'instant de l'accroche, au dixième, dans la
    /// langue de l'interface.
    static func snapLabel(_ secondes: Float, locale: Locale = .current) -> String {
        let valeur = Double(secondes.isFinite ? secondes : 0)
            .formatted(.number.precision(.fractionLength(1)).locale(locale))
        return ComposerTimeCopy.snapped("\(valeur) s")
    }

    private static func ecart(_ resultat: SnapResult, depuis brut: Float) -> Float? {
        resultat.matched == nil ? nil : resultat.snappedTime - brut
    }

    /// Les points d'accroche d'une piste : la tête, les bords de la slide, les
    /// bords des AUTRES pistes — jamais les siens.
    static func snapCandidates(tracks: [SceneFriseTrack], excluding id: String,
                               playhead: Float, duration: Float) -> [SnapCandidate] {
        let voisins = tracks.filter { $0.id != id }.flatMap {
            [SnapCandidate(kind: .clipStart, time: $0.start), SnapCandidate(kind: .clipEnd, time: $0.end)]
        }
        return [SnapCandidate(kind: .slideStart, time: 0),
                SnapCandidate(kind: .slideEnd, time: duration),
                SnapCandidate(kind: .playhead, time: playhead)] + voisins
    }

    /// Huit points de doigt à l'échelle RENDUE, plafonnés à un quart de
    /// seconde — la tolérance de l'atelier (`TimelineGeometry`) et d'Android.
    static func snapTolerance(duration: Float, width: CGFloat) -> Float {
        guard duration > 0, width > 0 else { return 0 }
        let echelle = width / (TimelineGeometry.basePixelsPerSecond * CGFloat(duration))
        return TimelineGeometry(zoomScale: echelle).dragSnapToleranceSeconds
    }

    /// **Une piste se coupe à la tête** si la tête tombe à l'intérieur, à
    /// plus d'une durée plancher de chaque bord. Texte, image, vidéo et son se
    /// coupent — la seconde moitié d'une vidéo ou d'un son reprend sa source
    /// au point de coupe (#14224) ; un sticker ou un lieu ne se coupe pas.
    static func canSplit(_ piste: SceneFriseTrack, at secondes: Float) -> Bool {
        guard [.text, .image, .video, .audio].contains(piste.kind), secondes.isFinite else { return false }
        let plancher = ClipWindowResolver.minimumDuration
        return secondes > piste.start + plancher && secondes < piste.end - plancher
    }

    /// Ce qu'une barre dessine en elle (#14214).
    /// #17110 : aucune barre ne montre sa seule couleur — le texte, le
    /// sticker et le lieu s'y écrivent, l'image y pose sa vignette.
    enum BarContent: Equatable { case filmstrip, waveform, picture, caption }

    static func barContent(kind: SceneFriseTrack.Kind) -> BarContent {
        switch kind {
        case .video: return .filmstrip
        case .audio: return .waveform
        case .image: return .picture
        case .text, .sticker, .place: return .caption
        }
    }

    /// **Le couloir d'icône** de chaque famille (planche S8).
    static func familySymbol(kind: SceneFriseTrack.Kind) -> String {
        switch kind {
        case .text: return "textformat"
        case .sticker: return "face.smiling"
        case .image: return "photo"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .place: return "mappin.and.ellipse"
        }
    }

    /// **La couleur de chaque famille**, prise au design system (`MeeshyColors`).
    static func familyColor(kind: SceneFriseTrack.Kind) -> Color {
        switch kind {
        case .text: return MeeshyColors.brandPrimary
        case .sticker: return MeeshyColors.amber500
        case .image: return MeeshyColors.info
        case .video: return MeeshyColors.purple500
        case .audio: return MeeshyColors.success
        case .place: return MeeshyColors.orange500
        }
    }

    /// Des pistes plus hautes : le contenu s'y lit, le pouce s'y pose.
    static let trackHeight: CGFloat = 40

    /// Six vignettes et soixante-quatre échantillons : assez pour reconnaître
    /// le plan et la voix dans une barre de frise, peu pour la mémoire.
    static let filmstripFrames = 6
    static let waveformSamples = 64

    /// **Retirer depuis la frise** : un texte, une image, une vidéo ou un son
    /// (la commande de la timeline) ; un sticker ou un lieu se retirent depuis
    /// la scène (#4840).
    /// **Dupliquer depuis la frise** : tout objet que la scène duplique — un
    /// lieu reste unique (#14215).
    static func canDuplicate(_ piste: SceneFriseTrack) -> Bool {
        piste.kind != .place
    }

    /// Les échantillons de la seule fenêtre `window` d'une source de
    /// `sourceDuration` secondes (#14268), au moins un ; durée ou fenêtre
    /// inconnue ⇒ l'onde entière.
    static func samples(_ tous: [Float], window: ClosedRange<Double>?, sourceDuration: Double?) -> [Float] {
        guard !tous.isEmpty, let window, let total = sourceDuration, total > 0, total.isFinite else { return tous }
        let premier = min(Int((window.lowerBound / total * Double(tous.count)).rounded()), tous.count - 1)
        let dernier = min(max(Int((window.upperBound / total * Double(tous.count)).rounded()), premier + 1), tous.count)
        return Array(tous[max(0, premier)..<dernier])
    }

    static func canRemove(_ piste: SceneFriseTrack) -> Bool {
        [.text, .image, .video, .audio].contains(piste.kind)
    }

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
    static var earlier: String { String(localized: "composer.frise.earlier", defaultValue: "Plus tôt", bundle: .main) }
    static var later: String { String(localized: "composer.frise.later", defaultValue: "Plus tard", bundle: .main) }
    static var entryEarlier: String {
        String(localized: "composer.frise.entryEarlier", defaultValue: "Entrer plus tôt", bundle: .main)
    }
    static var entryLater: String {
        String(localized: "composer.frise.entryLater", defaultValue: "Entrer plus tard", bundle: .main)
    }
    static var exitEarlier: String {
        String(localized: "composer.frise.exitEarlier", defaultValue: "Sortir plus tôt", bundle: .main)
    }
    static var exitLater: String {
        String(localized: "composer.frise.exitLater", defaultValue: "Sortir plus tard", bundle: .main)
    }
    static var split: String {
        String(localized: "composer.object.editor.split", defaultValue: "Couper", bundle: .main)
    }
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

/// Les deux sorties du mode plein écran de la frise (planche S9).
struct ComposerSceneFriseFullScreen {
    let onQuit: () -> Void
    let onValidate: () -> Void
}

/// Les mots de la frise premium (#17110), dans leur table `ComposerTime`.
nonisolated enum ComposerTimeCopy {
    static var pinchHint: String {
        String(localized: "composer.time.pinchHint", defaultValue: "Pincer pour zoomer", table: "ComposerTime", bundle: .main)
    }
    static var quit: String {
        String(localized: "composer.time.quit", defaultValue: "Quitter", table: "ComposerTime", bundle: .main)
    }
    static var validate: String {
        String(localized: "composer.time.validate", defaultValue: "Valider", table: "ComposerTime", bundle: .main)
    }
    static var expand: String {
        String(localized: "composer.time.expand", defaultValue: "Agrandir la frise", table: "ComposerTime", bundle: .main)
    }
    static func snapped(_ instant: String) -> String {
        String(format: String(localized: "composer.time.snapped", defaultValue: "aimanté · %@",
                              table: "ComposerTime", bundle: .main), instant)
    }
}
