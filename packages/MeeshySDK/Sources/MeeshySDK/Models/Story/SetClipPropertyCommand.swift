import CoreGraphics
import Foundation

public struct SetClipPropertyCommand: EditCommand {
    public enum ClipProperty: Codable, Sendable, Equatable {
        case volume(old: Float, new: Float)
        case fadeIn(old: Double?, new: Double?)
        case fadeOut(old: Double?, new: Double?)
        case loop(old: Bool?, new: Bool?)
        case isBackground(old: Bool?, new: Bool?)
        case isLocked(old: Bool?, new: Bool?)
        /// Coupe l'atténuation automatique du clip. Vidéo uniquement : c'est la
        /// piste des vidéos que le ducking atténue.
        case isDuckingDisabled(old: Bool?, new: Bool?)
        case name(old: String?, new: String?)
        /// Place de la piste dans le PLAN — position, taille, rotation, rang de
        /// superposition. Un seul cas plutôt que cinq : régler un champ produit
        /// une transformation COMPLÈTE, donc une seule entrée d'annulation par
        /// réglage, et l'encodage reste à deux clés.
        case transform(old: ClipTransform, new: ClipTransform)

        private enum CodingKeys: String, CodingKey {
            case type, oldFloat, newFloat, oldBool, newBool, oldString, newString
            case oldTransform, newTransform
        }

        private enum Tag: String, Codable {
            case volume, fadeIn, fadeOut, loop, isBackground, isLocked, name, transform
            case isDuckingDisabled
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let tag = try c.decode(Tag.self, forKey: .type)
            switch tag {
            case .volume:
                let old = try c.decode(Float.self, forKey: .oldFloat)
                let new = try c.decode(Float.self, forKey: .newFloat)
                self = .volume(old: old, new: new)
            case .fadeIn:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeIn(old: old, new: new)
            case .fadeOut:
                let old = try c.decodeIfPresent(Double.self, forKey: .oldFloat)
                let new = try c.decodeIfPresent(Double.self, forKey: .newFloat)
                self = .fadeOut(old: old, new: new)
            case .loop:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .loop(old: old, new: new)
            case .isBackground:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isBackground(old: old, new: new)
            case .isLocked:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isLocked(old: old, new: new)
            case .isDuckingDisabled:
                let old = try c.decodeIfPresent(Bool.self, forKey: .oldBool)
                let new = try c.decodeIfPresent(Bool.self, forKey: .newBool)
                self = .isDuckingDisabled(old: old, new: new)
            case .name:
                let old = try c.decodeIfPresent(String.self, forKey: .oldString)
                let new = try c.decodeIfPresent(String.self, forKey: .newString)
                self = .name(old: old, new: new)
            case .transform:
                let old = try c.decode(ClipTransform.self, forKey: .oldTransform)
                let new = try c.decode(ClipTransform.self, forKey: .newTransform)
                self = .transform(old: old, new: new)
            }
        }

        public func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            switch self {
            case .volume(let old, let new):
                try c.encode(Tag.volume, forKey: .type)
                try c.encode(old, forKey: .oldFloat)
                try c.encode(new, forKey: .newFloat)
            case .fadeIn(let old, let new):
                try c.encode(Tag.fadeIn, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .fadeOut(let old, let new):
                try c.encode(Tag.fadeOut, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldFloat)
                try c.encodeIfPresent(new, forKey: .newFloat)
            case .loop(let old, let new):
                try c.encode(Tag.loop, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isBackground(let old, let new):
                try c.encode(Tag.isBackground, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isLocked(let old, let new):
                try c.encode(Tag.isLocked, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .isDuckingDisabled(let old, let new):
                try c.encode(Tag.isDuckingDisabled, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldBool)
                try c.encodeIfPresent(new, forKey: .newBool)
            case .name(let old, let new):
                try c.encode(Tag.name, forKey: .type)
                try c.encodeIfPresent(old, forKey: .oldString)
                try c.encodeIfPresent(new, forKey: .newString)
            case .transform(let old, let new):
                try c.encode(Tag.transform, forKey: .type)
                try c.encode(old, forKey: .oldTransform)
                try c.encode(new, forKey: .newTransform)
            }
        }
    }

    public let id: String
    public let timestamp: Date
    public let clipId: String
    public let kind: TimelineClipKind
    public let property: ClipProperty

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                clipId: String,
                kind: TimelineClipKind,
                property: ClipProperty) {
        self.id = id
        self.timestamp = timestamp
        self.clipId = clipId
        self.kind = kind
        self.property = property
    }

    public func apply(to project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: true)
    }

