"""
Mock Translation Service pour les tests
Utilise directement transformers/NLLB pour les traductions
"""
import asyncio
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM


class MockTranslationService:
    """Service de traduction simple pour les tests"""

    def __init__(self):
        self.model_name = "facebook/nllb-200-distilled-600M"
        self.tokenizer = None
        self.model = None
        self._initialized = False
        self._translation_lock = asyncio.Lock()  # Lock pour éviter "Already borrowed"
        # Utiliser le cache local des modèles
        import os
        self.cache_dir = os.path.join(
            os.path.dirname(__file__),
            "..",
            "models",
            "huggingface"
        )

    async def initialize(self):
        """Initialise le modèle NLLB"""
        if self._initialized:
            return

        print(f"[MOCK_TRANSLATION] Loading {self.model_name} from {self.cache_dir}...")
        loop = asyncio.get_event_loop()
        self.tokenizer = await loop.run_in_executor(
            None,
            lambda: AutoTokenizer.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir,
                local_files_only=True  # Utiliser uniquement le cache local
            )
        )
        self.model = await loop.run_in_executor(
            None,
            lambda: AutoModelForSeq2SeqLM.from_pretrained(
                self.model_name,
                cache_dir=self.cache_dir,
                local_files_only=True  # Utiliser uniquement le cache local
            )
        )
        self._initialized = True
        print("[MOCK_TRANSLATION] Model loaded from cache")

    async def translate_with_structure(
        self,
        text: str,
        source_language: str,
        target_language: str,
        model_type: str = "600M",
        source_channel: str = "test"
    ):
        """Traduit le texte en préservant la structure"""
        if not self._initialized:
            await self.initialize()

        # Mapping codes langue NLLB
        lang_codes = {
            'fr': 'fra_Latn',
            'en': 'eng_Latn',
            'es': 'spa_Latn',
            'de': 'deu_Latn',
            'it': 'ita_Latn',
            'pt': 'por_Latn',
        }

        src_code = lang_codes.get(source_language, 'fra_Latn')
        tgt_code = lang_codes.get(target_language, 'eng_Latn')

        # Traduction avec lock pour éviter "Already borrowed" lors d'appels concurrents
        async with self._translation_lock:
            loop = asyncio.get_event_loop()

            def _translate():
                self.tokenizer.src_lang = src_code
                inputs = self.tokenizer(text, return_tensors="pt", padding=True)

                # Get target language ID
                tgt_lang_id = self.tokenizer.convert_tokens_to_ids(tgt_code)

                translated_tokens = self.model.generate(
                    **inputs,
                    forced_bos_token_id=tgt_lang_id,
                    max_length=512
                )

                return self.tokenizer.batch_decode(translated_tokens, skip_special_tokens=True)[0]

            translated_text = await loop.run_in_executor(None, _translate)

        return {
            'translated_text': translated_text,
            'source_language': source_language,
            'target_language': target_language,
            'segments': []
        }
