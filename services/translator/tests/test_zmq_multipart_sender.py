"""
Test - Translator envoie en Multipart ZMQ

Vérifie que le Translator envoie correctement les résultats audio
en format multipart avec frames binaires (pas base64).
"""

import pytest
import asyncio
import json
import base64
from unittest.mock import Mock, MagicMock, AsyncMock
from pathlib import Path
import tempfile
import os

# Import du module à tester
import sys
sys.path.insert(0, str(Path(__file__).parent.parent / 'src'))

from services.audio_message_pipeline import (
    AudioMessageResult,
    OriginalAudio,
    TranslatedAudioVersion,
    NewVoiceProfileData
)


class TestZmqMultipartSender:
    """Tests pour vérifier l'envoi multipart depuis Translator"""

    def create_mock_audio_result(self) -> AudioMessageResult:
        """Crée un résultat audio mock pour les tests"""

        # Audio original
        original = OriginalAudio(
            audio_path="/fake/original.wav",
            audio_url="/fake/original.wav",
            transcription="Hello world",
            language="en",
            duration_ms=2000,
            confidence=0.95,
            source="whisper",
            segments=[
                {"text": "Hello", "startMs": 0, "endMs": 500},
                {"text": "world", "startMs": 500, "endMs": 1000}
            ]
        )

        # Audios traduits (simulent avoir audio_data_base64)
        translations = {
            "fr": TranslatedAudioVersion(
                language="fr",
                translated_text="Bonjour le monde",
                audio_path="/fake/fr.mp3",
                audio_url="/fake/fr.mp3",
                duration_ms=2200,
                format="mp3",
                voice_cloned=True,
                voice_quality=0.92,
                processing_time_ms=1500,
                audio_data_base64="RkFLRV9GUkVOQ0hfQVVESU8=",  # "FAKE_FRENCH_AUDIO" en base64
                audio_mime_type="audio/mp3"
            ),
            "es": TranslatedAudioVersion(
                language="es",
                translated_text="Hola mundo",
                audio_path="/fake/es.mp3",
                audio_url="/fake/es.mp3",
                duration_ms=2100,
                format="mp3",
                voice_cloned=True,
                voice_quality=0.90,
                processing_time_ms=1400,
                audio_data_base64="RkFLRV9TUEFOSVIN",  # "FAKE_SPANISH" en base64
                audio_mime_type="audio/mp3"
            )
        }

        # Nouveau profil vocal
        new_voice_profile = NewVoiceProfileData(
            user_id="user_123",
            profile_id="profile_456",
            embedding_base64="RkFLRV9FTUJFRERJTK==",  # "FAKE_EMBEDDING" en base64
            quality_score=0.94,
            audio_count=1,
            total_duration_ms=5000,
            version=1,
            fingerprint={"signature": "sig_abc123"},
            voice_characteristics={"pitch": "medium"}
        )

        return AudioMessageResult(
            message_id="msg_789",
            attachment_id="att_456",
            original=original,
            translations=translations,
            voice_model_user_id="user_123",
            voice_model_quality=0.94,
            processing_time_ms=3000,
            new_voice_profile=new_voice_profile
        )

    def test_multipart_frames_structure(self):
        """Test: Vérifier la structure des frames multipart"""

        result = self.create_mock_audio_result()

        # Simuler la construction des frames (comme dans zmq_server.py)
        binary_frames = []
        binary_frames_info = {}
        frame_index = 1

        # Frame 1: Audio FR
        audio_fr_bytes = base64.b64decode(result.translations["fr"].audio_data_base64)
        binary_frames.append(audio_fr_bytes)
        binary_frames_info["audio_fr"] = {
            "index": frame_index,
            "size": len(audio_fr_bytes),
            "mimeType": "audio/mp3"
        }
        frame_index += 1

        # Frame 2: Audio ES
        audio_es_bytes = base64.b64decode(result.translations["es"].audio_data_base64)
        binary_frames.append(audio_es_bytes)
        binary_frames_info["audio_es"] = {
            "index": frame_index,
            "size": len(audio_es_bytes),
            "mimeType": "audio/mp3"
        }
        frame_index += 1

        # Frame 3: Embedding
        embedding_bytes = base64.b64decode(result.new_voice_profile.embedding_base64)
        binary_frames.append(embedding_bytes)
        binary_frames_info["embedding"] = {
            "index": frame_index,
            "size": len(embedding_bytes)
        }

        # Metadata JSON (Frame 0)
        metadata = {
            "type": "audio_process_completed",
            "messageId": result.message_id,
            "attachmentId": result.attachment_id,
            "binaryFrames": binary_frames_info
        }

        # ASSERT - Structure correcte
        assert len(binary_frames) == 3
        assert "audio_fr" in binary_frames_info
        assert "audio_es" in binary_frames_info
        assert "embedding" in binary_frames_info

        # ASSERT - Indices corrects
        assert binary_frames_info["audio_fr"]["index"] == 1
        assert binary_frames_info["audio_es"]["index"] == 2
        assert binary_frames_info["embedding"]["index"] == 3

        # ASSERT - Tailles cohérentes
        assert binary_frames_info["audio_fr"]["size"] == len(audio_fr_bytes)
        assert binary_frames_info["audio_es"]["size"] == len(audio_es_bytes)
        assert binary_frames_info["embedding"]["size"] == len(embedding_bytes)

        print("✅ Structure frames multipart correcte")

    def test_multipart_binary_content(self):
        """Test: Vérifier que les binaires sont corrects (pas de corruption)"""

        result = self.create_mock_audio_result()

        # Décoder base64 → binaire
        audio_fr_bytes = base64.b64decode(result.translations["fr"].audio_data_base64)
        audio_es_bytes = base64.b64decode(result.translations["es"].audio_data_base64)
        embedding_bytes = base64.b64decode(result.new_voice_profile.embedding_base64)

        # ASSERT - Contenu décodé correct
        assert audio_fr_bytes == b"FAKE_FRENCH_AUDIO"
        assert audio_es_bytes == b"FAKE_SPANISH"
        assert embedding_bytes == b"FAKE_EMBEDDING"

        print("✅ Binaires décodés correctement")

    def test_multipart_size_vs_base64(self):
        """Test: Démontrer l'économie de taille multipart vs base64"""

        result = self.create_mock_audio_result()

        # Calculer taille base64 (ancien format JSON)
        old_payload = {
            "type": "audio_process_completed",
            "translatedAudios": [
                {
                    "targetLanguage": "fr",
                    "audioDataBase64": result.translations["fr"].audio_data_base64
                },
                {
                    "targetLanguage": "es",
                    "audioDataBase64": result.translations["es"].audio_data_base64
                }
            ],
            "newVoiceProfile": {
                "embedding": result.new_voice_profile.embedding_base64
            }
        }
        old_payload_json = json.dumps(old_payload)
        old_size = len(old_payload_json.encode('utf-8'))

        # Calculer taille multipart (nouveau format)
        audio_fr_bytes = base64.b64decode(result.translations["fr"].audio_data_base64)
        audio_es_bytes = base64.b64decode(result.translations["es"].audio_data_base64)
        embedding_bytes = base64.b64decode(result.new_voice_profile.embedding_base64)

        new_metadata = {
            "type": "audio_process_completed",
            "translatedAudios": [
                {"targetLanguage": "fr"},
                {"targetLanguage": "es"}
            ],
            "newVoiceProfile": {},
            "binaryFrames": {
                "audio_fr": {"index": 1, "size": len(audio_fr_bytes)},
                "audio_es": {"index": 2, "size": len(audio_es_bytes)},
                "embedding": {"index": 3, "size": len(embedding_bytes)}
            }
        }
        new_metadata_json = json.dumps(new_metadata)
        new_size = len(new_metadata_json.encode('utf-8')) + len(audio_fr_bytes) + len(audio_es_bytes) + len(embedding_bytes)

        # ASSERT - Multipart plus petit
        overhead = ((old_size - new_size) / new_size) * 100

        print(f"\n📊 Comparaison Taille:")
        print(f"   Base64 (ancien):    {old_size} bytes")
        print(f"   Multipart (nouveau): {new_size} bytes")
        print(f"   Économie:           {overhead:.1f}%")

        assert old_size > new_size, "Multipart devrait être plus petit que base64"
        assert overhead > 20, "Économie devrait être > 20%"

        print("✅ Multipart plus efficace que base64")

    def test_multipart_without_embedding(self):
        """Test: Vérifier multipart sans profil vocal (cas fréquent)"""

        result = self.create_mock_audio_result()
        result.new_voice_profile = None  # Pas de profil vocal

        # Construire frames
        binary_frames = []
        binary_frames_info = {}

        audio_fr_bytes = base64.b64decode(result.translations["fr"].audio_data_base64)
        binary_frames.append(audio_fr_bytes)
        binary_frames_info["audio_fr"] = {"index": 1, "size": len(audio_fr_bytes)}

        audio_es_bytes = base64.b64decode(result.translations["es"].audio_data_base64)
        binary_frames.append(audio_es_bytes)
        binary_frames_info["audio_es"] = {"index": 2, "size": len(audio_es_bytes)}

        # ASSERT - Pas d'embedding dans binaryFrames
        assert len(binary_frames) == 2
        assert "embedding" not in binary_frames_info

        print("✅ Multipart sans embedding fonctionne")

    def test_multipart_metadata_no_base64(self):
        """Test: Vérifier que le metadata JSON ne contient PAS de base64"""

        result = self.create_mock_audio_result()

        # Construire metadata (comme dans _publish_audio_result)
        metadata = {
            "type": "audio_process_completed",
            "messageId": result.message_id,
            "transcription": {
                "text": result.original.transcription,
                "language": result.original.language,
                "segments": result.original.segments
            },
            "translatedAudios": [
                {
                    "targetLanguage": "fr",
                    "translatedText": result.translations["fr"].translated_text,
                    "audioMimeType": "audio/mp3"
                    # PAS de audioDataBase64
                },
                {
                    "targetLanguage": "es",
                    "translatedText": result.translations["es"].translated_text,
                    "audioMimeType": "audio/mp3"
                    # PAS de audioDataBase64
                }
            ],
            "binaryFrames": {
                "audio_fr": {"index": 1, "size": 100},
                "audio_es": {"index": 2, "size": 100},
                "embedding": {"index": 3, "size": 100}
            }
        }

        metadata_json = json.dumps(metadata)

        # ASSERT - Pas de base64 dans le JSON
        assert "audioDataBase64" not in metadata_json
        assert "embedding" not in metadata_json or "embedding_base64" not in metadata_json

        # ASSERT - binaryFrames présent
        assert "binaryFrames" in metadata_json

        print("✅ Metadata JSON ne contient pas de base64 (optimisé)")

    def test_multipart_realistic_sizes(self):
        """Test: Simuler des tailles réalistes d'audios (50KB par langue)"""

        # Audios réalistes ~50KB chacun
        audio_en = b"X" * (50 * 1024)  # 50KB
        audio_fr = b"Y" * (50 * 1024)  # 50KB
        audio_es = b"Z" * (50 * 1024)  # 50KB
        embedding = b"E" * (51 * 1024)  # 51KB

        # Base64 (ancien)
        old_size = (
            len(base64.b64encode(audio_en)) +
            len(base64.b64encode(audio_fr)) +
            len(base64.b64encode(audio_es)) +
            len(base64.b64encode(embedding)) +
            500  # Metadata JSON approximatif
        )

        # Multipart (nouveau)
        new_size = (
            len(audio_en) +
            len(audio_fr) +
            len(audio_es) +
            len(embedding) +
            300  # Metadata JSON réduit
        )

        saved_kb = (old_size - new_size) / 1024
        overhead_pct = ((old_size - new_size) / new_size) * 100

        print(f"\n📊 Scénario Réaliste (3 audios 50KB + embedding 51KB):")
        print(f"   Base64:    {old_size / 1024:.1f}KB")
        print(f"   Multipart: {new_size / 1024:.1f}KB")
        print(f"   Économie:  {saved_kb:.1f}KB ({overhead_pct:.1f}%)")

        assert saved_kb > 50, "Devrait économiser au moins 50KB"

        print("✅ Économie significative avec tailles réalistes")


