import CoreGraphics
import Foundation

// Extrait de `StoryModels.swift` (#4840, patron de #4723 § « Découpe
// naturelle » — un fichier par famille, le patron que `Models/Story/`
// inaugure).
//
// **Le motif de l'extraction est la RÈGLE, pas l'esthétique** : le fichier
// pesait 4 285 lignes, et « ajouter à un fichier déjà hors budget est interdit :
// on extrait d'abord, on ajoute ensuite » (directive 2026-09-02, plafond 1200).
// #4840 devait ajouter un cas à `TimelineClipKind` et deux branches aux
// commandes de fenêtre — donc ce bloc, et lui seul, sort avant l'ajout. C'est
// exactement ce que #4715 avait fait pour `StorySticker` et
// `StoryLocationObject`, et que #4723 raconte.
//
// Déplacement PUR : aucune déclaration ne change de nom, de visibilité ni de
// corps. Les douze commandes concrètes vivent dans `StoryEditCommands.swift`,
// leur contrat et leur cible ici.

// MARK: - Timeline Project (Snapshot for Command Pattern)

/// Snapshot Codable d'un slide pour le pattern Command (undo/redo).
/// Round-trip garanti : `TimelineProject(from: slide).apply(to: &slide)` est no-op.
public struct TimelineProject: Codable, Sendable {
    public var slideId: String
    public var slideDuration: Float
    public var mediaObjects: [StoryMediaObject]
    public var audioPlayerObjects: [StoryAudioPlayerObject]
    public var textObjects: [StoryTextObject]
    /// Stickers (emoji overlays) du slide — listés dans la timeline pour indiquer
    /// leur fenêtre d'apparition (startTime/duration), déplaçables comme les textes.
    public var stickerObjects: [StorySticker]

    /// **Les pastilles de lieu ONT une piste** (directive porteur 2026-08-31).
    ///
    /// Elles manquaient à ce projet, et j'avais lu leur absence comme une
    /// propriété — « un lieu n'a pas de piste parce qu'il n'a pas de temps ».
    /// Les deux moitiés du raisonnement étaient fausses, et elles se
    /// soutenaient : le modèle n'avait pas de fenêtre parce que la timeline ne
    /// le portait pas, et la timeline ne le portait pas parce que le modèle
    /// n'avait pas de fenêtre.
    ///
    /// > Deux absences qui se justifient l'une l'autre forment un cercle, et un
    /// > cercle a l'air d'une cohérence. Ce qui l'a brisé n'est pas une
    /// > relecture — c'est une source EXTÉRIEURE au code.
    public var locationObjects: [StoryLocationObject]
    public var clipTransitions: [StoryClipTransition]

    /// Read-only snapshot of the slide's inter-slide entry/exit animation,
    /// captured at `init(from:)` for the Timeline chrome lane to display.
    /// NOT round-tripped by `apply(to:)` — editing opening/closing stays the
    /// job of `OpeningEffectChips` above the canvas, same as before this
    /// property existed. Purely informational here.
    public var openingEffect: StoryTransitionEffect?
    public var closingEffect: StoryTransitionEffect?

    public init(slideId: String,
                slideDuration: Float,
                mediaObjects: [StoryMediaObject] = [],
                audioPlayerObjects: [StoryAudioPlayerObject] = [],
                textObjects: [StoryTextObject] = [],
                stickerObjects: [StorySticker] = [],
                locationObjects: [StoryLocationObject] = [],
                clipTransitions: [StoryClipTransition] = [],
                openingEffect: StoryTransitionEffect? = nil,
                closingEffect: StoryTransitionEffect? = nil) {
        self.slideId = slideId
        self.slideDuration = slideDuration
        self.mediaObjects = mediaObjects
        self.audioPlayerObjects = audioPlayerObjects
        self.textObjects = textObjects
        self.stickerObjects = stickerObjects
        self.locationObjects = locationObjects
        self.clipTransitions = clipTransitions
        self.openingEffect = openingEffect
        self.closingEffect = closingEffect
    }

    public init(from slide: StorySlide) {
        self.slideId = slide.id
        // Use the deterministic computed length so the timeline ruler,
        // playhead range and progress bar cover every element — not just
        // the user-typed slide.duration. Without this, a foreground video
        // longer than slide.duration would have its tail unreachable by the
        // scrub bar and clipped on playback / export.
        self.slideDuration = Float(slide.computedTotalDuration())
        self.mediaObjects = slide.effects.mediaObjects ?? []
        self.audioPlayerObjects = slide.effects.audioPlayerObjects ?? []
        self.textObjects = slide.effects.textObjects
        self.stickerObjects = slide.effects.stickerObjects ?? []
        self.locationObjects = slide.effects.locationObjects
        self.clipTransitions = slide.effects.clipTransitions ?? []
        self.openingEffect = slide.effects.opening
        self.closingEffect = slide.effects.closing
    }

