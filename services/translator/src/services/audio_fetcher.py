"""
Audio Fetcher Service
=====================

Service pour acquérir les fichiers audio depuis différentes sources:
1. Base64 (données inline via ZMQ) - pour fichiers < 5MB
2. HTTP URL fetch - pour fichiers plus gros ou quand base64 absent

Ce service assure le découplage entre Gateway et Translator
en évitant la dépendance aux volumes partagés.
"""

import os
import base64
import asyncio
import logging
import tempfile
import hashlib
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime

import aiohttp

logger = logging.getLogger(__name__)

# Timeout pour le téléchargement HTTP (en secondes)
HTTP_DOWNLOAD_TIMEOUT = 60

# Taille max pour téléchargement HTTP (100MB)
MAX_DOWNLOAD_SIZE = 100 * 1024 * 1024

# Répertoire temporaire pour les fichiers audio
TEMP_AUDIO_DIR = Path(tempfile.gettempdir()) / "meeshy_audio"


class AudioFetcherService:
    """
    Service pour acquérir les fichiers audio depuis base64 ou URL.

    Stratégie:
    1. Si audioBase64 est fourni → décoder et sauvegarder localement
    2. Sinon, si audioUrl est fourni → télécharger via HTTP
    3. Fallback: essayer audioPath (pour compatibilité legacy)
    """

    def __init__(self):
        # Créer le répertoire temporaire s'il n'existe pas
        TEMP_AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        """Retourne une session HTTP réutilisable"""
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=HTTP_DOWNLOAD_TIMEOUT)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self):
        """Ferme la session HTTP"""
        if self._session and not self._session.closed:
            await self._session.close()

    def _generate_temp_filename(self, attachment_id: str, mime_type: str = "audio/wav") -> str:
        """Génère un nom de fichier temporaire unique"""
        # Déterminer l'extension depuis le mime type
        ext_map = {
            "audio/wav": ".wav",
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/mp4": ".m4a",
            "audio/m4a": ".m4a",
            "audio/ogg": ".ogg",
            "audio/webm": ".webm",
            "audio/aac": ".aac",
            "audio/flac": ".flac",
        }
        ext = ext_map.get(mime_type, ".wav")

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return str(TEMP_AUDIO_DIR / f"audio_{attachment_id}_{timestamp}{ext}")

    async def acquire_audio(
        self,
        attachment_id: str,
        audio_binary: Optional[bytes] = None,  # Binaire direct (ZMQ multipart) - RECOMMANDÉ
        audio_base64: Optional[str] = None,
        audio_mime_type: Optional[str] = None,
        audio_url: Optional[str] = None,
        audio_path: Optional[str] = None,  # Legacy fallback
    ) -> Tuple[Optional[str], str]:
        """
        Acquiert le fichier audio depuis la meilleure source disponible.

        Priorité:
        1. audioBinary (binaire direct via ZMQ multipart) - Plus efficace, pas d'encodage
        2. audioBase64 (données inline, legacy)
        3. audioUrl (téléchargement HTTP)
        4. audioPath (legacy, volume partagé)

        Args:
            attachment_id: ID de l'attachement (pour nommage)
            audio_binary: Données audio binaires brutes (ZMQ multipart)
            audio_base64: Données audio encodées en base64
            audio_mime_type: Type MIME de l'audio
            audio_url: URL publique pour télécharger l'audio
            audio_path: Chemin local (legacy, pour compatibilité)

        Returns:
            Tuple (chemin_local, source) où source est 'binary', 'base64', 'url', 'path' ou 'error'
        """
        mime_type = audio_mime_type or "audio/wav"

        # 1. Essayer binaire d'abord (le plus efficace - ZMQ multipart, pas d'encodage)
        if audio_binary:
            try:
                local_path = await self._save_from_binary(
                    audio_binary,
                    attachment_id,
                    mime_type
                )
                if local_path:
                    logger.info(f"[AudioFetcher] ✅ Audio acquis depuis binaire ZMQ: {Path(local_path).name} ({len(audio_binary) / 1024:.1f}KB)")
                    return local_path, "binary"
            except Exception as e:
                logger.warning(f"[AudioFetcher] ⚠️ Erreur sauvegarde binaire: {e}")

        # 2. Essayer base64 (legacy, moins efficace que binaire)
        if audio_base64:
            try:
                local_path = await self._save_from_base64(
                    audio_base64,
                    attachment_id,
                    mime_type
                )
                if local_path:
                    logger.info(f"[AudioFetcher] ✅ Audio acquis depuis base64: {Path(local_path).name}")
                    return local_path, "base64"
            except Exception as e:
                logger.warning(f"[AudioFetcher] ⚠️ Erreur décodage base64: {e}")

        # 2. Essayer URL fetch
        if audio_url:
            try:
                local_path = await self._download_from_url(
                    audio_url,
                    attachment_id,
                    mime_type
                )
                if local_path:
                    logger.info(f"[AudioFetcher] ✅ Audio téléchargé depuis URL: {Path(local_path).name}")
                    return local_path, "url"
            except Exception as e:
                logger.warning(f"[AudioFetcher] ⚠️ Erreur téléchargement URL: {e}")

        # 3. Fallback: chemin local (legacy)
        if audio_path and os.path.exists(audio_path):
            logger.info(f"[AudioFetcher] ✅ Audio trouvé localement (legacy): {Path(audio_path).name}")
            return audio_path, "path"

        # Aucune source valide
        logger.error(
            f"[AudioFetcher] ❌ Impossible d'acquérir l'audio: "
            f"base64={'yes' if audio_base64 else 'no'}, "
            f"url={audio_url or 'none'}, "
            f"path={audio_path or 'none'}"
        )
        return None, "error"

    async def _save_from_binary(
        self,
        audio_binary: bytes,
        attachment_id: str,
        mime_type: str
    ) -> Optional[str]:
        """Sauvegarde les données binaires directement (ZMQ multipart, pas d'encodage)"""
        try:
            # Générer le chemin de sortie
            output_path = self._generate_temp_filename(attachment_id, mime_type)

            # Écrire le fichier directement (pas de décodage nécessaire!)
            with open(output_path, 'wb') as f:
                f.write(audio_binary)

            logger.debug(
                f"[AudioFetcher] Binaire sauvegardé: {len(audio_binary)} bytes → {output_path}"
            )

            return output_path

        except Exception as e:
            logger.error(f"[AudioFetcher] Erreur sauvegarde binaire: {e}")
            return None

    async def _save_from_base64(
        self,
        audio_base64: str,
        attachment_id: str,
        mime_type: str
    ) -> Optional[str]:
        """Décode le base64 et sauvegarde dans un fichier temporaire (legacy)"""
        try:
            # Décoder le base64
            audio_data = base64.b64decode(audio_base64)

            # Générer le chemin de sortie
            output_path = self._generate_temp_filename(attachment_id, mime_type)

            # Écrire le fichier
            with open(output_path, 'wb') as f:
                f.write(audio_data)

            logger.debug(
                f"[AudioFetcher] Base64 décodé: {len(audio_data)} bytes → {output_path}"
            )

            return output_path

        except Exception as e:
            logger.error(f"[AudioFetcher] Erreur sauvegarde base64: {e}")
            return None

    async def _download_from_url(
        self,
        audio_url: str,
        attachment_id: str,
        mime_type: str
    ) -> Optional[str]:
        """Télécharge le fichier audio depuis une URL HTTP"""
        try:
            session = await self._get_session()

            logger.info(f"[AudioFetcher] 📥 Téléchargement depuis: {audio_url}")

            async with session.get(audio_url) as response:
                if response.status != 200:
                    logger.error(
                        f"[AudioFetcher] HTTP {response.status} pour {audio_url}"
                    )
                    return None

                # Vérifier la taille
                content_length = response.headers.get('Content-Length')
                if content_length and int(content_length) > MAX_DOWNLOAD_SIZE:
                    logger.error(
                        f"[AudioFetcher] Fichier trop gros: {int(content_length) / 1024 / 1024:.1f}MB"
                    )
                    return None

                # Détecter le mime type depuis la réponse si disponible
                response_mime = response.headers.get('Content-Type', '').split(';')[0]
                if response_mime.startswith('audio/'):
                    mime_type = response_mime

                # Générer le chemin de sortie
                output_path = self._generate_temp_filename(attachment_id, mime_type)

                # Télécharger par chunks pour gérer les gros fichiers
                total_size = 0
                with open(output_path, 'wb') as f:
                    async for chunk in response.content.iter_chunked(8192):
                        total_size += len(chunk)
                        if total_size > MAX_DOWNLOAD_SIZE:
                            logger.error("[AudioFetcher] Téléchargement interrompu: taille max dépassée")
                            os.remove(output_path)
                            return None
                        f.write(chunk)

                logger.info(
                    f"[AudioFetcher] Téléchargé: {total_size / 1024:.1f}KB → {Path(output_path).name}"
                )

                return output_path

        except asyncio.TimeoutError:
            logger.error(f"[AudioFetcher] Timeout téléchargement: {audio_url}")
            return None
        except aiohttp.ClientError as e:
            logger.error(f"[AudioFetcher] Erreur HTTP: {e}")
            return None
        except Exception as e:
            logger.error(f"[AudioFetcher] Erreur téléchargement: {e}")
            return None

    def cleanup_temp_file(self, file_path: str):
        """
        Supprime un fichier temporaire après utilisation, ET sa conversion WAV
        (`<nom>.converted.wav`, `utils.audio_format_converter`) : #13102 — le
        clair d'un vocal ne reste pas sur le disque du translator une fois la
        tâche finie. Seulement sous le répertoire temporaire.
        """
        if not file_path or str(TEMP_AUDIO_DIR) not in file_path:
            return
        from utils.audio_format_converter import _conversion_cache
        converted = str(Path(file_path).with_suffix('.converted.wav'))
        _conversion_cache.pop(file_path, None)
        for path in (file_path, converted):
            try:
                if os.path.exists(path):
                    os.remove(path)
                    logger.debug(f"[AudioFetcher] 🗑️ Fichier temp supprimé: {Path(path).name}")
            except Exception as e:
                logger.warning(f"[AudioFetcher] Erreur suppression fichier temp: {type(e).__name__}")

    def cleanup_old_temp_files(self, max_age_hours: int = 24):
        """Nettoie les fichiers temporaires plus vieux que max_age_hours"""
        try:
            now = datetime.now()
            count = 0

            for file_path in TEMP_AUDIO_DIR.glob("audio_*"):
                if file_path.is_file():
                    file_age = now - datetime.fromtimestamp(file_path.stat().st_mtime)
                    if file_age.total_seconds() > max_age_hours * 3600:
                        file_path.unlink()
                        count += 1

            if count > 0:
                logger.info(f"[AudioFetcher] 🧹 Nettoyé {count} fichiers temp (>{max_age_hours}h)")

        except Exception as e:
            logger.warning(f"[AudioFetcher] Erreur nettoyage fichiers temp: {e}")


# Instance singleton
_audio_fetcher: Optional[AudioFetcherService] = None


def get_audio_fetcher() -> AudioFetcherService:
    """Retourne l'instance singleton du service"""
    global _audio_fetcher
    if _audio_fetcher is None:
        _audio_fetcher = AudioFetcherService()
    return _audio_fetcher
