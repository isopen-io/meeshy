import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une vignette par SCÈNE, dans la rangée haute** (constat porteur
/// 2026-09-06 : « lorsque je crée une nouvelle scène elle n'apparaît pas
/// immédiatement dans la mini-preview » ; fusion #5009 + #5037 actée le
/// 2026-09-03 : « il faut que les rails de slide soient des vignettes de
/// scène »).
///
/// ## Ce que la rangée montrait, et pourquoi une scène pouvait y manquer
///
/// Elle recevait une liste de MÉDIAS, filtrée par l'index des fondations. La
/// règle disait « une tuile par média posé en fond », et le doc-comment de
/// `ComposerTopBar` énonçait l'équivalence comme une définition : « une par
/// `MeeshySlide`, ce qui veut dire une par média posé en FOND ».
///
/// Les deux termes ont coïncidé tant que toute scène naissait d'un média. Un
/// fond COLORÉ les sépare — la scène existe, elle n'a aucun média — et la
/// rangée n'avait alors rien à montrer.
///
/// > **Retirer un doublon révèle ce que l'autre ne couvrait pas.** La bande de
/// > pastilles du couloir bas comptait les slides et couvrait ce trou ; elle est
/// > partie le matin même sur directive porteur.
///
/// ## Ce que la tuile peint
///
/// La VIGNETTE de sa scène — fond et objets posés, noire quand la scène est
/// vide — rendue par le composite partagé (`SceneThumbnailRenderer`, SDK), le
/// même qui produit la couverture du plateau et le ThumbHash. Elle peignait
/// auparavant `SlideMiniPreview`, un second chemin de rendu en modifiers
/// SwiftUI que #5037 nommait comme piège : il approxime les filtres et pouvait
/// mentir sur le rendu final.
///
/// ## Pourquoi la vue vit ici et non dans `ComposerTopBar`
///
/// Une vignette demande les effets VIVANTS de la slide et les bitmaps chargés —
/// donc le ViewModel. `ComposerTopBar` ne le connaît pas et n'a pas à le
/// connaître : elle reçoit ce rail en slot opaque, comme `formatFan`.
struct ComposerSlideRail: View {

    let slides: [StorySlide]
    let currentIndex: Int
    /// Les fonds de slide déjà chargés, par identifiant de slide.
    let slideImages: [String: UIImage]
    /// Les bitmaps des objets, par identifiant d'objet. Un bitmap remplacé est
    /// une INSTANCE neuve : l'empreinte de la vignette le voit sans compteur.
    let loadedImages: [String: UIImage]
    let onSelect: (Int) -> Void
    /// **Supprimer la scène courante** (constat porteur 2026-09-06 : « il
    /// manque la poubelle pour supprimer les scènes »). L'ancienne rangée de
    /// médias portait cette croix ; ma rangée de scènes ne l'avait pas reprise
    /// — une capacité perdue au passage d'un lot.
    let onDelete: ((Int) -> Void)?
    /// **(+) en DERNIER** (#17111) : la rangée se termine par la scène à venir.
    var canAdd: Bool = false
    var onAdd: (() -> Void)?
    /// **Le double toucher DUPLIQUE la scène** (`duplicateSlide`).
    var onDuplicate: ((Int) -> Void)?
    /// **L'appui long arme le RÉORDONNANCEMENT** : les croix paraissent, et
    /// glisser une tuile la déplace (`moveSlide`) — l'ordre de la rangée est
    /// celui de la publication.
    var onMove: ((Int, Int) -> Void)?

    private static let height: CGFloat = 44
    private static let pitch: CGFloat = height * SceneShape.aspect + MeeshySpacing.sm

    @State private var deletion = ComposerSceneDeletionPrompt()
    @State private var isReordering = false
    @State private var dragged: ComposerSlideRowDrag?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// La rangée est un OVERLAY sans cadre (#17111) : aucune bande ni fond, les
    /// tuiles flottent sur la scène. Une vignette SEULE reste un aperçu tant
    /// qu'aucun geste ne la sert.
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                // Identifiées par la SCÈNE, pas par la place : une tuile déplacée
                // glisse vers sa nouvelle place au lieu de se repeindre.
                ForEach(Array(slides.enumerated()), id: \.element.id) { index, _ in
                    sceneTile(index)
                }
                if ComposerSlideRowGrammar.items(sceneCount: slides.count,
                                                 canAdd: canAdd && onAdd != nil).last == .add {
                    addTile
                }
                if isReordering { doneButton }
            }
            .padding(.vertical, MeeshySpacing.xxs)
            .animation(reduceMotion ? nil : .spring(response: 0.28, dampingFraction: 0.82), value: slides.map(\.id))
        }
        .scrollDisabled(isReordering)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(Text(ComposerSlideRailCopy.rail))
        .adaptiveOnChange(of: slides.count) { _, count in
            if count < 2 { isReordering = false }
        }
        .confirmationDialog(ComposerSlideRailCopy.deleteConfirmTitle,
                            isPresented: Binding(get: { deletion.isPresented },
                                                 set: { if !$0 { deletion = deletion.cancelled() } }),
                            titleVisibility: .visible) {
            Button(ComposerSlideRailCopy.deleteConfirmAction, role: .destructive) {
                let cible = deletion.confirmedIndex(sceneCount: slides.count)
                deletion = deletion.cancelled()
                if let cible { onDelete?(cible) }
            }
            Button(ComposerSlideRailCopy.deleteCancel, role: .cancel) {
                deletion = deletion.cancelled()
            }
        }
    }

    @ViewBuilder
    private func sceneTile(_ index: Int) -> some View {
        if slides.indices.contains(index) {
            let slide = slides[index]
            let label = Text(ComposerSlideRailCopy.position(index: index + 1, total: slides.count))
            tuile(slide, index: index)
                .overlay(alignment: .topTrailing) { corbeille(index) }
                .scaleEffect(dragged?.source == index ? 1.12 : 1)
                .offset(x: dragged?.source == index ? dragged?.translation ?? 0 : 0)
                .zIndex(dragged?.source == index ? 1 : 0)
                .modifier(ComposerSlideRowJiggle(isOn: isReordering && !reduceMotion))
                .onTapGesture(count: 2) { perform(.doubleTap, on: index) }
                .onTapGesture { perform(.tap, on: index) }
                .onLongPressGesture(minimumDuration: 0.4) { perform(.longPress, on: index) }
                .simultaneousGesture(reorderDrag(index), including: isReordering ? .all : .subviews)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(index == currentIndex ? [.isButton, .isSelected] : .isButton)
                .accessibilityAction { perform(.tap, on: index) }
                .accessibilityActions { sceneActions(index) }
        }
    }

    @ViewBuilder
    private func sceneActions(_ index: Int) -> some View {
        if onDuplicate != nil, canAdd {
            Button(ComposerSlideRailCopy.duplicate) { onDuplicate?(index) }
        }
        if let onMove, index > 0 {
            Button(ComposerSlideRailCopy.moveEarlier) { onMove(index, index - 1) }
        }
        if let onMove, index < slides.count - 1 {
            Button(ComposerSlideRailCopy.moveLater) { onMove(index, index + 2) }
        }
        if onDelete != nil, slides.count > 1 {
            Button(ComposerSlideRailCopy.delete(index: index + 1)) { deletion = deletion.asking(index: index) }
        }
    }

    private func perform(_ geste: ComposerSlideRowGrammar.Gesture, on index: Int) {
        switch ComposerSlideRowGrammar.effect(geste, onScene: index, sceneCount: slides.count,
                                              isReordering: isReordering,
                                              canDuplicate: canAdd && onDuplicate != nil) {
        case .select(let cible)?:
            onSelect(cible)
        case .duplicate(let cible)?:
            HapticFeedback.light()
            onDuplicate?(cible)
        case .beginReordering?:
            HapticFeedback.medium()
            isReordering = true
        case nil:
            break
        }
    }

    private func reorderDrag(_ index: Int) -> some Gesture {
        DragGesture(minimumDistance: 4)
            .onChanged { valeur in
                guard isReordering else { return }
                let avant = dragged.flatMap { ComposerSlideRowGrammar.targetIndex(from: index, translation: $0.translation,
                                                                                   pitch: Self.pitch,
                                                                                   count: slides.count) }
                dragged = ComposerSlideRowDrag(source: index, translation: valeur.translation.width)
                let apres = ComposerSlideRowGrammar.targetIndex(from: index, translation: valeur.translation.width,
                                                                pitch: Self.pitch, count: slides.count)
                if avant != apres { HapticFeedback.rigid() }
            }
            .onEnded { valeur in
                defer { dragged = nil }
                guard isReordering,
                      let destination = ComposerSlideRowGrammar.destination(from: index,
                                                                            translation: valeur.translation.width,
                                                                            pitch: Self.pitch,
                                                                            count: slides.count) else { return }
                onMove?(index, destination)
            }
    }

    private var addTile: some View {
        Button {
            onAdd?()
        } label: {
            Image(systemName: "plus")
                .font(.body.weight(.semibold))
                .foregroundStyle(.white)
                .frame(width: Self.height * SceneShape.aspect, height: Self.height)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: MeeshyRadius.xxs),
                               tint: Color.black.opacity(ComposerSceneRoundGlyph.veil), interactive: true)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerMoreMenuCopy.label(.addSlide)))
        .accessibilityIdentifier("composer.slide.rail.add")
    }

    private var doneButton: some View {
        Button {
            isReordering = false
            HapticFeedback.light()
        } label: {
            Text(ComposerSlideRailCopy.reorderDone)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.white)
                .padding(.horizontal, MeeshySpacing.sm)
                .frame(height: Self.height)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("composer.slide.rail.done")
    }

    /// La croix paraît sur CHAQUE tuile tant que le réordonnancement est armé,
    /// jamais sous deux scènes (`ComposerHeaderTiles.showsDelete`), et la
    /// suppression se confirme toujours.
    @ViewBuilder
    private func corbeille(_ index: Int) -> some View {
        if onDelete != nil, ComposerHeaderTiles.showsDelete(sceneIndex: index,
                                           currentIndex: currentIndex,
                                           sceneCount: slides.count,
                                           isReordering: isReordering) {
            Button { deletion = deletion.asking(index: index) } label: {
                Image(systemName: "xmark")
                    .font(MeeshyFont.relative(8, weight: .bold))
                    .foregroundStyle(.white)
                    .padding(MeeshySpacing.xxs)
                    .background(Circle().fill(Color.black.opacity(0.55)))
            }
            .buttonStyle(.plain)
            .offset(x: 4, y: -4)
            .accessibilityLabel(Text(ComposerSlideRailCopy.delete(index: index + 1)))
        }
    }

    private func tuile(_ slide: StorySlide, index: Int) -> some View {
        // La diapositive est une scène : TOUJOURS 9:16 (`SceneShape.aspect`, #6896/#6904).
        let cote = CGSize(width: Self.height * SceneShape.aspect, height: Self.height)
        return ComposerSceneThumbnailTile(slide: slide, bgImage: slideImages[slide.id],
                                          loadedImages: loadedImages, size: cote)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        // Le rognage ne rogne pas le TOUCHER : la tuile voisine recouvrait la
        // première (#9126).
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.xxs))
        .overlay(
            RoundedRectangle(cornerRadius: MeeshyRadius.xxs)
                .strokeBorder(index == currentIndex
                              ? MeeshyColors.brandPrimary
                              : Color.white.opacity(0.25),
                              lineWidth: index == currentIndex ? 1.5 : 0.5)
        )
    }
}

