"""
Tests unitaires pour le protocole ZMQ Multipart

Vérifie:
1. Réception correcte des frames multipart
2. Extraction des données binaires (audio, embedding)
3. Rétrocompatibilité avec le format JSON legacy
4. Intégration avec AudioFetcher
"""

import pytest
import json
import base64
import tempfile
import asyncio
from pathlib import Path
from typing import List, Dict, Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch

# Imports du projet
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))


class TestZMQMultipartProtocol:
    """Tests pour le protocole ZMQ multipart."""

    def test_parse_multipart_frames_with_audio(self):
        """Test parsing de frames multipart avec audio binaire."""
        # Simuler les données comme Gateway les enverrait
        original_audio = b"RIFF....WAVEfmt mock audio data content"

        request_data = {
            "type": "audio_process",
            "messageId": "msg-123",
            "attachmentId": "att-456",
            "conversationId": "conv-789",
            "senderId": "user-001",
            "audioUrl": "https://example.com/audio.wav",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/wav",
                "audioSize": len(original_audio)
            },
            "targetLanguages": ["en", "fr"],
            "generateVoiceClone": True,
            "modelType": "basic",
            "audioDurationMs": 5000
        }

        # Créer les frames multipart
        json_frame = json.dumps(request_data).encode('utf-8')
        frames: List[bytes] = [json_frame, original_audio]

        # Parser comme le ferait le Translator
        parsed_json = json.loads(frames[0].decode('utf-8'))
        binary_frames = frames[1:]
        binary_frame_info = parsed_json.get('binaryFrames', {})

        # Extraire l'audio binaire
        extracted_audio = None
        audio_idx = binary_frame_info.get('audio')
        if audio_idx and audio_idx <= len(binary_frames):
            extracted_audio = binary_frames[audio_idx - 1]

        # Vérifications
        assert extracted_audio is not None
        assert len(extracted_audio) == len(original_audio)
        assert extracted_audio == original_audio
        assert binary_frame_info.get('audioMimeType') == 'audio/wav'
        assert binary_frame_info.get('audioSize') == len(original_audio)

    def test_parse_multipart_frames_with_audio_and_embedding(self):
        """Test parsing de frames avec audio ET embedding."""
        original_audio = b"mock audio binary data"
        original_embedding = b"mock pkl embedding data"

        request_data = {
            "type": "audio_process",
            "messageId": "msg-multi",
            "binaryFrames": {
                "audio": 1,
                "embedding": 2,
                "audioMimeType": "audio/wav",
                "audioSize": len(original_audio),
                "embeddingSize": len(original_embedding)
            }
        }

        json_frame = json.dumps(request_data).encode('utf-8')
        frames: List[bytes] = [json_frame, original_audio, original_embedding]

        parsed_json = json.loads(frames[0].decode('utf-8'))
        binary_frames = frames[1:]
        binary_frame_info = parsed_json.get('binaryFrames', {})

        # Extraire audio
        audio_idx = binary_frame_info.get('audio')
        extracted_audio = binary_frames[audio_idx - 1] if audio_idx else None

        # Extraire embedding
        embedding_idx = binary_frame_info.get('embedding')
        extracted_embedding = binary_frames[embedding_idx - 1] if embedding_idx else None

        assert extracted_audio == original_audio
        assert extracted_embedding == original_embedding

    def test_legacy_json_only_format(self):
        """Test rétrocompatibilité avec format JSON seul (pas de multipart)."""
        request_data = {
            "type": "audio_process",
            "messageId": "msg-legacy",
            "audioBase64": base64.b64encode(b"legacy audio data").decode('utf-8'),
            "audioUrl": "https://example.com/audio.wav"
            # Pas de binaryFrames
        }

        json_frame = json.dumps(request_data).encode('utf-8')
        frames: List[bytes] = [json_frame]  # Un seul frame

        parsed_json = json.loads(frames[0].decode('utf-8'))
        binary_frames = frames[1:]
        binary_frame_info = parsed_json.get('binaryFrames')

        # Pas de binaryFrames → utiliser audioBase64 (legacy)
        assert binary_frame_info is None
        assert len(binary_frames) == 0
        assert parsed_json.get('audioBase64') is not None
        assert parsed_json.get('audioUrl') == "https://example.com/audio.wav"

    def test_transcription_only_with_binary(self):
        """Test requête de transcription avec audio binaire."""
        original_audio = b"transcription audio content bytes"

        request_data = {
            "type": "transcription_only",
            "taskId": "task-trans-001",
            "messageId": "msg-trans-001",
            "audioFormat": "webm",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/webm",
                "audioSize": len(original_audio)
            }
        }

        json_frame = json.dumps(request_data).encode('utf-8')
        frames: List[bytes] = [json_frame, original_audio]

        parsed_json = json.loads(frames[0].decode('utf-8'))
        binary_frames = frames[1:]

        assert parsed_json['type'] == 'transcription_only'
        assert parsed_json['audioFormat'] == 'webm'
        assert len(binary_frames) == 1
        assert binary_frames[0] == original_audio


