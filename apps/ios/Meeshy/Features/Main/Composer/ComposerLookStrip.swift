import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les mots de la bande (#9351)

extension ComposerCaptureCopy {
    static func familyName(_ family: ComposerLookFamily) -> String {
        switch family {
        case .filters:
            return String(localized: "call.filters", defaultValue: "Filtres", bundle: .main)
        case .frames:
            return String(localized: "composer.capture.rail.frames", defaultValue: "Cadres", bundle: .main)
        }
    }

    static func familySymbol(_ family: ComposerLookFamily) -> String {
        family == .filters ? "camera.filters" : "photo.artframe"
    }

    static func itemName(_ item: ComposerLookStripItem) -> String {
        switch item {
        case .filter(.natural):
            return String(localized: "composer.capture.band.noFilter", defaultValue: "Aucun filtre", bundle: .main)
        case .filter(let preset):
            return CallEffectsCopy.presetName(preset)
        case .frame(.none):
            return CallLiveFrameCopy.none
        case .frame(.montage(let choice)):
            return CallFrameCopy.choiceName(choice)
        }
    }

    static func itemSymbol(_ item: ComposerLookStripItem) -> String {
        switch item {
        case .filter(let preset): return CallEffectsCopy.presetSymbol(preset)
        case .frame(.none): return "circle.slash"
        case .frame(.montage(let choice)): return CallFrameCopy.choiceSymbol(choice)
        }
    }

    /// Ce que la miniature choisie montre : ses deux moitiés, filtre et cadre.
    static func chosenLookName(_ look: ComposerPhotoLook) -> String {
        ListFormatter.localizedString(byJoining: [itemName(.filter(look.filter)), itemName(.frame(look.frame))])
    }
}

// MARK: - Les équivalents VoiceOver, projetés de la table

extension View {
    /// **Les prises d'une zone, offertes à VoiceOver** (#9351, contraintes globales
    /// § Accessibilité) : la liste est celle de la table des gestes, nommée par
    /// elle — jamais réécrite par la vue.
    func composerCaptureAccessibilityActions(zone: ComposerCaptureZone, context: ComposerCaptureGestureContext,
                                             perform: @escaping (ComposerCaptureAction) -> Void) -> some View {
        accessibilityActions {
            ForEach(Array(ComposerCaptureGesture.accessibilityActions(zone: zone, context: context).enumerated()),
                    id: \.offset) { _, action in
                if let nom = ComposerCaptureGesture.accessibilityName(of: action) {
                    Button(nom) { perform(action) }
                }
            }
        }
    }
}

// MARK: - Le rail

/// **Le rail vertical, en bas à gauche** (#9351) : Filtres, Cadres. Toucher une
/// famille ouvre sa bande ; la retoucher la replie. Ni verre ni cadre : le
/// pictogramme et le nom, ombrés pour rester lisibles (porteur 2026-10-07,
/// #9566) — « Cadres » porte le pictogramme du cadre de l'appel vidéo.
struct ComposerLookRail: View {
    let open: ComposerLookFamily?
    let onSelect: (ComposerLookFamily) -> Void

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            ForEach(ComposerLookFamily.allCases, id: \.self) { famille in
                Button { onSelect(famille) } label: {
                    VStack(spacing: MeeshySpacing.xxs) {
                        Image(systemName: ComposerCaptureCopy.familySymbol(famille))
                            .font(MeeshyFont.relative(17, weight: .semibold))
                        Text(ComposerCaptureCopy.familyName(famille))
                            .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .foregroundStyle(open == famille ? Color.yellow : .white)
                    .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                    .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(ComposerCaptureCopy.familyName(famille))
                .accessibilityAddTraits(open == famille ? .isSelected : [])
            }
        }
    }
}

// MARK: - La bande

/// **La bande — et, repliée, la miniature-déclencheur** (#9351, spec § 3.1 / § 3.2).
///
/// Ouverte, toutes les cases de la famille : celle du CENTRE est la choisie
/// (#9566) — le défilement s'accroche case par case et choisit en passant —,
/// encadrée, et son nom s'écrit seul, en grand, sous la bande. Repliée, la
/// seule miniature choisie (la paire complète), qui continue d'afficher le
/// direct. Les cases peintes sont les visibles ±1, au plus le budget thermique ;
/// leurs images vivent dans UN atlas Metal (`ComposerLookStripSurface`). Chaque
/// geste est lu dans la table (`ComposerCaptureGesture`), le toucher par son seul
/// décideur.
struct ComposerLookStrip: View {
    @ObservedObject var session: ComposerCaptureSession
    let source: any ComposerFrameSourcing
    let context: ComposerCaptureGestureContext
    let recordingTime: TimeInterval

    /// Les cases dont un pixel se voit — mises à jour au franchissement d'une case,
    /// jamais à chaque image du défilement.
    @State private var visible: ClosedRange<Int>?
    @State private var scrolling = false
    /// Le minuteur de fin de défilement et le suivi du centre : une référence,
    /// que mettre à jour à chaque image n'invalide pas la vue.
    @State private var settle = ComposerLookStripScrollSettle()
    @State private var blink: Double = 1
    /// Retombe d'elle-même quand le système annule l'appui long sans `onEnded`.
    @GestureState private var pressing = false
    /// La fin de la dernière tenue — sa levée ne compte pas pour un toucher.
    @State private var holdEndedAt: Date?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let scrollSpace = "composer.capture.band"
    private static let labelHeight: CGFloat = 30

    /// La famille ouverte GARDE ses cases pendant l'enregistrement : basculer de la
    /// bande à la miniature seule annulerait l'appui long qui vient de lancer la
    /// prise (sa levée ne parviendrait plus à `endHold`). Les autres cases
    /// s'effacent ; seule la choisie reste visible et vivante.
    private var items: [ComposerLookStripItem] {
        guard let famille = session.openFamily else { return [] }
        return ComposerLookStripRule.items(famille)
    }

    private var recording: Bool { context.stage == .recording }

    /// Le défilement peut-il changer le look ? La table le dit, comme pour un
    /// toucher : jamais pendant une prise, ni avec des segments en attente.
    private var selects: Bool {
        ComposerCaptureGesture.action(zone: .otherThumbnail, gesture: .tap, context: context) == .select
    }

    /// Le nom de la case choisie dans la famille ouverte — le seul écrit.
    private var chosenItemName: String {
        ComposerLookStripRule.chosenIndex(in: items, look: session.look)
            .map { ComposerCaptureCopy.itemName(items[$0]) } ?? ""
    }

    /// Le déclencheur porte UN nom, seul ou dans la bande ouverte.
    private var chosenLabel: String {
        recording
            ? ComposerSceneCameraCopy.shutterLabel(mode: .video, stage: .recording)
            : ComposerCaptureCopy.chosenLookName(session.look)
    }

    private var budget: ComposerThermalBudget {
        recording ? session.thermalBudget.whileRecording() : session.thermalBudget
    }

    var body: some View {
        Group {
            if items.isEmpty {
                switch ComposerLookStripRule.collapsedTrigger(look: session.look, editing: context.editing) {
                case .shutter: shutter
                case .thumbnail: chosenAlone
                case .hidden: Color.clear.accessibilityHidden(true)
                }
            } else {
                VStack(spacing: 0) {
                    band.frame(height: ComposerLookStripRule.cellSize.height)
                    Text(chosenItemName)
                        .font(MeeshyFont.relative(ComposerLookStripRule.chosenNameSize, weight: .bold))
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .padding(.horizontal, MeeshySpacing.mdPlus)
                        .frame(height: Self.labelHeight, alignment: .bottom)
                        .opacity(recording ? 0 : 1)
                        .accessibilityHidden(true)
                }
            }
        }
        .frame(height: ComposerLookStripRule.cellSize.height + Self.labelHeight)
        .adaptiveOnChange(of: pressing) { _, tenu in
            guard !tenu else { return }
            session.releaseStaleHold()
        }
    }

    // MARK: - Repliée, sans look : le déclencheur simple (#9557)

    /// Un anneau, rien de peint : la caméra est déjà tout l'écran. Il porte les
    /// gestes de la miniature choisie, et son point rouge quand la prise tourne.
    private var shutter: some View {
        let cote = ComposerLookStripRule.cellSize.width + MeeshySpacing.lg
        return ZStack {
            Circle().strokeBorder(Color.white, lineWidth: 4)
            RoundedRectangle(cornerRadius: recording ? MeeshyRadius.sm : cote / 2, style: .continuous)
                .fill(recording ? MeeshyColors.error : Color.white)
                .padding(recording ? cote * 0.3 : 7)
            chosenOverlay.offset(y: -MeeshySpacing.xxl)
        }
        .frame(width: cote, height: cote)
        .shadow(color: .black.opacity(0.35), radius: 4, y: 1)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: recording)
        .contentShape(Circle())
        .gesture(triggerGestures(zone: .shutter))
        .accessibilityElement()
        .accessibilityLabel(recording
            ? ComposerSceneCameraCopy.shutterLabel(mode: .video, stage: .recording)
            : ComposerSceneCameraCopy.shutterLabel(mode: .photo, stage: .armed))
        .accessibilityAddTraits(.isButton)
        .composerCaptureAccessibilityActions(zone: .shutter, context: context) { performAccessible($0) }
    }

    // MARK: - Repliée : la miniature choisie, seule

    private var chosenAlone: some View {
        let cellule = ComposerLookStripRule.cellSize
        let tuile = ComposerLookStripTile(index: 0, look: session.look, rect: CGRect(origin: .zero, size: cellule))
        return ZStack {
            glyph(symbol: "camera.aperture")
            ComposerLookStripSurface(tiles: budget.thumbnailCells > 0 ? [tuile] : [], source: source,
                                     person: session.lookPerson, date: session.lookDate, framing: session.framing,
                                     fps: budget.thumbnailFPS, frozen: false)
            chosenOverlay
        }
        .frame(width: cellule.width, height: cellule.height)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .strokeBorder(Color.white, lineWidth: 3))
        .contentShape(Rectangle())
        .gesture(chosenGestures)
        .accessibilityElement()
        .accessibilityLabel(chosenLabel)
        .accessibilityAddTraits(.isButton)
        .composerCaptureAccessibilityActions(zone: .chosenThumbnail, context: context) { performAccessible($0) }
    }

    /// Le point rouge clignotant et le chronomètre, DÈS le premier segment —
    /// posés sur la miniature choisie, seule ou dans la bande ouverte.
    @ViewBuilder
    private var chosenOverlay: some View {
        if recording || !session.segments.isEmpty {
            VStack {
                HStack(spacing: MeeshySpacing.xxs) {
                    Circle().fill(MeeshyColors.error).frame(width: 7, height: 7)
                        .opacity(reduceMotion || !recording ? 1 : blink)
                    Text(ComposerCaptureSegments.elapsed(segments: session.segments, live: recordingTime,
                                                         recording: recording)
                        .formatted(.number.precision(.fractionLength(0))) + "″")
                        .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                }
                .padding(.horizontal, MeeshySpacing.xs)
                .background(Capsule().fill(.black.opacity(0.45)))
                .padding(.top, MeeshySpacing.xxs)
                Spacer()
            }
            .accessibilityHidden(true)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { blink = 0.25 }
            }
            .onDisappear { blink = 1 }
        }
    }

    // MARK: - Ouverte : toute la famille

    private var band: some View {
        GeometryReader { conteneur in
            let retrait = max(0, (conteneur.size.width - ComposerLookStripRule.cellSize.width) / 2)
            ScrollViewReader { lecteur in
                ScrollView(.horizontal, showsIndicators: false) {
                    bandContent
                        .background(GeometryReader { contenu in
                            Color.clear.adaptiveOnChange(of: contenu.frame(in: .named(Self.scrollSpace)).minX,
                                                         initial: true) { _, x in
                                followScroll(scrolled: retrait - x, width: conteneur.size.width, reader: lecteur)
                            }
                        })
                        .modifier(ComposerLookStripLegacyInset(inset: retrait))
                }
                .modifier(ComposerLookStripSnapping(inset: retrait))
                .scrollDisabled(!selects)
                .coordinateSpace(name: Self.scrollSpace)
                .environment(\.layoutDirection, .leftToRight)
                .onAppear {
                    guard let choisie = ComposerLookStripRule.chosenIndex(in: items, look: session.look) else { return }
                    beginFollowing(chosen: choisie)
                    lecteur.scrollTo(choisie, anchor: .center)
                }
                .adaptiveOnChange(of: ComposerLookStripRule.chosenIndex(in: items, look: session.look)) { _, choisie in
                    guard let choisie, let cible = settle.follow.chose(choisie) else { return }
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
                        lecteur.scrollTo(cible, anchor: .center)
                    }
                }
            }
        }
    }

    private var bandContent: some View {
        let cellule = ComposerLookStripRule.cellSize
        let pas = ComposerLookStripRule.pitch
        let cases = items
        let choisie = ComposerLookStripRule.chosenIndex(in: cases, look: session.look)
        let peintes = ComposerLookStripRule.paintedIndices(visible: visible, count: cases.count,
                                                           cells: budget.thumbnailCells,
                                                           chosen: choisie, recording: recording)
        let fenetre = ComposerLookStripGeometry.paintedWindow(peintes)
        let tuiles = peintes.map { index in
            ComposerLookStripTile(index: index,
                                  look: ComposerLookStripRule.look(of: cases[index], combinedWith: session.look),
                                  rect: CGRect(x: CGFloat(index - (fenetre?.lowerBound ?? 0)) * pas, y: 0,
                                               width: cellule.width, height: cellule.height))
        }
        return ZStack(alignment: .topLeading) {
            HStack(spacing: ComposerLookStripRule.spacing) {
                ForEach(Array(cases.enumerated()), id: \.offset) { index, item in
                    glyph(symbol: ComposerCaptureCopy.itemSymbol(item))
                        .frame(width: cellule.width, height: cellule.height)
                        .opacity(recording && index != choisie ? 0 : 1)
                }
            }
            if let fenetre {
                ComposerLookStripSurface(tiles: tuiles, source: source, person: session.lookPerson,
                                         date: session.lookDate, framing: session.framing,
                                         fps: budget.thumbnailFPS, frozen: scrolling)
                    .frame(width: CGFloat(fenetre.count) * pas - ComposerLookStripRule.spacing,
                           height: cellule.height)
                    .offset(x: CGFloat(fenetre.lowerBound) * pas)
                    .allowsHitTesting(false)
            }
            HStack(spacing: ComposerLookStripRule.spacing) {
                ForEach(Array(cases.enumerated()), id: \.offset) { index, item in
                    cell(item: item, chosen: index == choisie)
                        .opacity(recording && index != choisie ? 0 : 1)
                        .allowsHitTesting(!recording || index == choisie)
                        .accessibilityHidden(recording && index != choisie)
                        .id(index)
                }
            }
            .modifier(ComposerLookStripTargets())
        }
    }

    /// Une case : son contour, rien d'écrit — seul le choix se nomme, sous la bande.
    @ViewBuilder
    private func cell(item: ComposerLookStripItem, chosen: Bool) -> some View {
        let cellule = ComposerLookStripRule.cellSize
        let corps = RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .strokeBorder(chosen ? Color.white : Color.white.opacity(0.25), lineWidth: chosen ? 3 : 1)
            .frame(width: cellule.width, height: cellule.height)
            .contentShape(Rectangle())
            .gesture(chosen ? AnyGesture(chosenGestures.map { _ in () }) : AnyGesture(TapGesture().onEnded {
                perform(.otherThumbnail, .tap, item: item)
            }))
            .overlay { if chosen { chosenOverlay } }
            .accessibilityElement(children: .ignore)
        if chosen {
            corps
                .accessibilityLabel(chosenLabel)
                .accessibilityAddTraits([.isButton, .isSelected])
                .composerCaptureAccessibilityActions(zone: .chosenThumbnail, context: context) { performAccessible($0) }
        } else {
            corps
                .accessibilityLabel(ComposerCaptureCopy.itemName(item))
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { perform(.otherThumbnail, .tap, item: item) }
        }
    }

    private func glyph(symbol: String) -> some View {
        RoundedRectangle(cornerRadius: MeeshyRadius.sm, style: .continuous)
            .fill(Color.white.opacity(0.12))
            .overlay(Image(systemName: symbol).foregroundStyle(.white.opacity(0.7)))
            .accessibilityHidden(true)
    }

    // MARK: - Les gestes de la miniature choisie

    /// Appui long (puis glissé : cadenas à droite, zoom à la verticale) ET
    /// toucher, reconnus côte à côte (#9557) : derrière un `exclusively(before:)`,
    /// le toucher ne partait jamais — relevé au simulateur.
    private var chosenGestures: some Gesture { triggerGestures(zone: .chosenThumbnail) }

    private func triggerGestures(zone: ComposerCaptureZone) -> some Gesture {
        LongPressGesture(minimumDuration: ComposerSceneQuickCapture.armedHoldDuration)
            .sequenced(before: DragGesture(minimumDistance: 0))
            .updating($pressing) { valeur, tenu, _ in
                guard case .second(true, _) = valeur else { return }
                tenu = true
            }
            .onChanged { valeur in
                guard case .second(true, let glisse) = valeur else { return }
                guard session.holdStartedAt != nil else {
                    perform(zone, .longPress)
                    return
                }
                guard let glisse, steers(zone) else { return }
                session.holdChanged(CGPoint(x: glisse.translation.width, y: glisse.translation.height))
            }
            .onEnded { _ in
                holdEndedAt = Date()
                session.endHold()
            }
            .simultaneously(with: TapGesture().onEnded {
                guard session.holdStartedAt == nil,
                      !ComposerCaptureTapRule.followsAHold(holdEndedAt, now: Date()) else { return }
                tapTrigger(zone)
            })
    }

    /// Le doigt qui tient la prise la pilote-t-il ? La table le dit.
    private func steers(_ zone: ComposerCaptureZone) -> Bool {
        var tenue = context
        tenue.holding = session.holdStartedAt != nil
        return ComposerCaptureGesture.action(zone: zone, gesture: .drag, context: tenue) == .steerTake
    }

    /// **Le toucher de la miniature, lu par le seul décideur** (#9464) : le second
    /// d'un double dans la même zone prend la photo vers la galerie ; seul, il
    /// arrête une prise verrouillée.
    private func tapTrigger(_ zone: ComposerCaptureZone) {
        let issue = ComposerCaptureGesture.tap(zone: zone, context: context, now: Date(),
                                               lastTap: session.lastViewfinderTap, armedAt: session.armedAt)
        session.lastViewfinderTap = issue.memory
        session.perform(issue.action, item: nil)
    }

    private func perform(_ zone: ComposerCaptureZone, _ geste: ComposerCaptureGestureKind,
                         item: ComposerLookStripItem? = nil) {
        session.perform(ComposerCaptureGesture.action(zone: zone, gesture: geste, context: context), item: item)
    }

    /// VoiceOver ne TIENT pas un doigt : une prise qu'il lance part verrouillée,
    /// et c'est « Arrêter » qui la termine.
    private func performAccessible(_ action: ComposerCaptureAction) {
        session.perform(action, item: nil)
        guard action == .filmToGallery || action == .filmSegment else { return }
        session.lockPendingTake()
    }

    // MARK: - Le défilement

    /// La bande s'ouvre en tête puis rejoint la case choisie : ce trajet-là
    /// n'est pas un choix.
    private func beginFollowing(chosen: Int?) {
        guard !settle.follow.hasBegun else { return }
        settle.follow.begin(chosen: chosen)
    }

    /// Les cases visibles suivent le défilement, case par case, et **celle du
    /// centre est choisie** (#9566) ; pendant qu'il dure, les cases peintes se
    /// figent et seules les neuves se peignent. Au repos, la bande se solde —
    /// et, sans accroche système (iOS 16), se recentre sur sa case.
    private func followScroll(scrolled: CGFloat, width: CGFloat, reader: ScrollViewProxy) {
        let cases = items
        let choisie = ComposerLookStripRule.chosenIndex(in: cases, look: session.look)
        beginFollowing(chosen: choisie)
        let vues = ComposerLookStripRule.visibleRange(offset: scrolled - (width - ComposerLookStripRule.cellSize.width) / 2,
                                                      width: width, count: cases.count)
        if vues != visible { visible = vues }
        if let centre = ComposerLookStripRule.centeredIndex(scrolled: scrolled, count: cases.count),
           centre != settle.follow.centered,
           let aChoisir = settle.follow.centered(on: centre, chosen: choisie, selects: selects) {
            choose(cases[aChoisir])
        }
        if !scrolling { scrolling = true }
        settle.task?.cancel()
        settle.task = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled else { return }
            scrolling = false
            rest(reader: reader)
        }
    }

    private func rest(reader: ScrollViewProxy) {
        let cases = items
        let choisie = ComposerLookStripRule.chosenIndex(in: cases, look: session.look)
        switch settle.follow.settled(chosen: choisie, selects: selects) {
        case .rejoin(let cible):
            return reader.scrollTo(cible, anchor: .center)
        case .choose(let aChoisir):
            if cases.indices.contains(aChoisir) { choose(cases[aChoisir]) }
        case .nothing:
            break
        }
        guard !ComposerLookStripSnapping.isNative, let centre = settle.follow.centered else { return }
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.15)) { reader.scrollTo(centre, anchor: .center) }
    }

    private func choose(_ item: ComposerLookStripItem) {
        perform(.otherThumbnail, .tap, item: item)
    }
}