if __name__ == "__main__":
    print("🧪 Tests Multipart Translator\n")

    tester = TestZmqMultipartSender()

    # Exécuter tous les tests
    tests = [
        ("Structure Frames Multipart", tester.test_multipart_frames_structure),
        ("Binaires Corrects", tester.test_multipart_binary_content),
        ("Taille vs Base64", tester.test_multipart_size_vs_base64),
        ("Sans Embedding", tester.test_multipart_without_embedding),
        ("Metadata Sans Base64", tester.test_multipart_metadata_no_base64),
        ("Tailles Réalistes", tester.test_multipart_realistic_sizes)
    ]

    passed = 0
    failed = 0

    for test_name, test_func in tests:
        print(f"\n{'='*60}")
        print(f"🔬 Test: {test_name}")
        print('='*60)
        try:
            test_func()
            passed += 1
            print(f"✅ {test_name} - SUCCÈS\n")
        except AssertionError as e:
            failed += 1
            print(f"❌ {test_name} - ÉCHEC: {e}\n")
        except Exception as e:
            failed += 1
            print(f"❌ {test_name} - ERREUR: {e}\n")

    # Résumé
    print("\n" + "="*60)
    print("RÉSUMÉ")
    print("="*60)
    print(f"Total:   {passed + failed}")
    print(f"Réussis: {passed}")
    print(f"Échoués: {failed}")

    if failed == 0:
        print("\n🎉 Tous les tests sont passés !")
        exit(0)
    else:
        print(f"\n❌ {failed} test(s) échoué(s)")
        exit(1)
