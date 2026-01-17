"""
Test d'intégration E2E pour le protocole ZMQ Multipart

Simule le flux complet:
  Gateway (TypeScript) → ZMQ PUSH → Translator (Python) → ZMQ PUB → Gateway

Ce test utilise de vrais sockets ZMQ pour valider l'interopérabilité.
"""

import pytest
import asyncio
import json
import time
import uuid
import tempfile
from pathlib import Path
from typing import List, Dict, Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch

# ZMQ imports
try:
    import zmq
    import zmq.asyncio
    ZMQ_AVAILABLE = True
except ImportError:
    ZMQ_AVAILABLE = False
    zmq = None

import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


@pytest.fixture
def zmq_context():
    """Créer un contexte ZMQ asyncio."""
    if not ZMQ_AVAILABLE:
        pytest.skip("ZMQ non disponible")
    ctx = zmq.asyncio.Context()
    yield ctx
    ctx.term()


@pytest.fixture
async def zmq_pair_sockets(zmq_context):
    """Créer une paire de sockets PUSH/PULL pour les tests."""
    push_socket = zmq_context.socket(zmq.PUSH)
    pull_socket = zmq_context.socket(zmq.PULL)

    # Utiliser un port aléatoire
    port = push_socket.bind_to_random_port("tcp://127.0.0.1")
    pull_socket.connect(f"tcp://127.0.0.1:{port}")

    yield push_socket, pull_socket

    push_socket.close()
    pull_socket.close()


@pytest.fixture
async def zmq_pubsub_sockets(zmq_context):
    """Créer une paire de sockets PUB/SUB pour les tests."""
    pub_socket = zmq_context.socket(zmq.PUB)
    sub_socket = zmq_context.socket(zmq.SUB)

    port = pub_socket.bind_to_random_port("tcp://127.0.0.1")
    sub_socket.connect(f"tcp://127.0.0.1:{port}")
    sub_socket.setsockopt_string(zmq.SUBSCRIBE, "")

    # Attendre la connexion
    await asyncio.sleep(0.1)

    yield pub_socket, sub_socket

    pub_socket.close()
    sub_socket.close()