/// Le minuteur de fin de défilement et le suivi du centre de la bande, hors de
/// l'état observé.
final class ComposerLookStripScrollSettle {
    var task: Task<Void, Never>?
    var follow = ComposerLookStripFollow()

    nonisolated deinit {}
}

// MARK: - L'accroche case par case (#9566)

/// iOS 17+ : l'accroche système, aussi loin que le lancer porte, sur des marges
/// qui amènent la première et la dernière case au centre.
struct ComposerLookStripSnapping: ViewModifier {
    let inset: CGFloat

    static var isNative: Bool {
        if #available(iOS 17.0, *) { return true }
        return false
    }

    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content
                .contentMargins(.horizontal, inset, for: .scrollContent)
                .scrollTargetBehavior(.viewAligned(limitBehavior: .never))
        } else {
            content
        }
    }
}

/// iOS 16 : pas de marges de contenu — un retrait posé sur le contenu.
struct ComposerLookStripLegacyInset: ViewModifier {
    let inset: CGFloat

    func body(content: Content) -> some View {
        if ComposerLookStripSnapping.isNative {
            content
        } else {
            content.padding(.horizontal, inset)
        }
    }
}

/// Les cases sont les cibles de l'accroche.
struct ComposerLookStripTargets: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.scrollTargetLayout()
        } else {
            content
        }
    }
}
