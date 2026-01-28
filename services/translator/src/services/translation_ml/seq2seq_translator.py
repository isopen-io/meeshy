"""
Wrapper générique pour modèles Seq2Seq de traduction
Supporte: NLLB, T5, mT5, mBART, et autres modèles similaires
"""

import logging
from typing import List, Union, Dict, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class ModelType(Enum):
    """Types de modèles supportés"""
    NLLB = "nllb"          # Meta's No Language Left Behind
    T5 = "t5"              # Google's T5
    MT5 = "mt5"            # Multilingual T5
    MBART = "mbart"        # Facebook's mBART
    UNKNOWN = "unknown"    # Modèle inconnu (mode auto-détection)


class Seq2SeqTranslator:
    """
    Wrapper générique pour modèles Seq2Seq de traduction

    Supporte automatiquement différents types de modèles:
    - NLLB: utilise forced_bos_token_id avec codes comme "eng_Latn"
    - T5/mT5: utilise des préfixes comme "translate English to French: {text}"
    - mBART: similaire à NLLB avec des codes spécifiques

    Auto-détecte le type de modèle depuis model.config
    """

    def __init__(
        self,
        model,
        tokenizer,
        src_lang: str,
        tgt_lang: str,
        device: int = -1,
        max_length: int = 512,
        batch_size: int = 8,
        model_type: Optional[ModelType] = None
    ):
        """
        Initialise le wrapper Seq2Seq

        Args:
            model: AutoModelForSeq2SeqLM instance
            tokenizer: AutoTokenizer instance
            src_lang: Code langue source (format dépend du modèle)
            tgt_lang: Code langue cible (format dépend du modèle)
            device: Device (-1 pour CPU, 0 pour GPU)
            max_length: Longueur maximale de génération
            batch_size: Taille du batch
            model_type: Type de modèle (auto-détecté si None)
        """
        self.model = model
        self.tokenizer = tokenizer
        self.src_lang = src_lang
        self.tgt_lang = tgt_lang
        self.device = device
        self.max_length = max_length
        self.batch_size = batch_size

        # Auto-détection du type de modèle
        self.model_type = model_type or self._detect_model_type()

        # Configurer le device du modèle
        self._setup_device()

        # Configurer la stratégie de traduction selon le modèle
        self._setup_translation_strategy()

        logger.info(
            f"✅ Seq2SeqTranslator créé: {self.model_type.value} "
            f"({src_lang} → {tgt_lang})"
        )

    def _detect_model_type(self) -> ModelType:
        """
        Détecte automatiquement le type de modèle

        Returns:
            ModelType détecté
        """
        model_name = self.model.config.model_type.lower()

        # NLLB utilise l'architecture M2M_100 (Many-to-Many 100)
        if "nllb" in model_name or "m2m_100" in model_name or "m2m100" in model_name:
            return ModelType.NLLB
        elif "mt5" in model_name:
            return ModelType.MT5
        elif "t5" in model_name:
            return ModelType.T5
        elif "mbart" in model_name:
            return ModelType.MBART
        else:
            logger.warning(f"⚠️  Type de modèle inconnu: {model_name}, mode auto")
            return ModelType.UNKNOWN

    def _setup_device(self):
        """Configure le device (CPU/GPU)"""
        if self.device >= 0:
            try:
                import torch
                if torch.cuda.is_available():
                    self.model = self.model.to(f'cuda:{self.device}')
                    logger.info(f"✅ Modèle déplacé vers GPU {self.device}")
            except Exception as e:
                logger.warning(f"⚠️  Impossible d'utiliser GPU, fallback CPU: {e}")

    def _setup_translation_strategy(self):
        """
        Configure la stratégie de traduction selon le type de modèle
        """
        if self.model_type == ModelType.NLLB:
            self._setup_nllb()
        elif self.model_type == ModelType.MBART:
            self._setup_mbart()
        elif self.model_type in [ModelType.T5, ModelType.MT5]:
            self._setup_t5()
        else:
            # Mode auto: essayer NLLB par défaut
            logger.warning("⚠️  Mode auto: tentative stratégie NLLB")
            self._setup_nllb()

    def _setup_nllb(self):
        """Configure pour NLLB"""
        # NLLB utilise src_lang dans le tokenizer
        self.tokenizer.src_lang = self.src_lang

        # Et forced_bos_token_id pour la langue cible
        self.forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(self.tgt_lang)

        logger.info(
            f"🔧 Stratégie NLLB: forced_bos_token_id={self.forced_bos_token_id}"
        )

    def _setup_mbart(self):
        """Configure pour mBART"""
        # mBART est similaire à NLLB
        self.tokenizer.src_lang = self.src_lang
        self.forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(self.tgt_lang)

        logger.info(
            f"🔧 Stratégie mBART: forced_bos_token_id={self.forced_bos_token_id}"
        )

    def _setup_t5(self):
        """Configure pour T5/mT5"""
        # T5 utilise des préfixes comme "translate English to French: {text}"
        self.prefix = f"translate {self.src_lang} to {self.tgt_lang}: "
        self.forced_bos_token_id = None

        logger.info(f"🔧 Stratégie T5: prefix='{self.prefix}'")

    def _preprocess_text(self, text: str) -> str:
        """
        Prétraite le texte selon le type de modèle

        Args:
            text: Texte brut

        Returns:
            Texte prétraité pour le modèle
        """
        if self.model_type in [ModelType.T5, ModelType.MT5]:
            # T5 nécessite un préfixe
            return self.prefix + text
        else:
            # NLLB, mBART: pas de préfixe
            return text

    def _preprocess_texts(self, texts: List[str]) -> List[str]:
        """Prétraite une liste de textes"""
        return [self._preprocess_text(text) for text in texts]

    def __call__(
        self,
        texts: Union[str, List[str]],
        src_lang: str = None,
        tgt_lang: str = None,
        max_length: int = None,
        num_beams: int = 1,
        do_sample: bool = False,
        **kwargs
    ) -> Union[Dict, List[Dict]]:
        """
        Traduit un ou plusieurs textes

        Args:
            texts: Texte unique ou liste de textes
            src_lang: Langue source (override de l'init)
            tgt_lang: Langue cible (override de l'init)
            max_length: Longueur max (override de l'init)
            num_beams: Nombre de beams pour la génération
            do_sample: Activer le sampling
            **kwargs: Autres paramètres pour generate()

        Returns:
            Dict ou List[Dict] avec clé 'translation_text'
        """
        # Gérer le cas d'un seul texte
        single_text = isinstance(texts, str)
        if single_text:
            texts = [texts]

        # Utiliser langues de l'init si non spécifiées
        src_lang = src_lang or self.src_lang
        tgt_lang = tgt_lang or self.tgt_lang
        max_length = max_length or self.max_length

        # Mettre à jour la stratégie si langues changent
        if src_lang != self.src_lang or tgt_lang != self.tgt_lang:
            self.src_lang = src_lang
            self.tgt_lang = tgt_lang
            self._setup_translation_strategy()

        # Prétraiter les textes selon le modèle
        preprocessed_texts = self._preprocess_texts(texts)

        # Tokeniser les textes
        inputs = self.tokenizer(
            preprocessed_texts,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=self.max_length
        )

        # Déplacer vers device si GPU
        if self.device >= 0:
            try:
                import torch
                if torch.cuda.is_available():
                    inputs = {k: v.to(f'cuda:{self.device}') for k, v in inputs.items()}
            except Exception:
                pass

        # Préparer les arguments de génération
        generate_kwargs = {
            'max_length': max_length,
            'num_beams': num_beams,
            'do_sample': do_sample,
            **kwargs
        }

        # Ajouter forced_bos_token_id pour NLLB/mBART
        if self.forced_bos_token_id is not None:
            generate_kwargs['forced_bos_token_id'] = self.forced_bos_token_id

        # Générer les traductions
        outputs = self.model.generate(**inputs, **generate_kwargs)

        # Décoder les résultats
        translations = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)

        # Formater comme pipeline transformers (pour compatibilité)
        results = [{'translation_text': t} for t in translations]

        # Retourner format unique si texte unique
        if single_text:
            return results[0]

        return results

    def get_model_info(self) -> Dict:
        """
        Retourne les informations sur le modèle

        Returns:
            Dict avec infos du modèle
        """
        return {
            'model_type': self.model_type.value,
            'model_name': self.model.config.model_type,
            'src_lang': self.src_lang,
            'tgt_lang': self.tgt_lang,
            'device': 'cuda' if self.device >= 0 else 'cpu',
            'max_length': self.max_length,
            'batch_size': self.batch_size
        }
