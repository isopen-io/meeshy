import Foundation

// MARK: - StoryEffects — résolution AUDIO

/// **Ce qui décide du son d'une slide, extrait de `StoryModels.swift`.**
///
/// Le fichier d'origine est hors budget (2 600+ lignes) et la règle interdit
/// d'y ajouter : on extrait d'abord, on ajoute ensuite. Le découpage suit une
/// RESPONSABILITÉ — « quel clip audio cette slide joue-t-elle, fond et
/// avant-plan » — et non une tranche arbitraire.
public extension StoryEffects {

    /// Retourne l'audio background résolu.
    /// - Premier `audioPlayerObjects` avec `isBackground == true` → cet objet.
    /// - Sinon, si aucun audioPlayerObject n'a de flag explicite (tous `nil`) ET
    ///   que la story utilise les champs legacy `backgroundAudioId/Volume/Start/End`,
    ///   synthétise un `StoryAudioPlayerObject` virtuel.
    /// - Un `isBackground: false` explicite sur un audioPlayerObject signale que
    ///   l'utilisateur a manipulé les flags — on ne retombe plus sur la synthèse legacy.
    ///
    /// **`backgroundAudioStart/End` ROGNENT LA SOURCE** (#6580). Ce ne sont pas
    /// des bornes sur le plan, et trois sites du dépôt le disaient déjà — l'aveu
    /// explicite de `legacyBackgroundSoundTrack`, dans la mise en plan 2D de la
    /// timeline (« ce ne sont pas des bornes sur le plan », d'où sa piste
    /// fantôme) — cité par son SYMBOLE seul, parce que la garde de périmètre du
    /// plan balaie le TEXTE des sources et ne distingue pas une citation d'un
    /// import —, le transport de
    /// `CanvasV3Migration` en `BackgroundSoundV3.Bounds` (la fenêtre de rognage
    /// du fil v3), et la lecture de `StoryComposerView+SyncRestore` en
    /// `audioTrimStart`. Seul CE site disait l'inverse, et c'est celui qui
    /// décide de ce qu'on ENTEND : posées en `startTime`, ces bornes faisaient
    /// jouer `start` secondes de SILENCE puis le fichier DEPUIS ZÉRO.
    ///
    /// Strictement inchangé quand les deux bornes sont `nil` — le cas de
    /// l'immense majorité du corpus.
    var resolvedBackgroundAudio: StoryAudioPlayerObject? {
        if let existing = audioPlayerObjects?.first(where: { $0.isBackground == true }) {
            return existing
        }
        let audiosUntouched = (audioPlayerObjects ?? []).allSatisfy { $0.isBackground == nil }
        guard audiosUntouched, let bgId = backgroundAudioId else { return nil }
        let duration: Float? = {
            guard let start = backgroundAudioStart,
                  let end = backgroundAudioEnd,
                  end > start else { return nil }
            return Float(end - start)
        }()
        return StoryAudioPlayerObject(
            id: "legacy-bg-audio",
            postMediaId: bgId,
            placement: "background",
            volume: backgroundAudioVolume ?? 0.5,
            waveformSamples: [],
            isBackground: true,
            backgroundAudioVariants: backgroundAudioVariants,
            startTime: nil,
            duration: duration,
            loop: true,
            sourceStart: backgroundAudioStart,
            sourceEnd: backgroundAudioEnd
        )
    }

    /// Retourne uniquement les audios foreground (draggable pills avec UI).
    var resolvedForegroundAudioPlayers: [StoryAudioPlayerObject] {
        (audioPlayerObjects ?? []).filter { $0.isBackground != true }
    }
}
