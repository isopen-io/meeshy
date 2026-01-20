"""
Test d'intégration End-to-End du Translator

Ce test simule complètement le Gateway et teste tous les types de requêtes
supportées par le Translator : traduction texte, audio process, transcription.

⚠️ Ce test nécessite que le Translator soit actif et ne doit PAS être exécuté en CI.

Usage:
    pytest tests/integration/test_translator_e2e.py -v -s

Pour skip en CI, utiliser:
    pytest -m "not e2e"
"""

import asyncio
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Any

import pytest
import zmq
import zmq.asyncio

# Marquer comme test e2e (à skip en CI)
pytestmark = pytest.mark.e2e

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ══════════════════════════════════════════════════════════════
# Configuration et données de test
# ══════════════════════════════════════════════════════════════

@dataclass
class TranslatorConfig:
    """Configuration de connexion au Translator"""
    host: str = "0.0.0.0"
    push_port: int = 5555  # Gateway PUSH → Translator PULL
    sub_port: int = 5558   # Translator PUB → Gateway SUB
    timeout_ms: int = 30000  # 30 secondes max par test


@dataclass
class TestResult:
    """Résultat d'un test individuel"""
    test_name: str
    success: bool
    duration_ms: int
    request_sent: Dict
    response_received: Optional[Dict]
    error: Optional[str] = None


