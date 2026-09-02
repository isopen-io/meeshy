import Foundation
import MeeshySDK

/// Pont PUR entre ce que `TimelineViewModel` porte (`TimelineProject`) et ce
/// que `Plan2DLayout.tracks(from:)` (D1, gelé) lit (`StoryEffects` — le
/// RUNTIME du composer). Global Constraints (lot D) : « le plan lit le
/// RUNTIME via un adaptateur pur — pas CanvasV3 : le composer édite le
/// runtime, le plan reflète ce qui s'édite. »
///
/// `TimelineProject` porte CINQ des familles de `StoryEffects` — texte,
/// sticker, média, audio et **lieu** (`init(from: StorySlide)`,
/// `StoryModels.swift`). `background` / `drawingStrokes` / `backgroundAudioId`
/// vivent uniquement sur `slide.effects`, jamais sur le projet timeline : cet
/// adaptateur les laisse à leur défaut plutôt que d'en fabriquer un —
/// `StoryEffects` reste honnête sur ce qu'il sait, un `StoryEffects` mensonger
/// serait pire qu'un plan incomplet.
///
/// **Le lieu a rejoint la liste le 2026-08-31** (directive porteur, #4591) :
/// une pastille de lieu apparaît et disparaît quand elle veut, donc elle a une
/// fenêtre, donc elle a une piste. Tant qu'elle ne traversait pas cet
/// adaptateur, la fenêtre posée au modèle n'atteignait AUCUN pixel du plan —
/// un champ nourri par personne.
///
/// `mediaObjects` traverse SANS filtre ni réécriture : `id` (synthétique ou
/// non) et `isBackground` restent ceux du projet — c'est sur EUX que
/// `Plan2DLayout.isLockedMedia` dérive `Plan2DTrack.isLocked` (revue Opus,
/// constat 3). Un adaptateur qui les altérerait casserait le verrou en aval
/// sans qu'aucun test de `Plan2DLayout` ne puisse le voir depuis sa propre
/// fixture — `Plan2DProjectAdapterTests` referme ce trou par un test bout en
/// bout (`TimelineProject` → `StoryEffects` → `Plan2DTrack.isLocked`).
public nonisolated enum Plan2DProjectAdapter {

    public static func effects(from project: TimelineProject) -> StoryEffects {
        StoryEffects(
            stickerObjects: project.stickerObjects,
            textObjects: project.textObjects,
            locationObjects: project.locationObjects,
            mediaObjects: project.mediaObjects,
            audioPlayerObjects: project.audioPlayerObjects
        )
    }
}
