"""
Utilitaires audio partagés.
Compatible avec librosa >= 0.10 (path=) et < 0.10 (filename=).
"""


def get_audio_duration(audio_path: str) -> float:
    """Récupère la durée d'un fichier audio en secondes (compatible toutes versions librosa)."""
    import librosa
    try:
        return librosa.get_duration(path=audio_path)
    except TypeError:
        return librosa.get_duration(filename=audio_path)
