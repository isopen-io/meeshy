import SwiftUI
import MeeshySDK

/// Floating inspector host for the unified timeline. Resolves the current
/// `selection.selectedClipId` — a bus shared by clips, keyframes and
/// transitions (`KeyframeMarkerView` and `TransitionBadge` both push their
/// own id through `selectClip(id:)`) — to exactly one inspector and renders
/// it. Extracted from the former Pro container so the single timeline view
/// surfaces the full editing feature set: selecting a clip, keyframe or
/// transition always opens its editor instead of dead-ending.
public struct TimelineInspectorHost: View {

    /// Identifies which inspector the overlay should surface for the current
    /// `selection.selectedClipId`. Resolution priority is clip → keyframe →
    /// transition, mirroring the lookup chain a tap on the underlying SwiftUI
    /// element would trigger.
    public enum SelectionKind: Equatable, Sendable, Identifiable {
        case clip(ClipInspector.ClipSnapshot)
        case keyframe(KeyframeInspector.KeyframeSnapshot, clipId: String)
        case transition(TransitionInspector.TransitionSnapshot)

        /// Identité de la SÉLECTION, jamais de ses valeurs.
        ///
        /// C'est ce qui pilote la présentation en sheet. La faire dépendre du
        /// volume, de la durée ou de la position d'un keyframe refermerait puis
        /// rouvrirait la sheet à chaque cran de curseur — sous les doigts de
        /// l'utilisateur en train de régler.
        ///
        /// Le préfixe de catégorie est nécessaire : clips, keyframes et
        /// transitions transitent par le MÊME bus (`selection.selectedClipId`)
        /// et peuvent porter le même identifiant brut ; sans lui, passer de
        /// l'un à l'autre ne changerait pas l'identité et la sheet garderait
        /// l'inspecteur précédent.
        public var id: String {
            switch self {
            case .clip(let snapshot):
                return "clip:\(snapshot.id)"
            case .keyframe(let snapshot, let clipId):
                return "keyframe:\(clipId):\(snapshot.id)"
            case .transition(let snapshot):
                return "transition:\(snapshot.id)"
            }
        }
    }

    @ObservedObject private var viewModel: TimelineViewModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let presentation: InspectorPresentation

    public init(viewModel: TimelineViewModel,
                presentation: InspectorPresentation = .popover) {
        self.viewModel = viewModel
        self.presentation = presentation
    }

    /// Sélection à présenter, gardes comprises. `nil` = rien à montrer.
    /// Extrait ici pour piloter une `sheet(item:)` depuis l'hôte.
    public static func presentedSelection(viewModel: TimelineViewModel) -> SelectionKind? {
        // La fiche ne s'ouvre QUE sur une intention explicite — double tap sur
        // une piste, tap sur un marqueur. Auparavant elle suivait
        // `selectedClipId` : surligner, c'était présenter, et le moindre tap
        // recouvrait la timeline qu'on était en train de lire.
        //
        // Les `resolve*Snapshot` ci-dessous lisent toujours `selectedClipId` :
        // c'est exact grâce à l'invariant d'ouverture
        // (`inspectedClipId != nil ⟹ inspectedClipId == selectedClipId`).
        guard viewModel.selection.inspectedClipId != nil else { return nil }
        switch resolveSelectionKind(viewModel: viewModel) {
        case .clip(let snapshot):
            // Un clip synthétique n'a rien d'éditable : ouvrir une sheet vide
            // serait pire que le survol, qu'on pouvait au moins ignorer.
            return shouldShowClipInspector(viewModel: viewModel) ? .clip(snapshot) : nil
        case .some(let kind):
            return kind
        case .none:
            return nil
        }
    }

    // MARK: - Static helpers (pure, testable)

    public static func shouldShowClipInspector(viewModel: TimelineViewModel) -> Bool {
        guard let id = viewModel.selection.selectedClipId else { return false }
        // Synthetic clips (e.g., the static background image lane) carry no
        // editable metadata — surfacing the inspector would expose Delete,
        // Add keyframe and Loop controls that have no effect, and risk the
        // user thinking they removed their background. The clip is still
        // tappable so the selection ring shows, but the inspector stays
        // hidden until they pick a real clip.
        return !StoryComposerViewModel.isSyntheticTimelineClipId(id)
    }

