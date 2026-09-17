import Foundation
import AVFoundation
import os
import MeeshySDK

/// Sample-accurate foreground-audio mixer for the story reader.
///
/// Replaces the legacy per-clip `AVPlayer` flow which had two latency sources:
///   1. `AVPlayer.play()` startup waits 30-100ms even on prerolled players.
///   2. The reader's 50ms `Timer` polled `currentTime >= startTime` — adding
///      another 0-50ms scheduling jitter on top of (1).
///
/// The mixer keeps a single `AVAudioEngine` running for the lifetime of the
/// reader and pins each audio clip's playback to a precise host time derived
/// from `clip.startTime`. The actual rendering then happens on the audio
/// thread without further main-thread mediation, so a clip whose `startTime`
/// lands halfway between two `CADisplayLink` ticks still fires *exactly* on
/// its expected sample, not at the next tick.
///
/// Apple Core Audio guidance: `AVAudioTime(hostTime:)` is the only reliable
/// cross-node timing reference. `sampleTime` may differ between input and
/// output nodes; `hostTime` resolves to `mach_absolute_time()` and is
/// consistent for every node connected to the same engine.
@MainActor
public final class ReaderAudioMixer {

    public private(set) var isMuted: Bool = false
    public private(set) var isPlaying: Bool = false
    /// Number of foreground audio clips currently configured.
    public var activeClipCount: Int { entries.count }

    private let logger = Logger(subsystem: "me.meeshy.app", category: "media")
    /// `internal` : l'extension du FOND vit dans son propre fichier
    /// (`ReaderAudioMixer+Background.swift`) et y attache son node.
    let engine = AVAudioEngine()