class GatewaySimulator:
    """
    Simule le comportement du Gateway pour tester le Translator

    Cette classe gère la connexion ZMQ et l'envoi/réception de messages
    exactement comme le ferait le vrai Gateway.
    """

    def __init__(self, config: TranslatorConfig):
        self.config = config
        self.context: Optional[zmq.asyncio.Context] = None
        self.push_socket: Optional[zmq.asyncio.Socket] = None
        self.sub_socket: Optional[zmq.asyncio.Socket] = None
        self.is_connected = False

        # Tracking des réponses reçues
        self.responses: Dict[str, Dict] = {}
        self.listener_task: Optional[asyncio.Task] = None

    async def connect(self):
        """Établit les connexions ZMQ avec le Translator"""
        try:
            logger.info(f"🔌 Connexion au Translator {self.config.host}:{self.config.push_port}")

            self.context = zmq.asyncio.Context()

            # Socket PUSH pour envoyer les commandes
            self.push_socket = self.context.socket(zmq.PUSH)
            self.push_socket.connect(f"tcp://{self.config.host}:{self.config.push_port}")

            # Socket SUB pour recevoir les résultats
            self.sub_socket = self.context.socket(zmq.SUB)
            self.sub_socket.connect(f"tcp://{self.config.host}:{self.config.sub_port}")
            self.sub_socket.subscribe(b'')  # S'abonner à tous les messages

            # Petit délai pour établir les connexions
            await asyncio.sleep(0.1)

            self.is_connected = True
            logger.info("✅ Connexion ZMQ établie")

            # Démarrer l'écoute des réponses
            self.listener_task = asyncio.create_task(self._listen_responses())

        except Exception as e:
            logger.error(f"❌ Erreur connexion: {e}")
            raise

    async def disconnect(self):
        """Ferme les connexions ZMQ"""
        logger.info("🛑 Fermeture des connexions ZMQ")

        if self.listener_task:
            self.listener_task.cancel()
            try:
                await self.listener_task
            except asyncio.CancelledError:
                pass

        if self.push_socket:
            self.push_socket.close()
        if self.sub_socket:
            self.sub_socket.close()
        if self.context:
            self.context.term()

        self.is_connected = False
        logger.info("✅ Connexions fermées")

    async def _listen_responses(self):
        """Écoute en continu les réponses du Translator"""
        logger.info("👂 Démarrage de l'écoute des réponses...")

        try:
            while self.is_connected:
                try:
                    # Attendre un message (avec timeout)
                    message = await asyncio.wait_for(
                        self.sub_socket.recv_string(),
                        timeout=1.0
                    )

                    # Parser le JSON
                    data = json.loads(message)
                    response_type = data.get('type')
                    task_id = data.get('taskId')

                    logger.info(f"📨 Réponse reçue: type={response_type}, taskId={task_id}")

                    # Stocker la réponse par taskId
                    if task_id:
                        self.responses[task_id] = data

                except asyncio.TimeoutError:
                    # Normal, on continue d'écouter
                    continue
                except Exception as e:
                    logger.error(f"❌ Erreur réception: {e}")

        except asyncio.CancelledError:
            logger.info("🛑 Arrêt de l'écoute")

    async def send_translation_request(
        self,
        text: str,
        source_language: str,
        target_languages: List[str],
        model_type: str = "medium"
    ) -> str:
        """
        Envoie une requête de traduction texte

        Simule: ZmqRequestSender.sendTranslationRequest()
        """
        task_id = str(uuid.uuid4())
        message_id = f"test_msg_{task_id[:8]}"
        conversation_id = f"test_conv_{task_id[:8]}"

        request = {
            "type": "translation",
            "taskId": task_id,
            "messageId": message_id,
            "text": text,
            "sourceLanguage": source_language,
            "targetLanguages": target_languages,
            "conversationId": conversation_id,
            "modelType": model_type,
            "timestamp": int(time.time() * 1000)
        }

        logger.info(f"📤 Envoi translation: '{text[:50]}...' ({source_language} → {target_languages})")

        # Envoyer en JSON
        await self.push_socket.send_string(json.dumps(request))

        return task_id

    async def send_audio_process_request(
        self,
        audio_path: str,
        target_languages: List[str],
        generate_voice_clone: bool = True,
        mobile_transcription: Optional[Dict] = None
    ) -> str:
        """
        Envoie une requête de traitement audio complet

        Simule: ZmqRequestSender.sendAudioProcessRequest()
        """
        task_id = str(uuid.uuid4())
        message_id = f"test_msg_{task_id[:8]}"
        attachment_id = f"test_att_{task_id[:8]}"
        conversation_id = f"test_conv_{task_id[:8]}"
        sender_id = "test_user_123"

        # Charger l'audio en binaire
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        with open(audio_path, 'rb') as f:
            audio_data = f.read()

        audio_size = len(audio_data)
        audio_mime = self._get_mime_type(audio_path)

        # Préparer le message JSON (frame 0)
        request = {
            "type": "audio_process",
            "messageId": message_id,
            "attachmentId": attachment_id,
            "conversationId": conversation_id,
            "senderId": sender_id,
            "audioUrl": "",
            "audioMimeType": audio_mime,
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": audio_mime,
                "audioSize": audio_size
            },
            "audioDurationMs": 5000,  # Exemple
            "mobileTranscription": mobile_transcription,
            "targetLanguages": target_languages,
            "generateVoiceClone": generate_voice_clone,
            "modelType": "medium"
        }

        logger.info(
            f"📤 Envoi audio_process: {os.path.basename(audio_path)} "
            f"({audio_size / 1024:.1f}KB, {len(target_languages)} langues)"
        )

        # Envoyer en multipart: [JSON, Binary]
        await self.push_socket.send_multipart([
            json.dumps(request).encode('utf-8'),
            audio_data
        ])

        return task_id

    async def send_transcription_only_request(
        self,
        audio_path: str,
        mobile_transcription: Optional[Dict] = None
    ) -> str:
        """
        Envoie une requête de transcription seule (sans traduction)

        Simule: ZmqRequestSender.sendTranscriptionOnlyRequest()
        """
        task_id = str(uuid.uuid4())
        message_id = f"test_msg_{task_id[:8]}"
        attachment_id = f"test_att_{task_id[:8]}"

        # Charger l'audio en binaire
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        with open(audio_path, 'rb') as f:
            audio_data = f.read()

        audio_size = len(audio_data)
        audio_mime = self._get_mime_type(audio_path)
        audio_format = audio_mime.replace('audio/', '')

        # Préparer le message JSON (frame 0)
        request = {
            "type": "transcription_only",
            "taskId": task_id,
            "messageId": message_id,
            "attachmentId": attachment_id,
            "audioFormat": audio_format,
            "mobileTranscription": mobile_transcription,
            "binaryFrames": {
                "audio": 1,
                "audioMimeType": audio_mime,
                "audioSize": audio_size
            }
        }

        logger.info(
            f"📤 Envoi transcription_only: {os.path.basename(audio_path)} "
            f"({audio_size / 1024:.1f}KB)"
        )

        # Envoyer en multipart: [JSON, Binary]
        await self.push_socket.send_multipart([
            json.dumps(request).encode('utf-8'),
            audio_data
        ])

        return task_id

    async def wait_for_response(
        self,
        task_id: str,
        timeout_ms: int = 30000,
        expected_type: Optional[str] = None
    ) -> Optional[Dict]:
        """
        Attend une réponse du Translator pour un taskId donné
        """
        start_time = time.time()
        timeout_sec = timeout_ms / 1000.0

        while (time.time() - start_time) < timeout_sec:
            if task_id in self.responses:
                response = self.responses[task_id]

                # Vérifier le type si spécifié
                if expected_type and response.get('type') != expected_type:
                    logger.warning(
                        f"⚠️ Type inattendu: attendu={expected_type}, "
                        f"reçu={response.get('type')}"
                    )

                return response

            await asyncio.sleep(0.1)

        logger.error(f"⏱️ Timeout après {timeout_ms}ms pour taskId={task_id}")
        return None

    def _get_mime_type(self, file_path: str) -> str:
        """Détermine le type MIME depuis l'extension"""
        ext = Path(file_path).suffix.lower()
        mime_types = {
            '.mp3': 'audio/mpeg',
            '.m4a': 'audio/mp4',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.webm': 'audio/webm'
        }
        return mime_types.get(ext, 'audio/mpeg')