/// Le glissé en cours : quelle tuile, et de combien.
nonisolated struct ComposerSlideRowDrag: Equatable, Sendable {
    let source: Int
    let translation: CGFloat
}

/// Le léger balancement des tuiles en réordonnancement, coupé sous Reduce Motion.
struct ComposerSlideRowJiggle: ViewModifier {
    let isOn: Bool
    @State private var phase = false

    func body(content: Content) -> some View {
        content
            .rotationEffect(.degrees(isOn ? (phase ? 1.5 : -1.5) : 0))
            .animation(isOn ? .easeInOut(duration: 0.14).repeatForever(autoreverses: true) : .default, value: phase)
            .onAppear { phase = isOn }
            .adaptiveOnChange(of: isOn) { _, on in phase = on }
    }
}

/// **La rangée des scènes, en overlay** (#17111) : ce que chaque geste fait,
/// hors de la vue.
nonisolated enum ComposerSlideRowItem: Hashable, Sendable {
    case scene(Int)
    case add
}

nonisolated enum ComposerSlideRowGrammar {

    enum Gesture: Equatable, Sendable {
        case tap
        case doubleTap
        case longPress
    }

    enum Effect: Equatable, Sendable {
        case select(Int)
        case duplicate(Int)
        case beginReordering
    }

    /// Les scènes dans leur ordre — celui de la publication —, puis (+) en
    /// dernier quand une scène de plus est permise.
    static func items(sceneCount: Int, canAdd: Bool) -> [ComposerSlideRowItem] {
        (0..<max(sceneCount, 0)).map(ComposerSlideRowItem.scene) + (canAdd ? [.add] : [])
    }

    static func effect(_ gesture: Gesture, onScene index: Int, sceneCount: Int,
                       isReordering: Bool, canDuplicate: Bool) -> Effect? {
        guard (0..<sceneCount).contains(index) else { return nil }
        switch gesture {
        case .tap:
            return isReordering ? nil : .select(index)
        case .doubleTap:
            return !isReordering && canDuplicate ? .duplicate(index) : nil
        case .longPress:
            return sceneCount > 1 && !isReordering ? .beginReordering : nil
        }
    }

    /// La place que la tuile glissée vise : un pas par tuile, bornée à la rangée.
    static func targetIndex(from source: Int, translation: CGFloat, pitch: CGFloat, count: Int) -> Int? {
        guard (0..<count).contains(source), pitch > 0, translation.isFinite else { return nil }
        let pas = Int((translation / pitch).rounded())
        return min(max(source + pas, 0), count - 1)
    }

    /// La destination au sens de `moveSlide(from:to:)` (un décalage de
    /// `Array.move(fromOffsets:toOffset:)`) ; `nil` quand la tuile revient à sa place.
    static func destination(from source: Int, translation: CGFloat, pitch: CGFloat, count: Int) -> Int? {
        guard let cible = targetIndex(from: source, translation: translation, pitch: pitch, count: count),
              cible != source else { return nil }
        return cible > source ? cible + 1 : cible
    }
}

