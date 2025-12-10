"""
Service de traduction ML unifié - Architecture centralisée
Un seul service ML qui charge les modèles au démarrage et sert tous les canaux
"""

import os
import logging
import time
import asyncio
import re
from typing import Dict, Optional, List, Any, Union
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import threading
from pathlib import Path

# CRITIQUE: Charger les variables d'environnement AVANT tout import
try:
    from dotenv import load_dotenv
    # Charger .env puis .env.local (override)
    env_path = Path(__file__).parent.parent.parent / '.env'
    env_local_path = Path(__file__).parent.parent.parent / '.env.local'
    
    if env_path.exists():
        load_dotenv(env_path)
    
    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)
        print(f"🔧 [ML-SERVICE] .env.local chargé depuis: {env_local_path}")
        print(f"🔧 [ML-SERVICE] MODELS_PATH: {os.getenv('MODELS_PATH', 'NOT SET')}")
except ImportError:
    print("⚠️ [ML-SERVICE] python-dotenv non disponible")

# Import des settings
from config.settings import get_settings

# CRITIQUE: Définir les variables d'environnement AVANT d'importer transformers
# Transformers lit ces variables au moment de l'import
_settings = get_settings()
os.environ['HF_HOME'] = str(_settings.models_path)
os.environ['TRANSFORMERS_CACHE'] = str(_settings.models_path)
os.environ['HUGGINGFACE_HUB_CACHE'] = str(_settings.models_path)
print(f"🔧 [ML-SERVICE] Variables HuggingFace définies: {_settings.models_path}")

# Import du module de segmentation pour préservation de structure
from utils.text_segmentation import TextSegmenter

# Import des modèles ML optimisés
try:
    import torch
    
    # SOLUTION: Désactiver les tensors meta avant d'importer les autres modules
    torch._C._disable_meta = True  # Désactiver les tensors meta au niveau PyTorch
    
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline
    ML_AVAILABLE = True
    
    # Suppression des warnings de retry Xet
    import warnings
    warnings.filterwarnings("ignore", message=".*Retry attempt.*")
    warnings.filterwarnings("ignore", message=".*reqwest.*")
    warnings.filterwarnings("ignore", message=".*xethub.*")
    warnings.filterwarnings("ignore", message=".*IncompleteMessage.*")
    warnings.filterwarnings("ignore", message=".*SendRequest.*")
    
except ImportError:
    ML_AVAILABLE = False
    print("⚠️ Dependencies ML non disponibles")

logger = logging.getLogger(__name__)

@dataclass
class TranslationResult:
    """Résultat d'une traduction unifié"""
    translated_text: str
    detected_language: str
    confidence: float
    model_used: str
    from_cache: bool
    processing_time: float
    source_channel: str  # 'zmq', 'rest', 'websocket'