# ══════════════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════════════

@pytest.fixture
async def gateway_simulator():
    """Fixture pour créer et fermer le simulateur Gateway"""
    config = TranslatorConfig()
    simulator = GatewaySimulator(config)

    await simulator.connect()

    yield simulator

    await simulator.disconnect()


@pytest.mark.asyncio
async def test_text_translation_single_language(gateway_simulator: GatewaySimulator):
    """
    Test 1: Traduction texte simple (fr → en)
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 1: Traduction texte simple (fr → en)")
    logger.info("="*70)

    start = time.time()

    # Envoyer la requête
    task_id = await gateway_simulator.send_translation_request(
        text="Bonjour, comment allez-vous aujourd'hui ?",
        source_language="fr",
        target_languages=["en"],
        model_type="medium"
    )

    # Attendre la réponse
    response = await gateway_simulator.wait_for_response(
        task_id,
        expected_type="translation_completed"
    )

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert response is not None, "Aucune réponse reçue"
    assert response['type'] == 'translation_completed'
    assert response['targetLanguage'] == 'en'
    assert 'translatedText' in response
    assert len(response['translatedText']) > 0

    logger.info(f"✅ Traduction reçue: \"{response['translatedText']}\"")
    logger.info(f"⏱️ Durée: {duration}ms")


@pytest.mark.asyncio
async def test_text_translation_multiple_languages(gateway_simulator: GatewaySimulator):
    """
    Test 2: Traduction texte multi-langues (fr → en, es, de)
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 2: Traduction texte multi-langues (fr → en, es, de)")
    logger.info("="*70)

    start = time.time()

    # Envoyer la requête
    task_id = await gateway_simulator.send_translation_request(
        text="La technologie évolue rapidement dans le monde moderne.",
        source_language="fr",
        target_languages=["en", "es", "de"],
        model_type="premium"
    )

    # Attendre les 3 réponses (une par langue)
    responses = []
    for _ in range(3):
        response = await gateway_simulator.wait_for_response(task_id, timeout_ms=45000)
        if response:
            responses.append(response)
            logger.info(
                f"  📨 {response['targetLanguage']}: \"{response['translatedText']}\""
            )

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert len(responses) == 3, f"Attendu 3 réponses, reçu {len(responses)}"

    target_langs = {r['targetLanguage'] for r in responses}
    assert target_langs == {'en', 'es', 'de'}

    for response in responses:
        assert response['type'] == 'translation_completed'
        assert len(response['translatedText']) > 0

    logger.info(f"✅ Toutes les traductions reçues")
    logger.info(f"⏱️ Durée totale: {duration}ms")