/// **Une tuile = la vignette de SA scène**, peinte par le composite partagé
/// (`SceneThumbnailRenderer.thumbnail(`, SDK) depuis des bitmaps réduits à la
/// tuile — jamais la photo de 1600 px peinte dans 44 points (#6922).
///
/// Elle se repeint quand l'EMPREINTE de la scène change, et seulement alors ;
/// `ComposerSceneThumbnailRefresh` décide si elle attend. Pendant un geste sur
/// la scène, l'image précédente reste à l'écran — jamais de trou, jamais un
/// rendu par image du glisser.
struct ComposerSceneThumbnailTile: View {
    let slide: StorySlide
    let bgImage: UIImage?
    let loadedImages: [String: UIImage]
    let size: CGSize
    @Environment(\.displayScale) private var displayScale
    @State private var shown: UIImage?

    var body: some View {
        let empreinte = SceneThumbnailFingerprint(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                                                  size: size, scale: displayScale)
        ZStack {
            // Le noir est l'état VIDE dessiné (#5037), et le fond tant que la
            // première vignette n'est pas peinte.
            Color.black
            if let image = shown ?? SceneThumbnailStore.shared.cached(empreinte) {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            }
        }
        .frame(width: size.width, height: size.height)
        .task(id: empreinte) { await repaint(empreinte) }
    }