    public func apply(to slide: inout StorySlide) {
        // Preserve nil-vs-empty-array idempotence: a project with empty
        // collections must round-trip to a slide with `nil` collections, not
        // `[]`, so `TimelineProject(from: slide).apply(to: &slide)` is a true
        // no-op when the slide had `nil` collections to begin with.
        //
        // Update the slide's duration to match the project's duration. The timeline
        // is AUTHORITATIVE (« la timeline EST la story ») : une durée EXPLICITEMENT
        // configurée par l'auteur (≠ durée auto du contenu) est persistée dans
        // `effects.timelineDuration`, lue EN PRIORITÉ par `computedTotalDuration()`
        // (viewer + canvas + exporter) — permettant d'étendre ET de rogner (12s → 5s).
        // Si la durée timeline == la durée auto du contenu, on NE pose PAS de pin
        // (`nil`) : le slide reste auto-dérivé et se recalcule si le contenu change
        // ensuite (évite un pin obsolète qui figerait une vieille valeur).
        // `slide.duration` reste un miroir legacy.
        slide.duration = TimeInterval(slideDuration)

        slide.effects.mediaObjects = mediaObjects.isEmpty ? nil : mediaObjects
        slide.effects.audioPlayerObjects = audioPlayerObjects.isEmpty ? nil : audioPlayerObjects
        slide.effects.textObjects = textObjects
        slide.effects.stickerObjects = stickerObjects.isEmpty ? nil : stickerObjects
        // `locationObjects` est NON-optionnel sur `StoryEffects` : pas de
        // bascule nil/vide à préserver ici, contrairement à ses quatre voisines.
        slide.effects.locationObjects = locationObjects
        slide.effects.clipTransitions = clipTransitions.isEmpty ? nil : clipTransitions

        // Calculé APRÈS l'écriture des arrays pour que `contentDerivedDuration()`
        // reflète le contenu du projet (et non l'ancien contenu du slide).
        let content = slide.contentDerivedDuration()
        slide.effects.timelineDuration =
            (abs(Double(slideDuration) - content) > 0.05) ? Double(slideDuration) : nil
    }
}

// MARK: - Edit Command (Pattern Command for Undo/Redo)

/// Atomic, reversible operation on a `TimelineProject`. Each conforming type
/// captures the minimum delta required to apply and to revert the operation.
public protocol EditCommand: Codable, Sendable {
    var id: String { get }
    var timestamp: Date { get }
    func apply(to project: inout TimelineProject) throws
    func revert(from project: inout TimelineProject) throws
}

/// Errors thrown when applying or reverting an `EditCommand` against a project
/// whose state no longer matches the assumptions captured at command creation.
public enum EditCommandError: Error, Sendable, Equatable {
    case clipNotFound(id: String)
    case transitionNotFound(id: String)
    case keyframeNotFound(id: String)
    case invalidState(reason: String)
}

// MARK: - Timeline Clip Kind (target collection identifier)

/// Identifies which collection of a `TimelineProject` a command targets.
/// `video` and `image` both live in `mediaObjects` but the kind is preserved
/// to drive UI / engine routing without re-deriving from `mediaType`.
public enum TimelineClipKind: String, Codable, CaseIterable, Sendable {
    case video
    case image
    case audio
    case text
    /// Sticker (emoji) overlay — même famille temporelle que `text` (startTime /
    /// duration / fadeIn / fadeOut, pas de keyframes). Listé et déplaçable dans
    /// la timeline pour indiquer QUAND il apparaît ; ajout/suppression restent
    /// côté canvas (le sticker picker), d'où les branches `.sticker` qui lèvent
    /// `invalidState` dans les commandes non exposées à la timeline.
    case sticker
    /// Pastille de LIEU — **même famille temporelle que `sticker`** (#4840) :
    /// `startTime` / `duration` / `fadeIn` / `fadeOut`, pas de keyframes. Elle
    /// se déplace et se rogne depuis la timeline ; se poser et se retirer
    /// restent l'affaire du canvas, d'où les branches `.place` qui refusent
    /// dans les commandes non exposées.
    ///
    /// **Le nom suit le vocabulaire CIBLE**, pas celui de la somme Swift
    /// voisine. `docs/product/meeshy-composer-modele.md` § 7 le dit : le
    /// contrat nomme cet objet `place` (`canvas-v3.ts`), quand `location`
    /// désigne, dans le même langage et souvent le même fichier, le **lieu de
    /// la PUBLICATION** (`location: SharedPlace?`). `MeeshySceneObject.location`
    /// est la divergence connue, avec son suivi de renommage — ajouter un cas
    /// est le seul moment où le nom juste est gratuit, et le prendre ici évite
    /// un troisième site à renommer.
    case place
}