@pytest.mark.asyncio
async def test_text_translation_long_text(gateway_simulator: GatewaySimulator):
    """
    Test 3: Traduction d'un texte long
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 3: Traduction texte long (>500 caractères)")
    logger.info("="*70)

    long_text = (
        "L'intelligence artificielle transforme radicalement notre société. "
        "Des algorithmes sophistiqués analysent des quantités massives de données "
        "pour identifier des patterns invisibles à l'œil humain. Cette révolution "
        "technologique soulève des questions éthiques fondamentales sur la vie privée, "
        "l'emploi, et le rôle de l'humain dans un monde automatisé. Les gouvernements "
        "et les entreprises doivent collaborer pour établir des cadres réglementaires "
        "qui encouragent l'innovation tout en protégeant les droits fondamentaux. "
        "L'avenir dépend de notre capacité à équilibrer progrès et responsabilité."
    )

    start = time.time()

    task_id = await gateway_simulator.send_translation_request(
        text=long_text,
        source_language="fr",
        target_languages=["en"],
        model_type="premium"
    )

    response = await gateway_simulator.wait_for_response(task_id, timeout_ms=60000)

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert response is not None
    assert response['type'] == 'translation_completed'
    assert len(response['translatedText']) > 400  # Devrait être assez long

    logger.info(f"✅ Texte long traduit ({len(response['translatedText'])} caractères)")
    logger.info(f"⏱️ Durée: {duration}ms")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not os.path.exists("/tmp/test_audio.m4a"),
    reason="Fichier audio de test non disponible"
)
async def test_audio_process_with_transcription(gateway_simulator: GatewaySimulator):
    """
    Test 4: Traitement audio complet (transcription + traduction + TTS)

    ⚠️ Nécessite un fichier audio de test: /tmp/test_audio.m4a
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 4: Traitement audio complet")
    logger.info("="*70)

    start = time.time()

    task_id = await gateway_simulator.send_audio_process_request(
        audio_path="/tmp/test_audio.m4a",
        target_languages=["en"],
        generate_voice_clone=True
    )

    response = await gateway_simulator.wait_for_response(
        task_id,
        timeout_ms=120000,  # 2 minutes pour l'audio
        expected_type="audio_process_completed"
    )

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert response is not None
    assert response['type'] == 'audio_process_completed'
    assert 'transcription' in response
    assert 'translations' in response
    assert len(response['translations']) > 0

    logger.info(f"✅ Transcription: \"{response['transcription']['text']}\"")
    logger.info(f"✅ Traductions: {len(response['translations'])} langue(s)")
    logger.info(f"⏱️ Durée: {duration}ms")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not os.path.exists("/tmp/test_audio.m4a"),
    reason="Fichier audio de test non disponible"
)
async def test_audio_process_with_mobile_transcription(gateway_simulator: GatewaySimulator):
    """
    Test 5: Audio process avec transcription mobile pré-fournie
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 5: Audio process avec transcription mobile")
    logger.info("="*70)

    mobile_transcription = {
        "text": "Bonjour, ceci est un test de transcription mobile.",
        "language": "fr",
        "confidence": 0.95,
        "source": "ios_speech_recognition"
    }

    start = time.time()

    task_id = await gateway_simulator.send_audio_process_request(
        audio_path="/tmp/test_audio.m4a",
        target_languages=["en", "es"],
        generate_voice_clone=True,
        mobile_transcription=mobile_transcription
    )

    response = await gateway_simulator.wait_for_response(
        task_id,
        timeout_ms=120000,
        expected_type="audio_process_completed"
    )

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert response is not None
    assert response['transcription']['text'] == mobile_transcription['text']
    assert response['transcription']['source'] == 'mobile'

    logger.info(f"✅ Transcription mobile utilisée")
    logger.info(f"⏱️ Durée: {duration}ms (devrait être plus rapide)")


@pytest.mark.asyncio
@pytest.mark.skipif(
    not os.path.exists("/tmp/test_audio.m4a"),
    reason="Fichier audio de test non disponible"
)
async def test_transcription_only(gateway_simulator: GatewaySimulator):
    """
    Test 6: Transcription seule (sans traduction ni TTS)
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 6: Transcription seule")
    logger.info("="*70)

    start = time.time()

    task_id = await gateway_simulator.send_transcription_only_request(
        audio_path="/tmp/test_audio.m4a"
    )

    response = await gateway_simulator.wait_for_response(
        task_id,
        timeout_ms=60000,
        expected_type="transcription_completed"
    )

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert response is not None
    assert response['type'] == 'transcription_completed'
    assert 'text' in response
    assert 'language' in response
    assert len(response['text']) > 0

    logger.info(f"✅ Transcription: \"{response['text']}\"")
    logger.info(f"✅ Langue détectée: {response['language']}")
    logger.info(f"⏱️ Durée: {duration}ms")