    /// Extrait les points d'automation du volume d'un jeu de keyframes, en
    /// temps ABSOLU.
    ///
    /// Les points sans volume — position, échelle, opacité — sont écartés :
    /// ils ne décrivent pas la courbe et les lister reviendrait à proposer de
    /// retirer un point qui ne règle aucun son.
    public static func volumePoints(
        keyframes: [StoryKeyframe]?,
        clipStart: Float
    ) -> [ClipInspector.ClipSnapshot.VolumePoint] {
        (keyframes ?? []).compactMap { kf in
            guard let volume = kf.volume else { return nil }
            return ClipInspector.ClipSnapshot.VolumePoint(
                id: kf.id, absoluteTime: clipStart + kf.time, volume: volume
            )
        }
    }

    /// `true` quand la slide porte un audio de FOND — la seule situation où
    /// l'atténuation automatique a quelque chose à atténuer.
    ///
    /// Sans lui, la fiche proposerait de couper une atténuation qui ne se
    /// déclenche jamais.
    public static func hasBackgroundAudio(project: TimelineProject) -> Bool {
        project.audioPlayerObjects.contains { $0.isBackground == true }
    }

    /// Fenêtre ANNONCÉE d'un clip, début et durée.
    ///
    /// Un clip permanent (`duration == nil`) court de son début jusqu'à la fin
    /// de la slide : c'est ce que la piste dessine
    /// (`TimelineGeometry.effectiveClipDuration`, même appel) et ce que le trim
    /// au doigt matérialise au premier geste. La fiche lisait `duration ?? 0`
    /// et annonçait « DÉBUT 0,0 · FIN 0,0 · DURÉE 0,0 » sur un texte de 16 s —
    /// trois valeurs fausses, et un piège : un appui sur « + » de la durée
    /// ramenait le clip à 0,1 s au lieu de l'allonger.
    private static func window(startTime: Float,
                               duration: Float?,
                               slideDuration: Float) -> (start: Float, duration: Float) {
        (startTime, TimelineGeometry.effectiveClipDuration(startTime: startTime,
                                                           duration: duration,
                                                           slideDuration: slideDuration))
    }