    /// Format canonique de mixage — 48 kHz stereo Float32 (standard broadcast,
    /// natif AAC LC, natif iPhone speaker + AirPods). Avant ce fix, chaque
    /// fichier était connecté au mainMixer avec son `file.processingFormat`
    /// natif (souvent 44.1 kHz pour les voice-over locaux, 22 kHz pour le TTS
    /// Chatterbox, 48 kHz pour les vidéos importées). Le mixer faisait alors
    /// un sample-rate conversion implicite à QUALITÉ MEDIUM (Apple default),
    /// audible sous forme de crackle / artefacts d'aliasing sur les transitions
    /// audio rapides. Connecter explicitement avec ce format force AVAudioEngine
    /// à insérer un AVAudioConverter haute qualité dès la connexion, et le
    /// mainMixer travaille en interne sur un seul format → moins de SRC
    /// imbriqués, signal propre.
    /// Returned via accessor instead of stored `let` initialiser — `AVAudioFormat`
    /// init can theoretically fail under restricted audio sessions (locked
    /// AirPlay, simulator with audio disabled). We fall back through three
    /// safer constructors before giving up to the engine's natural mixer format
    /// (which is guaranteed non-nil because the engine is live).
    static func resolveCanonicalFormat(mixer: AVAudioMixerNode) -> AVAudioFormat {
        if let std = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2) {
            return std
        }
        if let pcm = AVAudioFormat(commonFormat: .pcmFormatFloat32,
                                   sampleRate: 48_000,
                                   channels: 2,
                                   interleaved: false) {
            return pcm
        }
        // Ultimate fallback: mixer's natural output format — already valid by
        // virtue of the engine being live. Sample rate may differ from 48kHz
        // but the format is guaranteed coherent across all attached nodes.
        return mixer.outputFormat(forBus: 0)
    }
    /// One entry per configured clip, keyed by audio object id.
    private var entries: [String: Entry] = [:]
    /// Wall-clock origin for the current playback pass — set on `play()` and
    /// used to derive the sample-accurate host-time targets for each clip.
    private var playbackStartHostTime: UInt64?
    /// Instant `mach_absolute_time()` du dernier `pause()`, tant qu'aucune
    /// reprise ne l'a soldé. `slideElapsedSeconds` se mesure contre
    /// `playbackStartHostTime`, une horloge MURALE : sans ce jalon, une pause
    /// de N secondes faisait avancer le chip audio de N secondes pendant que
    /// rien ne jouait, et la reprise servait un écoulé faux de N (#6580).
    private var pausedAtHostTime: UInt64?
    private var didShutdown: Bool = false
    /// Stored background audio entry (at most one per slide).
    var backgroundEntry: BackgroundEntry?
    private var _duckingEnabled: Bool = false
    private var _duckedBackgroundVolume: Float = 0.5

    /// Timeline offset (seconds, relative to the slide origin) at which the
    /// background entry should begin. Filled by `configureBackground` from the
    /// resolved `StoryAudioPlayerObject.startTime` (which already folds in the
    /// legacy `StoryEffects.backgroundAudioStart`). Defaults to `0`.
    public internal(set) var backgroundStartOffset: Double = 0

    /// Identifies the slide content the engine was last scheduled against.
    /// A repeated `play(originHost:slideKey:)` carrying the same key resumes
    /// the transport WITHOUT re-scheduling buffers — this is the idempotence
    /// guard that stops a SwiftUI re-render (`updateUIView` → `setReaderContext`)
    /// from stacking duplicate buffers on the same node (RC4.6, no echo).
    /// Reset by `teardown()` / `configureBackground(...)` / `stop()` so the
    /// next configure pass always re-schedules cleanly.
    var startedSlideKey: String?

    // MARK: Default background envelope (RC4.7)

    /// Fade-in floor — the default envelope ramps the background from 30 % to
    /// 100 % of its target volume.
    public static let defaultEnvelopeFloorFraction: Float = 0.30
    /// Fade-out tail — the default envelope ramps the background down to 5 %.
    public static let defaultEnvelopeTailFraction: Float = 0.05
    /// Default fade-in duration (seconds).
    public static let defaultEnvelopeFadeInSeconds: Double = 1.2
    /// Default fade-out duration (seconds).
    public static let defaultEnvelopeFadeOutSeconds: Double = 0.5

    /// Le poseur de buffers. Injecté pour qu'un témoin puisse LIRE ce que le
    /// mixer remet au moteur — la frame de départ ET l'heure — sans faire
    /// tourner d'`AVAudioEngine` (cf. `ReaderAudioSchedulerProviding`).
    private let scheduler: any ReaderAudioSchedulerProviding

    public init() {
        self.scheduler = ReaderAudioNodeScheduler()
    }

    /// Seam de test : `internal`, donc invisible hors du module.
    init(scheduler: any ReaderAudioSchedulerProviding) {
        self.scheduler = scheduler
    }

    // MARK: - Configure

    /// Configure the mixer for a slide. Call before `play()`. Replaces any
    /// previous configuration and tears down dangling nodes.
    public func configure(audios: [StoryAudioPlayerObject], urls: [String: URL]) throws {
        teardown()
        logger.info("ReaderAudioMixer.configure audios=\(audios.count) urls=\(urls.count)")
        for audio in audios {
            guard let url = urls[audio.id] else {
                logger.error("ReaderAudioMixer.configure skipping \(audio.id, privacy: .public) — no URL in dict")
                continue
            }
            // AVAudioFile(forReading:) rejects HTTPS URLs with OSStatus 2003334207
            // ("not a file"). Log explicitly so a silent skip becomes diagnosable.
            if !url.isFileURL {
                logger.error("ReaderAudioMixer.configure \(audio.id, privacy: .public) URL is not file:// scheme=\(url.scheme ?? "nil", privacy: .public) — AVAudioFile will reject")
            }
            do {
                let file = try AVAudioFile(forReading: url)
                let node = AVAudioPlayerNode()
                engine.attach(node)
                // Connect via canonical format — AVAudioEngine inserts a
                // high-quality `AVAudioConverter` between this node and the
                // mainMixer when `file.processingFormat` differs (samplerate or
                // channel count). Cf. `canonicalFormat` docstring.
                engine.connect(node,
                               to: engine.mainMixerNode,
                               format: Self.resolveCanonicalFormat(mixer: engine.mainMixerNode))
                let initialVolume = audio.fadeIn ?? 0 > 0 ? 0 : audio.volume
                node.volume = isMuted ? 0 : initialVolume
                entries[audio.id] = Entry(
                    audioId: audio.id,
                    file: file,
                    node: node,
                    startTime: audio.startTime ?? 0,
                    targetVolume: audio.volume,
                    fadeIn: audio.fadeIn ?? 0,
                    fadeOut: audio.fadeOut ?? 0,
                    duration: audio.duration ?? Float(file.length) / Float(file.processingFormat.sampleRate),
                    loop: audio.loop ?? false,
                    // Fenêtre de rognage NON destructive (bornes seules, aucun
                    // ré-encodage). Résolue une fois ici — jamais recalculée à
                    // chaque schedule — via `StoryAudioPlayerObject.trimBounds`,
                    // le résolveur UNIQUE qui tolère les bornes vieillies. Le
                    // fichier porte sa PROPRE durée source (`file.length` /
                    // `processingFormat.sampleRate`, jamais `audio.duration` qui,
                    // une fois rogné, est la durée OCCUPÉE sur la timeline — pas
                    // celle de la source). Sans intention de rognage déclarée
                    // (les deux bornes `nil`), on ne résout rien : `nil` fait
                    // retomber `scheduleEntry` sur `scheduleFile`, le chemin
                    // d'aujourd'hui, à coût nul pour l'immense majorité des clips.
                    trimBounds: (audio.sourceStart == nil && audio.sourceEnd == nil)
                        ? nil
                        : audio.trimBounds(sourceDuration: Double(file.length) / max(file.processingFormat.sampleRate, 1))
                )
            } catch {
                logger.error("ReaderAudioMixer failed to load \(audio.id): \(error.localizedDescription)")
            }
        }
        logger.info("ReaderAudioMixer.configure done entries=\(self.entries.count)")
    }

    // MARK: - Transport

    /// Start playback anchored on a real timeline origin (RC4.4).
    ///
    /// `originHost` is the `mach_absolute_time()` value that materialises the
    /// slide's `t = 0`. The mixer NEVER captures its own origin: foreground
    /// clips are scheduled at `originHost + hostTime(clip.startTime)` and the
    /// background entry at `originHost + hostTime(backgroundStartOffset)`, so
    /// audio stays in phase with the canvas playhead the caller already drives.
    ///
    /// `slideKey` identifies the slide content. When it matches the key the
    /// engine was last scheduled against, the call resumes the transport
    /// without re-scheduling — a re-render (`updateUIView` → `setReaderContext`)
    /// can therefore re-invoke `play` freely without stacking buffers (RC4.6).
    ///
    /// Returns `true` when it scheduled a fresh pass, `false` when it merely
    /// resumed an existing one — the caller uses this to apply the default
    /// fade envelope exactly once per scheduled pass.
    ///
    /// `slideElapsed` est la position (secondes) de la SLIDE au moment de
    /// l'appel — `0` à l'ouverture nominale, `t > 0` quand le détail s'ouvre
    /// sur la position que la carte publiait déjà (#6580). Chaque clip en
    /// déduit son propre écoulé et entre EN COURS de piste plutôt que de
    /// rejouer son fichier depuis zéro.
    @discardableResult
    public func play(originHost: UInt64, slideKey: String, slideElapsed: Double = 0) throws -> Bool {
        logger.info("ReaderAudioMixer.play slideKey=\(slideKey, privacy: .public) entries=\(self.entries.count) bg=\(self.backgroundEntry == nil ? "nil" : "set") resume=\(self.startedSlideKey == slideKey)")
        if startedSlideKey == slideKey {
            // HORS de toute correction #6580 : une reprise à clé identique reste
            // un `resume`, jamais une replanification — replanifier ici
            // ressusciterait l'ÉCHO que cette garde ferme (RC4.6).
            try resumeWithoutRescheduling()
            return false
        }
        playbackStartHostTime = originHost
        pausedAtHostTime = nil
        guard !entries.isEmpty || backgroundEntry != nil else {
            logger.error("ReaderAudioMixer.play nothing scheduled (entries empty + no bg) — silent slide slideKey=\(slideKey, privacy: .public)")
            startedSlideKey = slideKey
            isPlaying = true
            return true
        }
        if !engine.isRunning {
            try engine.start()
        }
        for entry in entries.values {
            scheduleEntry(entry, originHost: originHost, slideElapsed: slideElapsed)
            entry.node.play()
            // Schedule volume fades on the main runloop. node.volume is read
            // by the audio thread per render slice, so the reads are safe.
            scheduleFades(for: entry, originHost: originHost, slideElapsed: slideElapsed)
        }
        startBackground(originHost: originHost, slideElapsed: slideElapsed)
        startedSlideKey = slideKey
        isPlaying = true
        return true
    }

    /// Resumes a previously-scheduled pass (idempotent re-render or `.edit`↔
    /// `.play` bounce) — restarts the engine and any paused nodes WITHOUT
    /// touching the buffer schedule, so no clip is heard twice.
    private func resumeWithoutRescheduling() throws {
        // L'origine GLISSE de la durée pendant laquelle rien n'a joué, sinon
        // `slideElapsedSeconds` — et le chip audio qui le publie — compterait
        // la pause comme du temps de lecture.
        advancePlaybackOriginPastPause()
        guard !entries.isEmpty || backgroundEntry != nil else {
            isPlaying = true
            return
        }
        if !engine.isRunning {
            try engine.start()
        }
        for entry in entries.values where !entry.node.isPlaying {
            entry.node.play()
        }
        if let bg = backgroundEntry, !bg.player.isPlaying {
            bg.player.play()
        }
        isPlaying = true
    }

    /// Décale `playbackStartHostTime` de la durée de la pause en cours, et
    /// solde le jalon. Sans effet si aucune pause n'est en attente.
    private func advancePlaybackOriginPastPause() {
        guard let pausedAt = pausedAtHostTime else { return }
        pausedAtHostTime = nil
        guard let origin = playbackStartHostTime else { return }
        playbackStartHostTime = ReaderAudioMixer.originAfterResume(
            origin: origin, pausedAt: pausedAt, resumedAt: mach_absolute_time())
    }

    /// Nouvelle origine d'un transport repris après une pause : l'ancienne
    /// origine glissée de `resumedAt - pausedAt`. Pure et statique — la seule
    /// forme de cette règle qui s'éprouve sans horloge réelle.
    ///
    /// Une reprise ANTÉRIEURE à la pause (horloge non monotone, jalon périmé)
    /// rend l'origine inchangée plutôt qu'une valeur reculée : un écoulé trop
    /// grand est un défaut d'affichage, un écoulé NÉGATIF est un crash de
    /// soustraction non signée.
    static func originAfterResume(origin: UInt64, pausedAt: UInt64, resumedAt: UInt64) -> UInt64 {
        guard resumedAt > pausedAt else { return origin }
        let pausedTicks = resumedAt - pausedAt
        let (shifted, overflow) = origin.addingReportingOverflow(pausedTicks)
        return overflow ? origin : shifted
    }

    public func pause() {
        for entry in entries.values { entry.node.pause() }
        backgroundEntry?.player.pause()
        if engine.isRunning { engine.pause() }
        // Jalon posé AVANT la remise à `false` : `slideElapsedSeconds` se gèle
        // sur la valeur de cet instant, et la reprise repart d'ici.
        if pausedAtHostTime == nil, playbackStartHostTime != nil {
            pausedAtHostTime = mach_absolute_time()
        }
        isPlaying = false
    }

    public func stop() {
        for entry in entries.values { entry.node.stop() }
        backgroundEntry?.player.stop()
        if engine.isRunning { engine.stop() }
        playbackStartHostTime = nil
        pausedAtHostTime = nil
        startedSlideKey = nil
        isPlaying = false
    }

    // MARK: - Volume / mute

    public func setVolume(_ volume: Float, for audioId: String) {
        // Plafond partagé : un gain au-delà de 100 % doit survivre jusqu'au
        // chemin d'amplification, le borner ici le rendrait inaudible.
        let clamped = max(0, min(StoryVolume.maxGain, volume))
        guard var entry = entries[audioId] else { return }
        entry.targetVolume = clamped
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func setMute(_ muted: Bool) {
        isMuted = muted
        for entry in entries.values {
            entry.node.volume = effectiveVolume(for: entry)
        }
        if let bg = backgroundEntry {
            bg.player.volume = muted ? 0 : bg.targetVolume
        }
    }

    /// Volume courant du clip de fond, indépendant du mute global.
    ///
    /// Le mixer n'exposait que `setVolume(_:for:)`, réservé aux clips
    /// d'avant-plan indexés par id : le slot de fond, unique et sans id
    /// exposé, restait figé sur la valeur posée à `configureBackground`.
    /// L'automation de volume a besoin de le piloter à chaque tick.
    public func setBackgroundVolume(_ volume: Float) {
        guard var bg = backgroundEntry else { return }
        let clamped = min(StoryVolume.maxGain, max(0, volume))
        guard bg.targetVolume != clamped else { return }
        bg.targetVolume = clamped
        backgroundEntry = bg
        bg.player.volume = isMuted ? 0 : clamped
    }

    /// Mute / unmute a single foreground clip without touching the global
    /// `isMuted` flag (used by the per-chip tap action in the reader). The
    /// background slot is not exposed here — the bg has no dedicated chip.
    public func setMute(_ muted: Bool, for audioId: String) {
        guard var entry = entries[audioId] else { return }
        entry.isUserMuted = muted
        entries[audioId] = entry
        entry.node.volume = effectiveVolume(for: entry)
    }

    public func isMuted(audioId: String) -> Bool {
        entries[audioId]?.isUserMuted ?? false
    }

    /// Volume CIBLE d'un clip d'avant-plan tel que le mixer le tient (avant
    /// mute global / per-piste). Miroir de `AudioMixer.intendedVolume(for:)` —
    /// seam d'observation : c'est ce qui permet de prouver qu'un mute d'auteur
    /// (`volume = 0` dans le modèle) atteint réellement le moteur.
    public func intendedVolume(for audioId: String) -> Float? {
        entries[audioId]?.targetVolume
    }

    /// Volume cible du slot de fond (nil si aucun fond configuré).
    public func intendedBackgroundVolume() -> Float? {
        backgroundEntry?.targetVolume
    }

    /// Volume RÉELLEMENT porté par le node d'un clip — distinct de
    /// `intendedVolume(for:)`, qui rend la CIBLE. Seam d'observation de
    /// l'enveloppe : c'est lui qui prouve qu'un clip entré en cours de piste
    /// n'est pas rendu muet par une montée rejouée depuis zéro.
    func appliedVolume(for audioId: String) -> Float? {
        entries[audioId]?.node.volume
    }

    private func effectiveVolume(for entry: Entry) -> Float {
        (isMuted || entry.isUserMuted) ? 0 : entry.targetVolume
    }

    // MARK: - Playhead

    /// Temps écoulé depuis l'origine `t = 0` de la slide en cours, en
    /// secondes. Calculé contre `playbackStartHostTime` qui partage le même
    /// référentiel `mach_absolute_time()` que les `AVAudioTime` utilisés pour
    /// scheduler les buffers — c'est donc *le clock audio réel* (sample-
    /// accurate, identique à celui qu'utilise le moteur).
    ///
    /// Retourne `nil` quand aucune slide ne joue (`playbackStartHostTime` nil
    /// après `teardown()` / `stop()`, ou avant le premier `play(...)`).
    public var slideElapsedSeconds: TimeInterval? {
        guard let start = playbackStartHostTime, isPlaying else { return nil }
        // `delaySeconds(forHostTime:relativeTo:)` retourne `target - relativeTo`
        // si positif, sinon `0`. On l'utilise à l'envers (now = target, start
        // = relativeTo) pour obtenir l'écoulé.
        return Self.delaySeconds(forHostTime: mach_absolute_time(), relativeTo: start)
    }

    /// Position de lecture sample-accurate d'un clip particulier (en
    /// secondes, relative au début du fichier audio). Lit
    /// `AVAudioPlayerNode.playerTime(forNodeTime:)` qui est l'API canonique
    /// Apple pour obtenir le temps réel de lecture. Retourne `nil` si le clip
    /// n'a pas encore commencé à rendre (pas de `lastRenderTime`).
    public func clipElapsedSeconds(for audioId: String) -> TimeInterval? {
        guard let entry = entries[audioId],
              let nodeTime = entry.node.lastRenderTime,
              let playerTime = entry.node.playerTime(forNodeTime: nodeTime),
              playerTime.sampleRate > 0
        else { return nil }
        return Double(playerTime.sampleTime) / playerTime.sampleRate
    }

    // MARK: - Lifecycle

    public func shutdown() {
        guard !didShutdown else { return }
        didShutdown = true
        teardown()
    }

    private func teardown() {
        for entry in entries.values {
            entry.node.stop()
            engine.detach(entry.node)
            entry.fadeTimers.forEach { $0.invalidate() }
            entry.fadeTasks.forEach { $0.cancel() }
        }
        entries.removeAll()
        if let bg = backgroundEntry {
            bg.player.stop()
            engine.detach(bg.player)
            bg.fadeTimers.forEach { $0.invalidate() }
            bg.fadeTasks.forEach { $0.cancel() }
            backgroundEntry = nil
        }
        if engine.isRunning {
            engine.stop()
        }
        playbackStartHostTime = nil
        pausedAtHostTime = nil
        startedSlideKey = nil
        backgroundStartOffset = 0
        isPlaying = false
    }

    // `nonisolated` : ne lit que `didShutdown` (Bool, Sendable) + log. Sans ce
    // mot-clé, le deinit @MainActor implicite est isolé et passe par
    // `swift_task_deinitOnExecutorMainActorBackDeploy`, dont le shim double-free
    // le TaskLocal scope et abort (SIGABRT) à la libération du mixer — y compris
    // via le teardown de StoryCanvasUIView qui possède toujours un audioMixer.
    nonisolated deinit {
        if !didShutdown {
            os.Logger(subsystem: "me.meeshy.app", category: "media").warning(
                "ReaderAudioMixer deinit without shutdown() — owner should call shutdown() before drop to release AVAudioEngine + nodes deterministically."
            )
        }
    }

    // MARK: - Scheduling

    /// `slideElapsed` est le playhead de la SLIDE (secondes) au moment où la
    /// passe est planifiée — zéro à l'ouverture nominale, `t > 0` quand le
    /// détail s'ouvre sur la position d'une carte déjà en lecture (#6580).
    /// L'écoulé DANS le clip s'en déduit : `max(0, slideElapsed - startTime)`.
    private func scheduleEntry(_ entry: Entry, originHost: UInt64, slideElapsed: Double) {
        let elapsedInClip = max(0, slideElapsed - Double(entry.startTime))
        let delaySeconds = Double(entry.startTime)
        let hostDelta = ReaderAudioMixer.hostTime(forDelaySeconds: delaySeconds)
        let scheduleAt = AVAudioTime(hostTime: originHost + hostDelta)

        let completion: (@Sendable () -> Void)? = entry.loop ? { @Sendable [weak self, audioId = entry.audioId] in
            // Re-schedule the same file at the next "now" host-time so the
            // loop has no audible gap. Using nil scheduleAt ensures playback
            // continues immediately upon completion.
            // `_ =` : discarde le handle du `Task` (fire-and-forget) pour que la
            // closure retourne `Void` — sans ça l'expression `Task` unique est
            // inférée comme valeur de retour (`() -> Task`), incompatible avec
            // le type `@Sendable () -> Void` attendu par `scheduleFile`.
            _ = Task { @MainActor [weak self] in
                self?.rescheduleLoopedEntry(audioId)
            }
        } : nil

        scheduleAudio(node: entry.node, file: entry.file, trimBounds: entry.trimBounds,
                      elapsedInClip: elapsedInClip,
                      at: scheduleAt, completionHandler: completion)
    }

    /// Ré-arme la lecture d'un node loopé depuis le completion handler de la
    /// passe précédente. **Synchrone à dessein** (et non `async`) : appeler
    /// `scheduleFile(_:at:completionHandler:)` hors d'un contexte `async` évite
    /// le diagnostic « consider using asynchronous alternative ». L'overload
    /// `async` suspendrait jusqu'à la FIN de lecture du segment — incompatible
    /// avec le ré-armement fire-and-forget requis pour boucler sans gap audible.
    private func rescheduleLoopedEntry(_ audioId: String) {
        guard let entry = entries[audioId], entry.node.isPlaying else { return }
        // Même fenêtre qu'au premier `scheduleAudio` : sans elle, un clip rogné
        // jouerait sa portion coupée en boucle une fois passée la première
        // itération — le loop-back audio rejouerait le fichier ENTIER après
        // avoir lu correctement la fenêtre une première fois.
        //
        // `elapsedInClip: 0` est ÉCRIT, pas omis : une itération de boucle
        // repart au DÉBUT de sa fenêtre. L'écoulé de la slide n'a de sens que
        // pour l'entrée initiale (#6580) — le rejouer ici ferait reboucler
        // chaque passe un cran plus loin dans le fichier, jusqu'au silence.
        scheduleAudio(node: entry.node, file: entry.file, trimBounds: entry.trimBounds,
                      elapsedInClip: 0,
                      at: nil, completionHandler: nil)
    }

    /// Convertit une fenêtre de rognage ET l'écoulé DANS le clip en
    /// position/longueur de FRAMES pour `AVAudioPlayerNode.scheduleSegment`.
    ///
    /// Projection du site partagé `TimelineAudioWindow.segment` — la MÊME loi
    /// que celle qu'applique `AudioMixer.scheduleNodeFromTimelineTime` côté
    /// composition. Elle n'est pas recopiée ici : les deux moteurs avaient déjà
    /// divergé sur `hostTime(forDelaySeconds:)`, et c'est cette divergence-là
    /// qui laissait le LECTEUR incapable d'entrer en cours de piste (#6580).
    ///
    /// `nil` en sortie et `elapsedInClip == 0` ⇒ l'appelant retombe sur
    /// `scheduleFile` (source entière, comportement d'aujourd'hui) ; `nil` avec
    /// `elapsedInClip > 0` ⇒ l'ouverture est au-delà de la fin du clip et il ne
    /// faut RIEN planifier — cf. `scheduleAudio`.
    ///
    /// Pure et statique : éprouvable sans `AVAudioEngine` ni fichier réel.
    static func segment(forBounds bounds: MediaTrimBounds?,
                        elapsedInClip: Double,
                        sampleRate: Double,
                        fileLength: AVAudioFramePosition) -> (startingFrame: AVAudioFramePosition, frameCount: AVAudioFrameCount)? {
        TimelineAudioWindow.segment(bounds: bounds,
                                    elapsedInClip: elapsedInClip,
                                    sampleRate: sampleRate,
                                    fileLength: fileLength)
    }

    /// Site UNIQUE d'appel à `scheduleFile`/`scheduleSegment` — foreground ET
    /// fond passent tous deux par ici (cf. `scheduleEntry`, `rescheduleLoopedEntry`,
    /// `scheduleBackgroundFile`), pour qu'une seule règle décide quand la
    /// fenêtre s'applique. `trimBounds == nil` ET `elapsedInClip == 0` (pas de
    /// rognage déclaré, pas d'entrée en cours de piste) prend le chemin
    /// d'aujourd'hui sans même consulter `segment(...)`.
    ///
    /// `elapsedInClip > 0` change DEUX choses à la fois, et les deux sont
    /// nécessaires (#6580) :
    /// 1. la position — l'origine glisse de `elapsedInClip` dans la source ;
    /// 2. **l'heure** — on planifie en `at: nil` (immédiat) au lieu de l'heure
    ///    future calculée pour un départ à zéro, qui est déjà PASSÉE. C'est
    ///    littéralement la branche `AudioMixer.swift:141-152` du composer.
    ///
    /// Et si la fenêtre ne rend rien alors que l'ouverture est en cours de
    /// piste, on ne planifie RIEN : le repli `scheduleFile` rejouerait le
    /// fichier depuis zéro sous une vidéo déjà à `t`, un défaut PIRE que le
    /// silence parce qu'il a l'air d'une lecture désynchronisée.
    ///
    /// `internal` et non `private` : l'extension du FOND vit dans son propre
    /// fichier (budget de taille) et doit atteindre ce site unique — la
    /// visibilité reste celle du MODULE.
    func scheduleAudio(node: AVAudioPlayerNode,
                       file: AVAudioFile,
                       trimBounds: MediaTrimBounds?,
                       elapsedInClip: Double,
                       at scheduleAt: AVAudioTime?,
                       completionHandler: (@Sendable () -> Void)?) {
        let entersMidClip = elapsedInClip.isFinite && elapsedInClip > 0
        let at: AVAudioTime? = entersMidClip ? nil : scheduleAt
        guard let segment = ReaderAudioMixer.segment(forBounds: trimBounds,
                                                     elapsedInClip: elapsedInClip,
                                                     sampleRate: file.processingFormat.sampleRate,
                                                     fileLength: file.length) else {
            guard !entersMidClip else { return }
            scheduler.schedule(node: node, file: file, window: .wholeFile,
                               at: at, completionHandler: completionHandler)
            return
        }
        scheduler.schedule(node: node, file: file,
                           window: .segment(startingFrame: segment.startingFrame,
                                            frameCount: segment.frameCount),
                           at: at, completionHandler: completionHandler)
    }

    /// Schedule fade-in and fade-out volume ramps. node.volume is sampled by
    /// the audio render thread per slice; main-thread updates are picked up
    /// at sub-millisecond granularity which is fine for human-perceptible
    /// fades. Sample-accurate fades would require AVAudioMixerNode +
    /// AVAudioUnitEQ scheduled parameter automation — overkill for the
    /// 0.1-0.5s fade durations the composer typically authors.
    ///
    /// `slideElapsed` est ce qui sépare « ce clip COMMENCE » de « ce clip est
    /// déjà commencé ». Sans elle, un clip entré à mi-fade rejouait sa montée
    /// DEPUIS LE SILENCE, et un clip entré passé son fade-out posait DEUX
    /// rampes qui tiraient à la même milliseconde sur le même `node.volume`
    /// (#6580) — la position avait suivi l'ouverture, l'amplitude non.
    /// `AudioEnvelope` est le site unique de cette règle ; le fond la partage.
    private func scheduleFades(for entry: Entry, originHost: UInt64, slideElapsed: Double) {
        let envelope = AudioEnvelope.plan(
            elapsedInClip: slideElapsed - Double(entry.startTime),
            fadeIn: Double(entry.fadeIn),
            fadeOut: Double(entry.fadeOut),
            clipDuration: Double(entry.duration),
            target: entry.targetVolume)
        entry.node.volume = (isMuted || entry.isUserMuted) ? 0 : envelope.initialVolume
        [envelope.fadeIn, envelope.fadeOut].compactMap { $0 }.forEach { ramp in
            scheduleVolumeFade(
                entry: entry,
                from: ramp.from,
                to: ramp.to,
                duration: ramp.duration,
                triggerAt: originHost + ReaderAudioMixer.hostTime(
                    forDelaySeconds: Double(entry.startTime) + ramp.startOffset)
            )
        }
    }

    private func scheduleVolumeFade(entry: Entry, from start: Float, to end: Float,
                                    duration: TimeInterval, triggerAt hostTrigger: UInt64) {
        let delaySeconds = ReaderAudioMixer.delaySeconds(forHostTime: hostTrigger,
                                                         relativeTo: mach_absolute_time())
        guard delaySeconds >= 0 else { return }
        // Timer.scheduledTimer fires on the run loop that scheduled it (main),
        // so the body is implicitly main-isolated — `assumeIsolated` lifts the
        // Swift 6 @Sendable closure annotation without an actor hop.
        let timer = Timer.scheduledTimer(withTimeInterval: delaySeconds, repeats: false) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.runVolumeRamp(entry: entry, from: start, to: end, duration: duration)
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTimers.append(timer)
            entries[entry.audioId] = stored
        }
    }

    private func runVolumeRamp(entry: Entry, from start: Float, to end: Float, duration: TimeInterval) {
        guard duration > 0 else {
            entry.node.volume = (isMuted || entry.isUserMuted) ? 0 : end
            return
        }
        // Async ramp instead of Timer because Swift 6 won't let us capture
        // the Timer parameter inside the closure across the @Sendable
        // boundary. Task.sleep on @MainActor is equally smooth at 30 fps and
        // cooperates with structured cancellation if the mixer tears down.
        let audioId = entry.audioId
        let stepInterval: TimeInterval = 1.0 / 30.0
        let steps = max(1, Int(duration / stepInterval))
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            for i in 1...steps {
                try? await Task.sleep(nanoseconds: UInt64(stepInterval * 1_000_000_000))
                if Task.isCancelled { return }
                guard let live = self.entries[audioId] else { return }
                let progress = Float(i) / Float(steps)
                let v = start + (end - start) * progress
                live.node.volume = (self.isMuted || live.isUserMuted) ? 0 : v
            }
            if let live = self.entries[audioId] {
                live.node.volume = (self.isMuted || live.isUserMuted) ? 0 : end
            }
        }
        if var stored = entries[entry.audioId] {
            stored.fadeTasks.append(task)
            entries[entry.audioId] = stored
        }
    }

    // MARK: - host-time helpers

    private static let hostTimebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    /// Forward to `AudioMixer.hostTime(forDelaySeconds:)` so a single, hardened
    /// implementation (Double-based, clamped to `UInt64.max`, validates timebase
    /// and finiteness — see P3-#5 in commit `841a528a`) is the source of truth
    /// for the entire MeeshyUI audio pipeline. The previous local implementation
    /// silently overflowed on non-Apple-Silicon timebases (numer=1, denom=3 on
    /// Intel) for delays > 9.22s, which is well within the realistic envelope
    /// of a 30s slide. Production callers keep the same call shape; the dedicated
    /// `timebase:` overload below exists for tests that need to exercise the
    /// overflow path explicitly.
    static func hostTime(forDelaySeconds seconds: Double) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds)
    }

    /// Testable overload that injects an explicit timebase. Delegates to the
    /// hardened `AudioMixer` helper so the two mixers stay bit-identical.
    static func hostTime(
        forDelaySeconds seconds: Double,
        timebase: mach_timebase_info_data_t
    ) -> UInt64 {
        return AudioMixer.hostTime(forDelaySeconds: seconds, timebase: timebase)
    }

    static func delaySeconds(forHostTime target: UInt64, relativeTo now: UInt64) -> TimeInterval {
        guard target > now else { return 0 }
        let deltaTicks = target - now
        let nanos = deltaTicks * UInt64(hostTimebase.numer) / UInt64(hostTimebase.denom)
        return TimeInterval(nanos) / 1_000_000_000
    }

    // MARK: - Internal

    private struct Entry {
        let audioId: String
        let file: AVAudioFile
        let node: AVAudioPlayerNode
        let startTime: Float
        var targetVolume: Float
        let fadeIn: Float
        let fadeOut: Float
        let duration: Float
        let loop: Bool
        var fadeTimers: [Timer] = []
        var fadeTasks: [Task<Void, Never>] = []
        /// Mute per-piste déclenché par le tap utilisateur sur le chip du
        /// reader. Indépendant du mute global (`ReaderAudioMixer.isMuted`).
        var isUserMuted: Bool = false
        /// Fenêtre de rognage résolue à `configure(...)`, ou `nil` quand ce
        /// clip n'a jamais été rogné. `scheduleAudio` (MARK: Scheduling) la
        /// consulte à chaque `scheduleSegment` — départ ET rebouclage.
        let trimBounds: MediaTrimBounds?
    }

    /// Internal helper for the single background audio slot.
    struct BackgroundEntry {
        let player: AVAudioPlayerNode
        let file: AVAudioFile
        let looping: Bool
        let audioId: String
        var targetVolume: Float
        let fadeIn: Float
        let fadeOut: Float
        /// Timeline offset (seconds) at which the entry begins.
        let startOffset: Double
        /// Playback duration (seconds) used to anchor an explicit fade-out.
        let duration: Float
        var fadeTimers: [Timer] = []
        var fadeTasks: [Task<Void, Never>] = []
        /// Jumelle de `Entry.trimBounds` — même règle, même résolveur.
        let trimBounds: MediaTrimBounds?

        /// `true` when the composer authored an explicit fade — the default
        /// envelope must then defer to the configured values (RC4.7).
        var hasExplicitFade: Bool { fadeIn > 0 || fadeOut > 0 }
    }
}