    public func revert(from project: inout TimelineProject) throws {
        try mutate(project: &project, useNew: false)
    }

    private func mutate(project: inout TimelineProject, useNew: Bool) throws {
        switch kind {
        case .video, .image:
            guard let idx = project.mediaObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.mediaObjects[idx], useNew: useNew)
        case .audio:
            guard let idx = project.audioPlayerObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.audioPlayerObjects[idx], useNew: useNew)
        case .text:
            guard let idx = project.textObjects.firstIndex(where: { $0.id == clipId }) else {
                throw EditCommandError.clipNotFound(id: clipId)
            }
            apply(property: property, to: &project.textObjects[idx], useNew: useNew)
        case .sticker:
            throw EditCommandError.invalidState(reason: "sticker properties are edited on the canvas, not the timeline")
        case .place:
            throw EditCommandError.invalidState(reason: "place properties are edited on the canvas, not the timeline")
        }
    }

    private func apply(property: ClipProperty,
                       to media: inout StoryMediaObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            // Via le mémento : muter depuis la timeline (new == 0) mémorise le
            // niveau courant, et l'undo/redo garde l'invariant
            // `memento != nil ⟹ volume == 0` — sans quoi un unmute post-undo
            // restaurerait un niveau périmé.
            media.setVolumePreservingMuteMemento(useNew ? new : old)
        case .fadeIn(let old, let new):
            media.fadeIn = useNew ? new : old
        case .fadeOut(let old, let new):
            media.fadeOut = useNew ? new : old
        case .loop(let old, let new):
            media.loop = (useNew ? new : old) ?? false
        case .isBackground(let old, let new):
            media.isBackground = (useNew ? new : old) ?? false
        case .isLocked:
            break
        case .isDuckingDisabled(let old, let new):
            media.isDuckingDisabled = useNew ? new : old
        case .name(let old, let new):
            media.name = useNew ? new : old
        case .transform(let old, let new):
            let t = useNew ? new : old
            media.x = t.x; media.y = t.y
            media.scale = t.scale; media.rotation = t.rotation
            media.zIndex = t.zIndex
        }
    }

    private func apply(property: ClipProperty,
                       to audio: inout StoryAudioPlayerObject,
                       useNew: Bool) {
        switch property {
        case .volume(let old, let new):
            // Même invariant de mémento que la branche média — cf. ci-dessus.
            audio.setVolumePreservingMuteMemento(useNew ? new : old)
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeIn = val.map { Float($0) }
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            audio.fadeOut = val.map { Float($0) }
        case .loop(let old, let new):
            audio.loop = useNew ? new : old
        case .isBackground(let old, let new):
            audio.isBackground = useNew ? new : old
        case .isLocked:
            break
        case .isDuckingDisabled:
            // Le ducking atténue la piste des VIDÉOS pour dégager la musique :
            // le couper sur un audio n'aurait rien à atténuer.
            break
        case .name(let old, let new):
            audio.name = useNew ? new : old
        case .transform:
            // Un audio ne se voit pas : ses x/y existent dans le modèle mais ne
            // pilotent aucun rendu. La fiche ne propose pas la section.
            break
        }
    }

    private func apply(property: ClipProperty,
                       to text: inout StoryTextObject,
                       useNew: Bool) {
        switch property {
        case .isLocked(let old, let new):
            text.isLocked = useNew ? new : old
        case .fadeIn(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeIn = val
        case .fadeOut(let old, let new):
            let val: Double? = useNew ? new : old
            text.fadeOut = val
        case .name(let old, let new):
            text.name = useNew ? new : old
        case .transform(let old, let new):
            let tr = useNew ? new : old
            text.x = tr.x; text.y = tr.y
            text.scale = tr.scale; text.rotation = tr.rotation
            text.zIndex = tr.zIndex
        case .volume, .loop, .isBackground, .isDuckingDisabled:
            break
        }
    }
}
