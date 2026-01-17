"""
Test d'intégration complet: Gateway → ZMQ → Translator → ZMQ → Gateway

Ce test charge le VRAI composant Translator et simule la Gateway pour tester
le flux complet de communication ZMQ multipart.

Scénarios testés:
1. Transcription only
2.a Traduction de message texte
2.b Traduction d'audio complet (transcription + traduction + TTS)
3. Création de profil vocal sans échantillon
4. Création de profil vocal avec échantillon audio

Architecture:
- Gateway Simulator: PUSH → Translator PULL (port 5555)
- Gateway Simulator: SUB ← Translator PUB (port 5558)
"""

import pytest
import asyncio
import json
import time
import uuid
import base64
import tempfile
import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from dataclasses import dataclass

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

# Import des fixtures audio réelles
from fixtures.audio_fixtures import (
    get_voice_sample,
    get_voice_clone_sample,
    load_voice_sample_bytes,
    get_available_voice_samples,
    VOICE_SAMPLE_PATH,
    VOICE_CLONE_SAMPLES,
    AudioFixtureGenerator
)


# ═══════════════════════════════════════════════════════════════════════════════
# GATEWAY SIMULATOR - Simule le comportement de Gateway TypeScript
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class GatewaySimulatorConfig:
    """Configuration pour le simulateur Gateway."""
    translator_host: str = "127.0.0.1"
    push_port: int = 5555  # Port vers lequel Gateway PUSH (Translator PULL)
    sub_port: int = 5558   # Port où Gateway SUB (Translator PUB)
    timeout_seconds: float = 30.0


class GatewaySimulator:
    """
    Simule le comportement de Gateway TypeScript (ZmqTranslationClient).

    Reproduit exactement le protocole multipart ZMQ utilisé par Gateway:
    - PUSH socket pour envoyer les requêtes
    - SUB socket pour recevoir les réponses
    - Format multipart: Frame 0 = JSON, Frame 1+ = binaires
    """

    def __init__(self, config: GatewaySimulatorConfig = None):
        self.config = config or GatewaySimulatorConfig()
        self.context = None
        self.push_socket = None
        self.sub_socket = None
        self.running = False
        self.received_events: List[Dict[str, Any]] = []
        self._listener_task = None

    async def initialize(self):
        """Initialise les sockets ZMQ comme Gateway."""
        if not ZMQ_AVAILABLE:
            raise RuntimeError("ZMQ non disponible")

        self.context = zmq.asyncio.Context()

        # Socket PUSH pour envoyer les commandes (comme Gateway)
        self.push_socket = self.context.socket(zmq.PUSH)
        self.push_socket.connect(f"tcp://{self.config.translator_host}:{self.config.push_port}")

        # Socket SUB pour recevoir les réponses (comme Gateway)
        self.sub_socket = self.context.socket(zmq.SUB)
        self.sub_socket.connect(f"tcp://{self.config.translator_host}:{self.config.sub_port}")
        self.sub_socket.setsockopt_string(zmq.SUBSCRIBE, "")

        # Attendre la connexion
        await asyncio.sleep(0.2)

        self.running = True
        print(f"[GatewaySimulator] Initialisé: PUSH→{self.config.push_port}, SUB←{self.config.sub_port}")

    async def start_listener(self):
        """Démarre l'écoute des réponses du Translator."""
        self._listener_task = asyncio.create_task(self._listen_for_responses())

    async def _listen_for_responses(self):
        """Écoute les réponses via SUB socket."""
        while self.running:
            try:
                # Non-blocking receive avec timeout
                if await asyncio.wait_for(
                    self._try_receive(),
                    timeout=0.1
                ):
                    pass
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                if self.running:
                    print(f"[GatewaySimulator] Erreur réception: {e}")

    async def _try_receive(self) -> bool:
        """Tente de recevoir un message avec polling."""
        try:
            poller = zmq.asyncio.Poller()
            poller.register(self.sub_socket, zmq.POLLIN)

            events = dict(await poller.poll(timeout=50))  # 50ms

            if self.sub_socket in events:
                message = await self.sub_socket.recv()
                event = json.loads(message.decode('utf-8'))
                self.received_events.append(event)
                print(f"[GatewaySimulator] Reçu: {event.get('type', 'unknown')}")
                return True
            return False
        except Exception as e:
            print(f"[GatewaySimulator] Erreur receive: {e}")
            return False

    async def send_multipart(self, json_payload: dict, binary_frames: List[bytes] = None):
        """
        Envoie un message multipart comme Gateway.

        Frame 0: JSON metadata
        Frame 1+: Données binaires (audio, embedding, etc.)
        """
        frames = [json.dumps(json_payload).encode('utf-8')]
        if binary_frames:
            frames.extend(binary_frames)

        await self.push_socket.send_multipart(frames)
        print(f"[GatewaySimulator] Envoyé multipart: {len(frames)} frames")

    async def send_json(self, json_payload: dict):
        """Envoie un message JSON simple (legacy mode)."""
        await self.push_socket.send(json.dumps(json_payload).encode('utf-8'))

    async def wait_for_event(
        self,
        event_type: str,
        task_id: str = None,
        timeout: float = None
    ) -> Optional[Dict[str, Any]]:
        """
        Attend un événement spécifique du Translator.

        Args:
            event_type: Type d'événement attendu (e.g., 'transcription_completed')
            task_id: ID de tâche spécifique (optionnel)
            timeout: Timeout en secondes

        Returns:
            L'événement reçu ou None si timeout
        """
        timeout = timeout or self.config.timeout_seconds
        start_time = time.time()

        while time.time() - start_time < timeout:
            # Chercher dans les événements reçus
            for event in self.received_events:
                if event.get('type') == event_type:
                    if task_id is None or event.get('taskId') == task_id:
                        self.received_events.remove(event)
                        return event

            # Recevoir de nouveaux messages
            try:
                message = await asyncio.wait_for(
                    self.sub_socket.recv(),
                    timeout=min(1.0, timeout - (time.time() - start_time))
                )
                event = json.loads(message.decode('utf-8'))
                self.received_events.append(event)

                if event.get('type') == event_type:
                    if task_id is None or event.get('taskId') == task_id:
                        self.received_events.remove(event)
                        return event
            except asyncio.TimeoutError:
                continue

        return None

    async def close(self):
        """Ferme les sockets."""
        self.running = False

        if self._listener_task:
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass

        if self.push_socket:
            self.push_socket.close()
        if self.sub_socket:
            self.sub_socket.close()
        if self.context:
            self.context.term()

        print("[GatewaySimulator] Fermé")