    /// Pure mapping from the current timeline selection to a `ClipSnapshot`.
    /// Returns `nil` when no clip is selected or when the selected id matches
    /// neither a media clip nor an audio player object.
    public static func resolveClipSnapshot(viewModel: TimelineViewModel) -> ClipInspector.ClipSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        return clipSnapshot(id: id, viewModel: viewModel)
    }

    /// La MÊME résolution, pour un id QUELCONQUE — la sélection n'est qu'un id
    /// parmi d'autres. C'est ce qui permet de demander ce qu'un tap
    /// OUVRIRAIT avant de rien poser (`inspectIfResolvable`) : sans ce
    /// découplage, la seule façon de le savoir serait de poser la sélection
    /// puis de la reprendre — un état transitoire que la vue verrait passer.
    static func clipSnapshot(id: String,
                             viewModel: TimelineViewModel) -> ClipInspector.ClipSnapshot? {
        let slideDuration = viewModel.project.slideDuration
        if let media = viewModel.project.mediaObjects.first(where: { $0.id == id }) {
            // Media objects only carry image/video — audio lives in
            // `audioPlayerObjects`. An unrecognized mediaType (forward-compat)
            // defaults to .video so existing video-tuned controls remain
            // reachable rather than disappearing.
            let kind: ClipInspector.ClipSnapshot.Kind = {
                switch media.kind {
                case .some(.image): return .image
                case .some(.video): return .video
                case .none:         return .video
                }
            }()
            let win = window(startTime: Float(media.startTime ?? 0),
                             duration: media.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: media.id,
                displayName: media.postMediaId,
                kind: kind,
                startTime: win.start,
                duration: win.duration,
                volume: media.volume,
                fadeInDuration: Float(media.fadeIn ?? 0),
                fadeOutDuration: Float(media.fadeOut ?? 0),
                isLooping: media.loop,
                isBackground: media.isBackground,
                name: media.name,
                transform: ClipTransform(x: media.x, y: media.y, scale: media.scale,
                                         rotation: media.rotation, zIndex: media.zIndex),
                volumeKeyframes: volumePoints(keyframes: media.keyframes,
                                              clipStart: Float(media.startTime ?? 0)),
                isDuckingDisabled: media.isDuckingDisabled ?? false,
                slideHasBackgroundAudio: hasBackgroundAudio(project: viewModel.project),
                isFollowingSlide: media.startTime == nil && media.duration == nil
            )
        }
        if let audio = viewModel.project.audioPlayerObjects.first(where: { $0.id == id }) {
            return audioClipSnapshot(audio, slideDuration: slideDuration)
        }
        // Le texte a aussi un début/durée/fondu (et un nom) éditables — sans
        // cette branche, un long-press sur un TEXTE n'ouvrirait aucun inspecteur.
        // Pas de volume ni de boucle pour le texte (slider masqué via
        // hasAudioAffordances(.text) == false).
        if let text = viewModel.project.textObjects.first(where: { $0.id == id }) {
            let win = window(startTime: Float(text.startTime ?? 0),
                             duration: text.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: text.id,
                displayName: text.text,
                kind: .text,
                startTime: win.start,
                duration: win.duration,
                volume: 1.0,
                fadeInDuration: Float(text.fadeIn ?? 0),
                fadeOutDuration: Float(text.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: text.name,
                transform: ClipTransform(x: text.x, y: text.y, scale: text.scale,
                                         rotation: text.rotation, zIndex: text.zIndex),
                isFollowingSlide: text.startTime == nil && text.duration == nil
            )
        }
        // Le sticker a une lane TAPABLE dans la timeline mais aucune branche
        // ici : la sélection résolvait `nil`, la sheet ne s'ouvrait jamais, et
        // le début / la durée / les keyframes du sticker restaient
        // inatteignables alors que le view model les gère tous.
        // Pas de nom persisté sur `StorySticker` — l'emoji EST son identité.
        if let sticker = viewModel.project.stickerObjects.first(where: { $0.id == id }) {
            let win = window(startTime: Float(sticker.startTime ?? 0),
                             duration: sticker.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: sticker.id,
                displayName: sticker.emoji,
                kind: .sticker,
                startTime: win.start,
                duration: win.duration,
                volume: 1.0,
                fadeInDuration: Float(sticker.fadeIn ?? 0),
                fadeOutDuration: Float(sticker.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: nil,
                isFollowingSlide: sticker.startTime == nil && sticker.duration == nil
            )
        }
        // **La pastille de lieu, dernière famille sans fiche** (#4840). Le
        // commentaire du sticker juste au-dessus raconte exactement ce qui lui
        // arrivait — et il n'a pas suffi à empêcher que ça recommence sur la
        // famille suivante : la sélection résolvait `nil`, donc le tap ne
        // posait rien, donc aucune poignée n'était rendue, donc la fenêtre que
        // le ViewModel savait écrire n'était atteignable par aucun geste.
        //
        // Pas de nom persisté sur `StoryLocationObject` — le nom du LIEU est
        // son identité, comme l'emoji l'est pour un sticker.
        if let lieu = viewModel.project.locationObjects.first(where: { $0.id == id }) {
            let win = window(startTime: Float(lieu.startTime ?? 0),
                             duration: lieu.duration.map { Float($0) },
                             slideDuration: slideDuration)
            return ClipInspector.ClipSnapshot(
                id: lieu.id,
                displayName: lieu.place.name ?? "",
                kind: .place,
                startTime: win.start,
                duration: win.duration,
                volume: 1.0,
                fadeInDuration: Float(lieu.fadeIn ?? 0),
                fadeOutDuration: Float(lieu.fadeOut ?? 0),
                isLooping: false,
                isBackground: false,
                name: nil,
                isFollowingSlide: lieu.startTime == nil && lieu.duration == nil
            )
        }
        return nil
    }

    /// Construit la `ClipSnapshot` d'un objet audio — extrait de
    /// `resolveClipSnapshot` pour être RÉUTILISÉ par
    /// `audioKeyframeOwnerSnapshot` ci-dessous : les deux chemins
    /// doivent produire EXACTEMENT la même fiche, qu'on tape le CLIP ou l'un
    /// de ses losanges de volume.
    private static func audioClipSnapshot(_ audio: StoryAudioPlayerObject,
                                          slideDuration: Float) -> ClipInspector.ClipSnapshot {
        let win = window(startTime: audio.startTime ?? 0,
                         duration: audio.duration,
                         slideDuration: slideDuration)
        return ClipInspector.ClipSnapshot(
            id: audio.id,
            displayName: audio.postMediaId,
            kind: .audio,
            startTime: win.start,
            duration: win.duration,
            volume: audio.volume,
            fadeInDuration: audio.fadeIn ?? 0,
            fadeOutDuration: audio.fadeOut ?? 0,
            isLooping: audio.loop ?? false,
            isBackground: audio.isBackground ?? false,
            name: audio.name,
            volumeKeyframes: volumePoints(keyframes: audio.keyframes,
                                          clipStart: audio.startTime ?? 0),
            isFollowingSlide: audio.startTime == nil && audio.duration == nil
        )
    }

    /// Un losange AUDIO n'a AUCUN `KeyframeInspector` à ouvrir — l'audio ne
    /// porte qu'un canal `volume` (`StoryKeyframe.x/y/scale/opacity` restent
    /// `nil`), déjà réglable à la courbe de la fiche CLIP existante
    /// (`ClipSnapshot.volumeKeyframes`). Avant ce routage, taper ce losange
    /// posait `selectedClipId` sur un id qu'aucun résolveur ne connaissait :
    /// cul-de-sac silencieux qui empoisonnait aussi la sélection en cours
    /// (revue Opus, constat 1 / addendum rév. 2, arbitrage 3).
    ///
    /// Recherché SÉPARÉMENT de `resolveKeyframeSnapshot` (media/texte) :
    /// contrairement à eux, la cible n'est pas le keyframe lui-même mais le
    /// clip qui le PORTE — un keyframe audio ne produit donc jamais de cas
    /// `.keyframe(…)`, seulement `.clip(…)`.
    ///
    /// Deux appelants, tous deux VIVANTS et tous deux sur l'id TAPÉ, jamais
    /// sur la sélection : `selectionKind(for:)`, qui décide si une fiche
    /// s'ouvrirait, et `resolvedOwnerId(for:)`, qui dit ce que le bus doit
    /// alors porter. Il n'existe volontairement pas de variante
    /// `resolve…(viewModel:)` lisant `selection.selectedClipId` : depuis la
    /// normalisation au bus, cette sélection ne vaut PLUS jamais l'id d'un
    /// losange audio, et une telle variante serait morte par construction
    /// (revue DoD de D6c, constat 2).
    private static func audioKeyframeOwnerSnapshot(
        id: String, viewModel: TimelineViewModel
    ) -> ClipInspector.ClipSnapshot? {
        guard let audio = viewModel.project.audioPlayerObjects.first(where: { audio in
            (audio.keyframes ?? []).contains { $0.id == id }
        }) else { return nil }
        return audioClipSnapshot(audio, slideDuration: viewModel.project.slideDuration)
    }

    /// Pure mapping from the current selection to a `KeyframeSnapshot`.
    /// A keyframe id is searched across every clip's `keyframes` collection
    /// (media + text ONLY — an audio keyframe id resolves to its OWNING clip
    /// via `audioKeyframeOwnerSnapshot` above, never to a case here).
    /// The owning clip's start time is added to the keyframe's relative
    /// `time` to produce an absolute timeline position so the inspector
    /// header reads correctly.
    ///
    /// Ce temps absolu n'est délibérément PAS écrêté à la barre rendue,
    /// contrairement au losange que dessine `Plan2DLayout.markers` : sur un
    /// clip rogné plus court que son dernier keyframe, le losange se replie
    /// au bord (affordance de dessin) pendant que cet en-tête annonce le
    /// temps STOCKÉ, qui seul fait foi. `StoryKeyframe.time` survit au
    /// rognage — écrêter aussi la fiche ferait mentir la seule surface qui
    /// dit encore où se trouve réellement le keyframe (revue DoD de D6c,
    /// constat 3 ; décision consignée en toutes lettres dans `markers`).
    public static func resolveKeyframeSnapshot(
        viewModel: TimelineViewModel
    ) -> (snapshot: KeyframeInspector.KeyframeSnapshot, clipId: String)? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        return keyframeSnapshot(id: id, viewModel: viewModel)
    }

    private static func keyframeSnapshot(
        id: String, viewModel: TimelineViewModel
    ) -> (snapshot: KeyframeInspector.KeyframeSnapshot, clipId: String)? {
        for media in viewModel.project.mediaObjects {
            guard let keyframes = media.keyframes,
                  let kf = keyframes.first(where: { $0.id == id }) else { continue }
            let clipStart = Float(media.startTime ?? 0)
            let snapshot = KeyframeInspector.KeyframeSnapshot(
                id: kf.id,
                absoluteTime: clipStart + kf.time,
                x: kf.x ?? 0.5,
                y: kf.y ?? 0.5,
                scale: kf.scale ?? 1.0,
                opacity: kf.opacity ?? 1.0
            )
            return (snapshot, media.id)
        }
        for text in viewModel.project.textObjects {
            guard let keyframes = text.keyframes,
                  let kf = keyframes.first(where: { $0.id == id }) else { continue }
            let clipStart = Float(text.startTime ?? 0)
            let snapshot = KeyframeInspector.KeyframeSnapshot(
                id: kf.id,
                absoluteTime: clipStart + kf.time,
                x: kf.x ?? 0.5,
                y: kf.y ?? 0.5,
                scale: kf.scale ?? 1.0,
                opacity: kf.opacity ?? 1.0
            )
            return (snapshot, text.id)
        }
        return nil
    }

    /// Pure mapping from the current selection to a `TransitionSnapshot`.
    /// The selected id is matched against `project.clipTransitions[].id`.
    public static func resolveTransitionSnapshot(
        viewModel: TimelineViewModel
    ) -> TransitionInspector.TransitionSnapshot? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        return transitionSnapshot(id: id, viewModel: viewModel)
    }

    private static func transitionSnapshot(
        id: String, viewModel: TimelineViewModel
    ) -> TransitionInspector.TransitionSnapshot? {
        guard let transition = viewModel.project.clipTransitions.first(where: { $0.id == id }) else {
            return nil
        }
        return TransitionInspector.TransitionSnapshot(
            id: transition.id,
            fromClipId: transition.fromClipId,
            toClipId: transition.toClipId,
            kind: transition.kind,
            duration: transition.duration
        )
    }

    /// Maps a `KeyframeInspector.Easing` UI tag to the SDK-side `StoryEasing`
    /// used by the command stack. `spring` falls back to `easeInOut` since the
    /// SDK does not surface a dedicated spring case yet.
    public static func mapInspectorEasing(_ easing: KeyframeInspector.Easing) -> StoryEasing {
        switch easing {
        case .linear:    return .linear
        case .easeIn:    return .easeIn
        case .easeOut:   return .easeOut
        case .easeInOut: return .easeInOut
        case .spring:    return .easeInOut
        }
    }

    /// Per-clip mute resolution for the audio lane bar. A clip is rendered as
    /// muted when EITHER the global timeline mute is engaged (engine.isMuted)
    /// OR the clip volume is at or below zero — `StoryAudioPlayerObject` has
    /// no `isMuted` flag of its own, so volume 0 is the persistent silenced
    /// state the timeline can show without holding a separate boolean.
    public static func isMutedForAudio(globalMute: Bool, audio: StoryAudioPlayerObject) -> Bool {
        globalMute || audio.volume <= 0
    }

    /// Resolves the current selection to exactly one inspector kind, applying
    /// the clip → audio-keyframe-owner → keyframe → transition priority. A
    /// clip lookup wins because media/audio/text object ids are the primary
    /// handle the playback engine reports via `onElementBecameActive`. An
    /// audio keyframe's OWNING clip is checked next — it resolves to `.clip`,
    /// never `.keyframe` (arbitrage 3, D6c: audio has no per-keyframe
    /// inspector). Returns `nil` when no selection is active or the id
    /// matches none of the categories.
    public static func resolveSelectionKind(
        viewModel: TimelineViewModel
    ) -> SelectionKind? {
        guard let id = viewModel.selection.selectedClipId else { return nil }
        return selectionKind(for: id, viewModel: viewModel)
    }

    /// Ce qu'un id OUVRIRAIT s'il devenait la sélection — sans rien poser.
    /// Même chaîne de priorité que `resolveSelectionKind`, dont elle EST le
    /// corps : deux chaînes jumelles divergeraient au premier résolveur
    /// ajouté, et la garde d'`inspectIfResolvable` promettrait alors une
    /// fiche que la présentation ne rendrait pas.
    public static func selectionKind(for id: String,
                                     viewModel: TimelineViewModel) -> SelectionKind? {
        if let clip = clipSnapshot(id: id, viewModel: viewModel) {
            return .clip(clip)
        }
        // La famille AUDIO : la cible n'est pas le losange mais le clip qui
        // le PORTE. Cette branche répond sur l'id TAPÉ — c'est ici que la
        // garde d'ouverture apprend qu'une fiche existe, avant que
        // `resolvedOwnerId(for:)` ne pose le porteur sur le bus.
        if let clip = audioKeyframeOwnerSnapshot(id: id, viewModel: viewModel) {
            return .clip(clip)
        }
        if let keyframe = keyframeSnapshot(id: id, viewModel: viewModel) {
            return .keyframe(keyframe.snapshot, clipId: keyframe.clipId)
        }
        if let transition = transitionSnapshot(id: id, viewModel: viewModel) {
            return .transition(transition)
        }
        return nil
    }

    /// Ouvre la fiche d'un id — et ne pose la sélection QUE si une fiche va
    /// réellement s'ouvrir.
    ///
    /// `ClipSelectionState.inspect()` écrase `selectedClipId` SANS condition.
    /// Router vers lui un id qu'aucun résolveur ne connaît n'ouvrait donc
    /// aucune fiche ET emportait la sélection en cours : l'utilisateur perdait
    /// la piste qu'il consultait sans rien recevoir en échange, et le plan ne
    /// pouvait plus rien surligner puisque l'id ne désignait aucune piste
    /// (revue Opus, constat 1 — second volet ; addendum rév. 2, arbitrage 3).
    ///
    /// Le filtre est `selectionKind(for:)`, pas `presentedSelection` : un clip
    /// SYNTHÉTIQUE résout bien (`.clip`) et doit rester SÉLECTIONNABLE — c'est
    /// `shouldShowClipInspector` qui lui refuse ensuite une sheet vide, et lui
    /// refuser aussi l'anneau de sélection serait une seconde régression.
    public static func inspectIfResolvable(id: String, viewModel: TimelineViewModel) {
        guard selectionKind(for: id, viewModel: viewModel) != nil else { return }
        viewModel.inspectClip(id: resolvedOwnerId(for: id, viewModel: viewModel))
    }

    /// L'id que le BUS de sélection doit porter pour un id TAPÉ — celui du
    /// PORTEUR, jamais celui du losange qu'on rabat sur lui.
    ///
    /// Router le losange audio au seul niveau de la PRÉSENTATION faisait
    /// diverger la fiche et le bus : la sheet montrait `aud-1` pendant que
    /// `selection.selectedClipId` valait `kf-vol`. Trois surfaces, toutes
    /// bornées par cet id, devenaient alors inertes EN SILENCE — les
    /// commandes de la fiche (`addKeyframeAtPlayhead(volume:)`, le bouton
    /// « Point de volume », SEULE surface d'édition de la courbe ;
    /// `addKeyframeAtPlayhead()` ; `splitSelectedAtPlayhead()`, qui rendent
    /// toutes `nil` sur un id de keyframe et sortent sans message),
    /// l'anneau du plan (`Plan2DView` : `track.id == selectedTrackId`) et
    /// les poignées de bord (`edgeHandleZones`, bornées par la même
    /// égalité). Normaliser ICI, au bus, rend leur cible aux trois d'un seul
    /// geste et laisse la présentation lire une sélection déjà juste
    /// (revue DoD de D6c, constat 1).
    ///
    /// Un id de clip, un losange de média/texte ou une transition se rendent
    /// eux-mêmes : seule la famille AUDIO a un porteur à désigner.
    public static func resolvedOwnerId(for id: String, viewModel: TimelineViewModel) -> String {
        audioKeyframeOwnerSnapshot(id: id, viewModel: viewModel)?.id ?? id
    }

    // MARK: - Body

    public var body: some View {
        switch Self.resolveSelectionKind(viewModel: viewModel) {
        case .clip(let snapshot):
            if Self.shouldShowClipInspector(viewModel: viewModel) {
                clipInspectorOverlay(snapshot: snapshot)
            }
        case .keyframe(let snapshot, let clipId):
            keyframeInspectorOverlay(snapshot: snapshot, clipId: clipId)
        case .transition(let snapshot):
            transitionInspectorOverlay(snapshot: snapshot)
        case .none:
            EmptyView()
        }
    }

    // MARK: - Inspector overlays

    @ViewBuilder
    private func clipInspectorOverlay(snapshot: ClipInspector.ClipSnapshot) -> some View {
        let clipId = snapshot.id
        ClipInspector(
            presentation: presentation,
            clip: snapshot,
            onVolumeChanged: { [viewModel] volume in
                viewModel.setClipVolume(id: clipId, volume: volume)
            },
            onFadeInChanged: { [viewModel] fadeIn in
                viewModel.setClipFadeIn(id: clipId, fadeIn: fadeIn)
            },
            onFadeOutChanged: { [viewModel] fadeOut in
                viewModel.setClipFadeOut(id: clipId, fadeOut: fadeOut)
            },
            onLoopToggled: { [viewModel] loop in
                viewModel.setClipLoop(id: clipId, isLooping: loop)
            },
            onBackgroundToggled: { [viewModel] bg in
                viewModel.setClipBackground(id: clipId, isBackground: bg)
            },
            onAddKeyframe: { viewModel.addKeyframeAtPlayhead() },
            onDelete: { viewModel.deleteClip(id: clipId) },
            onFollowSlide: { [viewModel] in
                viewModel.followSlide(id: clipId)
            },
            // `splitSelectedAtPlayhead` lit `selectedClipId`, comme
            // `onAddKeyframe` et `onAddVolumePoint` ci-dessus et dessous :
            // correct parce que `inspect(_:)` pose les deux identifiants ET
            // que `inspectIfResolvable` y met l'id du PORTEUR
            // (`resolvedOwnerId(for:)`). Router un losange audio à la seule
            // PRÉSENTATION rendrait ces trois commandes inertes en silence.
            onSplit: { viewModel.splitSelectedAtPlayhead() },
            onClose: { viewModel.endInspection() },
            // Stepper de PRÉCISION, pas un geste : `dragClip` aurait fait
            // avaler le pas de 0,1 s par l'aimant magnétique (~0,16 s au zoom
            // par défaut).
            onStartAdjusted: { [viewModel] delta in
                viewModel.nudgeClipStart(id: clipId, by: delta)
            },
            onDurationAdjusted: { [viewModel] delta in
                viewModel.trimClipEnd(id: clipId, deltaTimeSeconds: delta)
            },
            onNameChanged: { [viewModel] name in
                viewModel.setClipName(id: clipId, name: name)
            },
            onEndAdjusted: { [viewModel] delta in
                viewModel.trimClipEnd(id: clipId, deltaTimeSeconds: delta)
            },
            onStartTrimmed: { [viewModel] delta in
                viewModel.trimClipStart(id: clipId, deltaTimeSeconds: delta)
            },
            slideDuration: viewModel.project.slideDuration,
            onStartSet: { [viewModel] seconds in
                viewModel.setClipStart(id: clipId, to: seconds)
            },
            onEndSet: { [viewModel] seconds in
                viewModel.setClipEnd(id: clipId, to: seconds)
            },
            onDurationSet: { [viewModel] seconds in
                viewModel.setClipDuration(id: clipId, to: seconds)
            },
            onTransformChanged: { [viewModel] field in
                viewModel.setClipTransform(id: clipId, field: field)
            },
            playheadTime: viewModel.currentTime,
            onAddVolumePoint: { [viewModel] volume in
                viewModel.addKeyframeAtPlayhead(volume: volume)
            },
            onRemoveVolumePoint: { [viewModel] keyframeId in
                viewModel.deleteKeyframe(clipId: clipId, keyframeId: keyframeId)
            },
            onDuckingDisabledChanged: { [viewModel] isDisabled in
                viewModel.setClipDuckingDisabled(id: clipId, isDisabled: isDisabled)
            },
            onToggleMute: { [viewModel] in
                viewModel.toggleClipMute(id: clipId)
            }
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    @ViewBuilder
    private func keyframeInspectorOverlay(snapshot: KeyframeInspector.KeyframeSnapshot,
                                          clipId: String) -> some View {
        let keyframeId = snapshot.id
        KeyframeInspector(
            keyframe: snapshot,
            // Advanced easings stay gated behind a future product flag.
            // Linear-only matches the launch surface of KeyframeInspector.
            isAdvancedEnabled: false,
            onPositionChanged: { [viewModel] newX, newY in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       position: CGPoint(x: newX, y: newY))
            },
            onScaleChanged: { [viewModel] newScale in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       scale: newScale)
            },
            onOpacityChanged: { [viewModel] newOpacity in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       opacity: newOpacity)
            },
            onEasingChanged: { [viewModel] newEasing in
                viewModel.moveKeyframe(clipId: clipId,
                                       keyframeId: keyframeId,
                                       easing: Self.mapInspectorEasing(newEasing))
            },
            onTimeAdjusted: { [viewModel] delta in
                viewModel.nudgeKeyframeTime(clipId: clipId, keyframeId: keyframeId, by: delta)
            },
            onDelete: { [viewModel] in
                viewModel.deleteKeyframe(clipId: clipId, keyframeId: keyframeId)
            },
            onClose: { viewModel.endInspection() }
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }

    @ViewBuilder
    private func transitionInspectorOverlay(snapshot: TransitionInspector.TransitionSnapshot) -> some View {
        let transitionId = snapshot.id
        let currentEasing = viewModel.project.clipTransitions
            .first(where: { $0.id == transitionId })?.easing ?? .linear
        TransitionInspector(
            transition: snapshot,
            isAdvancedEnabled: true,
            onKindChanged: { [viewModel] kind in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: kind,
                                           duration: snapshot.duration)
            },
            onDurationChanged: { [viewModel] duration in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: snapshot.kind,
                                           duration: duration)
            },
            onDelete: { [viewModel] in
                viewModel.removeTransition(transitionId: transitionId)
            },
            onClose: { viewModel.endInspection() },
            onEasingChanged: { [viewModel] easing in
                viewModel.changeTransition(transitionId: transitionId,
                                           kind: snapshot.kind,
                                           duration: snapshot.duration,
                                           easing: easing)
            },
            easing: currentEasing
        )
        .padding(presentation == .popover ? 12 : 0)
        .transition(.opacity)
        .animation(reduceMotion ? .none : .easeInOut(duration: 0.15),
                   value: viewModel.selection.selectedClipId)
    }
}

