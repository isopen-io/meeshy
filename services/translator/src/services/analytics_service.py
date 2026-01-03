"""
Service d'analytics pour la voix - Singleton
Gère: Feedback qualité, historique, statistiques, A/B testing
Persistance fichier JSON + cache mémoire
"""

import os
import logging
import time
import asyncio
import threading
import json
import random
from typing import Optional, List, Dict, Any, Tuple
from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta
from pathlib import Path
from enum import Enum
from collections import defaultdict
import hashlib

# Configuration du logging
logger = logging.getLogger(__name__)


class FeedbackType(str, Enum):
    """Types de feedback"""
    VOICE_QUALITY = "voice_quality"
    TRANSLATION_ACCURACY = "translation_accuracy"
    SPEED = "speed"
    OVERALL = "overall"


class ABTestStatus(str, Enum):
    """États d'un test A/B"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


@dataclass
class QualityFeedback:
    """Feedback de qualité utilisateur"""
    id: str
    user_id: str
    translation_id: str
    rating: int  # 1-5
    feedback_type: FeedbackType
    comment: Optional[str] = None
    target_language: str = ""
    voice_cloned: bool = False
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "translation_id": self.translation_id,
            "rating": self.rating,
            "feedback_type": self.feedback_type.value,
            "comment": self.comment,
            "target_language": self.target_language,
            "voice_cloned": self.voice_cloned,
            "created_at": self.created_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'QualityFeedback':
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            translation_id=data["translation_id"],
            rating=data["rating"],
            feedback_type=FeedbackType(data["feedback_type"]),
            comment=data.get("comment"),
            target_language=data.get("target_language", ""),
            voice_cloned=data.get("voice_cloned", False),
            created_at=datetime.fromisoformat(data["created_at"])
        )


@dataclass
class TranslationHistoryEntry:
    """Entrée d'historique de traduction"""
    id: str
    user_id: str
    source_language: str
    target_language: str
    original_text: str
    translated_text: str
    voice_cloned: bool
    voice_quality: float
    processing_time_ms: int
    audio_url: Optional[str] = None
    feedback_rating: Optional[int] = None
    created_at: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "source_language": self.source_language,
            "target_language": self.target_language,
            "original_text": self.original_text[:100] + "..." if len(self.original_text) > 100 else self.original_text,
            "translated_text": self.translated_text[:100] + "..." if len(self.translated_text) > 100 else self.translated_text,
            "voice_cloned": self.voice_cloned,
            "voice_quality": self.voice_quality,
            "processing_time_ms": self.processing_time_ms,
            "audio_url": self.audio_url,
            "feedback_rating": self.feedback_rating,
            "created_at": self.created_at.isoformat()
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TranslationHistoryEntry':
        return cls(
            id=data["id"],
            user_id=data["user_id"],
            source_language=data["source_language"],
            target_language=data["target_language"],
            original_text=data["original_text"],
            translated_text=data["translated_text"],
            voice_cloned=data["voice_cloned"],
            voice_quality=data.get("voice_quality", 0.0),
            processing_time_ms=data.get("processing_time_ms", 0),
            audio_url=data.get("audio_url"),
            feedback_rating=data.get("feedback_rating"),
            created_at=datetime.fromisoformat(data["created_at"])
        )


@dataclass
class UserStats:
    """Statistiques utilisateur"""
    user_id: str
    total_translations: int = 0
    total_audio_seconds: float = 0.0
    languages_used: Dict[str, int] = field(default_factory=dict)
    avg_rating: float = 0.0
    total_feedback: int = 0
    voice_profile_quality: float = 0.0
    first_translation: Optional[datetime] = None
    last_translation: Optional[datetime] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "total_translations": self.total_translations,
            "total_audio_seconds": self.total_audio_seconds,
            "languages_used": self.languages_used,
            "avg_rating": self.avg_rating,
            "total_feedback": self.total_feedback,
            "voice_profile_quality": self.voice_profile_quality,
            "first_translation": self.first_translation.isoformat() if self.first_translation else None,
            "last_translation": self.last_translation.isoformat() if self.last_translation else None
        }