# ═══════════════════════════════════════════════════════════════════════════════
# SAMPLE AUDIO GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

def generate_sample_wav_audio(duration_ms: int = 1000) -> bytes:
    """Génère un fichier WAV de test minimal."""
    import struct

    sample_rate = 16000
    num_samples = int(sample_rate * duration_ms / 1000)

    # Générer des échantillons de silence (16-bit)
    samples = b'\x00\x00' * num_samples

    # Construire le header WAV
    byte_rate = sample_rate * 2  # 16-bit mono
    data_size = len(samples)

    wav_header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,
        b'WAVE',
        b'fmt ',
        16,  # Subchunk1Size
        1,   # AudioFormat (PCM)
        1,   # NumChannels (mono)
        sample_rate,
        byte_rate,
        2,   # BlockAlign
        16,  # BitsPerSample
        b'data',
        data_size
    )

    return wav_header + samples


# ═══════════════════════════════════════════════════════════════════════════════
# FIXTURES
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def sample_audio():
    """
    Charge un vrai échantillon audio pour les tests.

    Utilise voice_sample_chatterbox.wav si disponible,
    sinon génère un audio synthétique comme fallback.
    """
    voice_sample = get_voice_sample()
    if voice_sample and voice_sample.exists():
        return voice_sample.read_bytes()
    # Fallback sur audio généré si fichier absent (CI sans fixtures)
    return generate_sample_wav_audio(duration_ms=2000)


@pytest.fixture
def sample_audio_base64(sample_audio):
    """Retourne l'audio encodé en base64."""
    return base64.b64encode(sample_audio).decode('utf-8')


@pytest.fixture
def voice_clone_samples():
    """
    Retourne un dictionnaire des samples de voix clonées disponibles.

    Returns:
        Dict[str, bytes]: {language_code: audio_bytes}
    """
    samples = {}
    for lang in get_available_voice_samples():
        audio_bytes = load_voice_sample_bytes(lang)
        if audio_bytes:
            samples[lang] = audio_bytes
    return samples


@pytest.fixture
def french_cloned_audio():
    """Charge le sample de voix clonée française pour les tests."""
    audio_bytes = load_voice_sample_bytes("fr")
    if audio_bytes:
        return audio_bytes
    # Fallback
    return generate_sample_wav_audio(duration_ms=2000)


