"""
Debug script pour identifier pourquoi l'extraction d'embedding échoue
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

OUTPUT_DIR = Path(__file__).parent.parent.parent / "outputs" / "voice_clone_test"


async def debug_embedding_extraction():
    """Debug l'extraction d'embedding"""
    print("=" * 60)
    print("DEBUG EXTRACTION D'EMBEDDING OPENVOICE")
    print("=" * 60)

    # Fichiers à tester
    voice_sample = OUTPUT_DIR / "voice_sample.wav"
    vits_temp = OUTPUT_DIR / "cloned_lingala_1_vits_temp.wav"

    print(f"\n📁 Fichiers de test:")
    print(f"   1. voice_sample.wav: {voice_sample.exists()}")
    print(f"   2. cloned_lingala_1_vits_temp.wav: {vits_temp.exists()}")

    # Charger OpenVoice
    print("\n🔄 Chargement OpenVoice...")
    try:
        from openvoice.api import ToneColorConverter
        print("   ✅ OpenVoice importé")
    except ImportError as e:
        print(f"   ❌ Erreur import: {e}")
        return

    # Charger le ToneColorConverter
    from config.settings import get_settings
    settings = get_settings()

    base_path = settings.openvoice_checkpoints_path
    converter_dir = os.path.join(base_path, "converter")
    config_path = os.path.join(converter_dir, "config.json")
    ckpt_path = os.path.join(converter_dir, "checkpoint.pth")

    print(f"\n📂 Checkpoints OpenVoice:")
    print(f"   Config: {config_path} (exists: {os.path.exists(config_path)})")
    print(f"   Checkpoint: {ckpt_path} (exists: {os.path.exists(ckpt_path)})")

    print("\n🔄 Création ToneColorConverter...")
    try:
        converter = ToneColorConverter(config_path, device="cpu")
        converter.load_ckpt(ckpt_path)
        print("   ✅ ToneColorConverter chargé")
    except Exception as e:
        print(f"   ❌ Erreur: {e}")
        import traceback
        traceback.print_exc()
        return

    # Test extraction embedding sur les deux fichiers
    for audio_path in [voice_sample, vits_temp]:
        if not audio_path.exists():
            print(f"\n⚠️ Fichier non trouvé: {audio_path}")
            continue

        print(f"\n{'=' * 40}")
        print(f"🔍 Test: {audio_path.name}")
        print(f"{'=' * 40}")

        # Infos sur le fichier audio
        import wave
        try:
            with wave.open(str(audio_path), 'rb') as wav:
                channels = wav.getnchannels()
                sample_width = wav.getsampwidth()
                framerate = wav.getframerate()
                n_frames = wav.getnframes()
                duration = n_frames / framerate

            print(f"   📊 Format WAV:")
            print(f"      - Channels: {channels}")
            print(f"      - Sample width: {sample_width} bytes")
            print(f"      - Sample rate: {framerate} Hz")
            print(f"      - Frames: {n_frames}")
            print(f"      - Duration: {duration:.2f}s")
        except Exception as e:
            print(f"   ⚠️ Impossible de lire info WAV: {e}")

        # Tenter l'extraction directe (sans VAD)
        print(f"\n   🔄 Extraction directe de l'embedding (sans VAD)...")
        try:
            # Utiliser directement extract_se() au lieu de se_extractor.get_se()
            embedding = converter.extract_se(
                str(audio_path),
                se_save_path=None
            )

            if embedding is None:
                print(f"   ❌ Embedding = None")
            else:
                print(f"   ✅ Embedding extrait!")
                print(f"      Shape: {embedding.shape if hasattr(embedding, 'shape') else 'unknown'}")
                print(f"      Type: {type(embedding)}")
                print(f"      Device: {embedding.device if hasattr(embedding, 'device') else 'unknown'}")

        except Exception as e:
            print(f"   ❌ Erreur extraction: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("DEBUG TERMINÉ")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(debug_embedding_extraction())