    private func repaint(_ empreinte: SceneThumbnailFingerprint) async {
        let attend = ComposerSceneThumbnailRefresh.waits(
            isShowingImage: shown != nil,
            isCached: SceneThumbnailStore.shared.cached(empreinte) != nil,
            isBlank: SceneThumbnailContent.isBlank(slide, bgImage: bgImage))
        if attend {
            guard await cancellableSleep(for: .nanoseconds(ComposerSceneThumbnailRefresh.debounceNanoseconds)), !Task.isCancelled else { return }
        }
        shown = SceneThumbnailRenderer.thumbnail(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                                                 size: size, scale: displayScale)
    }
}

/// **Quand repeindre une vignette** — la règle, hors de la vue.
///
/// - la PREMIÈRE image d'une tuile se peint tout de suite : attendre ne
///   montrerait que du noir à la place d'une scène qui en a ;
/// - une vignette déjà en cache, ou une scène vide (du noir), ne coûtent rien ;
/// - sinon la scène change sous le doigt : on attend qu'elle se pose, la
///   vignette précédente restant affichée.
nonisolated enum ComposerSceneThumbnailRefresh {

    static let debounceNanoseconds: UInt64 = 150_000_000

    static func waits(isShowingImage: Bool, isCached: Bool, isBlank: Bool) -> Bool {
        isShowingImage && !isCached && !isBlank
    }
}