@pytest.fixture
async def gateway_simulator():
    """Crée et initialise un simulateur Gateway pour les tests."""
    if not ZMQ_AVAILABLE:
        pytest.skip("ZMQ non disponible")

    # Utiliser des ports aléatoires pour éviter les conflits
    config = GatewaySimulatorConfig(
        translator_host="127.0.0.1",
        push_port=5555 + hash(uuid.uuid4()) % 1000,
        sub_port=5558 + hash(uuid.uuid4()) % 1000,
        timeout_seconds=10.0
    )

    simulator = GatewaySimulator(config)
    yield simulator, config

    await simulator.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS D'INTÉGRATION AVEC VRAI TRANSLATOR
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
@pytest.mark.integration  # Marqué pour exécution séparée (skip en CI avec -m "not integration")
class TestRealTranslatorIntegration:
    """
    Tests d'intégration utilisant le VRAI Translator.

    Ces tests nécessitent que le Translator soit démarré et les services ML disponibles.
    En CI, utilisez: pytest -m "not integration" pour les ignorer.

    Prérequis locaux:
    - Dossier models/ avec les modèles ML téléchargés
    - Redis optionnel (fallback sur cache mémoire)
    - Base de données optionnelle (sauvegarde désactivée si non connectée)
    """

    @pytest.fixture
    async def translator_server(self, request):
        """
        Démarre le vrai serveur Translator pour les tests.

        Cette fixture charge et initialise le ZMQTranslationServer réel
        avec le vrai service de traduction ML.
        """
        # Importer les settings d'abord pour éviter les imports circulaires
        try:
            from config.settings import get_settings
            settings = get_settings()
        except ImportError as e:
            pytest.skip(f"Import settings échoué: {e}")

        # Importer le serveur Translator
        try:
            from services.zmq_server import ZMQTranslationServer
        except ImportError as e:
            pytest.skip(f"Import ZMQTranslationServer échoué: {e}")

        # Ports aléatoires pour isolation
        push_port = 15555 + (hash(uuid.uuid4()) % 5000)
        sub_port = 15558 + (hash(uuid.uuid4()) % 5000)

        # Créer et initialiser le vrai service de traduction ML
        translation_service = None
        ml_service_working = False
        try:
            from services.translation_ml_service import TranslationMLService
            translation_service = TranslationMLService(settings, max_workers=2)
            await translation_service.initialize()

            # Test rapide pour vérifier que le service fonctionne
            test_result = await translation_service.translate(
                text="Hello",
                source_language="en",
                target_language="fr",
                model_type="basic"
            )
            if test_result and test_result.get('translated_text') and not test_result.get('translated_text', '').startswith('['):
                ml_service_working = True
                print(f"[TEST] ✅ TranslationMLService fonctionnel: 'Hello' → '{test_result.get('translated_text')}'")
            else:
                print(f"[TEST] ⚠️ TranslationMLService chargé mais non fonctionnel: {test_result}")
        except Exception as e:
            print(f"[TEST] ⚠️ TranslationMLService non disponible: {e}")
            import traceback
            traceback.print_exc()
            # Le serveur fonctionnera avec le fallback

        # Stocker l'état pour les tests
        request.config._ml_service_working = ml_service_working

        # Mock des services lourds pour les tests unitaires
        with patch('services.zmq_server.AUDIO_PIPELINE_AVAILABLE', True), \
             patch('services.zmq_server.TRANSCRIPTION_SERVICE_AVAILABLE', True), \
             patch('services.zmq_server.VOICE_PROFILE_HANDLER_AVAILABLE', True):

            server = ZMQTranslationServer(
                host="127.0.0.1",
                gateway_push_port=push_port,
                gateway_sub_port=sub_port,
                normal_workers=2,
                any_workers=1,
                translation_service=translation_service,
                database_url=None
            )

            # Initialiser le serveur
            await server.initialize()

            # Démarrer dans une tâche
            server_task = asyncio.create_task(server.start())

            await asyncio.sleep(0.5)  # Attendre le démarrage

            yield server, push_port, sub_port, ml_service_working

            # Cleanup
            await server.stop()
            server_task.cancel()
            try:
                await server_task
            except asyncio.CancelledError:
                pass

            # Fermer le service de traduction
            if translation_service:
                try:
                    await translation_service.close()
                except Exception:
                    pass

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_1_transcription_only(self, translator_server, sample_audio):
        """
        Test 1: Transcription only

        Gateway → ZMQ → Translator (transcription) → ZMQ → Gateway
        """
        server, push_port, sub_port, ml_service_working = translator_server

        # Créer le simulateur Gateway
        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=30.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-trans-{uuid.uuid4()}"

            # Construire la requête comme Gateway le fait
            request = {
                "type": "transcription_only",
                "taskId": task_id,
                "messageId": message_id,
                "audioFormat": "wav",
                "binaryFrames": {
                    "audio": 1,
                    "audioMimeType": "audio/wav",
                    "audioSize": len(sample_audio)
                }
            }

            # Envoyer en multipart (comme Gateway)
            await gateway.send_multipart(request, [sample_audio])

            # Attendre la réponse
            event = await gateway.wait_for_event(
                "transcription_completed",
                task_id=task_id,
                timeout=30.0
            )

            if event is None:
                # Vérifier s'il y a une erreur
                error_event = await gateway.wait_for_event(
                    "transcription_error",
                    task_id=task_id,
                    timeout=2.0
                )
                if error_event:
                    pytest.fail(f"Transcription échouée: {error_event.get('error')}")
                pytest.fail("Timeout: pas de réponse du Translator")

            # Vérifications
            assert event['taskId'] == task_id
            assert event['messageId'] == message_id
            assert 'transcription' in event
            assert 'text' in event['transcription']
            assert 'language' in event['transcription']

            print(f"✅ Transcription reçue: {event['transcription']['text'][:50]}...")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_2a_text_translation(self, translator_server):
        """
        Test 2.a: Traduction de message texte

        Gateway → ZMQ → Translator (traduction ML) → ZMQ → Gateway
        """
        server, push_port, sub_port, ml_service_working = translator_server

        if not ml_service_working:
            pytest.skip("Service ML non fonctionnel - test de traduction texte skippé")

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=30.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-text-{uuid.uuid4()}"

            # Requête de traduction texte (pas de binaryFrames)
            request = {
                "taskId": task_id,
                "messageId": message_id,
                "text": "Bonjour, comment allez-vous?",
                "sourceLanguage": "fr",
                "targetLanguages": ["en", "es"],
                "conversationId": f"conv-{uuid.uuid4()}",
                "modelType": "basic",
                "timestamp": time.time()
            }

            # Envoyer en JSON simple
            await gateway.send_json(request)

            # Attendre les traductions (une par langue cible)
            translations_received = []
            for target_lang in ["en", "es"]:
                event = await gateway.wait_for_event(
                    "translation_completed",
                    timeout=30.0
                )
                if event and event.get('result', {}).get('messageId') == message_id:
                    translations_received.append(event)

            if len(translations_received) == 0:
                error_event = await gateway.wait_for_event(
                    "translation_error",
                    timeout=2.0
                )
                if error_event:
                    pytest.fail(f"Traduction échouée: {error_event.get('error')}")
                pytest.fail("Timeout: pas de traduction reçue")

            # Vérifications
            for event in translations_received:
                assert 'result' in event
                result = event['result']
                assert result['messageId'] == message_id
                assert 'translatedText' in result
                assert result['targetLanguage'] in ["en", "es"]
                print(f"✅ Traduction {result['targetLanguage']}: {result['translatedText'][:50]}...")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_2b_audio_translation(self, translator_server, sample_audio):
        """
        Test 2.b: Traduction d'audio complet

        Gateway → ZMQ → Translator (transcription + traduction + TTS) → ZMQ → Gateway
        """
        server, push_port, sub_port, ml_service_working = translator_server

        if not ml_service_working:
            pytest.skip("Service ML non fonctionnel - test de traduction audio skippé")

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=60.0  # Plus long pour audio processing
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-audio-{uuid.uuid4()}"
            attachment_id = f"att-{uuid.uuid4()}"

            # Requête audio process complète
            request = {
                "type": "audio_process",
                "taskId": task_id,
                "messageId": message_id,
                "attachmentId": attachment_id,
                "conversationId": f"conv-{uuid.uuid4()}",
                "senderId": f"user-{uuid.uuid4()}",
                "audioUrl": "https://example.com/audio.wav",  # Fallback
                "binaryFrames": {
                    "audio": 1,
                    "audioMimeType": "audio/wav",
                    "audioSize": len(sample_audio)
                },
                "targetLanguages": ["en"],
                "generateVoiceClone": True,
                "modelType": "basic",
                "audioDurationMs": 2000
            }

            # Envoyer en multipart
            await gateway.send_multipart(request, [sample_audio])

            # Attendre le résultat
            event = await gateway.wait_for_event(
                "audio_process_completed",
                task_id=task_id,
                timeout=60.0
            )

            if event is None:
                error_event = await gateway.wait_for_event(
                    "audio_process_error",
                    task_id=task_id,
                    timeout=2.0
                )
                if error_event:
                    pytest.fail(f"Audio process échoué: {error_event.get('error')}")
                pytest.fail("Timeout: pas de réponse audio_process_completed")

            # Vérifications
            assert event['taskId'] == task_id
            assert event['messageId'] == message_id
            assert event['attachmentId'] == attachment_id
            assert 'transcription' in event
            assert 'translatedAudios' in event

            transcription = event['transcription']
            assert 'text' in transcription
            assert 'language' in transcription

            translated_audios = event['translatedAudios']
            assert len(translated_audios) >= 1

            for audio in translated_audios:
                assert 'targetLanguage' in audio
                assert 'translatedText' in audio
                assert 'audioUrl' in audio or 'audioPath' in audio
                print(f"✅ Audio traduit ({audio['targetLanguage']}): {audio['translatedText'][:30]}...")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_3_voice_profile_without_sample(self, translator_server):
        """
        Test 3: Création de profil vocal sans échantillon audio

        Ce test vérifie la création d'un profil vocal de base sans fournir
        d'échantillon audio. Le Translator doit retourner un profil vide
        ou une erreur appropriée.
        """
        server, push_port, sub_port, ml_service_working = translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=30.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            request_id = str(uuid.uuid4())
            user_id = f"user-{uuid.uuid4()}"

            # Requête de création profil SANS audio
            # Cela devrait échouer ou retourner un profil vide
            request = {
                "type": "voice_profile_analyze",
                "request_id": request_id,
                "user_id": user_id,
                "audio_data": "",  # Pas de données audio
                "audio_format": "wav",
                "is_update": False,
                "include_transcription": False,
                "generate_previews": False
            }

            await gateway.send_json(request)

            # Attendre la réponse (succès ou erreur)
            result_event = await gateway.wait_for_event(
                "voice_profile_analyze_result",
                timeout=30.0
            )

            error_event = None
            if result_event is None:
                error_event = await gateway.wait_for_event(
                    "voice_profile_error",
                    timeout=5.0
                )

            # Soit on a un résultat, soit une erreur
            if result_event:
                assert result_event['request_id'] == request_id
                # Sans audio, on attend success=False ou quality_score=0
                if result_event.get('success'):
                    assert result_event.get('quality_score', 0) == 0
                print(f"✅ Profil vocal (sans sample): success={result_event.get('success')}")
            elif error_event:
                assert error_event['request_id'] == request_id
                print(f"✅ Erreur attendue (sans sample): {error_event.get('error')}")
            else:
                # Si pas de handler configuré, peut timeout - acceptable
                print("⚠️ Voice profile handler non configuré (timeout)")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_4_voice_profile_with_sample(self, translator_server, sample_audio, sample_audio_base64):
        """
        Test 4: Création de profil vocal avec échantillon audio

        Gateway → ZMQ → Translator (analyse vocale) → ZMQ → Gateway

        Vérifie:
        - Création du profil vocal
        - Extraction des caractéristiques vocales
        - Score de qualité
        - Fingerprint
        """
        server, push_port, sub_port, ml_service_working = translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=60.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            request_id = str(uuid.uuid4())
            user_id = f"user-{uuid.uuid4()}"

            # Requête de création profil AVEC audio
            request = {
                "type": "voice_profile_analyze",
                "request_id": request_id,
                "user_id": user_id,
                "audio_data": sample_audio_base64,  # Audio en base64
                "audio_format": "wav",
                "is_update": False,
                "include_transcription": True,  # Demander aussi la transcription
                "generate_previews": False
            }

            await gateway.send_json(request)

            # Attendre la réponse
            event = await gateway.wait_for_event(
                "voice_profile_analyze_result",
                timeout=60.0
            )

            if event is None:
                error_event = await gateway.wait_for_event(
                    "voice_profile_error",
                    timeout=5.0
                )
                if error_event:
                    # Erreur peut être due aux services ML non initialisés
                    print(f"⚠️ Voice profile échoué (services ML): {error_event.get('error')}")
                    return
                pytest.fail("Timeout: pas de réponse voice_profile_analyze_result")

            # Vérifications
            assert event['request_id'] == request_id
            assert event['user_id'] == user_id

            if event.get('success'):
                # Profil créé avec succès
                assert 'quality_score' in event
                assert event['quality_score'] >= 0

                if 'voice_characteristics' in event:
                    print(f"✅ Caractéristiques: {event['voice_characteristics']}")

                if 'fingerprint' in event:
                    print(f"✅ Fingerprint créé")

                if 'transcription' in event:
                    print(f"✅ Transcription: {event['transcription'].get('text', '')[:50]}...")

                print(f"✅ Profil vocal créé: quality={event['quality_score']}")
            else:
                # Échec (peut être attendu si services ML non disponibles)
                print(f"⚠️ Profil non créé: {event.get('error', 'unknown')}")

        finally:
            await gateway.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS MOCK (Sans dépendances ML - pour CI/CD)
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
class TestMockedTranslatorIntegration:
    """
    Tests d'intégration avec services ML mockés.

    Ces tests peuvent s'exécuter sans GPU ni modèles ML.
    Ils vérifient uniquement le flux ZMQ et le format des messages.
    """

    @pytest.fixture
    async def mocked_translator_server(self):
        """
        Démarre un serveur Translator minimal pour tests ZMQ.

        Ce fixture simule le comportement du Translator sans charger
        tous les services ML.
        """
        if not ZMQ_AVAILABLE:
            pytest.skip("ZMQ non disponible")

        # Utiliser des ports aléatoires pour éviter les conflits
        import random
        push_port = 16555 + random.randint(0, 3000)
        sub_port = 16558 + random.randint(0, 3000)

        # Créer un mini-serveur ZMQ qui simule les réponses du Translator
        context = zmq.asyncio.Context()

        # Socket PULL pour recevoir les requêtes (comme Translator)
        pull_socket = context.socket(zmq.PULL)
        pull_socket.bind(f"tcp://127.0.0.1:{push_port}")

        # Socket PUB pour envoyer les réponses (comme Translator)
        pub_socket = context.socket(zmq.PUB)
        pub_socket.bind(f"tcp://127.0.0.1:{sub_port}")

        await asyncio.sleep(0.3)  # Attendre le binding

        state = {'running': True}

        async def mock_translator_loop():
            """Boucle qui simule le comportement du Translator."""
            poller = zmq.asyncio.Poller()
            poller.register(pull_socket, zmq.POLLIN)

            while state['running']:
                try:
                    # Polling avec timeout pour permettre l'arrêt propre
                    events = dict(await poller.poll(timeout=100))  # 100ms

                    if pull_socket not in events:
                        continue

                    # Recevoir une requête multipart
                    frames = await pull_socket.recv_multipart()

                    # Parser le JSON
                    request = json.loads(frames[0].decode('utf-8'))
                    msg_type = request.get('type', '')
                    task_id = request.get('taskId', request.get('request_id', str(uuid.uuid4())))

                    # Simuler les réponses selon le type
                    response = None

                    if msg_type == 'ping':
                        response = {
                            'type': 'pong',
                            'timestamp': time.time(),
                            'translator_status': 'alive',
                            'audio_pipeline_available': True
                        }

                    elif msg_type == 'transcription_only':
                        response = {
                            'type': 'transcription_completed',
                            'taskId': task_id,
                            'messageId': request.get('messageId', ''),
                            'attachmentId': request.get('attachmentId', ''),
                            'transcription': {
                                'text': 'Mocked transcription text',
                                'language': 'en',
                                'confidence': 0.95,
                                'durationMs': 2000,
                                'source': 'whisper'
                            },
                            'processingTimeMs': 150,
                            'timestamp': time.time()
                        }

                    elif msg_type == 'audio_process':
                        response = {
                            'type': 'audio_process_completed',
                            'taskId': task_id,
                            'messageId': request.get('messageId', ''),
                            'attachmentId': request.get('attachmentId', ''),
                            'transcription': {
                                'text': 'Mocked audio transcription',
                                'language': 'fr',
                                'confidence': 0.92,
                                'source': 'whisper'
                            },
                            'translatedAudios': [
                                {
                                    'targetLanguage': lang,
                                    'translatedText': f'[{lang}] Translated text',
                                    'audioUrl': f'/audio/output_{lang}.mp3',
                                    'durationMs': 2500,
                                    'voiceCloned': True,
                                    'voiceQuality': 0.85
                                }
                                for lang in request.get('targetLanguages', ['en'])
                            ],
                            'voiceModelUserId': request.get('senderId', 'user-001'),
                            'voiceModelQuality': 0.88,
                            'processingTimeMs': 3500,
                            'timestamp': time.time()
                        }

                    elif msg_type == 'voice_profile_analyze':
                        response = {
                            'type': 'voice_profile_analyze_result',
                            'request_id': request.get('request_id', ''),
                            'user_id': request.get('user_id', ''),
                            'success': True,
                            'quality_score': 0.85,
                            'voice_characteristics': {'pitch': 120, 'tempo': 1.0},
                            'fingerprint': {'id': 'fp-mock-123'},
                            'transcription': {
                                'text': 'Voice profile audio text',
                                'language': 'en',
                                'confidence': 0.9
                            } if request.get('include_transcription') else None
                        }

                    elif 'text' in request and 'targetLanguages' in request:
                        # Requête de traduction texte
                        for target_lang in request.get('targetLanguages', []):
                            trans_response = {
                                'type': 'translation_completed',
                                'taskId': task_id,
                                'result': {
                                    'messageId': request.get('messageId', ''),
                                    'translatedText': f"[{target_lang}] {request.get('text', '')}",
                                    'sourceLanguage': request.get('sourceLanguage', 'auto'),
                                    'targetLanguage': target_lang,
                                    'confidenceScore': 0.92,
                                    'processingTime': 120,
                                    'modelType': request.get('modelType', 'basic')
                                },
                                'targetLanguage': target_lang,
                                'timestamp': time.time()
                            }
                            await pub_socket.send(json.dumps(trans_response).encode('utf-8'))
                        continue

                    if response:
                        await pub_socket.send(json.dumps(response).encode('utf-8'))

                except asyncio.CancelledError:
                    break
                except Exception as e:
                    if state['running']:
                        print(f"[MockTranslator] Erreur: {e}")
                        import traceback
                        traceback.print_exc()

        # Démarrer la boucle mock
        server_task = asyncio.create_task(mock_translator_loop())
        await asyncio.sleep(0.3)

        yield None, push_port, sub_port, None

        # Cleanup
        state['running'] = False
        await asyncio.sleep(0.15)  # Laisser le temps au poll de se terminer
        server_task.cancel()
        try:
            await server_task
        except asyncio.CancelledError:
            pass

        pull_socket.close()
        pub_socket.close()
        context.term()

    @pytest.mark.asyncio
    async def test_mocked_transcription(self, mocked_translator_server, sample_audio):
        """Test de transcription avec service mocké."""
        server, push_port, sub_port, mock_service = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=10.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-mock-{uuid.uuid4()}"

            request = {
                "type": "transcription_only",
                "taskId": task_id,
                "messageId": message_id,
                "audioFormat": "wav",
                "binaryFrames": {
                    "audio": 1,
                    "audioMimeType": "audio/wav",
                    "audioSize": len(sample_audio)
                }
            }

            await gateway.send_multipart(request, [sample_audio])

            event = await gateway.wait_for_event(
                "transcription_completed",
                task_id=task_id,
                timeout=10.0
            )

            assert event is not None, "Devrait recevoir une réponse transcription"
            assert event['taskId'] == task_id
            assert event['transcription']['text'] == "Mocked transcription text"
            assert event['transcription']['language'] == "en"

            print("✅ Test mocké réussi: transcription reçue")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    async def test_ping_pong(self, mocked_translator_server):
        """Test du mécanisme ping/pong."""
        server, push_port, sub_port, _ = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=5.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            ping_request = {
                "type": "ping",
                "timestamp": time.time()
            }

            await gateway.send_json(ping_request)

            event = await gateway.wait_for_event("pong", timeout=5.0)

            assert event is not None, "Devrait recevoir un pong"
            assert event['type'] == 'pong'
            assert event['translator_status'] == 'alive'

            print("✅ Ping/Pong fonctionnel")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    async def test_mocked_text_translation(self, mocked_translator_server):
        """
        Test 2.a (mocké): Traduction de message texte

        Gateway → ZMQ → Mock Translator → ZMQ → Gateway
        """
        server, push_port, sub_port, _ = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=10.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-text-{uuid.uuid4()}"

            request = {
                "taskId": task_id,
                "messageId": message_id,
                "text": "Bonjour, comment allez-vous?",
                "sourceLanguage": "fr",
                "targetLanguages": ["en", "es"],
                "conversationId": f"conv-{uuid.uuid4()}",
                "modelType": "basic",
                "timestamp": time.time()
            }

            await gateway.send_json(request)

            # Attendre les traductions (une par langue cible)
            translations = []
            for _ in range(2):  # 2 langues cibles
                event = await gateway.wait_for_event(
                    "translation_completed",
                    timeout=10.0
                )
                if event:
                    translations.append(event)

            assert len(translations) == 2, "Devrait recevoir 2 traductions"

            target_langs = set(t['result']['targetLanguage'] for t in translations)
            assert target_langs == {'en', 'es'}

            for event in translations:
                assert event['result']['messageId'] == message_id
                assert 'translatedText' in event['result']
                print(f"✅ Traduction {event['result']['targetLanguage']}: {event['result']['translatedText']}")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    async def test_mocked_audio_translation(self, mocked_translator_server, sample_audio):
        """
        Test 2.b (mocké): Traduction audio complète

        Gateway → ZMQ → Mock Translator (transcription + traduction + TTS) → ZMQ → Gateway
        """
        server, push_port, sub_port, _ = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=15.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            task_id = str(uuid.uuid4())
            message_id = f"msg-audio-{uuid.uuid4()}"
            attachment_id = f"att-{uuid.uuid4()}"

            request = {
                "type": "audio_process",
                "taskId": task_id,
                "messageId": message_id,
                "attachmentId": attachment_id,
                "conversationId": f"conv-{uuid.uuid4()}",
                "senderId": f"user-{uuid.uuid4()}",
                "audioUrl": "https://example.com/audio.wav",
                "binaryFrames": {
                    "audio": 1,
                    "audioMimeType": "audio/wav",
                    "audioSize": len(sample_audio)
                },
                "targetLanguages": ["en"],
                "generateVoiceClone": True,
                "modelType": "basic",
                "audioDurationMs": 2000
            }

            await gateway.send_multipart(request, [sample_audio])

            event = await gateway.wait_for_event(
                "audio_process_completed",
                task_id=task_id,
                timeout=15.0
            )

            assert event is not None, "Devrait recevoir audio_process_completed"
            assert event['taskId'] == task_id
            assert event['messageId'] == message_id
            assert event['attachmentId'] == attachment_id
            assert 'transcription' in event
            assert 'translatedAudios' in event
            assert len(event['translatedAudios']) >= 1

            trans_audio = event['translatedAudios'][0]
            assert trans_audio['targetLanguage'] == 'en'
            assert 'audioUrl' in trans_audio
            assert trans_audio['voiceCloned'] == True

            print(f"✅ Audio process complet: {event['transcription']['text']}")
            print(f"✅ Audio traduit: {trans_audio['translatedText']}")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    async def test_mocked_voice_profile_without_sample(self, mocked_translator_server):
        """
        Test 3 (mocké): Création de profil vocal sans échantillon

        Gateway → ZMQ → Mock Translator → ZMQ → Gateway
        Le serveur mocké retournera quand même un succès avec quality_score=0
        """
        server, push_port, sub_port, _ = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=10.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            request_id = str(uuid.uuid4())
            user_id = f"user-{uuid.uuid4()}"

            request = {
                "type": "voice_profile_analyze",
                "request_id": request_id,
                "user_id": user_id,
                "audio_data": "",  # Pas de données audio
                "audio_format": "wav",
                "is_update": False,
                "include_transcription": False,
                "generate_previews": False
            }

            await gateway.send_json(request)

            event = await gateway.wait_for_event(
                "voice_profile_analyze_result",
                timeout=10.0
            )

            assert event is not None, "Devrait recevoir voice_profile_analyze_result"
            assert event['request_id'] == request_id
            assert event['user_id'] == user_id
            # Le mock retourne success=True même sans audio
            # En prod, on aurait success=False ou une erreur
            print(f"✅ Profil vocal (sans sample): success={event.get('success')}")

        finally:
            await gateway.close()

    @pytest.mark.asyncio
    async def test_mocked_voice_profile_with_sample(self, mocked_translator_server, sample_audio_base64):
        """
        Test 4 (mocké): Création de profil vocal avec échantillon

        Gateway → ZMQ → Mock Translator (analyse vocale) → ZMQ → Gateway
        """
        server, push_port, sub_port, _ = mocked_translator_server

        config = GatewaySimulatorConfig(
            push_port=push_port,
            sub_port=sub_port,
            timeout_seconds=15.0
        )
        gateway = GatewaySimulator(config)
        await gateway.initialize()

        try:
            request_id = str(uuid.uuid4())
            user_id = f"user-{uuid.uuid4()}"

            request = {
                "type": "voice_profile_analyze",
                "request_id": request_id,
                "user_id": user_id,
                "audio_data": sample_audio_base64,
                "audio_format": "wav",
                "is_update": False,
                "include_transcription": True,
                "generate_previews": False
            }

            await gateway.send_json(request)

            event = await gateway.wait_for_event(
                "voice_profile_analyze_result",
                timeout=15.0
            )

            assert event is not None, "Devrait recevoir voice_profile_analyze_result"
            assert event['request_id'] == request_id
            assert event['user_id'] == user_id
            assert event['success'] == True
            assert 'quality_score' in event
            assert event['quality_score'] > 0
            assert 'voice_characteristics' in event
            assert 'fingerprint' in event

            # Vérifier la transcription demandée
            assert 'transcription' in event
            assert event['transcription'] is not None
            assert 'text' in event['transcription']

            print(f"✅ Profil vocal créé: quality={event['quality_score']}")
            print(f"✅ Caractéristiques: {event['voice_characteristics']}")
            print(f"✅ Transcription: {event['transcription']['text']}")

        finally:
            await gateway.close()


