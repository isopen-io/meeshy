import SwiftUI
import AVFoundation
import os
import MeeshySDK
import MeeshyUI

// MARK: - Video recording

extension CameraModel {
    /// **Peut-on demander un enregistrement à AVFoundation ?** La question est
    /// posée à `CameraRecordingReadiness`, et elle est POSÉE — c'est tout le
    /// lot : `startRecording(to:recordingDelegate:)` lève une exception
    /// Objective-C quand la connexion vidéo manque, et une exception ObjC ne se
    /// rattrape pas en Swift. Il n'y a pas de « gérer l'erreur » ici, seulement
    /// de la prévention.
    private var videoRecordingIsPossible: Bool {
        let connection = videoOutput.connection(with: .video)
        return CameraRecordingReadiness.mayStartRecording(
            sessionIsRunning: session.isRunning,
            hasVideoConnection: connection != nil,
            connectionIsActive: connection?.isActive ?? false,
            connectionIsEnabled: connection?.isEnabled ?? false
        )
    }

    func startRecording() {
        #if DEBUG
        if fixture != nil {
            guard !isRecordingVideo, !isSwitchingCamera, recordingId == nil else { return }
            recordingDuration = 0
            isRecordingVideo = true
            recordingId = UUID().uuidString
            recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
                Task { @MainActor [weak self] in self?.recordingDuration += 0.5 }
            }
            return
        }
        #endif
        guard recordingId == nil else { return }
        recordedSegmentURLs = []
        isSwitchingCameraDuringRecording = false
        pendingSwitchPosition = nil
        pendingStopRequested = false
        recordingDuration = 0
        // **Le chrono ne part QU'APRÈS le segment.** L'ordre est la moitié de
        // la garde : démarrer le minuteur d'abord ferait courir une durée sur
        // une vidéo que rien n'écrit — un enregistrement fantôme, avec son
        // indicateur rouge et son compteur qui monte.
        recordingId = UUID().uuidString
        // Les sons extérieurs s'arrêtent, le son Meeshy qui joue BAISSE sans
        // s'arrêter. Refusé pendant un appel : la prise se fait sous
        // la session de l'appel. La session se pose hors du fil principal
        // (#17038), armée d'avance par `prepare(.video)` quand le micro entre.
        recordingSession.begin(.video) { _ in }
        guard startSegment() else {
            recordingSession.finish(handingBackSession: false)
            return closeRecordingToken(recordingId)
        }
        recordingTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.recordingDuration += 0.5
            }
        }
    }

    /// Starts (or restarts, after a mid-recording camera switch) recording to a
    /// fresh temp file. Does not touch `recordingDuration`/`recordingTimer` so a
    /// segment restart is invisible to the recording-duration UI.
    ///
    /// **Rend son verdict** : `false` ⇒ AVFoundation n'aurait pas pu écrire, et
    /// l'appelant doit en tenir compte plutôt que de laisser l'écran croire
    /// qu'il filme.
    private func startSegment() -> Bool {
        guard videoRecordingIsPossible else {
            Logger.media.error("Video recording refused: no active/enabled capture connection")
            return false
        }
        let tempURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("video_\(UUID().uuidString).mov")
        segmentTokens[tempURL] = recordingId
        horizon.level(videoOutput.connection(with: .video))
        videoOutput.startRecording(to: tempURL, recordingDelegate: self)
        isRecordingVideo = true
        setSmoothFocus(true)
        return true
    }

    /// **La sortie d'un enregistrement qui n'écrira rien.**
    ///
    /// Elle est NOMMÉE, et pas repliée dans un `return` muet, parce qu'elle
    /// laisse l'écran dans un état qu'il faut décrire : plus d'indicateur, plus
    /// de chrono, et les segments déjà pris rendus au système de fichiers. Un
    /// refus silencieux garderait `isRecordingVideo` à vrai — l'utilisateur
    /// verrait le point rouge d'une vidéo que personne n'écrit.
    private func endRecordingWithoutOutput(token: String?) {
        recordingSession.finish(handingBackSession: false)
        isSwitchingCameraDuringRecording = false
        isSwitchingCamera = false
        switchCover = nil
        switchFollower = nil
        isRecordingVideo = false
        setSmoothFocus(false)
        recordingTimer?.invalidate()
        recordingTimer = nil
        for segment in recordedSegmentURLs {
            FileManager.default.removeItemLogging(at: segment,
                                                  context: "discarded recording segment",
                                                  logger: .media)
        }
        recordedSegmentURLs = []
        abandonRecording(token: token)
    }

    /// Ends the recording. If a camera switch is mid-flight, the stop is queued
    /// and honored the instant the new segment opens — otherwise the user's tap
    /// could race the switch and be silently dropped.
    func stopRecording() {
        #if DEBUG
        if let fixture {
            guard isRecordingVideo, !stopIsRequested else { return }
            stopIsRequested = true
            recordingTimer?.invalidate()
            recordingTimer = nil
            deliverFixtureMovie(fixture)
            return
        }
        #endif
        stopIsRequested = recordingId != nil
        guard !isSwitchingCameraDuringRecording else {
            pendingStopRequested = true
            return
        }
        videoOutput.stopRecording()
    }

    /// Handles every `fileOutput(didFinishRecordingTo:...)` callback — both the
    /// intermediate segment closes from a mid-recording camera switch and the
    /// final stop. See `recordedSegmentURLs`'s doc-comment for the overall design.
    private func handleSegmentFinished(url: URL, error: Error?) async {
        let jeton = segmentTokens.removeValue(forKey: url) ?? recordingId
        // Un appel, l'arrière-plan, Siri, la durée ou le disque closent la prise
        // AVEC une erreur et un fichier valide (OPUS-11) : ce qui est filmé reste.
        let fin = CameraRecordingEnding.of(error)
        if fin.keepsFile {
            recordedSegmentURLs.append(url)
        } else {
            FileManager.default.removeItemLogging(at: url, context: "unusable recording segment", logger: .media)
        }
        switch fin.next(keptSegments: recordedSegmentURLs.count) {
        case .asUsual: break
        case .nothingToKeep: return endRecordingWithoutOutput(token: jeton)
        case .keepWhatWasFilmed: return await deliverInterruptedRecording(token: jeton)
        }

        if isSwitchingCameraDuringRecording {
            // La bascule se fait sur la file de la session : le segment suivant
            // ne s'ouvre qu'une fois le nouvel objectif EN PLACE.
            guard let position = pendingSwitchPosition else {
                endSwitch()
                resumeRecordingAfterSwitch()
                return
            }
            pendingSwitchPosition = nil
            performCameraSwitch(to: position) { [weak self] in self?.resumeRecordingAfterSwitch() }
            return
        }

        // Final stop.
        await deliverRecording(token: jeton)
    }

    /// Le nouvel objectif est en place : la prise reprend — ou se clôt, si
    /// l'auteur a demandé l'arrêt pendant la bascule. Sa connexion peut naître
    /// inactive : la reprise l'attend un instant plutôt que de clore la
    /// prise sur un refus d'une image ; un arrêt demandé entre-temps reste en file.
    private func resumeRecordingAfterSwitch() {
        let suite = switchFollower
        switchFollower = nil
        suite?(currentPosition)
        Task { @MainActor [weak self] in
            let limite = Date().addingTimeInterval(ComposerCameraSwitchRule.segmentResumeWait)
            while let self, !self.videoRecordingIsPossible, !self.pendingStopRequested, Date() < limite {
                guard await cancellableSleep(for: .milliseconds(30)) else { break }
            }
            self?.reopenSegmentAfterSwitch()
        }
    }

    private func reopenSegmentAfterSwitch() {
        isSwitchingCameraDuringRecording = false
        if pendingStopRequested {
            pendingStopRequested = false
            let jeton = recordingId
            Task { @MainActor [weak self] in await self?.deliverRecording(token: jeton) }
        } else if !startSegment() {
            // La connexion a disparu PENDANT la bascule — un cas que le
            // changement de caméra rend possible par construction. Sans ce
            // repli, l'enregistrement continuait « en cours » sans sortie.
            endRecordingWithoutOutput(token: recordingId)
        }
    }

    /// **Le système a clos la prise** : la bascule en vol s'oublie, ce qui a
    /// été filmé part comme une prise arrêtée, et l'auteur l'apprend.
    private func deliverInterruptedRecording(token: String?) async {
        isSwitchingCameraDuringRecording = false
        pendingSwitchPosition = nil
        pendingStopRequested = false
        isSwitchingCamera = false
        switchCover = nil
        switchFollower = nil
        await deliverRecording(token: token)
        CameraTakeNotice.announceInterruptedRecording()
    }

    /// La prise est close : les segments se rassemblent et partent.
    private func deliverRecording(token: String?) async {
        recordingSession.finish(handingBackSession: false)
        isRecordingVideo = false
        setSmoothFocus(false)
        recordingTimer?.invalidate()
        recordingTimer = nil

        let segments = recordedSegmentURLs
        recordedSegmentURLs = []

        guard let finalURL = segments.count > 1 ? await Self.mergeSegments(segments) : segments.first else {
            // Merge failed (or there was nothing to merge) — fail soft to the
            // last recorded segment rather than losing the whole capture.
            if let lastSegment = segments.last {
                for segment in segments.dropLast() {
                    FileManager.default.removeItemLogging(at: segment, context: "unmergeable recording segment", logger: .media)
                }
                capturedVideoURL = lastSegment
                librarySave = savesOriginal()
                    ? Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: lastSegment) } }
                    : nil
                capturedVideoId = token ?? UUID().uuidString
                return closeRecordingToken(token)
            }
            return abandonRecording(token: token)
        }
        capturedVideoURL = finalURL
        librarySave = savesOriginal()
            ? Task { await Self.saveToPhotoLibrary { await PhotoLibraryManager.shared.saveVideo(at: finalURL) } }
            : nil
        capturedVideoId = token ?? UUID().uuidString
        closeRecordingToken(token)
        if segments.count > 1 {
            for segment in segments where segment != finalURL {
                FileManager.default.removeItemLogging(at: segment, context: "merged recording segment", logger: .media)
            }
        }
    }

    /// Façade : l'assemblage vit dans `CameraSegmentMerger`.
    nonisolated static func mergeSegments(_ urls: [URL]) async -> URL? {
        await CameraSegmentMerger.merge(urls)
    }
}

extension CameraModel: AVCaptureFileOutputRecordingDelegate {
    nonisolated func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL,
                                from connections: [AVCaptureConnection], error: Error?) {
        Task { @MainActor in
            await self.handleSegmentFinished(url: outputFileURL, error: error)
        }
    }
}