@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
class TestZMQMultipartE2E:
    """Tests E2E pour le protocole multipart ZMQ."""

    @pytest.mark.asyncio
    async def test_gateway_to_translator_audio_multipart(self, zmq_pair_sockets):
        """
        Test E2E: Gateway envoie audio multipart → Translator reçoit.

        Simule:
        1. Gateway crée frames multipart (JSON + audio binaire)
        2. Gateway envoie via PUSH
        3. Translator reçoit via PULL
        4. Translator extrait l'audio binaire
        """
        push_socket, pull_socket = zmq_pair_sockets

        # === Côté Gateway: Préparer et envoyer ===
        original_audio = b"RIFF....WAVEfmt simulated WAV audio content for E2E test"
        task_id = str(uuid.uuid4())

        gateway_request = {
            "type": "audio_process",
            "taskId": task_id,
            "messageId": f"msg-{uuid.uuid4()}",
            "attachmentId": f"att-{uuid.uuid4()}",
            "conversationId": f"conv-{uuid.uuid4()}",
            "senderId": "user-gateway-test",
            "audioUrl": "https://example.com/audio.wav",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/wav",
                "audioSize": len(original_audio)
            },
            "targetLanguages": ["en", "fr", "es"],
            "generateVoiceClone": True,
            "modelType": "basic",
            "audioDurationMs": 5000
        }

        # Créer les frames multipart comme le fait Gateway
        json_frame = json.dumps(gateway_request).encode('utf-8')
        frames_to_send = [json_frame, original_audio]

        # Envoyer via PUSH (multipart)
        await push_socket.send_multipart(frames_to_send)

        # === Côté Translator: Recevoir et parser ===
        received_frames = await pull_socket.recv_multipart()

        # Parser comme le fait Translator
        assert len(received_frames) >= 1, "Au moins un frame attendu"

        parsed_json = json.loads(received_frames[0].decode('utf-8'))
        binary_frames = received_frames[1:]
        binary_frame_info = parsed_json.get('binaryFrames', {})

        # Extraire l'audio
        extracted_audio = None
        audio_idx = binary_frame_info.get('audio')
        if audio_idx and audio_idx <= len(binary_frames):
            extracted_audio = binary_frames[audio_idx - 1]

        # === Vérifications ===
        assert parsed_json['type'] == 'audio_process'
        assert parsed_json['taskId'] == task_id
        assert len(binary_frames) == 1
        assert extracted_audio is not None
        assert extracted_audio == original_audio
        assert binary_frame_info['audioMimeType'] == 'audio/wav'
        assert binary_frame_info['audioSize'] == len(original_audio)

    @pytest.mark.asyncio
    async def test_gateway_to_translator_transcription_multipart(self, zmq_pair_sockets):
        """
        Test E2E: Gateway envoie transcription request multipart → Translator.
        """
        push_socket, pull_socket = zmq_pair_sockets

        # Audio pour transcription
        audio_content = b"Audio content for transcription only test"

        gateway_request = {
            "type": "transcription_only",
            "taskId": str(uuid.uuid4()),
            "messageId": f"msg-trans-{uuid.uuid4()}",
            "audioFormat": "webm",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/webm",
                "audioSize": len(audio_content)
            }
        }

        frames = [
            json.dumps(gateway_request).encode('utf-8'),
            audio_content
        ]

        await push_socket.send_multipart(frames)

        received_frames = await pull_socket.recv_multipart()
        parsed = json.loads(received_frames[0].decode('utf-8'))
        binary_frames = received_frames[1:]

        assert parsed['type'] == 'transcription_only'
        assert len(binary_frames) == 1
        assert binary_frames[0] == audio_content

    @pytest.mark.asyncio
    async def test_translator_to_gateway_response(self, zmq_pubsub_sockets):
        """
        Test E2E: Translator envoie réponse → Gateway reçoit.

        Simule:
        1. Translator publie résultat via PUB
        2. Gateway reçoit via SUB
        """
        pub_socket, sub_socket = zmq_pubsub_sockets

        # Réponse du Translator
        translator_response = {
            "type": "audio_process_completed",
            "taskId": str(uuid.uuid4()),
            "messageId": f"msg-{uuid.uuid4()}",
            "attachmentId": f"att-{uuid.uuid4()}",
            "transcription": {
                "text": "Bonjour, ceci est un test de transcription.",
                "language": "fr",
                "confidence": 0.95,
                "source": "whisper",
                "durationMs": 3500
            },
            "translatedAudios": [
                {
                    "targetLanguage": "en",
                    "translatedText": "Hello, this is a transcription test.",
                    "audioUrl": "/audio/translated_en.mp3",
                    "durationMs": 3200,
                    "voiceCloned": True,
                    "voiceQuality": 0.85
                }
            ],
            "voiceModelUserId": "user-001",
            "voiceModelQuality": 0.88,
            "processingTimeMs": 4500,
            "timestamp": time.time()
        }

        # Translator publie
        response_json = json.dumps(translator_response).encode('utf-8')
        await pub_socket.send(response_json)

        # Gateway reçoit
        received = await asyncio.wait_for(sub_socket.recv(), timeout=2.0)
        parsed_response = json.loads(received.decode('utf-8'))

        # Vérifications
        assert parsed_response['type'] == 'audio_process_completed'
        assert parsed_response['transcription']['text'] == "Bonjour, ceci est un test de transcription."
        assert len(parsed_response['translatedAudios']) == 1
        assert parsed_response['translatedAudios'][0]['targetLanguage'] == 'en'

    @pytest.mark.asyncio
    async def test_legacy_json_only_compatibility(self, zmq_pair_sockets):
        """
        Test E2E: Rétrocompatibilité avec format JSON seul (pas de multipart).
        """
        push_socket, pull_socket = zmq_pair_sockets

        import base64
        audio_base64 = base64.b64encode(b"legacy audio data").decode('utf-8')

        legacy_request = {
            "type": "audio_process",
            "messageId": f"msg-legacy-{uuid.uuid4()}",
            "audioBase64": audio_base64,
            "audioUrl": "https://example.com/audio.wav",
            "targetLanguages": ["en"],
            "generateVoiceClone": False,
            "modelType": "basic",
            "audioDurationMs": 2000
            # Pas de binaryFrames!
        }

        # Envoyer comme un seul frame JSON
        frames = [json.dumps(legacy_request).encode('utf-8')]
        await push_socket.send_multipart(frames)

        received_frames = await pull_socket.recv_multipart()

        assert len(received_frames) == 1
        parsed = json.loads(received_frames[0].decode('utf-8'))

        # Vérifier format legacy
        assert 'binaryFrames' not in parsed or parsed['binaryFrames'] is None
        assert parsed['audioBase64'] == audio_base64

    @pytest.mark.asyncio
    async def test_full_roundtrip_audio_process(self, zmq_pair_sockets, zmq_pubsub_sockets):
        """
        Test E2E complet: Gateway → Translator → Gateway

        Flux complet:
        1. Gateway envoie audio multipart via PUSH
        2. Translator reçoit via PULL
        3. Translator traite (simulé)
        4. Translator publie résultat via PUB
        5. Gateway reçoit via SUB
        """
        push_socket, pull_socket = zmq_pair_sockets
        pub_socket, sub_socket = zmq_pubsub_sockets

        original_audio = b"Complete roundtrip audio test content"
        task_id = str(uuid.uuid4())
        message_id = f"msg-roundtrip-{uuid.uuid4()}"

        # === Gateway envoie ===
        gateway_request = {
            "type": "audio_process",
            "taskId": task_id,
            "messageId": message_id,
            "attachmentId": f"att-{uuid.uuid4()}",
            "conversationId": f"conv-{uuid.uuid4()}",
            "senderId": "user-roundtrip",
            "audioUrl": "https://example.com/audio.wav",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/wav",
                "audioSize": len(original_audio)
            },
            "targetLanguages": ["en"],
            "generateVoiceClone": True,
            "modelType": "basic",
            "audioDurationMs": 3000
        }

        frames = [json.dumps(gateway_request).encode('utf-8'), original_audio]
        await push_socket.send_multipart(frames)

        # === Translator reçoit ===
        received = await pull_socket.recv_multipart()
        parsed_request = json.loads(received[0].decode('utf-8'))
        binary_audio = received[1] if len(received) > 1 else None

        assert parsed_request['taskId'] == task_id
        assert binary_audio == original_audio

        # === Translator "traite" et répond ===
        translator_response = {
            "type": "audio_process_completed",
            "taskId": task_id,
            "messageId": message_id,
            "transcription": {
                "text": "Transcription from roundtrip test",
                "language": "en",
                "confidence": 0.97,
                "source": "whisper"
            },
            "translatedAudios": [
                {
                    "targetLanguage": "en",
                    "translatedText": "Transcription from roundtrip test",
                    "audioUrl": "/audio/output.mp3",
                    "voiceCloned": True
                }
            ],
            "processingTimeMs": 1500
        }

        await pub_socket.send(json.dumps(translator_response).encode('utf-8'))

        # === Gateway reçoit la réponse ===
        response = await asyncio.wait_for(sub_socket.recv(), timeout=2.0)
        parsed_response = json.loads(response.decode('utf-8'))

        assert parsed_response['type'] == 'audio_process_completed'
        assert parsed_response['taskId'] == task_id
        assert parsed_response['messageId'] == message_id