class TranslationMLService:
    """
    Service de traduction ML unifié - Singleton
    Charge les modèles une seule fois au démarrage et sert tous les canaux
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        """Singleton pattern pour garantir une seule instance"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self, settings, model_type: str = "all", max_workers: int = 4, quantization_level: str = "float16"):
        if self._initialized:
            return
            
        # Charger les settings
        self.settings = settings
        
        self.model_type = model_type
        # OPTIMISATION CPU MULTICORE: Utiliser 16 workers pour AMD 18 cores
        # Laisser 2 cores pour l'OS et les opérations système
        import os
        cpu_workers = min(max_workers, int(os.getenv('ML_MAX_WORKERS', '16')))
        self.max_workers = cpu_workers
        self.quantization_level = quantization_level
        self.executor = ThreadPoolExecutor(max_workers=cpu_workers)
        
        # Modèles ML chargés (partagés entre tous les canaux)
        self.models = {}
        self.tokenizers = {}
        self.pipelines = {}
        
        # Cache thread-local de tokenizers pour éviter "Already borrowed"
        self._thread_local_tokenizers = {}
        self._tokenizer_lock = threading.Lock()

        # Segmenteur de texte pour préservation de structure
        self.text_segmenter = TextSegmenter(max_segment_length=100)

        # Configuration des modèles depuis les settings et .env
        self.models_path = Path(self.settings.models_path)
        logger.info(f"🔍 [ML-SERVICE] models_path configuré: {self.models_path}")
        logger.info(f"🔍 [ML-SERVICE] models_path existe: {self.models_path.exists()}")
        logger.info(f"🔍 [ML-SERVICE] HF_HOME env: {os.getenv('HF_HOME', 'NOT SET')}")
        logger.info(f"🔍 [ML-SERVICE] TRANSFORMERS_CACHE env: {os.getenv('TRANSFORMERS_CACHE', 'NOT SET')}")
        self.device = os.getenv('DEVICE', 'cpu')
        
        self.model_configs = {
            'basic': {
                'model_name': self.settings.basic_model,
                'local_path': self.models_path / self.settings.basic_model,
                'description': f'{self.settings.basic_model} - Modèle rapide',
                'device': self.device,
                'priority': 1  # Chargé en premier
            },
            'medium': {
                'model_name': self.settings.medium_model,
                'local_path': self.models_path / self.settings.medium_model,
                'description': f'{self.settings.medium_model} - Modèle équilibré',
                'device': self.device,
                'priority': 2
            },
            'premium': {
                'model_name': self.settings.premium_model,
                'local_path': self.models_path / self.settings.premium_model,
                'description': f'{self.settings.premium_model} - Modèle haute qualité',
                'device': self.device,
                'priority': 3
            }
        }
        
        # Mapping des codes de langues NLLB
        self.lang_codes = {
            'fr': 'fra_Latn',
            'en': 'eng_Latn', 
            'es': 'spa_Latn',
            'de': 'deu_Latn',
            'pt': 'por_Latn',
            'zh': 'zho_Hans',
            'ja': 'jpn_Jpan',
            'ar': 'arb_Arab'
        }
        
        # Mapping des noms de langues pour T5 (noms complets)
        self.language_names = {
            'fr': 'French',
            'en': 'English', 
            'es': 'Spanish',
            'de': 'German',
            'pt': 'Portuguese',
            'zh': 'Chinese',
            'ja': 'Japanese',
            'ar': 'Arabic',
            'it': 'Italian',
            'ru': 'Russian',
            'ko': 'Korean',
            'nl': 'Dutch'
        }
        
        # Stats globales (partagées entre tous les canaux)
        self.stats = {
            'translations_count': 0,
            'zmq_translations': 0,
            'rest_translations': 0,
            'websocket_translations': 0,
            'avg_processing_time': 0.0,
            'models_loaded': False,
            'startup_time': None
        }
        self.request_times = []
        
        # État d'initialisation
        self.is_initialized = False
        self.is_loading = False
        self._startup_lock = asyncio.Lock()
        
        self._initialized = True
        self._configure_environment()
        logger.info(f"🤖 Service ML Unifié créé (Singleton) avec {max_workers} workers")
    
    def _configure_environment(self):
        """Configure les variables d'environnement basées sur les settings"""
        import os
        
        # OPTIMISATION XET: Configuration pour réduire les warnings du nouveau système
        os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
        os.environ['HF_HUB_DISABLE_IMPLICIT_TOKEN'] = '1'
        os.environ['TOKENIZERS_PARALLELISM'] = 'false'
        
        # OPTIMISATION RÉSEAU: Configuration pour améliorer la connectivité Docker
        os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
        os.environ['HF_HUB_DOWNLOAD_TIMEOUT'] = str(self.settings.huggingface_timeout)
        os.environ['HF_HUB_DOWNLOAD_RETRY_DELAY'] = '5'
        os.environ['HF_HUB_DOWNLOAD_MAX_RETRIES'] = str(self.settings.model_download_max_retries)
        
        # SOLUTION: Désactiver les tensors meta pour éviter l'erreur Tensor.item()
        os.environ['PYTORCH_DISABLE_META'] = '1'
        os.environ['PYTORCH_FORCE_CUDA'] = '0'  # Forcer CPU si pas de GPU
        os.environ['PYTORCH_NO_CUDA_MEMORY_CACHING'] = '1'
        
        # Configuration pour éviter les problèmes de proxy/corporate network
        # Vérifier si le fichier de certificats existe, sinon utiliser le système par défaut
        if os.path.exists('/etc/ssl/certs/ca-certificates.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-certificates.crt'
        elif os.path.exists('/etc/ssl/certs/ca-bundle.crt'):
            os.environ['REQUESTS_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'
            os.environ['CURL_CA_BUNDLE'] = '/etc/ssl/certs/ca-bundle.crt'
        else:
            # Utiliser le système par défaut
            logger.info("⚠️ Fichier de certificats SSL non trouvé, utilisation du système par défaut")
        
        # Option pour désactiver temporairement la vérification SSL si nécessaire
        if os.getenv('HF_HUB_DISABLE_SSL_VERIFICATION', '0') == '1':
            os.environ['REQUESTS_CA_BUNDLE'] = ''
            os.environ['CURL_CA_BUNDLE'] = ''
            logger.info("⚠️ Vérification SSL désactivée pour Hugging Face (HF_HUB_DISABLE_SSL_VERIFICATION=1)")
    
    async def initialize(self) -> bool:
        """Initialise les modèles ML une seule fois au démarrage"""
        async with self._startup_lock:
            if self.is_initialized:
                logger.info("✅ Service ML déjà initialisé")
                return True
                
            if self.is_loading:
                logger.info("⏳ Initialisation ML en cours...")
                # Attendre que l'initialisation se termine
                while self.is_loading and not self.is_initialized:
                    await asyncio.sleep(0.5)
                return self.is_initialized
            
            self.is_loading = True
            startup_start = time.time()
            
            if not ML_AVAILABLE:
                logger.error("❌ Transformers non disponible. Service ML désactivé.")
                self.is_loading = False
                return False
            
            try:
                logger.info("🚀 Initialisation du Service ML Unifié...")
                
                # Configuration optimale des threads PyTorch pour AMD multicore
                if ML_AVAILABLE:
                    torch.set_num_threads(16)  # Utiliser 16 threads pour inference
                    torch.set_num_interop_threads(2)  # 2 threads pour opérations inter-op
                    logger.info(f"⚙️ PyTorch configuré: {torch.get_num_threads()} threads intra-op, {torch.get_num_interop_threads()} threads inter-op")
                
                logger.info("📚 Chargement des modèles NLLB...")
                
                # Charger les modèles par ordre de priorité
                models_to_load = sorted(
                    self.model_configs.items(), 
                    key=lambda x: x[1]['priority']
                )
                
                for model_type, config in models_to_load:
                    try:
                        await self._load_model(model_type)
                    except Exception as e:
                        logger.error(f"❌ Erreur chargement {model_type}: {e}")
                        # Continuer avec les autres modèles
                
                # Vérifier qu'au moins un modèle est chargé
                if not self.models:
                    logger.error("❌ Aucun modèle ML chargé")
                    self.is_loading = False
                    return False
                
                startup_time = time.time() - startup_start
                self.stats['startup_time'] = startup_time
                self.stats['models_loaded'] = True
                self.is_initialized = True
                self.is_loading = False
                
                logger.info(f"✅ Service ML Unifié initialisé en {startup_time:.2f}s")
                logger.info(f"📊 Modèles chargés: {list(self.models.keys())}")
                logger.info(f"🎯 Prêt à servir tous les canaux: ZMQ, REST, WebSocket")
                
                return True
                
            except Exception as e:
                logger.error(f"❌ Erreur critique initialisation ML: {e}")
                self.is_loading = False
                return False
    
    def _get_thread_local_tokenizer(self, model_type: str) -> Optional[AutoTokenizer]:
        """Obtient ou crée un tokenizer pour le thread actuel (évite 'Already borrowed')"""
        import threading
        thread_id = threading.current_thread().ident
        cache_key = f"{model_type}_{thread_id}"
        
        # Vérifier le cache thread-local
        if cache_key in self._thread_local_tokenizers:
            return self._thread_local_tokenizers[cache_key]
        
        # Créer un nouveau tokenizer pour ce thread
        with self._tokenizer_lock:
            # Double-check après acquisition du lock
            if cache_key in self._thread_local_tokenizers:
                return self._thread_local_tokenizers[cache_key]
            
            try:
                model_name = self.model_configs[model_type]['model_name']
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name,
                    cache_dir=str(self.models_path),
                    use_fast=True
                )
                self._thread_local_tokenizers[cache_key] = tokenizer
                logger.debug(f"✅ Tokenizer thread-local créé: {cache_key}")
                return tokenizer
            except Exception as e:
                logger.error(f"❌ Erreur création tokenizer thread-local: {e}")
                return None
    
    async def _load_model(self, model_type: str):
        """Charge un modèle spécifique depuis local ou HuggingFace"""
        if model_type in self.models:
            return  # Déjà chargé
        
        config = self.model_configs[model_type]
        model_name = config['model_name']
        local_path = config['local_path']
        device = config['device']
        
        logger.info(f"📥 Chargement {model_type}: {model_name}")
        
        # Charger dans un thread pour éviter de bloquer
        def load_model():
            try:
                # Tokenizer
                tokenizer = AutoTokenizer.from_pretrained(
                    model_name, 
                    cache_dir=str(self.models_path),
                    use_fast=True,  # Tokenizer rapide
                    model_max_length=512  # Limiter la taille
                )
                
                # Modèle avec quantification
                # OPTIMISATION CPU: Utiliser float32 au lieu de float16 sur CPU pour éviter les erreurs
                # et améliorer la compatibilité. Sur CPU, float16 n'apporte pas d'accélération.
                dtype = torch.float32 if device == "cpu" else (
                    getattr(torch, self.quantization_level) if hasattr(torch, self.quantization_level) else torch.float32
                )
                
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    model_name,
                    cache_dir=str(self.models_path), 
                    torch_dtype=dtype,
                    low_cpu_mem_usage=True,  # Optimisation mémoire
                    device_map="auto" if device == "cuda" else None
                )
                
                # OPTIMISATION CPU: Mettre le modèle en mode eval pour désactiver dropout
                model.eval()
                
                # CORRECTION: Pas de pipeline partagé pour éviter "Already borrowed"
                # On crée les pipelines à la demande dans _ml_translate
                
                return tokenizer, model
                
            except Exception as e:
                logger.error(f"❌ Erreur chargement {model_type}: {e}")
                return None, None
        
        # Charger de manière asynchrone
        loop = asyncio.get_event_loop()
        tokenizer, model = await loop.run_in_executor(self.executor, load_model)
        
        if model and tokenizer:
            self.tokenizers[model_type] = tokenizer
            self.models[model_type] = model
            logger.info(f"✅ Modèle {model_type} chargé: {model_name}")
            if local_path.exists():
                logger.info(f"📁 Modèle disponible en local: {local_path}")
        else:
            raise Exception(f"Échec chargement {model_type}")
    
    async def translate(self, text: str, source_language: str = "auto", 
                       target_language: str = "en", model_type: str = "basic",
                       source_channel: str = "unknown") -> Dict[str, Any]:
        """
        Interface unique de traduction pour tous les canaux
        source_channel: 'zmq', 'rest', 'websocket'
        """
        start_time = time.time()
        
        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")
            
            # Vérifier que le service est initialisé
            if not self.is_initialized:
                logger.warning("Service ML non initialisé, utilisation du fallback")
                return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)
            
            # Fallback si modèle spécifique pas disponible  
            if model_type not in self.models:
                # Utiliser le premier modèle disponible
                available_models = list(self.models.keys())
                if available_models:
                    model_type = available_models[0]
                    logger.info(f"Modèle demandé non disponible, utilisation de: {model_type}")
                else:
                    return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)
            
            # Détecter la langue source si nécessaire
            detected_lang = source_language if source_language != "auto" else self._detect_language(text)
            
            # Traduire avec le vrai modèle ML
            translated_text = await self._ml_translate(text, detected_lang, target_language, model_type)
            
            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)
            
            result = {
                'translated_text': translated_text,
                'detected_language': detected_lang,
                'confidence': 0.95,  # Confiance élevée pour les vrais modèles
                'model_used': f"{model_type}_ml",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel
            }
            
            logger.info(f"✅ [ML-{source_channel.upper()}] '{text[:20]}...' → '{translated_text[:20]}...' ({processing_time:.3f}s)")
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction ML [{source_channel}]: {e}")
            # Fallback en cas d'erreur
            return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

    async def translate_with_structure(self, text: str, source_language: str = "auto",
                                      target_language: str = "en", model_type: str = "basic",
                                      source_channel: str = "unknown") -> Dict[str, Any]:
        """
        Traduction avec préservation de structure (paragraphes, emojis, sauts de ligne)

        Cette méthode segmente le texte, traduit chaque segment séparément,
        puis réassemble en préservant la structure originale

        AMÉLIORATION: Sélection automatique du modèle selon la longueur du texte
        """
        start_time = time.time()

        try:
            # Validation
            if not text.strip():
                raise ValueError("Text cannot be empty")

            # AMÉLIORATION: Sélection automatique du modèle selon la longueur
            # - Textes < 50 chars: basic (rapide)
            # - Textes >= 50 chars: medium (meilleure qualité)
            # - Textes >= 200 chars: premium si disponible (qualité maximale)
            text_length = len(text)
            original_model_type = model_type

            if text_length >= 200 and 'premium' in self.models:
                model_type = 'premium'
                logger.info(f"[STRUCTURED] Text length {text_length} chars → Using PREMIUM model for best quality")
            elif text_length >= 50 and 'medium' in self.models:
                model_type = 'medium'
                logger.info(f"[STRUCTURED] Text length {text_length} chars → Using MEDIUM model for better quality")
            elif model_type not in self.models and 'basic' in self.models:
                model_type = 'basic'
                logger.info(f"[STRUCTURED] Requested model not available → Using BASIC model")

            if model_type != original_model_type:
                logger.info(f"[STRUCTURED] Model switched: {original_model_type} → {model_type}")

            # Vérifier si le texte est court et sans structure complexe
            if len(text) <= 100 and '\n\n' not in text and not self.text_segmenter.extract_emojis(text)[1]:
                # Texte simple, utiliser la traduction standard
                logger.debug(f"[STRUCTURED] Text is simple, using standard translation")
                return await self.translate(text, source_language, target_language, model_type, source_channel)

            logger.info(f"[STRUCTURED] Starting structured translation: {len(text)} chars")

            # Vérifier que le service est initialisé
            if not self.is_initialized:
                logger.warning("Service ML non initialisé, utilisation du fallback")
                return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

            # Fallback si modèle spécifique pas disponible
            if model_type not in self.models:
                available_models = list(self.models.keys())
                if available_models:
                    model_type = available_models[0]
                    logger.info(f"Modèle demandé non disponible, utilisation de: {model_type}")
                else:
                    return await self._fallback_translate(text, source_language, target_language, model_type, source_channel)

            # Détecter la langue source si nécessaire
            detected_lang = source_language if source_language != "auto" else self._detect_language(text)

            # 1. Segmenter le texte (extraction emojis + découpage par paragraphes)
            segments, emojis_map = self.text_segmenter.segment_text(text)
            logger.info(f"[STRUCTURED] Text segmented into {len(segments)} parts with {len(emojis_map)} emojis")

            # XXX: PARALLÉLISATION OPPORTUNITÉ #1 - Traduction de segments indépendants
            # TODO: Les segments sont INDÉPENDANTS les uns des autres après segmentation
            # TODO: Chaque paragraphe/ligne peut être traduit en PARALLÈLE avec asyncio.gather()
            # TODO: Gains potentiels:
            #       - Pour 10 paragraphes de 100 chars chacun: 10x plus rapide
            #       - Pour 50 lignes de liste: 50x plus rapide (si GPU/CPU disponibles)
            #       - Limiter la concurrence selon les ressources: asyncio.Semaphore(max_concurrent=5)
            # TODO: Implémentation suggérée:
            #       async def translate_segment(segment):
            #           if segment['type'] == 'paragraph_break':
            #               return segment
            #           return await self._ml_translate(segment['text'], ...)
            #       
            #       tasks = [translate_segment(seg) for seg in segments]
            #       translated_segments = await asyncio.gather(*tasks)
            # TODO: Considérations:
            #       - Préserver l'ordre des segments (gather() le fait automatiquement)
            #       - Gérer les erreurs individuellement (return_exceptions=True)
            #       - Limiter la charge mémoire GPU avec Semaphore
            
            # 2. Traduire chaque segment (lignes uniquement, les séparateurs et code sont préservés)
            # XXX: ACTUELLEMENT SÉQUENTIEL - voir TODO ci-dessus pour parallélisation
            translated_segments = []
            for segment in segments:
                segment_type = segment['type']

                # Préserver les séparateurs, lignes vides et blocs de code
                if segment_type in ['paragraph_break', 'separator', 'empty_line', 'code']:
                    translated_segments.append(segment)
                    if segment_type == 'code':
                        logger.debug(f"[STRUCTURED] Code block preserved (not translated): {segment['text'][:50]}...")
                    continue

                # Traduire uniquement les lignes de texte normal
                if segment_type == 'line':
                    segment_text = segment['text']
                    if segment_text.strip():
                        try:
                            # Détecter les placeholders d'emojis AVANT traduction (nouveau format)
                            placeholders_before = re.findall(r'🔹EMOJI_\d+🔹', segment_text)

                            # AMÉLIORATION: Détecter la position des emojis (début, fin, milieu)
                            emoji_positions = {}
                            for placeholder in placeholders_before:
                                pos = segment_text.find(placeholder)
                                length = len(segment_text)

                                # Calculer si c'est au début, fin, ou milieu
                                # Début: dans les 10% premiers caractères OU juste après le premier mot
                                # Fin: dans les 10% derniers caractères OU juste avant la ponctuation finale
                                if pos <= max(3, length * 0.1):
                                    emoji_positions[placeholder] = 'start'
                                elif pos >= length - max(3, length * 0.1):
                                    emoji_positions[placeholder] = 'end'
                                else:
                                    # Vérifier si après un saut de ligne (début de ligne)
                                    if pos > 0 and segment_text[pos-1] == '\n':
                                        emoji_positions[placeholder] = 'line_start'
                                    # Vérifier si avant un saut de ligne (fin de ligne)
                                    elif pos + len(placeholder) < length and segment_text[pos + len(placeholder)] == '\n':
                                        emoji_positions[placeholder] = 'line_end'
                                    else:
                                        emoji_positions[placeholder] = ('middle', pos / length)

                            logger.debug(f"[STRUCTURED] Emoji positions mapped: {emoji_positions}")

                            translated = await self._ml_translate(
                                segment_text,
                                detected_lang,
                                target_language,
                                model_type
                            )

                            # VÉRIFICATION CRITIQUE: Détecter les placeholders APRÈS traduction
                            placeholders_after = re.findall(r'🔹EMOJI_\d+🔹', translated)

                            # Comparer les placeholders avant/après
                            if len(placeholders_before) != len(placeholders_after):
                                logger.error(f"[STRUCTURED] ❌ EMOJI PLACEHOLDERS LOST during translation!")
                                logger.error(f"    Before: {placeholders_before}")
                                logger.error(f"    After:  {placeholders_after}")
                                logger.error(f"    Original: '{segment_text}'")
                                logger.error(f"    Translated: '{translated}'")

                                # AMÉLIORATION: Réinjecter les placeholders selon leur position d'origine
                                missing_placeholders = set(placeholders_before) - set(placeholders_after)
                                if missing_placeholders:
                                    logger.warning(f"[STRUCTURED] ⚠️  Attempting to restore {len(missing_placeholders)} lost placeholders")

                                    for placeholder in missing_placeholders:
                                        position_type = emoji_positions.get(placeholder, 'middle')

                                        if position_type == 'start':
                                            # Emoji était au tout début → remettre au début
                                            translated = placeholder + ' ' + translated.lstrip()
                                            logger.info(f"[STRUCTURED] ✅ Restored {placeholder} at START (sentence beginning)")

                                        elif position_type == 'end':
                                            # Emoji était à la toute fin → remettre à la fin
                                            translated = translated.rstrip() + ' ' + placeholder
                                            logger.info(f"[STRUCTURED] ✅ Restored {placeholder} at END (sentence ending)")

                                        elif position_type == 'line_start':
                                            # Emoji était au début d'une ligne → chercher un \n et insérer après
                                            newline_pos = translated.find('\n')
                                            if newline_pos >= 0:
                                                translated = translated[:newline_pos+1] + placeholder + ' ' + translated[newline_pos+1:]
                                            else:
                                                translated = placeholder + ' ' + translated
                                            logger.info(f"[STRUCTURED] ✅ Restored {placeholder} at LINE_START")

                                        elif position_type == 'line_end':
                                            # Emoji était à la fin d'une ligne → chercher un \n et insérer avant
                                            newline_pos = translated.find('\n')
                                            if newline_pos >= 0:
                                                translated = translated[:newline_pos] + ' ' + placeholder + translated[newline_pos:]
                                            else:
                                                translated = translated + ' ' + placeholder
                                            logger.info(f"[STRUCTURED] ✅ Restored {placeholder} at LINE_END")

                                        else:
                                            # Milieu - utiliser le ratio
                                            _, ratio = position_type if isinstance(position_type, tuple) else ('middle', 0.5)
                                            insert_pos = int(len(translated) * ratio)
                                            # S'assurer d'insérer à un espace pour éviter de couper un mot
                                            space_pos = translated.find(' ', insert_pos)
                                            if space_pos > 0 and (space_pos - insert_pos) < 10:
                                                insert_pos = space_pos + 1
                                            translated = translated[:insert_pos] + placeholder + ' ' + translated[insert_pos:]
                                            logger.info(f"[STRUCTURED] ✅ Restored {placeholder} at MIDDLE position {insert_pos}")

                            translated_segments.append({
                                'text': translated,
                                'type': segment['type'],
                                'index': segment['index']
                            })
                            seg_type_label = "PARAGRAPH" if segment_type == 'paragraph' else ("LIST ITEM" if segment_type == 'list_item' else ("LINE" if segment_type == 'line' else "SENTENCE"))
                            logger.debug(f"[STRUCTURED] {seg_type_label} {segment['index']} translated: '{segment_text[:30]}...' → '{translated[:30]}...'")
                        except Exception as e:
                            logger.error(f"[STRUCTURED] Error translating {segment_type} {segment['index']}: {e}")
                            # En cas d'erreur, garder le texte original
                            translated_segments.append(segment)
                    else:
                        # Texte vide (ne devrait pas arriver)
                        translated_segments.append(segment)

            # 3. Réassembler le texte traduit
            final_text = self.text_segmenter.reassemble_text(translated_segments, emojis_map)

            processing_time = time.time() - start_time
            self._update_stats(processing_time, source_channel)

            result = {
                'translated_text': final_text,
                'detected_language': detected_lang,
                'confidence': 0.95,
                'model_used': f"{model_type}_ml_structured",
                'from_cache': False,
                'processing_time': processing_time,
                'source_channel': source_channel,
                'segments_count': len(segments),
                'emojis_count': len(emojis_map)
            }

            logger.info(f"✅ [ML-STRUCTURED-{source_channel.upper()}] {len(text)}→{len(final_text)} chars, {len(segments)} segments, {len(emojis_map)} emojis ({processing_time:.3f}s)")
            return result

        except Exception as e:
            logger.error(f"❌ Erreur traduction structurée [{source_channel}]: {e}")
            # Fallback vers traduction standard en cas d'erreur
            return await self.translate(text, source_language, target_language, model_type, source_channel)

    async def _ml_translate(self, text: str, source_lang: str, target_lang: str, model_type: str) -> str:
        """
        Traduction avec le vrai modèle ML - tokenizers thread-local pour éviter 'Already borrowed'
        
        XXX: PARALLÉLISATION OPPORTUNITÉ #2 - Traduction batch pour multiples segments
        TODO: Cette méthode pourrait accepter une LISTE de textes au lieu d'un seul
        TODO: Avantages du batch processing:
              - Réduire l'overhead de création de pipeline (1 fois au lieu de N fois)
              - Utiliser batch_size optimal du modèle (traiter 8-16 segments à la fois)
              - Meilleure utilisation GPU/CPU (pas de temps mort entre segments)
        TODO: Signature suggérée:
              async def _ml_translate_batch(
                  self, 
                  texts: List[str], 
                  source_lang: str, 
                  target_lang: str, 
                  model_type: str
              ) -> List[str]:
                  # Créer pipeline UNE fois
                  # Traduire tous les textes en batch_size chunks
                  # Retourner résultats dans le même ordre
        TODO: Gains attendus:
              - 3-5x plus rapide pour 10+ segments
              - Réduction de 70% du temps de setup (pipeline creation)
              - Meilleure utilisation mémoire GPU
        """
        try:
            if model_type not in self.models:
                raise Exception(f"Modèle {model_type} non chargé")
            
            # CORRECTION: Sauvegarder le model_name original pour éviter les collisions dans la boucle de fallback
            original_model_name = self.model_configs[model_type]['model_name']
            
            # Traduction dans un thread - OPTIMISATION: tokenizer thread-local caché
            def translate():
                try:
                    from transformers import pipeline
                    import threading
                    
                    # Modèle partagé (thread-safe en lecture)
                    shared_model = self.models[model_type]
                    
                    # OPTIMISATION: Utiliser le tokenizer thread-local caché (évite recréation)
                    thread_tokenizer = self._get_thread_local_tokenizer(model_type)
                    if thread_tokenizer is None:
                        raise Exception(f"Impossible d'obtenir le tokenizer pour {model_type}")
                    
                    # Différencier T5 et NLLB avec pipelines appropriés
                    if "t5" in original_model_name.lower():
                        # T5: utiliser text2text-generation avec tokenizer thread-local
                        # OPTIMISATION CPU: Réduire max_length pour accélérer les inférences
                        temp_pipeline = pipeline(
                            "text2text-generation",
                            model=shared_model,
                            tokenizer=thread_tokenizer,  # ← TOKENIZER THREAD-LOCAL
                            device=0 if self.device == 'cuda' and torch.cuda.is_available() else -1,
                            max_length=256,  # Augmenté pour traductions de qualité
                            batch_size=8  # Optimisé pour multicore AMD
                        )
                        
                        # T5: format avec noms complets de langues
                        source_name = self.language_names.get(source_lang, source_lang.capitalize())
                        target_name = self.language_names.get(target_lang, target_lang.capitalize())
                        instruction = f"translate {source_name} to {target_name}: {text}"
                        
                        logger.debug(f"T5 instruction: {instruction}")
                        
                        # OPTIMISATION MULTICORE: Paramètres optimisés pour AMD 18 cores
                        # num_beams=4 pour qualité avec multicore
                        result = temp_pipeline(
                            instruction,
                            max_new_tokens=256,  # Augmenté pour traductions complètes
                            num_beams=4,  # Équilibre qualité/vitesse
                            do_sample=False,
                            early_stopping=True,
                            repetition_penalty=1.1,
                            length_penalty=1.0
                        )
                        
                        # T5 retourne generated_text
                        t5_success = False
                        translated = None  # CORRECTION: Initialiser translated pour éviter UnboundLocalError
                        if result and len(result) > 0 and 'generated_text' in result[0]:
                            raw_text = result[0]['generated_text']
                            
                            # Nettoyer l'instruction si présente dans le résultat
                            instruction_prefix = f"translate {source_name} to {target_name}:"
                            if instruction_prefix in raw_text:
                                parts = raw_text.split(instruction_prefix, 1)
                                if len(parts) > 1:
                                    translated = parts[1].strip()
                                else:
                                    translated = raw_text.strip()
                            else:
                                translated = raw_text.strip()
                                
                            # Validation: vérifier si T5 a vraiment traduit (pas juste répété l'instruction)
                            # Rejeter SEULEMENT si:
                            # 1. Vide
                            # 2. Identique à l'original
                            # 3. Contient l'instruction complète T5 (ex: "translate French to Spanish:")
                            has_instruction = f"translate {source_name} to {target_name}:" in translated.lower()
                            
                            if not translated or translated.lower() == text.lower() or has_instruction:
                                logger.warning(f"T5 traduction invalide: '{translated}', fallback vers NLLB")
                                t5_success = False
                            else:
                                t5_success = True
                                
                        # Si T5 échoue, fallback automatique vers NLLB
                        if not t5_success:
                            logger.info(f"Fallback : T5 → NLLB {source_lang}→{target_lang}")
                            # Nettoyer le pipeline T5 (tokenizer reste en cache)
                            del temp_pipeline
                            
                            # CORRECTION: Chercher un modèle NLLB parmi les modèles chargés
                            # Les clés sont 'basic', 'medium', 'premium', pas les noms de modèles
                            nllb_model_type = None
                            nllb_model_name = None
                            
                            # Chercher medium ou premium (qui sont des modèles NLLB)
                            # CORRECTION: Utiliser un nom de variable différent pour éviter la collision
                            for fallback_model_type in ['medium', 'premium']:
                                if fallback_model_type in self.models:
                                    config = self.model_configs.get(fallback_model_type, {})
                                    fallback_model_name = config.get('model_name', '')
                                    if 'nllb' in fallback_model_name.lower():
                                        nllb_model_type = fallback_model_type
                                        nllb_model_name = fallback_model_name
                                        break
                            
                            if nllb_model_type is None:
                                logger.warning(f"Modèle NLLB non chargé, impossible de faire le fallback")
                                translated = f"[Translation-Failed] {text}"
                            else:
                                nllb_model = self.models[nllb_model_type]
                                # OPTIMISATION: Utiliser tokenizer thread-local caché
                                nllb_tokenizer = self._get_thread_local_tokenizer(nllb_model_type)
                                if nllb_tokenizer is None:
                                    logger.warning(f"Impossible d'obtenir tokenizer NLLB")
                                    translated = f"[Translation-Failed] {text}"
                                    return translated
                                
                                # OPTIMISATION MULTICORE: Paramètres optimisés pour AMD 18 cores
                                nllb_pipeline = pipeline(
                                    "translation",
                                    model=nllb_model,
                                    tokenizer=nllb_tokenizer,
                                    device=0 if self.device == 'cuda' and torch.cuda.is_available() else -1,
                                    max_length=512,  # Augmenté pour qualité
                                    batch_size=8  # Optimisé pour multicore
                                )
                                
                                nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                                nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')
                                
                                nllb_result = nllb_pipeline(
                                    text, 
                                    src_lang=nllb_source, 
                                    tgt_lang=nllb_target, 
                                    max_length=512,  # Augmenté pour qualité
                                    num_beams=4,  # Équilibre qualité/vitesse
                                    early_stopping=True
                                )
                                
                                if nllb_result and len(nllb_result) > 0 and 'translation_text' in nllb_result[0]:
                                    translated = nllb_result[0]['translation_text']
                                    logger.info(f"✅ Fallback NLLB réussi: '{text}' → '{translated}'")
                                else:
                                    translated = f"[NLLB-Fallback-Failed] {text}"
                                
                                # Nettoyer le pipeline (tokenizer reste en cache)
                                del nllb_pipeline
                            
                            return translated
                            
                    else:
                        # NLLB: utiliser translation avec tokenizer thread-local
                        # OPTIMISATION MULTICORE: Paramètres optimisés pour AMD 18 cores
                        temp_pipeline = pipeline(
                            "translation",
                            model=shared_model,
                            tokenizer=thread_tokenizer,  # ← TOKENIZER THREAD-LOCAL
                            device=0 if self.device == 'cuda' and torch.cuda.is_available() else -1,
                            max_length=512,  # Augmenté pour qualité
                            batch_size=8  # Optimisé pour multicore
                        )
                        
                        # NLLB: codes de langue spéciaux
                        nllb_source = self.lang_codes.get(source_lang, 'eng_Latn')
                        nllb_target = self.lang_codes.get(target_lang, 'fra_Latn')
                        
                        # OPTIMISATION MULTICORE: Paramètres optimisés pour qualité et vitesse
                        result = temp_pipeline(
                            text, 
                            src_lang=nllb_source, 
                            tgt_lang=nllb_target, 
                            max_length=512,  # Augmenté pour qualité
                            num_beams=4,  # Équilibre qualité/vitesse sur multicore
                            early_stopping=True
                        )
                        
                        # NLLB retourne translation_text
                        if result and len(result) > 0 and 'translation_text' in result[0]:
                            translated = result[0]['translation_text']
                        else:
                            translated = f"[NLLB-No-Result] {text}"
                    
                    # Nettoyer tokenizer et pipeline temporaires
                    del thread_tokenizer
                    del temp_pipeline
                    
                    return translated
                    
                except Exception as e:
                    logger.error(f"Erreur pipeline {original_model_name}: {e}")
                    return f"[ML-Pipeline-Error] {text}"
            
            # Exécuter de manière asynchrone
            loop = asyncio.get_event_loop()
            translated = await loop.run_in_executor(self.executor, translate)
            
            return translated
            
        except Exception as e:
            logger.error(f"❌ Erreur modèle ML {model_type}: {e}")
            return f"[ML-Error] {text}"
    
    def _detect_language(self, text: str) -> str:
        """Détection de langue simple"""
        text_lower = text.lower()
        
        # Mots caractéristiques par langue
        if any(word in text_lower for word in ['bonjour', 'comment', 'vous', 'merci', 'salut']):
            return 'fr'
        elif any(word in text_lower for word in ['hello', 'how', 'you', 'thank', 'hi']):
            return 'en'
        elif any(word in text_lower for word in ['hola', 'como', 'estas', 'gracias']):
            return 'es'
        elif any(word in text_lower for word in ['guten', 'wie', 'geht', 'danke', 'hallo']):
            return 'de'
        else:
            return 'en'  # Défaut
    
    async def _fallback_translate(self, text: str, source_lang: str, target_lang: str, 
                                 model_type: str, source_channel: str) -> Dict[str, Any]:
        """Traduction de fallback si ML non disponible"""
        logger.warning(f"Utilisation du fallback pour {model_type} [{source_channel}]")
        
        # Dictionnaire simple comme fallback
        translations = {
            ('fr', 'en'): {
                'bonjour': 'hello', 'comment': 'how', 'vous': 'you', 'allez': 'are',
                'êtes': 'are', 'tout': 'all', 'le': 'the', 'monde': 'world'
            },
            ('en', 'fr'): {
                'hello': 'bonjour', 'how': 'comment', 'you': 'vous', 'are': 'êtes',
                'all': 'tout', 'the': 'le', 'world': 'monde'
            },
            ('es', 'fr'): {
                'hola': 'bonjour', 'como': 'comment', 'estas': 'allez-vous'
            },
            ('en', 'de'): {
                'hello': 'hallo', 'how': 'wie', 'are': 'sind', 'you': 'sie'
            }
        }
        
        # Traduction simple mot par mot
        lang_pair = (source_lang, target_lang)
        if lang_pair in translations:
            words = text.lower().split()
            translated_words = []
            for word in words:
                translated_word = translations[lang_pair].get(word, word)
                translated_words.append(translated_word)
            translated_text = ' '.join(translated_words)
        else:
            translated_text = f"[FALLBACK-{source_lang}→{target_lang}] {text}"
        
        self._update_stats(0.001, source_channel)
        
        return {
            'translated_text': translated_text,
            'detected_language': source_lang,
            'confidence': 0.3,  # Faible confiance pour fallback
            'model_used': f"{model_type}_fallback",
            'from_cache': False,
            'processing_time': 0.001,
            'source_channel': source_channel
        }
    
    def _update_stats(self, processing_time: float, source_channel: str):
        """Met à jour les statistiques globales"""
        self.stats['translations_count'] += 1
        
        # Mettre à jour les stats par canal (canaux connus seulement)
        if source_channel in ['zmq', 'rest', 'websocket']:
            self.stats[f'{source_channel}_translations'] += 1
        
        self.request_times.append(processing_time)
        
        if len(self.request_times) > 200:
            self.request_times = self.request_times[-200:]
        
        if self.request_times:
            self.stats['avg_processing_time'] = sum(self.request_times) / len(self.request_times)
    
    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques globales du service"""
        return {
            'service_type': 'unified_ml',
            'is_singleton': True,
            'translations_count': self.stats['translations_count'],
            'zmq_translations': self.stats['zmq_translations'],
            'rest_translations': self.stats['rest_translations'], 
            'websocket_translations': self.stats['websocket_translations'],
            'avg_processing_time': self.stats['avg_processing_time'],
            'models_loaded': {
                model_type: {
                    'name': self.model_configs[model_type]['model_name'],
                    'description': self.model_configs[model_type]['description'],
                    'local_path': str(self.model_configs[model_type]['local_path']),
                    'is_local': self.model_configs[model_type]['local_path'].exists()
                } for model_type in self.models.keys()
            },
            'ml_available': ML_AVAILABLE,
            'is_initialized': self.is_initialized,
            'startup_time': self.stats['startup_time'],
            'supported_languages': list(self.lang_codes.keys()),
            'models_path': str(self.models_path),
            'device': self.device
        }
    
    async def get_health(self) -> Dict[str, Any]:
        """Health check du service unifié"""
        return {
            'status': 'healthy' if self.is_initialized else 'initializing',
            'models_count': len(self.models),
            'pipelines_count': len(self.pipelines),
            'ml_available': ML_AVAILABLE,
            'translations_served': self.stats['translations_count']
        }

# Instance globale du service (Singleton)
def get_unified_ml_service(max_workers: int = 4) -> TranslationMLService:
    """Retourne l'instance unique du service ML"""
    return TranslationMLService(get_settings(), max_workers=max_workers)