// MARK: - PlaybackCoordinator integration

/// `ReaderAudioMixer` is a single-owner audio source: registering it with
/// `PlaybackCoordinator` lets a second reader surface (viewer + composer preview
/// mounted together) stop the previous engine before starting its own, so the
/// same background track is never heard from two engines at once (RC4.6).
extension ReaderAudioMixer: StoppablePlayer {}

// MARK: - Ducking + fade-out

extension ReaderAudioMixer {
    /// When `true`, foreground entry start/end events automatically schedule
    /// volume ramps on the background entry to duck and restore.
    public var duckingEnabled: Bool {
        get { _duckingEnabled }
        set { _duckingEnabled = newValue }
    }

    /// Volume the background drops to when ducking is active. Default 0.5.
    public var duckedBackgroundVolume: Float {
        get { _duckedBackgroundVolume }
        set { _duckedBackgroundVolume = newValue }
    }

    /// Globally fades all entries (foreground + background) to silence
    /// over `duration` seconds, then stops the engine. Idempotent.
    public func fadeOutAndStop(duration: TimeInterval = 0.5) async {
        guard isPlaying else { stop(); return }
        let steps = max(1, Int(duration * 50))   // 50 Hz ramp
        let stepDuration = duration / Double(steps)
        for s in 0..<steps {
            let factor = 1.0 - (Float(s + 1) / Float(steps))
            for (_, entry) in entries {
                entry.node.volume = entry.targetVolume * factor
            }
            if let bg = backgroundEntry {
                bg.player.volume = bg.player.volume * factor
            }
            try? await Task.sleep(nanoseconds: UInt64(stepDuration * 1_000_000_000))
        }
        stop()
    }
}
