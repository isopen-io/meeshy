import Foundation
import AVFoundation
@preconcurrency import CallKit
import Combine
import Network
import UIKit
import MeeshySDK
import MeeshyUI
@preconcurrency import WebRTC
import os

/// La durée d'un appel telle qu'on la LIT (« 02:05 ») et telle qu'on l'ENTEND
/// (« 2 minutes 5 secondes »), dérivées de `callDuration`.

extension CallManager {

    // MARK: - Duration Formatting

    var formattedDuration: String {
        Self.formatDuration(callDuration)
    }

    /// Ce que VoiceOver ENTEND de la durée d'appel — « 2 minutes 5 secondes ».
    ///
    /// Six sites (`CallView` ×5, `FloatingCallPillView`) passaient
    /// `formattedDuration` à `.accessibilityValue` : le synthétiseur lit
    /// « 02:05 » comme une HEURE. 206i/210i/211i avaient donné son libellé à
    /// cette valeur (« Durée de l'appel ») ; le libellé nomme la mesure, il ne
    /// corrige pas l'orthographe de ce qu'il introduit.
    var spokenDuration: String {
        Self.spokenDuration(callDuration)
    }

    /// Pure helper — extracted for unit-testability without touching `callDuration`.
    ///
    /// L'orthographe est celle de l'app Téléphone : minutes remplies à deux
    /// chiffres sous l'heure (« 02:05 »), heures dès qu'il y en a
    /// (« 1:05:00 »). Elle diffère volontairement de celle des minuteries média
    /// (« 2:05 », `DurationClock.minuteSecond`), et c'est le seul appelant du
    /// dépôt à promouvoir les heures.
    ///
    /// `locale` est un paramètre — et non `.current` en dur — pour la raison
    /// devenue idiomatique depuis 234i : sans elle, une suite jugerait la
    /// locale du SIMULATEUR, verte en local et rouge en CI.
    nonisolated static func formatDuration(
        _ duration: TimeInterval,
        locale: Locale = .current
    ) -> String {
        let total = LocalizedNumber.wholeSeconds(from: duration)
        return LocalizedNumber.duration(
            seconds: total,
            clock: total >= 3600 ? .hourMinuteSecond : .paddedMinuteSecond,
            locale: locale
        )
    }

    nonisolated static func spokenDuration(
        _ duration: TimeInterval,
        locale: Locale = .current
    ) -> String {
        LocalizedNumber.spokenDuration(seconds: duration, locale: locale)
    }

}
