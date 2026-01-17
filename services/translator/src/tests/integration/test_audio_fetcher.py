#!/usr/bin/env python3
"""
Test Audio Fetcher Service
==========================

Teste le nouveau flow hybride d'acquisition audio:
1. Base64 (données inline) - pour fichiers < 5MB
2. HTTP URL fetch - pour fichiers plus gros
3. Path legacy (fallback)

Usage:
    cd services/translator
    python -m pytest src/tests/integration/test_audio_fetcher.py -v

    # Ou directement:
    python -m src.tests.integration.test_audio_fetcher
"""

import os
import sys
import asyncio
import base64
import tempfile
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time

# Ajouter le chemin du projet
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.services.audio_fetcher import AudioFetcherService, get_audio_fetcher


def create_test_audio_file(duration_seconds: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Crée un fichier WAV de test avec un ton sinusoïdal"""
    import struct
    import math

    # Paramètres audio
    channels = 1
    bits_per_sample = 16
    frequency = 440  # Hz (La)

    # Générer les échantillons
    num_samples = int(sample_rate * duration_seconds)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        sample = int(32767 * 0.5 * math.sin(2 * math.pi * frequency * t))
        samples.append(sample)

    # Créer le header WAV
    byte_rate = sample_rate * channels * bits_per_sample // 8
    block_align = channels * bits_per_sample // 8
    data_size = num_samples * block_align

    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,
        b'WAVE',
        b'fmt ',
        16,  # Subchunk1Size
        1,   # AudioFormat (PCM)
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_size
    )

    # Encoder les échantillons
    data = struct.pack('<' + 'h' * num_samples, *samples)

    return header + data


class TestAudioFetcher:
    """Tests pour AudioFetcherService"""

    @classmethod
    def setup_class(cls):
        """Initialisation des tests"""
        cls.fetcher = AudioFetcherService()
        cls.test_audio_small = create_test_audio_file(duration_seconds=1.0)  # ~32KB
        cls.test_audio_medium = create_test_audio_file(duration_seconds=30.0)  # ~960KB

        # Créer un fichier temp pour les tests
        cls.temp_dir = tempfile.mkdtemp()
        cls.temp_audio_path = os.path.join(cls.temp_dir, "test_audio.wav")
        with open(cls.temp_audio_path, 'wb') as f:
            f.write(cls.test_audio_small)

    @classmethod
    async def teardown_class_async(cls):
        """Nettoyage après tests (async)"""
        await cls.fetcher.close()

    @classmethod
    def teardown_class(cls):
        """Nettoyage après tests"""
        # Nettoyer les fichiers temp
        import shutil
        shutil.rmtree(cls.temp_dir, ignore_errors=True)

    async def test_acquire_from_base64(self):
        """Test acquisition depuis base64"""
        print("\n📦 Test: Acquisition depuis base64...")

        # Encoder en base64
        audio_base64 = base64.b64encode(self.test_audio_small).decode('utf-8')

        # Acquérir
        local_path, source = await self.fetcher.acquire_audio(
            attachment_id="test_base64_001",
            audio_base64=audio_base64,
            audio_mime_type="audio/wav"
        )

        assert local_path is not None, "Le chemin local ne devrait pas être None"
        assert source == "base64", f"La source devrait être 'base64', pas '{source}'"
        assert os.path.exists(local_path), f"Le fichier devrait exister: {local_path}"

        # Vérifier la taille
        file_size = os.path.getsize(local_path)
        assert file_size == len(self.test_audio_small), f"Taille incorrecte: {file_size} vs {len(self.test_audio_small)}"

        print(f"   ✅ Fichier créé: {local_path} ({file_size} bytes)")

        # Nettoyer
        self.fetcher.cleanup_temp_file(local_path)
        assert not os.path.exists(local_path), "Le fichier devrait être supprimé"
        print("   ✅ Nettoyage OK")

    async def test_acquire_from_path_legacy(self):
        """Test acquisition depuis chemin local (legacy)"""
        print("\n📁 Test: Acquisition depuis path legacy...")

        # Acquérir depuis le chemin existant
        local_path, source = await self.fetcher.acquire_audio(
            attachment_id="test_path_001",
            audio_path=self.temp_audio_path
        )

        assert local_path is not None, "Le chemin local ne devrait pas être None"
        assert source == "path", f"La source devrait être 'path', pas '{source}'"
        assert local_path == self.temp_audio_path, "Le chemin devrait être le même"

        print(f"   ✅ Chemin existant utilisé: {local_path}")

    async def test_acquire_from_url(self):
        """Test acquisition depuis URL HTTP"""
        print("\n🌐 Test: Acquisition depuis URL HTTP...")

        # Démarrer un serveur HTTP local temporaire
        server_dir = self.temp_dir

        class QuietHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=server_dir, **kwargs)
            def log_message(self, format, *args):
                pass  # Silence les logs

        server = HTTPServer(('127.0.0.1', 0), QuietHandler)
        port = server.server_address[1]

        # Démarrer le serveur dans un thread
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        try:
            # URL du fichier audio
            audio_url = f"http://127.0.0.1:{port}/test_audio.wav"
            print(f"   🔗 URL: {audio_url}")

            # Acquérir
            local_path, source = await self.fetcher.acquire_audio(
                attachment_id="test_url_001",
                audio_url=audio_url
            )

            assert local_path is not None, "Le chemin local ne devrait pas être None"
            assert source == "url", f"La source devrait être 'url', pas '{source}'"
            assert os.path.exists(local_path), f"Le fichier devrait exister: {local_path}"

            # Vérifier la taille
            file_size = os.path.getsize(local_path)
            assert file_size == len(self.test_audio_small), f"Taille incorrecte: {file_size}"

            print(f"   ✅ Fichier téléchargé: {local_path} ({file_size} bytes)")

            # Nettoyer
            self.fetcher.cleanup_temp_file(local_path)
            print("   ✅ Nettoyage OK")

        finally:
            server.shutdown()

    async def test_priority_base64_over_url(self):
        """Test que base64 est prioritaire sur URL"""
        print("\n🔄 Test: Priorité base64 > URL...")

        audio_base64 = base64.b64encode(self.test_audio_small).decode('utf-8')

        # Fournir les deux, base64 devrait être utilisé
        local_path, source = await self.fetcher.acquire_audio(
            attachment_id="test_priority_001",
            audio_base64=audio_base64,
            audio_url="http://invalid.url/should_not_be_used.wav",
            audio_path="/invalid/path/should_not_be_used.wav"
        )

        assert source == "base64", f"Base64 devrait être prioritaire, pas '{source}'"
        print(f"   ✅ Base64 utilisé en priorité (source={source})")

        # Nettoyer
        self.fetcher.cleanup_temp_file(local_path)

    async def test_fallback_to_url_when_no_base64(self):
        """Test fallback vers URL quand pas de base64"""
        print("\n🔄 Test: Fallback URL quand pas de base64...")

        # Démarrer un serveur HTTP local
        server_dir = self.temp_dir

        class QuietHandler(SimpleHTTPRequestHandler):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, directory=server_dir, **kwargs)
            def log_message(self, format, *args):
                pass

        server = HTTPServer(('127.0.0.1', 0), QuietHandler)
        port = server.server_address[1]

        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()

        try:
            audio_url = f"http://127.0.0.1:{port}/test_audio.wav"

            # Pas de base64, URL devrait être utilisée
            local_path, source = await self.fetcher.acquire_audio(
                attachment_id="test_fallback_001",
                audio_base64=None,  # Pas de base64
                audio_url=audio_url
            )

            assert source == "url", f"URL devrait être utilisée, pas '{source}'"
            print(f"   ✅ Fallback URL OK (source={source})")

            self.fetcher.cleanup_temp_file(local_path)

        finally:
            server.shutdown()

    async def test_error_when_no_source(self):
        """Test erreur quand aucune source n'est disponible"""
        print("\n❌ Test: Erreur quand aucune source...")

        local_path, source = await self.fetcher.acquire_audio(
            attachment_id="test_error_001",
            audio_base64=None,
            audio_url=None,
            audio_path=None
        )

        assert local_path is None, "Le chemin devrait être None"
        assert source == "error", f"La source devrait être 'error', pas '{source}'"
        print(f"   ✅ Erreur correctement retournée (source={source})")


async def run_tests():
    """Exécute tous les tests"""
    print("=" * 60)
    print("TEST AUDIO FETCHER SERVICE")
    print("=" * 60)

    tester = TestAudioFetcher()
    tester.setup_class()

    try:
        await tester.test_acquire_from_base64()
        await tester.test_acquire_from_path_legacy()
        await tester.test_acquire_from_url()
        await tester.test_priority_base64_over_url()
        await tester.test_fallback_to_url_when_no_base64()
        await tester.test_error_when_no_source()

        print("\n" + "=" * 60)
        print("✅ TOUS LES TESTS PASSÉS !")
        print("=" * 60)

    except AssertionError as e:
        print(f"\n❌ TEST ÉCHOUÉ: {e}")
        raise
    finally:
        await tester.teardown_class_async()
        tester.teardown_class()


if __name__ == "__main__":
    asyncio.run(run_tests())