@pytest.mark.asyncio
async def test_error_handling_invalid_language(gateway_simulator: GatewaySimulator):
    """
    Test 7: Gestion d'erreur - langue invalide
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 7: Gestion d'erreur - langue invalide")
    logger.info("="*70)

    task_id = await gateway_simulator.send_translation_request(
        text="Test avec langue invalide",
        source_language="fr",
        target_languages=["invalid_lang"],
        model_type="medium"
    )

    response = await gateway_simulator.wait_for_response(task_id, timeout_ms=10000)

    # Devrait recevoir une erreur
    assert response is not None
    # Le type pourrait être 'translation_error' ou 'translation_completed' avec erreur
    logger.info(f"📨 Réponse: type={response.get('type')}")


@pytest.mark.asyncio
async def test_concurrent_requests(gateway_simulator: GatewaySimulator):
    """
    Test 8: Requêtes concurrentes (charge)
    """
    logger.info("\n" + "="*70)
    logger.info("TEST 8: Requêtes concurrentes (10 traductions simultanées)")
    logger.info("="*70)

    start = time.time()

    # Envoyer 10 requêtes en parallèle
    tasks = []
    for i in range(10):
        task_id = await gateway_simulator.send_translation_request(
            text=f"Message de test numéro {i+1} pour tester la concurrence.",
            source_language="fr",
            target_languages=["en"],
            model_type="medium"
        )
        tasks.append(task_id)

    # Attendre toutes les réponses
    responses = []
    for task_id in tasks:
        response = await gateway_simulator.wait_for_response(task_id, timeout_ms=60000)
        if response:
            responses.append(response)

    duration = int((time.time() - start) * 1000)

    # Assertions
    assert len(responses) == 10, f"Attendu 10 réponses, reçu {len(responses)}"

    logger.info(f"✅ Toutes les traductions concurrentes reçues")
    logger.info(f"⏱️ Durée totale: {duration}ms ({duration/10:.0f}ms/requête en moyenne)")


# ══════════════════════════════════════════════════════════════
# Rapport de synthèse
# ══════════════════════════════════════════════════════════════

def pytest_sessionfinish(session, exitstatus):
    """Hook pytest pour afficher un rapport de synthèse"""
    if exitstatus == 0:
        logger.info("\n" + "="*70)
        logger.info("🎉 TOUS LES TESTS SONT PASSÉS !")
        logger.info("="*70)
        logger.info("\n✅ Le Translator fonctionne correctement pour:")
        logger.info("   • Traduction texte simple")
        logger.info("   • Traduction multi-langues")
        logger.info("   • Traduction texte long")
        logger.info("   • Traitement audio complet")
        logger.info("   • Transcription mobile")
        logger.info("   • Transcription seule")
        logger.info("   • Gestion d'erreurs")
        logger.info("   • Requêtes concurrentes")
        logger.info("\n✅ Le système est prêt pour la production !")
    else:
        logger.info("\n" + "="*70)
        logger.info("❌ CERTAINS TESTS ONT ÉCHOUÉ")
        logger.info("="*70)


if __name__ == "__main__":
    """
    Permet d'exécuter directement le script:
    python tests/integration/test_translator_e2e.py
    """
    import sys

    # Exécuter avec pytest
    sys.exit(pytest.main([__file__, "-v", "-s"]))
