"""
Utilitaires pour la gestion des modèles ML
- Vérification de l'existence locale des modèles
- Téléchargement intelligent des modèles
- Gestion du cache HuggingFace
"""

import os
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from huggingface_hub import snapshot_download, HfApi
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch

logger = logging.getLogger(__name__)

class ModelManager:
    """Gestionnaire intelligent des modèles ML"""
    
    def __init__(self, models_path: str):
        self.models_path = Path(models_path)
        self.models_path.mkdir(parents=True, exist_ok=True)
        self.api = HfApi()
        
    def get_model_local_path(self, model_name: str) -> Path:
        """Retourne le chemin local d'un modèle"""
        # Convertir le nom du modèle en chemin de répertoire
        model_dir = model_name.replace('/', '_')
        return self.models_path / model_dir
    
    def is_model_downloaded(self, model_name: str) -> bool:
        """Vérifie si un modèle est téléchargé localement"""
        # Essayer différents formats de noms de répertoires
        possible_paths = [
            self.get_model_local_path(model_name),  # facebook_nllb-200-distilled-600M
            self.models_path / model_name.split('/')[-1],  # nllb-200-distilled-600M
            self.models_path / model_name.replace('/', '_'),  # facebook_nllb-200-distilled-600M
        ]
        
        for local_path in possible_paths:
            if self._check_model_files(local_path):
                logger.info(f"✅ Modèle {model_name} trouvé localement: {local_path}")
                return True
        
        logger.debug(f"❌ Modèle {model_name} non trouvé dans les chemins: {[str(p) for p in possible_paths]}")
        return False
    
    def _check_model_files(self, local_path: Path) -> bool:
        """Vérifie si un répertoire contient tous les fichiers nécessaires"""
        if not local_path.exists() or not local_path.is_dir():
            return False
        
        # Vérifier les fichiers essentiels
        required_files = [
            'config.json',
            'pytorch_model.bin',  # ou plusieurs fichiers .safetensors
            'tokenizer.json',
            'tokenizer_config.json'
        ]
        
        # Vérifier aussi les fichiers .safetensors (format moderne)
        safetensors_files = list(local_path.glob('*.safetensors'))
        
        # Si on a des .safetensors, on n'a pas besoin de pytorch_model.bin
        if safetensors_files:
            required_files.remove('pytorch_model.bin')
        
        for file_name in required_files:
            file_path = local_path / file_name
            if not file_path.exists():
                logger.debug(f"❌ Fichier manquant: {file_path}")
                return False
        
        return True
    
    def get_model_info(self, model_name: str) -> Optional[Dict]:
        """Récupère les informations d'un modèle depuis HuggingFace"""
        try:
            model_info = self.api.model_info(model_name)
            
            # Extraire la taille de manière sécurisée
            size = 0
            try:
                if hasattr(model_info, 'safetensors') and model_info.safetensors:
                    size = model_info.safetensors.get('total', 0)
                elif hasattr(model_info, 'pytorch') and model_info.pytorch:
                    size = model_info.pytorch.get('total', 0)
                elif hasattr(model_info, 'model_size'):
                    size = model_info.model_size
            except Exception:
                size = 0
            
            return {
                'id': getattr(model_info, 'id', model_name),
                'downloads': getattr(model_info, 'downloads', 0),
                'likes': getattr(model_info, 'likes', 0),
                'size': size,
                'tags': getattr(model_info, 'tags', []) or []
            }
        except Exception as e:
            logger.warning(f"⚠️ Impossible de récupérer les infos pour {model_name}: {e}")
            # Retourner des informations par défaut
            return {
                'id': model_name,
                'downloads': 0,
                'likes': 0,
                'size': 0,
                'tags': []
            }
    
    def download_model_if_needed(self, model_name: str, force_download: bool = False) -> bool:
        """Télécharge un modèle seulement s'il n'existe pas localement avec retry après 3 timeouts"""
        if not force_download and self.is_model_downloaded(model_name):
            logger.info(f"📁 Modèle {model_name} déjà présent localement")
            return True
        
        # Configuration des retries depuis les variables d'environnement
        max_retries = int(os.getenv('MODEL_DOWNLOAD_MAX_RETRIES', '3'))
        timeout_seconds = int(os.getenv('MODEL_DOWNLOAD_TIMEOUT', '300'))  # 5 minutes par défaut
        consecutive_timeout_limit = int(os.getenv('MODEL_DOWNLOAD_CONSECUTIVE_TIMEOUTS', '3'))
        
        consecutive_timeouts = 0
        total_attempts = 0
        
        while total_attempts < max_retries:
            total_attempts += 1
            try:
                logger.info(f"📥 Téléchargement du modèle {model_name} (tentative {total_attempts}/{max_retries})...")
                
                # Utiliser snapshot_download pour un téléchargement complet
                local_path = self.get_model_local_path(model_name)
                
                # Créer le répertoire si nécessaire
                local_path.mkdir(parents=True, exist_ok=True)
                
                # Télécharger le modèle avec timeout configurable
                snapshot_download(
                    repo_id=model_name,
                    local_dir=str(local_path),
                    local_dir_use_symlinks=False,  # Copier les fichiers
                    resume_download=True,  # Reprendre si interrompu
                    timeout=timeout_seconds
                )
                
                logger.info(f"✅ Modèle {model_name} téléchargé avec succès après {total_attempts} tentative(s)")
                return True
                
            except Exception as e:
                error_msg = str(e).lower()
                
                # Détecter les timeouts spécifiquement
                is_timeout = any(timeout_indicator in error_msg for timeout_indicator in [
                    'timeout', 'timed out', 'connection timed out', 'read timeout'
                ])
                
                if is_timeout:
                    consecutive_timeouts += 1
                    logger.warning(f"⏰ Timeout lors du téléchargement de {model_name} (timeout {consecutive_timeouts}/{consecutive_timeout_limit})")
                    
                    # Si on a atteint la limite de timeouts consécutifs, on échoue
                    if consecutive_timeouts >= consecutive_timeout_limit:
                        logger.error(f"❌ Échec du téléchargement de {model_name} après {consecutive_timeouts} timeouts consécutifs")
                        return False
                    
                    # Attendre avant de réessayer (backoff exponentiel)
                    wait_time = min(30 * (2 ** (consecutive_timeouts - 1)), 300)  # Max 5 minutes
                    logger.info(f"⏳ Attente de {wait_time} secondes avant nouvelle tentative...")
                    import time
                    time.sleep(wait_time)
                else:
                    # Réinitialiser le compteur de timeouts pour les autres types d'erreurs
                    consecutive_timeouts = 0
                    logger.error(f"❌ Erreur téléchargement {model_name} (tentative {total_attempts}): {e}")
                    
                    # Pour les erreurs non-timeout, on peut réessayer immédiatement
                    if total_attempts < max_retries:
                        logger.info(f"🔄 Nouvelle tentative dans 5 secondes...")
                        import time
                        time.sleep(5)
        
        logger.error(f"❌ Échec définitif du téléchargement de {model_name} après {max_retries} tentatives")
        return False
    
    def load_model_locally(self, model_name: str, quantization_level: str = "float16") -> Tuple[AutoModelForSeq2SeqLM, AutoTokenizer]:
        """Charge un modèle depuis le stockage local"""
        local_path = self.get_model_local_path(model_name)
        
        if not self.is_model_downloaded(model_name):
            raise FileNotFoundError(f"Modèle {model_name} non trouvé localement: {local_path}")
        
        logger.info(f"🔄 Chargement local du modèle {model_name}")
        
        # Configuration de base
        base_config = {
            'local_files_only': True,  # Forcer l'utilisation locale
            'trust_remote_code': True
        }
        
        # Configuration de quantification
        if quantization_level == "float16":
            base_config['torch_dtype'] = torch.float16
        elif quantization_level == "int8":
            # Charger d'abord en float32 puis quantifier
            base_config['torch_dtype'] = torch.float32
        else:
            base_config['torch_dtype'] = torch.float32
        
        # Charger le tokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            str(local_path),
            local_files_only=True,
            trust_remote_code=True
        )
        
        # Charger le modèle
        model = AutoModelForSeq2SeqLM.from_pretrained(
            str(local_path),
            **base_config
        )
        
        # Quantification int8 si demandée
        if quantization_level == "int8":
            try:
                model = torch.quantization.quantize_dynamic(
                    model, {torch.nn.Linear}, dtype=torch.qint8
                )
                logger.info(f"✅ Modèle {model_name} quantifié en int8")
            except Exception as e:
                logger.warning(f"⚠️ Quantification int8 échouée pour {model_name}: {e}")
        
        logger.info(f"✅ Modèle {model_name} chargé localement")
        return model, tokenizer
    
    def get_models_status(self, model_names: List[str]) -> Dict[str, Dict]:
        """Retourne le statut de plusieurs modèles"""
        status = {}
        
        for model_name in model_names:
            is_local = self.is_model_downloaded(model_name)
            info = self.get_model_info(model_name)
            
            status[model_name] = {
                'local': is_local,
                'path': str(self.get_model_local_path(model_name)),
                'info': info,
                'size_mb': info.get('size', 0) / (1024 * 1024) if info else 0
            }
        
        return status
    
    def cleanup_incomplete_downloads(self) -> int:
        """Nettoie les téléchargements incomplets"""
        cleaned = 0
        
        for model_dir in self.models_path.iterdir():
            if not model_dir.is_dir():
                continue
                
            # Vérifier si le répertoire contient un téléchargement complet
            if not self.is_model_downloaded(model_dir.name.replace('_', '/')):
                try:
                    import shutil
                    shutil.rmtree(model_dir)
                    logger.info(f"🧹 Nettoyage répertoire incomplet: {model_dir}")
                    cleaned += 1
                except Exception as e:
                    logger.warning(f"⚠️ Erreur nettoyage {model_dir}: {e}")
        
        return cleaned

def create_model_manager(models_path: str) -> ModelManager:
    """Factory pour créer un gestionnaire de modèles"""
    return ModelManager(models_path)