/// **Toucher (+) crée une scène — ou dit pourquoi non** (#5009).
///
/// Au plafond de dix (`StoryComposerViewModel.canAddSlide`), `addSlide()` est un
/// no-op : un geste dont l'effet est invisible se lit exactement comme un
/// bouton inerte. Le refus s'ANNONCE donc, il ne se tait pas.
nonisolated enum ComposerSceneAddition: Equatable {
    case added
    case refusedAtCap

    static func outcome(canAddSlide: Bool) -> ComposerSceneAddition {
        canAddSlide ? .added : .refusedAtCap
    }
}

/// **La suppression d'une scène depuis le rail se CONFIRME toujours**, même
/// vide : la corbeille arme l'invite, seule la confirmation rend l'index à
/// retirer. Annuler ne change rien.
nonisolated struct ComposerSceneDeletionPrompt: Equatable {
    private(set) var pendingIndex: Int?

    var isPresented: Bool { pendingIndex != nil }

    func asking(index: Int) -> ComposerSceneDeletionPrompt {
        ComposerSceneDeletionPrompt(pendingIndex: index)
    }

    func cancelled() -> ComposerSceneDeletionPrompt {
        ComposerSceneDeletionPrompt(pendingIndex: nil)
    }

    /// L'index à retirer, ou `nil` si rien n'est demandé ou si la scène visée
    /// n'est plus dans le rail.
    func confirmedIndex(sceneCount: Int) -> Int? {
        guard let pendingIndex, (0..<sceneCount).contains(pendingIndex) else { return nil }
        return pendingIndex
    }
}

/// Le libellé du rail, hors de la vue pour la raison habituelle du dépôt : une
/// chaîne composée dans un corps de vue échappe au cliquet de complétude.
@MainActor
enum ComposerSlideRailCopy {
    /// Le nom de la RANGÉE, distinct du libellé d'une tuile : VoiceOver
    /// annonce le conteneur avant de parcourir ses éléments.
    static var rail: String {
        String(localized: "composer.slide.rail", defaultValue: "Scènes de la publication",
               bundle: .main)
    }

    /// Le refus du onzième `(+)` (#5009) — dit, jamais tu.
    static var capReached: String {
        String(localized: "composer.slide.rail.capReached",
               defaultValue: "Dix scènes au maximum — supprimez-en une pour en créer une autre",
               bundle: .main)
    }

    static func delete(index: Int) -> String {
        String(format: String(localized: "composer.slide.rail.delete",
                              defaultValue: "Supprimer la scène %1$d", bundle: .main), index)
    }

    static var deleteConfirmTitle: String {
        String(localized: "composer.slide.rail.deleteConfirm.title",
               defaultValue: "Supprimer cette scène ?", bundle: .main)
    }

    static var deleteConfirmAction: String {
        String(localized: "composer.slide.rail.deleteConfirm.action",
               defaultValue: "Supprimer", bundle: .main)
    }

    static var deleteCancel: String {
        String(localized: "composer.slide.rail.deleteConfirm.cancel",
               defaultValue: "Annuler", bundle: .main)
    }

    static var duplicate: String {
        String(localized: "composer.shell.duplicate", defaultValue: "Dupliquer la scène",
               table: "ComposerShell", bundle: .main)
    }

    static var moveEarlier: String {
        String(localized: "composer.shell.moveEarlier", defaultValue: "Déplacer avant",
               table: "ComposerShell", bundle: .main)
    }

    static var moveLater: String {
        String(localized: "composer.shell.moveLater", defaultValue: "Déplacer après",
               table: "ComposerShell", bundle: .main)
    }

    static var reorderDone: String {
        String(localized: "composer.shell.reorder.done", defaultValue: "Terminé",
               table: "ComposerShell", bundle: .main)
    }

    static func position(index: Int, total: Int) -> String {
        String(format: String(localized: "composer.slide.rail.position",
                              defaultValue: "Scène %1$d sur %2$d", bundle: .main),
               index, total)
    }
}
