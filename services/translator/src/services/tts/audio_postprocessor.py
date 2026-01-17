"""
Audio Post-Processor pour améliorer la qualité du TTS
=====================================================

Fonctionnalités:
- Normalisation du volume
- Réduction du bruit (spectral gating)
- Égalisation pour améliorer la clarté vocale
- Compression dynamique
"""

import logging
import numpy as np
from typing import Optional, Tuple
from pathlib import Path

logger = logging.getLogger(__name__)

# Vérifier les dépendances optionnelles
SCIPY_AVAILABLE = False
NOISEREDUCE_AVAILABLE = False

try:
    import scipy.signal as signal
    from scipy.io import wavfile
    SCIPY_AVAILABLE = True
except ImportError:
    logger.warning("⚠️ scipy non disponible - certains post-traitements désactivés")

try:
    import noisereduce as nr
    NOISEREDUCE_AVAILABLE = True
except ImportError:
    logger.info("ℹ️ noisereduce non disponible - pip install noisereduce")


class AudioPostProcessor:
    """Post-processeur audio pour améliorer la qualité TTS"""

    def __init__(
        self,
        normalize: bool = True,
        reduce_noise: bool = True,
        equalize: bool = True,
        compress_dynamics: bool = False,
        target_db: float = -3.0,
        noise_reduction_strength: float = 0.5
    ):
        """
        Args:
            normalize: Normaliser le volume
            reduce_noise: Appliquer la réduction de bruit
            equalize: Appliquer l'égalisation vocale
            compress_dynamics: Appliquer la compression dynamique
            target_db: Niveau cible en dB pour la normalisation
            noise_reduction_strength: Intensité réduction bruit (0.0-1.0)
        """
        self.normalize = normalize
        self.reduce_noise = reduce_noise and NOISEREDUCE_AVAILABLE
        self.equalize = equalize and SCIPY_AVAILABLE
        self.compress_dynamics = compress_dynamics
        self.target_db = target_db
        self.noise_reduction_strength = noise_reduction_strength

    def process(
        self,
        audio: np.ndarray,
        sample_rate: int,
        reference_audio: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """
        Applique le post-traitement à l'audio.

        Args:
            audio: Signal audio (numpy array)
            sample_rate: Taux d'échantillonnage
            reference_audio: Audio de référence pour le profil de bruit (optionnel)

        Returns:
            Audio post-traité
        """
        processed = audio.copy().astype(np.float32)

        # Normaliser à [-1, 1] si nécessaire
        if processed.dtype == np.int16:
            processed = processed / 32768.0
        elif np.abs(processed).max() > 1.0:
            processed = processed / np.abs(processed).max()

        # 1. Réduction du bruit
        if self.reduce_noise:
            processed = self._reduce_noise(processed, sample_rate, reference_audio)
            logger.debug("[POST] Réduction du bruit appliquée")

        # 2. Égalisation vocale
        if self.equalize:
            processed = self._equalize_voice(processed, sample_rate)
            logger.debug("[POST] Égalisation vocale appliquée")

        # 3. Compression dynamique
        if self.compress_dynamics:
            processed = self._compress_dynamics(processed)
            logger.debug("[POST] Compression dynamique appliquée")

        # 4. Normalisation du volume
        if self.normalize:
            processed = self._normalize_volume(processed)
            logger.debug(f"[POST] Volume normalisé à {self.target_db} dB")

        return processed

    def _reduce_noise(
        self,
        audio: np.ndarray,
        sample_rate: int,
        reference: Optional[np.ndarray] = None
    ) -> np.ndarray:
        """Applique la réduction de bruit spectrale"""
        if not NOISEREDUCE_AVAILABLE:
            return audio

        try:
            # noisereduce utilise le début de l'audio comme profil de bruit
            # si pas de référence fournie
            reduced = nr.reduce_noise(
                y=audio,
                sr=sample_rate,
                prop_decrease=self.noise_reduction_strength,
                stationary=True
            )
            return reduced
        except Exception as e:
            logger.warning(f"[POST] Erreur réduction bruit: {e}")
            return audio

    def _equalize_voice(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        """
        Applique une égalisation pour améliorer la clarté vocale.

        - Boost léger des médiums (1-4 kHz) pour la clarté
        - Atténuation des basses fréquences (< 80 Hz) pour réduire le rumble
        - Légère atténuation des hautes fréquences (> 8 kHz)
        """
        if not SCIPY_AVAILABLE:
            return audio

        try:
            # High-pass filter pour couper le rumble (< 80 Hz)
            nyquist = sample_rate / 2
            high_pass_freq = 80 / nyquist
            if high_pass_freq < 1.0:
                b_hp, a_hp = signal.butter(2, high_pass_freq, btype='high')
                audio = signal.filtfilt(b_hp, a_hp, audio)

            # Presence boost (2-4 kHz) - filtre en cloche
            center_freq = 3000 / nyquist
            if center_freq < 1.0:
                # Créer un filtre passe-bande léger pour boost
                low = 2000 / nyquist
                high = 4500 / nyquist
                if high < 1.0:
                    b_bp, a_bp = signal.butter(2, [low, high], btype='band')
                    presence = signal.filtfilt(b_bp, a_bp, audio)
                    # Ajouter 20% du signal filtré pour un boost subtil
                    audio = audio + 0.2 * presence

            # De-esser léger (atténuation 6-9 kHz)
            sibilance_freq = 7000 / nyquist
            if sibilance_freq < 1.0:
                b_lp, a_lp = signal.butter(1, sibilance_freq, btype='low')
                # Appliquer très légèrement
                audio = 0.9 * audio + 0.1 * signal.filtfilt(b_lp, a_lp, audio)

            return audio

        except Exception as e:
            logger.warning(f"[POST] Erreur égalisation: {e}")
            return audio

    def _compress_dynamics(
        self,
        audio: np.ndarray,
        threshold: float = 0.5,
        ratio: float = 4.0,
        attack_ms: float = 5.0,
        release_ms: float = 50.0
    ) -> np.ndarray:
        """
        Applique une compression dynamique simple.

        Args:
            threshold: Seuil de compression (0.0-1.0)
            ratio: Ratio de compression (ex: 4:1)
            attack_ms: Temps d'attaque en ms
            release_ms: Temps de release en ms
        """
        try:
            # Compression simple basée sur l'enveloppe
            envelope = np.abs(audio)

            # Calculer le gain de compression
            gain = np.ones_like(audio)
            above_threshold = envelope > threshold

            if np.any(above_threshold):
                # Réduction au-dessus du seuil
                excess = envelope[above_threshold] - threshold
                compressed_excess = excess / ratio
                gain[above_threshold] = (threshold + compressed_excess) / envelope[above_threshold]

            # Appliquer le gain
            compressed = audio * gain

            return compressed

        except Exception as e:
            logger.warning(f"[POST] Erreur compression: {e}")
            return audio

    def _normalize_volume(self, audio: np.ndarray) -> np.ndarray:
        """Normalise le volume au niveau cible en dB"""
        try:
            # Calculer le niveau actuel (RMS)
            rms = np.sqrt(np.mean(audio ** 2))
            if rms < 1e-10:
                return audio

            # Niveau cible
            target_linear = 10 ** (self.target_db / 20)

            # Peak normalization pour éviter le clipping
            peak = np.abs(audio).max()
            if peak < 1e-10:
                return audio

            # Calculer le gain nécessaire
            # On normalise par le peak mais on vise un RMS raisonnable
            gain = target_linear / peak

            # Appliquer le gain
            normalized = audio * gain

            # S'assurer qu'on ne clip pas
            if np.abs(normalized).max() > 1.0:
                normalized = normalized / np.abs(normalized).max()

            return normalized

        except Exception as e:
            logger.warning(f"[POST] Erreur normalisation: {e}")
            return audio

    def process_file(
        self,
        input_path: str,
        output_path: Optional[str] = None,
        reference_path: Optional[str] = None
    ) -> str:
        """
        Post-traite un fichier audio.

        Args:
            input_path: Chemin du fichier d'entrée
            output_path: Chemin de sortie (défaut: écrase l'entrée)
            reference_path: Fichier de référence pour le profil de bruit

        Returns:
            Chemin du fichier de sortie
        """
        import soundfile as sf

        # Charger l'audio
        audio, sample_rate = sf.read(input_path)

        # Charger la référence si fournie
        reference = None
        if reference_path:
            reference, _ = sf.read(reference_path)

        # Appliquer le post-traitement
        processed = self.process(audio, sample_rate, reference)

        # Sauvegarder
        if output_path is None:
            output_path = input_path

        sf.write(output_path, processed, sample_rate)
        logger.info(f"✅ [POST] Audio post-traité: {output_path}")

        return output_path


# Instance par défaut pour utilisation facile
default_postprocessor = AudioPostProcessor(
    normalize=True,
    reduce_noise=False,  # Désactivé par défaut car peut altérer la voix
    equalize=True,
    compress_dynamics=False,
    target_db=-3.0
)


def postprocess_audio(
    audio: np.ndarray,
    sample_rate: int,
    **kwargs
) -> np.ndarray:
    """Fonction utilitaire pour post-traitement rapide"""
    processor = AudioPostProcessor(**kwargs) if kwargs else default_postprocessor
    return processor.process(audio, sample_rate)