@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
class TestZMQMultipartPerformance:
    """Tests de performance pour le protocole multipart."""

    @pytest.mark.asyncio
    async def test_binary_vs_base64_size_comparison(self, zmq_pair_sockets):
        """Comparer taille binaire vs base64."""
        push_socket, pull_socket = zmq_pair_sockets

        import base64

        # Audio de 1MB
        audio_size = 1024 * 1024
        audio_binary = b"X" * audio_size

        # Mode binaire (multipart)
        binary_request = {
            "type": "test",
            "binaryFrames": {"audio": 1}
        }
        binary_frames = [
            json.dumps(binary_request).encode('utf-8'),
            audio_binary
        ]
        binary_total_size = sum(len(f) for f in binary_frames)

        # Mode base64 (legacy)
        audio_base64 = base64.b64encode(audio_binary).decode('utf-8')
        base64_request = {
            "type": "test",
            "audioBase64": audio_base64
        }
        base64_frames = [json.dumps(base64_request).encode('utf-8')]
        base64_total_size = sum(len(f) for f in base64_frames)

        # Calculer les économies
        savings = ((base64_total_size - binary_total_size) / base64_total_size) * 100

        print(f"\n=== Comparaison Binaire vs Base64 ===")
        print(f"Audio original: {audio_size:,} bytes (1MB)")
        print(f"Binaire (multipart): {binary_total_size:,} bytes")
        print(f"Base64 (legacy): {base64_total_size:,} bytes")
        print(f"Économie: {savings:.1f}%")

        # Le binaire devrait être ~25% plus petit
        assert savings > 20, f"Économie attendue > 20%, obtenu {savings:.1f}%"

    @pytest.mark.asyncio
    async def test_multipart_latency(self, zmq_pair_sockets):
        """Mesurer la latence d'envoi multipart."""
        push_socket, pull_socket = zmq_pair_sockets

        audio_sizes = [1024, 10240, 102400, 1024000]  # 1KB à 1MB
        results = []

        for size in audio_sizes:
            audio = b"X" * size
            request = {
                "type": "latency_test",
                "binaryFrames": {"audio": 1}
            }
            frames = [json.dumps(request).encode('utf-8'), audio]

            start = time.perf_counter()
            await push_socket.send_multipart(frames)
            received = await pull_socket.recv_multipart()
            end = time.perf_counter()

            latency_ms = (end - start) * 1000
            results.append((size, latency_ms))

        print("\n=== Latence Multipart ===")
        for size, latency in results:
            print(f"  {size:>10,} bytes: {latency:.3f} ms")

        # Vérifier que la latence reste raisonnable
        for size, latency in results:
            assert latency < 1000, f"Latence trop élevée pour {size} bytes: {latency}ms"


