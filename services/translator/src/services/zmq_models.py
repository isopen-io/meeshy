"""
Modèles de données pour le serveur ZMQ de traduction

Contient les dataclasses et modèles utilisés par le serveur de traduction.
"""

import time
from dataclasses import dataclass
from typing import List, Optional

# Import des optimisations de performance
PERFORMANCE_MODULE_AVAILABLE = False
try:
    from utils.performance import Priority
    PERFORMANCE_MODULE_AVAILABLE = True
except ImportError:
    pass


@dataclass
class TranslationTask:
    """Tâche de traduction avec support multi-langues et priorité"""
    task_id: str
    message_id: str
    text: str
    source_language: str
    target_languages: List[str]
    conversation_id: str
    model_type: str = "basic"
    created_at: float = None
    priority: int = 2  # 1=HIGH (short), 2=MEDIUM, 3=LOW (long), 4=BULK

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = time.time()
        # Auto-assign priority based on text length if not set
        if PERFORMANCE_MODULE_AVAILABLE and self.priority == 2:
            text_len = len(self.text)
            if text_len < 100:
                self.priority = Priority.HIGH.value
            elif text_len < 500:
                self.priority = Priority.MEDIUM.value
            else:
                self.priority = Priority.LOW.value