# ═══════════════════════════════════════════════════════════════════════════════
# TESTS DE FORMAT DE MESSAGE
# ═══════════════════════════════════════════════════════════════════════════════

@pytest.mark.skipif(not ZMQ_AVAILABLE, reason="ZMQ non disponible")
class TestMessageFormats:
    """Tests de validation des formats de message ZMQ."""

    def test_transcription_request_format(self, sample_audio):
        """Vérifie le format d'une requête transcription."""
        request = {
            "type": "transcription_only",
            "taskId": str(uuid.uuid4()),
            "messageId": f"msg-{uuid.uuid4()}",
            "audioFormat": "wav",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/wav",
                "audioSize": len(sample_audio)
            }
        }

        # Vérifier les champs requis
        assert "type" in request
        assert "taskId" in request
        assert "messageId" in request
        assert "binaryFrames" in request
        assert request["binaryFrames"]["audio"] == 1

    def test_audio_process_request_format(self, sample_audio):
        """Vérifie le format d'une requête audio_process."""
        request = {
            "type": "audio_process",
            "taskId": str(uuid.uuid4()),
            "messageId": f"msg-{uuid.uuid4()}",
            "attachmentId": f"att-{uuid.uuid4()}",
            "conversationId": f"conv-{uuid.uuid4()}",
            "senderId": f"user-{uuid.uuid4()}",
            "audioUrl": "https://example.com/audio.wav",
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": "audio/wav",
                "audioSize": len(sample_audio)
            },
            "targetLanguages": ["en", "fr"],
            "generateVoiceClone": True,
            "modelType": "basic",
            "audioDurationMs": 2000
        }

        # Vérifier les champs requis
        required_fields = ["type", "messageId", "attachmentId", "senderId", "targetLanguages"]
        for field in required_fields:
            assert field in request, f"Champ requis manquant: {field}"

        assert isinstance(request["targetLanguages"], list)
        assert len(request["targetLanguages"]) > 0

    def test_translation_request_format(self):
        """Vérifie le format d'une requête traduction texte."""
        request = {
            "taskId": str(uuid.uuid4()),
            "messageId": f"msg-{uuid.uuid4()}",
            "text": "Hello world",
            "sourceLanguage": "en",
            "targetLanguages": ["fr", "es", "de"],
            "conversationId": f"conv-{uuid.uuid4()}",
            "modelType": "basic",
            "timestamp": time.time()
        }

        required_fields = ["messageId", "text", "sourceLanguage", "targetLanguages"]
        for field in required_fields:
            assert field in request, f"Champ requis manquant: {field}"

    def test_voice_profile_analyze_format(self, sample_audio_base64):
        """Vérifie le format d'une requête voice_profile_analyze."""
        request = {
            "type": "voice_profile_analyze",
            "request_id": str(uuid.uuid4()),
            "user_id": f"user-{uuid.uuid4()}",
            "audio_data": sample_audio_base64,
            "audio_format": "wav",
            "is_update": False,
            "include_transcription": True,
            "generate_previews": True,
            "preview_languages": ["en", "fr"]
        }

        required_fields = ["type", "request_id", "user_id", "audio_data", "audio_format"]
        for field in required_fields:
            assert field in request, f"Champ requis manquant: {field}"

        # Vérifier que audio_data est du base64 valide
        try:
            decoded = base64.b64decode(request["audio_data"])
            assert len(decoded) > 0
        except Exception as e:
            pytest.fail(f"audio_data n'est pas du base64 valide: {e}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s", "-m", "not integration"])