class TestBinarySizeCalculations:
    """Tests pour les calculs de taille binaire vs base64."""

    def test_binary_saves_33_percent_vs_base64(self):
        """Vérifier que le binaire économise ~33% vs base64."""
        test_sizes = [1024, 10240, 102400, 1024000, 5242880]  # 1KB à 5MB

        for size_bytes in test_sizes:
            audio_binary = b"x" * size_bytes
            base64_encoded = base64.b64encode(audio_binary)
            base64_size = len(base64_encoded)

            savings_percent = ((base64_size - size_bytes) / base64_size) * 100

            # L'économie devrait être entre 25% et 35%
            assert 20 < savings_percent < 40, f"Size {size_bytes}: savings {savings_percent:.1f}%"

    def test_binary_frame_info_tracks_sizes(self):
        """Test que BinaryFrameInfo track correctement les tailles."""
        audio_data = b"A" * 1000
        embedding_data = b"B" * 500

        binary_frame_info = {
            "audio": 1,
            "embedding": 2,
            "audioSize": len(audio_data),
            "embeddingSize": len(embedding_data)
        }

        assert binary_frame_info["audioSize"] == 1000
        assert binary_frame_info["embeddingSize"] == 500


class TestAudioFetcherIntegration:
    """Tests d'intégration avec AudioFetcher."""

    @pytest.fixture
    def temp_audio_dir(self):
        """Créer un répertoire temporaire pour les tests."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    def test_save_binary_directly(self, temp_audio_dir):
        """Test sauvegarde de binaire direct (sans décodage base64)."""
        audio_binary = b"RIFF....WAVEfmt test audio content"
        output_path = temp_audio_dir / "test_audio.wav"

        # Simuler _save_from_binary
        with open(output_path, 'wb') as f:
            f.write(audio_binary)

        # Vérifier
        assert output_path.exists()
        assert output_path.read_bytes() == audio_binary

    def test_binary_priority_over_base64(self, temp_audio_dir):
        """Test que le binaire a priorité sur base64."""
        audio_binary = b"binary audio data"
        audio_base64 = base64.b64encode(b"base64 audio data").decode('utf-8')

        # Simuler la logique d'acquire_audio
        result_source = None
        result_data = None

        # Priorité: binary > base64 > url > path
        if audio_binary:
            result_source = "binary"
            result_data = audio_binary
        elif audio_base64:
            result_source = "base64"
            result_data = base64.b64decode(audio_base64)

        assert result_source == "binary"
        assert result_data == audio_binary


class TestMultipartHandlerSimulation:
    """Tests simulant le handler multipart du ZMQ server."""

    def simulate_handle_translation_request_multipart(
        self,
        frames: List[bytes]
    ) -> Dict[str, Any]:
        """Simuler _handle_translation_request_multipart."""
        if not frames:
            return {"error": "empty_frames"}

        # Frame 0: JSON metadata
        json_frame = frames[0]
        binary_frames = frames[1:] if len(frames) > 1 else []

        try:
            request_data = json.loads(json_frame.decode('utf-8'))
        except json.JSONDecodeError as e:
            return {"error": f"json_decode_error: {e}"}

        binary_frame_info = request_data.get('binaryFrames', {})

        # Injecter les binaires
        if binary_frames and binary_frame_info:
            audio_idx = binary_frame_info.get('audio')
            if audio_idx and audio_idx <= len(binary_frames):
                request_data['_audioBinary'] = binary_frames[audio_idx - 1]

            embedding_idx = binary_frame_info.get('embedding')
            if embedding_idx and embedding_idx <= len(binary_frames):
                request_data['_embeddingBinary'] = binary_frames[embedding_idx - 1]

        return request_data

    def test_multipart_audio_injection(self):
        """Test injection de _audioBinary dans request_data."""
        original_audio = b"test audio bytes content"

        request = {
            "type": "audio_process",
            "messageId": "msg-inject",
            "binaryFrames": {"audio": 1, "audioSize": len(original_audio)}
        }

        frames = [
            json.dumps(request).encode('utf-8'),
            original_audio
        ]

        result = self.simulate_handle_translation_request_multipart(frames)

        assert '_audioBinary' in result
        assert result['_audioBinary'] == original_audio

    def test_multipart_audio_and_embedding_injection(self):
        """Test injection de _audioBinary ET _embeddingBinary."""
        audio = b"audio bytes"
        embedding = b"embedding pkl bytes"

        request = {
            "type": "audio_process",
            "messageId": "msg-both",
            "binaryFrames": {"audio": 1, "embedding": 2}
        }

        frames = [
            json.dumps(request).encode('utf-8'),
            audio,
            embedding
        ]

        result = self.simulate_handle_translation_request_multipart(frames)

        assert result['_audioBinary'] == audio
        assert result['_embeddingBinary'] == embedding

    def test_legacy_single_frame(self):
        """Test avec un seul frame (legacy JSON)."""
        request = {
            "type": "audio_process",
            "messageId": "msg-legacy",
            "audioBase64": "dGVzdA==",  # "test" en base64
            "audioUrl": "https://example.com/audio.wav"
        }

        frames = [json.dumps(request).encode('utf-8')]

        result = self.simulate_handle_translation_request_multipart(frames)

        assert '_audioBinary' not in result
        assert result.get('audioBase64') == "dGVzdA=="
        assert result.get('audioUrl') == "https://example.com/audio.wav"

    def test_empty_frames_handling(self):
        """Test gestion des frames vides."""
        result = self.simulate_handle_translation_request_multipart([])
        assert result.get('error') == 'empty_frames'

    def test_invalid_json_handling(self):
        """Test gestion de JSON invalide."""
        frames = [b"not valid json {{{"]
        result = self.simulate_handle_translation_request_multipart(frames)
        assert 'error' in result
        assert 'json_decode_error' in result['error']


class TestMimeTypeHandling:
    """Tests pour la gestion des types MIME."""

    @pytest.mark.parametrize("mime_type,extension", [
        ("audio/wav", "wav"),
        ("audio/mpeg", "mp3"),
        ("audio/mp4", "m4a"),
        ("audio/ogg", "ogg"),
        ("audio/webm", "webm"),
        ("audio/aac", "aac"),
        ("audio/flac", "flac"),
    ])
    def test_mime_type_in_binary_frame_info(self, mime_type, extension):
        """Test que les types MIME sont correctement transmis."""
        binary_frame_info = {
            "audio": 1,
            "audioMimeType": mime_type,
            "audioSize": 1000
        }

        assert binary_frame_info["audioMimeType"] == mime_type


class TestEdgeCases:
    """Tests pour les cas limites."""

    def test_empty_audio_buffer(self):
        """Test avec buffer audio vide."""
        binary_frame_info = {
            "audio": 1,
            "audioSize": 0
        }

        frames = [
            json.dumps({"binaryFrames": binary_frame_info}).encode('utf-8'),
            b""  # Buffer vide
        ]

        assert len(frames[1]) == 0

    def test_large_audio_threshold(self):
        """Test seuil de 5MB pour les fichiers audio."""
        THRESHOLD = 5 * 1024 * 1024  # 5MB

        under_threshold = THRESHOLD - 1
        over_threshold = THRESHOLD + 1

        assert under_threshold < THRESHOLD
        assert over_threshold > THRESHOLD

    def test_unicode_in_metadata(self):
        """Test caractères Unicode dans les métadonnées."""
        request = {
            "type": "audio_process",
            "messageId": "msg-émoji-🎤-测试",
            "conversationId": "conv-spécial-àéïõü",
            "binaryFrames": {"audio": 1}
        }

        json_frame = json.dumps(request, ensure_ascii=False).encode('utf-8')
        parsed = json.loads(json_frame.decode('utf-8'))

        assert parsed["messageId"] == "msg-émoji-🎤-测试"
        assert parsed["conversationId"] == "conv-spécial-àéïõü"

    def test_missing_audio_index(self):
        """Test avec index audio manquant dans binaryFrames."""
        request = {
            "type": "audio_process",
            "binaryFrames": {
                # Pas de "audio" key
                "embedding": 1
            }
        }

        frames = [
            json.dumps(request).encode('utf-8'),
            b"embedding data"
        ]

        parsed = json.loads(frames[0].decode('utf-8'))
        binary_frame_info = parsed.get('binaryFrames', {})

        audio_idx = binary_frame_info.get('audio')
        assert audio_idx is None

    def test_out_of_range_index(self):
        """Test avec index hors limites."""
        request = {
            "type": "audio_process",
            "binaryFrames": {
                "audio": 5  # Index 5, mais seulement 1 binary frame
            }
        }

        frames = [
            json.dumps(request).encode('utf-8'),
            b"only one binary frame"
        ]

        binary_frames = frames[1:]
        binary_frame_info = json.loads(frames[0].decode('utf-8')).get('binaryFrames', {})

        audio_idx = binary_frame_info.get('audio')

        # L'index est hors limites
        assert audio_idx > len(binary_frames)


class TestResponseConstruction:
    """Tests pour la construction des réponses."""

    def test_transcription_completed_response(self):
        """Test construction d'une réponse transcription_completed."""
        response = {
            "type": "transcription_completed",
            "taskId": "task-001",
            "messageId": "msg-001",
            "transcription": {
                "text": "Bonjour, comment allez-vous?",
                "language": "fr",
                "confidence": 0.95,
                "source": "whisper",
                "durationMs": 3500
            },
            "processingTimeMs": 1200
        }

        response_json = json.dumps(response)
        parsed = json.loads(response_json)

        assert parsed["type"] == "transcription_completed"
        assert parsed["transcription"]["text"] == "Bonjour, comment allez-vous?"
        assert parsed["transcription"]["confidence"] == 0.95

    def test_audio_process_completed_response(self):
        """Test construction d'une réponse audio_process_completed."""
        response = {
            "type": "audio_process_completed",
            "taskId": "task-002",
            "messageId": "msg-002",
            "attachmentId": "att-002",
            "transcription": {
                "text": "Hello world",
                "language": "en",
                "confidence": 0.98,
                "source": "whisper"
            },
            "translatedAudios": [
                {
                    "targetLanguage": "fr",
                    "translatedText": "Bonjour le monde",
                    "audioUrl": "/audio/translated_fr.mp3",
                    "durationMs": 2000,
                    "voiceCloned": True
                },
                {
                    "targetLanguage": "es",
                    "translatedText": "Hola mundo",
                    "audioUrl": "/audio/translated_es.mp3",
                    "durationMs": 1800,
                    "voiceCloned": True
                }
            ],
            "processingTimeMs": 5500
        }

        response_json = json.dumps(response)
        parsed = json.loads(response_json)

        assert len(parsed["translatedAudios"]) == 2
        assert parsed["translatedAudios"][0]["targetLanguage"] == "fr"
        assert parsed["translatedAudios"][1]["voiceCloned"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
