"""
Wrapper NLLB pour remplacer le pipeline transformers
Ce wrapper est nécessaire car transformers 4.54+ n'a pas de task "translation"
"""

import logging
from typing import List, Union, Dict

logger = logging.getLogger(__name__)


class NLLBTranslator:
    """
    Wrapper pour NLLB qui remplace pipeline() de transformers

    Utilise directement AutoModelForSeq2SeqLM + AutoTokenizer
    car transformers 4.54+ n'a pas de task "translation" dans le registry
    """

    def __init__(
        self,
        model,
        tokenizer,
        src_lang: str,
        tgt_lang: str,
        device: int = -1,
        max_length: int = 512,
        batch_size: int = 8
    ):
        """
        Initialise le wrapper NLLB

        Args:
            model: AutoModelForSeq2SeqLM instance
            tokenizer: AutoTokenizer instance
            src_lang: Code langue source (ex: "eng_Latn")
            tgt_lang: Code langue cible (ex: "fra_Latn")
            device: Device (-1 pour CPU, 0 pour GPU)
            max_length: Longueur maximale de génération
            batch_size: Taille du batch (non utilisé pour l'instant)
        """
        self.model = model
        self.tokenizer = tokenizer
        self.src_lang = src_lang
        self.tgt_lang = tgt_lang
        self.device = device
        self.max_length = max_length
        self.batch_size = batch_size

        # Configurer le device du modèle
        if device >= 0:
            try:
                import torch
                if torch.cuda.is_available():
                    self.model = self.model.to(f'cuda:{device}')
                    logger.info(f"✅ Modèle déplacé vers GPU {device}")
            except Exception as e:
                logger.warning(f"⚠️  Impossible d'utiliser GPU, fallback CPU: {e}")

        # Configurer la langue source dans le tokenizer
        self.tokenizer.src_lang = src_lang

        # Obtenir le token BOS forcé pour la langue cible
        self.forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(tgt_lang)

        logger.info(
            f"✅ NLLBTranslator créé: {src_lang} → {tgt_lang} "
            f"(forced_bos_token_id={self.forced_bos_token_id})"
        )

    def __call__(
        self,
        texts: Union[str, List[str]],
        src_lang: str = None,
        tgt_lang: str = None,
        max_length: int = None,
        num_beams: int = 1,
        do_sample: bool = False,
        **kwargs
    ) -> Union[List[Dict], Dict]:
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

        # Mettre à jour forced_bos_token_id si langue cible change
        if tgt_lang != self.tgt_lang:
            forced_bos_token_id = self.tokenizer.convert_tokens_to_ids(tgt_lang)
        else:
            forced_bos_token_id = self.forced_bos_token_id

        # Mettre à jour src_lang si nécessaire
        if src_lang != self.tokenizer.src_lang:
            self.tokenizer.src_lang = src_lang

        # Tokenizer les textes
        inputs = self.tokenizer(
            texts,
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

        # Générer les traductions
        outputs = self.model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_length=max_length,
            num_beams=num_beams,
            do_sample=do_sample,
            **kwargs
        )

        # Décoder les résultats
        translations = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)

        # Formater comme pipeline transformers (pour compatibilité)
        results = [{'translation_text': t} for t in translations]

        # Retourner format unique si texte unique
        if single_text:
            return results[0]

        return results