@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
class TestZMQMultipartEdgeCases:
    """Tests des cas limites pour le multipart."""

    @pytest.mark.asyncio
    async def test_empty_binary_frame(self, zmq_pair_sockets):
        """Test avec frame binaire vide."""
        push_socket, pull_socket = zmq_pair_sockets

        request = {
            "type": "test",
            "binaryFrames": {"audio": 1, "audioSize": 0}
        }

        frames = [json.dumps(request).encode('utf-8'), b""]

        await push_socket.send_multipart(frames)
        received = await pull_socket.recv_multipart()

        assert len(received) == 2
        assert len(received[1]) == 0

    @pytest.mark.asyncio
    async def test_multiple_binary_frames(self, zmq_pair_sockets):
        """Test avec plusieurs frames binaires."""
        push_socket, pull_socket = zmq_pair_sockets

        audio = b"audio data"
        embedding = b"embedding pkl data"
        extra = b"extra binary data"

        request = {
            "type": "test",
            "binaryFrames": {
                "audio": 1,
                "embedding": 2,
                "extra": 3
            }
        }

        frames = [
            json.dumps(request).encode('utf-8'),
            audio,
            embedding,
            extra
        ]

        await push_socket.send_multipart(frames)
        received = await pull_socket.recv_multipart()

        assert len(received) == 4
        assert received[1] == audio
        assert received[2] == embedding
        assert received[3] == extra

    @pytest.mark.asyncio
    async def test_large_json_metadata(self, zmq_pair_sockets):
        """Test avec métadonnées JSON volumineuses."""
        push_socket, pull_socket = zmq_pair_sockets

        # Créer une grande structure JSON
        large_metadata = {
            "type": "test",
            "segments": [
                {"text": f"Segment {i}", "start": i * 1000, "end": (i + 1) * 1000}
                for i in range(1000)
            ],
            "binaryFrames": {"audio": 1}
        }

        audio = b"small audio"
        frames = [json.dumps(large_metadata).encode('utf-8'), audio]

        await push_socket.send_multipart(frames)
        received = await pull_socket.recv_multipart()

        parsed = json.loads(received[0].decode('utf-8'))
        assert len(parsed['segments']) == 1000


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