@dataclass
class ABTest:
    """Test A/B"""
    id: str
    name: str
    description: str
    status: ABTestStatus = ABTestStatus.DRAFT

    # Variantes
    variants: List[Dict[str, Any]] = field(default_factory=list)
    traffic_split: List[float] = field(default_factory=list)  # e.g., [0.5, 0.5]

    # Résultats
    variant_counts: Dict[str, int] = field(default_factory=dict)
    variant_ratings: Dict[str, List[int]] = field(default_factory=dict)

    # Timing
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None

    # Configuration
    target_sample_size: int = 1000
    min_confidence: float = 0.95

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "variants": self.variants,
            "traffic_split": self.traffic_split,
            "results": {
                "counts": self.variant_counts,
                "avg_ratings": {
                    k: sum(v)/len(v) if v else 0
                    for k, v in self.variant_ratings.items()
                },
                "total_samples": sum(self.variant_counts.values())
            },
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "target_sample_size": self.target_sample_size
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ABTest':
        return cls(
            id=data["id"],
            name=data["name"],
            description=data.get("description", ""),
            status=ABTestStatus(data.get("status", "draft")),
            variants=data.get("variants", []),
            traffic_split=data.get("traffic_split", []),
            variant_counts=data.get("variant_counts", {}),
            variant_ratings=data.get("variant_ratings", {}),
            created_at=datetime.fromisoformat(data["created_at"]) if data.get("created_at") else datetime.now(),
            started_at=datetime.fromisoformat(data["started_at"]) if data.get("started_at") else None,
            ended_at=datetime.fromisoformat(data["ended_at"]) if data.get("ended_at") else None,
            target_sample_size=data.get("target_sample_size", 1000),
            min_confidence=data.get("min_confidence", 0.95)
        )


