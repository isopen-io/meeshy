import os

/// Catégories de logs dédiées au sous-système Stories.
///
/// Utiliser depuis Console.app en filtrant sur la catégorie pour isoler
/// rapidement les défaillances audio / vidéo / cache sans bruit.
///
/// Conventions :
/// - `.error` : défaillance qui empêche la lecture (URL nil, AVAudioFile fail,
///   ducking incomplet). Doit toujours rester en release.
/// - `.info` : transition d'état observable côté utilisateur (configure pass,
///   play start, mute toggle). Filtré en release par les niveaux par défaut
///   de `os.log` mais visible en dev.
/// - `.debug` : tracing fin (URL résolue, host time, slide key). Compilé out
///   en release.
public extension os.Logger {
    /// Pipeline audio des Stories (composer preview + reader playback).
    /// Catégorie distincte de `media` (utilisée par les mixers) pour permettre
    /// un filtrage Console.app focalisé sur la chaîne reader/composer.
    static let storyAudio = os.Logger(subsystem: "me.meeshy.app",
                                      category: "story-audio")
}