// MARK: - Présentation en sheet

/// Présente l'inspecteur de timeline dans une **sheet** plutôt qu'en survol
/// flottant au-dessus des pistes (item 8, directive user 2026-07-25).
///
/// Le survol posait un panneau translucide par-dessus la zone qu'on était en
/// train d'éditer : il masquait les pistes, n'offrait aucune poignée de
/// redimensionnement, et se refermait par un bouton minuscule. La sheet donne
/// les affordances système — poignée, glisser pour fermer, paliers de hauteur —
/// et libère la timeline pendant le réglage.
private struct TimelineInspectorSheetModifier: ViewModifier {
    @ObservedObject var viewModel: TimelineViewModel

    func body(content: Content) -> some View {
        content.sheet(item: Binding(
            get: { TimelineInspectorHost.presentedSelection(viewModel: viewModel) },
            // Fermer la sheet DÉSÉLECTIONNE : sans ça, la sélection resterait
            // posée et la sheet se rouvrirait au prochain rendu.
            // Fermer la sheet referme l'INSPECTION, sans désélectionner : le
            // clip reste surligné, l'utilisateur retrouve où il en était.
            set: { if $0 == nil { viewModel.endInspection() } }
        )) { _ in
            TimelineInspectorHost(viewModel: viewModel, presentation: .sheet)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
                .sheetBackgroundIfAvailable()
        }
    }
}

private extension View {
    /// `presentationBackground` n'existe qu'à partir d'iOS 16.4 ; le paquet
    /// cible iOS 16.0. Sans la garde, la compilation casse sur le plancher.
    @ViewBuilder
    func sheetBackgroundIfAvailable() -> some View {
        if #available(iOS 16.4, *) {
            self.presentationBackground(.ultraThinMaterial)
        } else {
            self
        }
    }
}

public extension View {
    /// Attache l'inspecteur de timeline en sheet à la vue hôte.
    func timelineInspectorSheet(viewModel: TimelineViewModel) -> some View {
        modifier(TimelineInspectorSheetModifier(viewModel: viewModel))
    }
}
