"""
Test Multilingue - Clonage Vocal Cross-Lingue
=============================================

Utilise votre échantillon vocal français pour générer des versions
clonées dans plusieurs langues : anglais, italien, espagnol, chinois,
allemand et portugais.

Pipeline:
1. MMS/Edge-TTS génère l'audio dans la langue cible
2. OpenVoice convertit le timbre vers votre voix
"""

import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "voice_clone_test"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Paramètres
VOICE_CLONE_TAU = 0.6  # Intensité du clonage

# Textes à synthétiser dans chaque langue
TEXTS = {
    "en": {
        "name": "English",
        "text": "Hello! I am Meeshy, your multilingual assistant.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "es": {
        "name": "Español",
        "text": "¡Hola! Soy Meeshy, tu asistente multilingüe.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "it": {
        "name": "Italiano",
        "text": "Ciao! Sono Meeshy, il tuo assistente multilingue.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "de": {
        "name": "Deutsch",
        "text": "Hallo! Ich bin Meeshy, dein mehrsprachiger Assistent.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "pt": {
        "name": "Português",
        "text": "Olá! Eu sou Meeshy, seu assistente multilíngue.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "zh": {
        "name": "中文",
        "text": "你好！我是Meeshy，你的多语言助手。",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
    "fr": {
        "name": "Français",
        "text": "Bonjour! Je suis Meeshy, votre assistant multilingue.",
        "translation": "Bonjour! Je suis Meeshy, votre assistant multilingue."
    },
}


class MultilingualVoiceCloner:
    """Clonage vocal multilingue avec OpenVoice"""

    def __init__(self, voice_sample_path: str, tau: float = 0.5):
        self.voice_sample_path = voice_sample_path
        self.tau = tau
        self.tone_converter = None
        self.target_embedding = None
        self._initialized = False

    async def initialize(self):
        """Initialise OpenVoice"""
        if self._initialized:
            return True

        try:
            from openvoice.api import ToneColorConverter
            from config.settings import get_settings

            settings = get_settings()
            base_path = settings.openvoice_checkpoints_path
            converter_dir = os.path.join(base_path, "converter")
            config_path = os.path.join(converter_dir, "config.json")
            ckpt_path = os.path.join(converter_dir, "checkpoint.pth")

            print("🔄 Chargement OpenVoice...")

            loop = asyncio.get_event_loop()

            def load():
                converter = ToneColorConverter(config_path, device="cpu")
                converter.watermark_model = None  # Désactiver watermark
                converter.load_ckpt(ckpt_path)
                return converter

            self.tone_converter = await loop.run_in_executor(None, load)

            # Extraire l'embedding de la voix cible
            print(f"🎤 Extraction embedding de: {Path(self.voice_sample_path).name}")
            self.target_embedding = await self._extract_embedding(self.voice_sample_path)

            self._initialized = True
            print("✅ OpenVoice initialisé")
            return True

        except Exception as e:
            print(f"❌ Erreur initialisation OpenVoice: {e}")
            return False

    async def _extract_embedding(self, audio_path: str):
        """Extrait l'embedding vocal"""
        loop = asyncio.get_event_loop()

        def extract():
            return self.tone_converter.extract_se(audio_path, se_save_path=None)

        return await loop.run_in_executor(None, extract)

    async def clone_voice(self, source_audio_path: str, output_path: str) -> str:
        """Applique le clonage vocal"""
        if not self._initialized:
            await self.initialize()

        loop = asyncio.get_event_loop()

        # Extraire embedding de l'audio source
        src_embedding = await self._extract_embedding(source_audio_path)

        def convert():
            self.tone_converter.convert(
                audio_src_path=source_audio_path,
                src_se=src_embedding,
                tgt_se=self.target_embedding,
                output_path=output_path,
                tau=self.tau,
                message=""
            )

        await loop.run_in_executor(None, convert)
        return output_path


async def synthesize_with_edge_tts(text: str, language: str, output_path: str) -> bool:
    """Synthèse avec Edge TTS (Microsoft)"""
    try:
        import edge_tts

        # Voix par langue
        voices = {
            "en": "en-US-AriaNeural",
            "es": "es-ES-ElviraNeural",
            "it": "it-IT-ElsaNeural",
            "de": "de-DE-KatjaNeural",
            "pt": "pt-BR-FranciscaNeural",
            "zh": "zh-CN-XiaoxiaoNeural",
            "fr": "fr-FR-DeniseNeural",
        }

        voice = voices.get(language, "en-US-AriaNeural")

        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(output_path)
        return True

    except ImportError:
        return False
    except Exception as e:
        print(f"   ⚠️ Edge TTS erreur: {e}")
        return False


async def synthesize_with_mms(text: str, language: str, output_path: str) -> bool:
    """Synthèse avec MMS (Meta)"""
    try:
        from services.tts.backends.mms_backend import MMSBackend

        backend = MMSBackend(device="cpu")
        if not backend.is_available or not backend.supports_language(language):
            return False

        await backend.initialize()
        await backend.synthesize(text, language, output_path=output_path)
        await backend.close()
        return True

    except Exception as e:
        print(f"   ⚠️ MMS erreur: {e}")
        return False


async def test_multilingual_clone():
    """Test principal de clonage multilingue"""
    print("\n" + "=" * 70)
    print("🌍 TEST CLONAGE VOCAL MULTILINGUE")
    print("=" * 70)

    # Vérifier l'échantillon vocal
    voice_sample = OUTPUT_DIR / "voice_sample.wav"
    if not voice_sample.exists():
        print(f"❌ Échantillon vocal non trouvé: {voice_sample}")
        print("   Exécutez d'abord test_voice_clone_pipeline.py")
        return None

    print(f"\n🎤 Voix source: {voice_sample}")
    print(f"🎚️  Intensité clonage (tau): {VOICE_CLONE_TAU}")

    # Vérifier Edge TTS
    edge_available = False
    try:
        import edge_tts
        edge_available = True
        print("✅ Edge TTS disponible")
    except ImportError:
        print("⚠️ Edge TTS non disponible - pip install edge-tts")

    if not edge_available:
        print("\n❌ Edge TTS requis pour ce test multilingue")
        print("   Installation: pip install edge-tts")
        return None

    # Initialiser le cloner
    cloner = MultilingualVoiceCloner(str(voice_sample), tau=VOICE_CLONE_TAU)
    if not await cloner.initialize():
        print("❌ Impossible d'initialiser le clonage vocal")
        return None

    print(f"\n📝 Langues à tester: {', '.join([v['name'] for v in TEXTS.values()])}")

    results = []
    total_start = time.time()

    for lang_code, lang_info in TEXTS.items():
        print(f"\n{'─' * 60}")
        print(f"🌐 [{lang_info['name']}] {lang_code.upper()}")
        print(f"   Texte: \"{lang_info['text'][:50]}...\"")

        start_time = time.time()

        # Chemins
        temp_path = str(OUTPUT_DIR / f"temp_{lang_code}.wav")
        output_path = str(OUTPUT_DIR / f"cloned_{lang_code}.wav")

        try:
            # Étape 1: Synthèse TTS
            print(f"   🔊 Synthèse Edge TTS...")
            success = await synthesize_with_edge_tts(
                lang_info['text'],
                lang_code,
                temp_path
            )

            if not success:
                print(f"   ❌ Échec synthèse")
                continue

            # Étape 2: Clonage vocal
            print(f"   🎭 Clonage vocal...")
            await cloner.clone_voice(temp_path, output_path)

            # Nettoyer temp
            if os.path.exists(temp_path):
                os.remove(temp_path)

            elapsed = time.time() - start_time
            file_size = os.path.getsize(output_path) / 1024

            print(f"   ✅ Généré: cloned_{lang_code}.wav")
            print(f"   📊 Taille: {file_size:.1f} KB | ⏱️ Temps: {elapsed:.2f}s")

            results.append({
                "lang": lang_code,
                "name": lang_info['name'],
                "file": output_path,
                "size": file_size,
                "time": elapsed
            })

        except Exception as e:
            print(f"   ❌ Erreur: {e}")
            import traceback
            traceback.print_exc()

    # Résumé
    total_time = time.time() - total_start

    print("\n" + "=" * 70)
    print("📊 RÉSUMÉ")
    print("=" * 70)

    print(f"\n⏱️  Temps total: {total_time:.2f}s")
    print(f"✅ Langues réussies: {len(results)}/{len(TEXTS)}")

    print(f"\n📁 Fichiers générés dans: {OUTPUT_DIR}")
    print("\n📝 Fichiers audio clonés:")

    for r in results:
        print(f"   • cloned_{r['lang']}.wav ({r['name']}) - {r['size']:.1f} KB")

    print("\n" + "=" * 70)
    print("🎧 ÉCOUTEZ ET COMPAREZ")
    print("=" * 70)
    print(f"\n   🎤 voice_sample.wav - Votre voix originale (français)")
    for r in results:
        print(f"   🌐 cloned_{r['lang']}.wav - {r['name']} avec votre voix")

    return results


if __name__ == "__main__":
    results = asyncio.run(test_multilingual_clone())
    sys.exit(0 if results else 1)