class AnalyticsService:
    """
    Service d'analytics pour la traduction vocale - Singleton

    Fonctionnalités:
    - Feedback qualité (ratings, commentaires)
    - Historique des traductions par utilisateur
    - Statistiques agrégées
    - Tests A/B
    - Persistance fichier JSON
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        """Singleton pattern"""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, data_dir: str = None):
        if self._initialized:
            return

        # Configuration
        self.data_dir = Path(data_dir or os.getenv('ANALYTICS_DATA_DIR', './analytics_data'))
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Fichiers de données
        self.feedback_file = self.data_dir / "feedback.json"
        self.history_file = self.data_dir / "history.json"
        self.stats_file = self.data_dir / "user_stats.json"
        self.ab_tests_file = self.data_dir / "ab_tests.json"

        # Cache mémoire
        self._feedback: List[QualityFeedback] = []
        self._history: Dict[str, List[TranslationHistoryEntry]] = defaultdict(list)
        self._user_stats: Dict[str, UserStats] = {}
        self._ab_tests: Dict[str, ABTest] = {}

        # Locks
        self._data_lock = asyncio.Lock()

        # État
        self.is_initialized = False
        self._init_lock = asyncio.Lock()

        # Configuration
        self._max_history_per_user = 100
        self._max_feedback_entries = 10000

        logger.info(f"[ANALYTICS] Service créé: data_dir={self.data_dir}")
        self._initialized = True

    async def initialize(self) -> bool:
        """Initialise le service et charge les données"""
        if self.is_initialized:
            return True

        async with self._init_lock:
            if self.is_initialized:
                return True

            logger.info("[ANALYTICS] 🔄 Initialisation...")

            # Charger les données persistées
            await self._load_data()

            self.is_initialized = True
            logger.info("[ANALYTICS] ✅ Initialisé")
            return True

    async def _load_data(self):
        """Charge les données depuis les fichiers"""
        try:
            # Feedback
            if self.feedback_file.exists():
                with open(self.feedback_file, 'r') as f:
                    data = json.load(f)
                    self._feedback = [QualityFeedback.from_dict(d) for d in data]

            # History
            if self.history_file.exists():
                with open(self.history_file, 'r') as f:
                    data = json.load(f)
                    for user_id, entries in data.items():
                        self._history[user_id] = [TranslationHistoryEntry.from_dict(e) for e in entries]

            # User stats
            if self.stats_file.exists():
                with open(self.stats_file, 'r') as f:
                    data = json.load(f)
                    for user_id, stats in data.items():
                        self._user_stats[user_id] = UserStats(
                            user_id=user_id,
                            total_translations=stats.get("total_translations", 0),
                            total_audio_seconds=stats.get("total_audio_seconds", 0.0),
                            languages_used=stats.get("languages_used", {}),
                            avg_rating=stats.get("avg_rating", 0.0),
                            total_feedback=stats.get("total_feedback", 0),
                            voice_profile_quality=stats.get("voice_profile_quality", 0.0)
                        )

            # A/B tests
            if self.ab_tests_file.exists():
                with open(self.ab_tests_file, 'r') as f:
                    data = json.load(f)
                    for test_id, test_data in data.items():
                        self._ab_tests[test_id] = ABTest.from_dict(test_data)

            logger.info(
                f"[ANALYTICS] Données chargées: {len(self._feedback)} feedbacks, "
                f"{len(self._history)} users, {len(self._ab_tests)} A/B tests"
            )

        except Exception as e:
            logger.error(f"[ANALYTICS] Erreur chargement données: {e}")

    async def _save_data(self):
        """Sauvegarde les données dans les fichiers"""
        try:
            async with self._data_lock:
                # Feedback
                with open(self.feedback_file, 'w') as f:
                    json.dump([fb.to_dict() for fb in self._feedback[-self._max_feedback_entries:]], f, indent=2)

                # History
                history_data = {}
                for user_id, entries in self._history.items():
                    history_data[user_id] = [e.to_dict() for e in entries[-self._max_history_per_user:]]
                with open(self.history_file, 'w') as f:
                    json.dump(history_data, f, indent=2)

                # User stats
                stats_data = {uid: stats.to_dict() for uid, stats in self._user_stats.items()}
                with open(self.stats_file, 'w') as f:
                    json.dump(stats_data, f, indent=2)

                # A/B tests
                ab_data = {tid: test.to_dict() for tid, test in self._ab_tests.items()}
                with open(self.ab_tests_file, 'w') as f:
                    json.dump(ab_data, f, indent=2)

        except Exception as e:
            logger.error(f"[ANALYTICS] Erreur sauvegarde données: {e}")

    # ═══════════════════════════════════════════════════════════════════════
    # FEEDBACK
    # ═══════════════════════════════════════════════════════════════════════

    async def submit_feedback(
        self,
        user_id: str,
        translation_id: str,
        rating: int,
        feedback_type: FeedbackType = FeedbackType.OVERALL,
        comment: Optional[str] = None,
        target_language: str = "",
        voice_cloned: bool = False
    ) -> QualityFeedback:
        """
        Soumet un feedback de qualité.

        Args:
            user_id: ID de l'utilisateur
            translation_id: ID de la traduction concernée
            rating: Note de 1 à 5
            feedback_type: Type de feedback
            comment: Commentaire optionnel
            target_language: Langue cible
            voice_cloned: Si la voix était clonée

        Returns:
            QualityFeedback créé
        """
        if not 1 <= rating <= 5:
            raise ValueError("Rating doit être entre 1 et 5")

        feedback = QualityFeedback(
            id=self._generate_id("fb"),
            user_id=user_id,
            translation_id=translation_id,
            rating=rating,
            feedback_type=feedback_type,
            comment=comment,
            target_language=target_language,
            voice_cloned=voice_cloned
        )

        async with self._data_lock:
            self._feedback.append(feedback)

            # Mettre à jour les stats utilisateur
            if user_id not in self._user_stats:
                self._user_stats[user_id] = UserStats(user_id=user_id)

            stats = self._user_stats[user_id]
            stats.total_feedback += 1

            # Recalculer la moyenne
            user_feedbacks = [f for f in self._feedback if f.user_id == user_id]
            if user_feedbacks:
                stats.avg_rating = sum(f.rating for f in user_feedbacks) / len(user_feedbacks)

        # Sauvegarder
        await self._save_data()

        logger.info(f"[ANALYTICS] ✅ Feedback enregistré: user={user_id}, rating={rating}")

        return feedback

    async def get_feedback_for_translation(self, translation_id: str) -> List[QualityFeedback]:
        """Récupère les feedbacks pour une traduction"""
        return [f for f in self._feedback if f.translation_id == translation_id]

    # ═══════════════════════════════════════════════════════════════════════
    # HISTORIQUE
    # ═══════════════════════════════════════════════════════════════════════

    async def record_translation(
        self,
        user_id: str,
        translation_id: str,
        source_language: str,
        target_language: str,
        original_text: str,
        translated_text: str,
        voice_cloned: bool = False,
        voice_quality: float = 0.0,
        processing_time_ms: int = 0,
        audio_url: Optional[str] = None
    ) -> TranslationHistoryEntry:
        """
        Enregistre une traduction dans l'historique.
        """
        entry = TranslationHistoryEntry(
            id=translation_id,
            user_id=user_id,
            source_language=source_language,
            target_language=target_language,
            original_text=original_text,
            translated_text=translated_text,
            voice_cloned=voice_cloned,
            voice_quality=voice_quality,
            processing_time_ms=processing_time_ms,
            audio_url=audio_url
        )

        async with self._data_lock:
            self._history[user_id].append(entry)

            # Limiter la taille
            if len(self._history[user_id]) > self._max_history_per_user:
                self._history[user_id] = self._history[user_id][-self._max_history_per_user:]

            # Mettre à jour les stats
            if user_id not in self._user_stats:
                self._user_stats[user_id] = UserStats(user_id=user_id)

            stats = self._user_stats[user_id]
            stats.total_translations += 1

            # Languages
            if target_language not in stats.languages_used:
                stats.languages_used[target_language] = 0
            stats.languages_used[target_language] += 1

            # Timing
            if stats.first_translation is None:
                stats.first_translation = entry.created_at
            stats.last_translation = entry.created_at

            # Voice quality
            if voice_cloned:
                stats.voice_profile_quality = voice_quality

        # Sauvegarder périodiquement (pas à chaque entrée)
        if stats.total_translations % 10 == 0:
            await self._save_data()

        return entry

    async def get_user_history(
        self,
        user_id: str,
        page: int = 1,
        limit: int = 20,
        language: Optional[str] = None
    ) -> Tuple[List[TranslationHistoryEntry], int]:
        """
        Récupère l'historique d'un utilisateur avec pagination.

        Returns:
            Tuple (entries, total_count)
        """
        entries = self._history.get(user_id, [])

        # Filtrer par langue si spécifié
        if language:
            entries = [e for e in entries if e.target_language == language]

        # Trier par date décroissante
        entries = sorted(entries, key=lambda e: e.created_at, reverse=True)

        total = len(entries)

        # Pagination
        start = (page - 1) * limit
        end = start + limit
        paginated = entries[start:end]

        return paginated, total

    # ═══════════════════════════════════════════════════════════════════════
    # STATISTIQUES
    # ═══════════════════════════════════════════════════════════════════════

    async def get_user_stats(self, user_id: str) -> UserStats:
        """Récupère les statistiques d'un utilisateur"""
        if user_id not in self._user_stats:
            return UserStats(user_id=user_id)
        return self._user_stats[user_id]

    async def get_global_stats(self) -> Dict[str, Any]:
        """Récupère les statistiques globales"""
        total_translations = sum(s.total_translations for s in self._user_stats.values())
        total_users = len(self._user_stats)
        total_feedback = len(self._feedback)

        # Rating moyen global
        if self._feedback:
            avg_rating = sum(f.rating for f in self._feedback) / len(self._feedback)
        else:
            avg_rating = 0.0

        # Langues les plus utilisées
        language_counts = defaultdict(int)
        for stats in self._user_stats.values():
            for lang, count in stats.languages_used.items():
                language_counts[lang] += count

        top_languages = sorted(language_counts.items(), key=lambda x: x[1], reverse=True)[:10]

        # Rating par type
        rating_by_type = defaultdict(list)
        for f in self._feedback:
            rating_by_type[f.feedback_type.value].append(f.rating)

        avg_by_type = {
            k: sum(v)/len(v) if v else 0
            for k, v in rating_by_type.items()
        }

        # Voice cloning stats
        voice_cloned_count = sum(1 for f in self._feedback if f.voice_cloned)
        voice_cloned_avg = 0
        if voice_cloned_count > 0:
            voice_cloned_avg = sum(
                f.rating for f in self._feedback if f.voice_cloned
            ) / voice_cloned_count

        return {
            "total_translations": total_translations,
            "total_users": total_users,
            "total_feedback": total_feedback,
            "avg_rating": round(avg_rating, 2),
            "top_languages": top_languages,
            "rating_by_type": avg_by_type,
            "voice_cloning": {
                "count": voice_cloned_count,
                "avg_rating": round(voice_cloned_avg, 2)
            },
            "ab_tests_active": sum(1 for t in self._ab_tests.values() if t.status == ABTestStatus.ACTIVE)
        }

    # ═══════════════════════════════════════════════════════════════════════
    # A/B TESTING
    # ═══════════════════════════════════════════════════════════════════════

    async def create_ab_test(
        self,
        name: str,
        description: str,
        variants: List[Dict[str, Any]],
        traffic_split: Optional[List[float]] = None,
        target_sample_size: int = 1000
    ) -> ABTest:
        """
        Crée un nouveau test A/B.

        Args:
            name: Nom du test
            description: Description
            variants: Liste des variantes (e.g., [{"name": "A", "model": "base"}, {"name": "B", "model": "large"}])
            traffic_split: Répartition du trafic (e.g., [0.5, 0.5])
            target_sample_size: Taille cible de l'échantillon

        Returns:
            ABTest créé
        """
        if not variants or len(variants) < 2:
            raise ValueError("Au moins 2 variantes requises")

        if traffic_split is None:
            traffic_split = [1.0 / len(variants)] * len(variants)

        if len(traffic_split) != len(variants):
            raise ValueError("traffic_split doit avoir la même taille que variants")

        if abs(sum(traffic_split) - 1.0) > 0.01:
            raise ValueError("La somme de traffic_split doit être 1.0")

        test = ABTest(
            id=self._generate_id("ab"),
            name=name,
            description=description,
            variants=variants,
            traffic_split=traffic_split,
            target_sample_size=target_sample_size,
            variant_counts={v.get("name", f"variant_{i}"): 0 for i, v in enumerate(variants)},
            variant_ratings={v.get("name", f"variant_{i}"): [] for i, v in enumerate(variants)}
        )

        async with self._data_lock:
            self._ab_tests[test.id] = test

        await self._save_data()

        logger.info(f"[ANALYTICS] ✅ Test A/B créé: {test.id} - {name}")

        return test

    async def start_ab_test(self, test_id: str) -> ABTest:
        """Démarre un test A/B"""
        test = self._ab_tests.get(test_id)
        if not test:
            raise ValueError(f"Test A/B non trouvé: {test_id}")

        test.status = ABTestStatus.ACTIVE
        test.started_at = datetime.now()

        await self._save_data()

        logger.info(f"[ANALYTICS] ▶️ Test A/B démarré: {test_id}")

        return test

    async def get_ab_test_variant(self, test_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Sélectionne une variante pour un utilisateur.
        Utilise un hash du user_id pour une attribution déterministe.

        Returns:
            La variante assignée ou None si le test n'est pas actif
        """
        test = self._ab_tests.get(test_id)
        if not test or test.status != ABTestStatus.ACTIVE:
            return None

        # Hash déterministe basé sur user_id + test_id
        hash_input = f"{user_id}:{test_id}"
        hash_value = int(hashlib.md5(hash_input.encode()).hexdigest(), 16)
        random_value = (hash_value % 10000) / 10000  # 0 to 1

        # Sélectionner la variante basée sur le split
        cumulative = 0
        for i, split in enumerate(test.traffic_split):
            cumulative += split
            if random_value < cumulative:
                variant = test.variants[i]
                variant_name = variant.get("name", f"variant_{i}")

                # Incrémenter le compteur
                test.variant_counts[variant_name] = test.variant_counts.get(variant_name, 0) + 1

                return variant

        # Fallback à la dernière variante
        return test.variants[-1]

    async def record_ab_test_result(
        self,
        test_id: str,
        variant_name: str,
        rating: int
    ):
        """Enregistre un résultat pour un test A/B"""
        test = self._ab_tests.get(test_id)
        if not test:
            return

        if variant_name not in test.variant_ratings:
            test.variant_ratings[variant_name] = []

        test.variant_ratings[variant_name].append(rating)

        # Vérifier si on a atteint la taille cible
        total_samples = sum(len(v) for v in test.variant_ratings.values())
        if total_samples >= test.target_sample_size and test.status == ABTestStatus.ACTIVE:
            test.status = ABTestStatus.COMPLETED
            test.ended_at = datetime.now()
            logger.info(f"[ANALYTICS] ✅ Test A/B terminé: {test_id}")

        # Sauvegarder périodiquement
        if total_samples % 100 == 0:
            await self._save_data()

    async def get_ab_test_results(self, test_id: str) -> Optional[Dict[str, Any]]:
        """Récupère les résultats d'un test A/B"""
        test = self._ab_tests.get(test_id)
        if not test:
            return None

        results = test.to_dict()

        # Calculer la significativité statistique (simplifiée)
        if len(test.variant_ratings) >= 2:
            ratings = list(test.variant_ratings.values())
            if len(ratings[0]) > 30 and len(ratings[1]) > 30:
                # T-test simplifié
                import statistics
                mean_a = statistics.mean(ratings[0]) if ratings[0] else 0
                mean_b = statistics.mean(ratings[1]) if ratings[1] else 0
                std_a = statistics.stdev(ratings[0]) if len(ratings[0]) > 1 else 1
                std_b = statistics.stdev(ratings[1]) if len(ratings[1]) > 1 else 1

                # Effet size approximatif
                pooled_std = ((std_a ** 2 + std_b ** 2) / 2) ** 0.5
                effect_size = abs(mean_a - mean_b) / pooled_std if pooled_std > 0 else 0

                results["statistical_analysis"] = {
                    "effect_size": round(effect_size, 3),
                    "is_significant": effect_size > 0.2,  # Cohen's d > 0.2
                    "winner": list(test.variant_ratings.keys())[0] if mean_a > mean_b else list(test.variant_ratings.keys())[1]
                }

        return results

    async def list_ab_tests(
        self,
        status: Optional[ABTestStatus] = None
    ) -> List[ABTest]:
        """Liste tous les tests A/B"""
        tests = list(self._ab_tests.values())

        if status:
            tests = [t for t in tests if t.status == status]

        return sorted(tests, key=lambda t: t.created_at, reverse=True)

    # ═══════════════════════════════════════════════════════════════════════
    # HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _generate_id(self, prefix: str) -> str:
        """Génère un ID unique"""
        import uuid
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        unique = uuid.uuid4().hex[:8]
        return f"{prefix}_{timestamp}_{unique}"

    async def get_stats(self) -> Dict[str, Any]:
        """Retourne les statistiques du service"""
        return {
            "service": "AnalyticsService",
            "initialized": self.is_initialized,
            "data_dir": str(self.data_dir),
            "feedback_count": len(self._feedback),
            "users_with_history": len(self._history),
            "users_with_stats": len(self._user_stats),
            "ab_tests_count": len(self._ab_tests),
            "ab_tests_active": sum(1 for t in self._ab_tests.values() if t.status == ABTestStatus.ACTIVE)
        }

    async def close(self):
        """Ferme le service et sauvegarde les données"""
        logger.info("[ANALYTICS] 🛑 Fermeture du service...")
        await self._save_data()
        self.is_initialized = False
        logger.info("[ANALYTICS] ✅ Service fermé")


# Fonction helper pour obtenir l'instance singleton
def get_analytics_service() -> AnalyticsService:
    """Retourne l'instance singleton du service d'analytics"""
    return AnalyticsService()
