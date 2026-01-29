# 🔌 Intégration du Nettoyeur de Diarisation

## Exemple Complet d'Intégration

### Modification de `diarization_speechbrain.py`

```python
"""
Ajout du nettoyage automatique dans SpeechBrainDiarization
"""

# En haut du fichier, après les imports existants
from services.audio_processing.diarization_cleaner import (
    DiarizationCleaner,
    merge_consecutive_same_speaker
)

class SpeechBrainDiarization:
    """
    Diarisation des locuteurs avec SpeechBrain + nettoyage automatique
    """

    def __init__(self, models_dir: Optional[str] = None, enable_cleaning: bool = True):
        """
        Args:
            models_dir: Répertoire pour stocker les modèles (optionnel)
            enable_cleaning: Activer le nettoyage post-diarisation (défaut: True)
        """
        self.models_dir = models_dir or str(
            Path(__file__).parent.parent.parent / "models" / "speechbrain"
        )
        self._encoder = None
        self.enable_cleaning = enable_cleaning

        # ✨ Initialiser le nettoyeur avec config pour monologue
        self._cleaner = DiarizationCleaner(
            similarity_threshold=0.85,      # Fusion si similarité > 85%
            min_speaker_percentage=0.15,    # Fusion si < 15% du temps
            max_sentence_gap=0.5,           # Continuité phrase < 0.5s
            min_transition_gap=0.3          # Transition anormale < 0.3s
        )

        # Initialiser le service d'analyse vocale
        from services.voice_analyzer_service import VoiceAnalyzerService
        self._voice_analyzer = VoiceAnalyzerService()

    async def diarize(
        self,
        audio_path: str,
        num_speakers: Optional[int] = None,
        max_speakers: int = 5,
        transcripts: Optional[List[str]] = None  # ✨ Nouveau paramètre
    ) -> DiarizationResult:
        """
        Diarise un fichier audio avec nettoyage automatique

        Args:
            audio_path: Chemin vers le fichier audio
            num_speakers: Nombre exact de speakers (None = auto-détection)
            max_speakers: Nombre maximum de speakers
            transcripts: Transcriptions par segment (optionnel, améliore nettoyage)

        Returns:
            DiarizationResult nettoyé
        """
        logger.info(f"[SPEECHBRAIN] 🎤 Début diarisation: {audio_path}")

        if not SPEECHBRAIN_AVAILABLE or not SKLEARN_AVAILABLE:
            raise RuntimeError("Dépendances manquantes: speechbrain, scikit-learn")

        # 1. Extraction embeddings
        embeddings, timestamps = await self._extract_embeddings(audio_path)
        logger.info(f"[SPEECHBRAIN] ✅ {len(embeddings)} embeddings extraits")

        # 2. Clustering (diarisation brute)
        labels = self._cluster_embeddings(
            embeddings,
            num_speakers=num_speakers,
            max_speakers=max_speakers
        )

        # 3. Créer segments bruts
        segments = self._create_segments(labels, timestamps)
        raw_speaker_count = len(set(seg['speaker_id'] for seg in segments))
        logger.info(f"[SPEECHBRAIN] 🔍 Diarisation brute: {raw_speaker_count} speaker(s)")

        # ✨ 4. NETTOYAGE AUTOMATIQUE (si activé)
        cleaning_stats = None
        if self.enable_cleaning and len(segments) > 0:
            logger.info("[SPEECHBRAIN] 🧹 Début nettoyage automatique...")

            # Préparer embeddings par speaker
            speaker_embeddings = self._compute_speaker_embeddings(segments, embeddings)

            # Nettoyage
            segments, cleaning_stats = self._cleaner.clean_diarization(
                segments=segments,
                embeddings=speaker_embeddings,
                transcripts=transcripts
            )

            # Fusion consécutive (optimisation finale)
            segments = merge_consecutive_same_speaker(segments)

            cleaned_speaker_count = len(set(seg['speaker_id'] for seg in segments))
            logger.info(
                f"[SPEECHBRAIN] ✅ Nettoyage terminé: "
                f"{raw_speaker_count} → {cleaned_speaker_count} speaker(s)"
            )

            # Log des fusions effectuées
            if cleaning_stats and cleaning_stats['merges_performed']:
                for merge_msg in cleaning_stats['merges_performed']:
                    logger.info(f"[SPEECHBRAIN]    🔄 {merge_msg}")

        # 5. Grouper par speaker et créer DiarizationResult
        speakers_data = self._group_by_speaker(segments)

        # 6. Analyser caractéristiques vocales (optionnel)
        for speaker_id, data in speakers_data.items():
            try:
                voice_chars = await self._analyze_voice_characteristics(
                    audio_path,
                    data['segments_obj']
                )
                data['voice_characteristics'] = voice_chars
            except Exception as e:
                logger.warning(f"[SPEECHBRAIN] Erreur analyse vocale {speaker_id}: {e}")
                data['voice_characteristics'] = None

        # 7. Créer objets SpeakerInfo
        speakers = []
        total_duration_ms = int(timestamps[-1][1] * 1000) if timestamps else 0

        for speaker_id, data in speakers_data.items():
            speaker_info = SpeakerInfo(
                speaker_id=speaker_id,
                is_primary=data['is_primary'],
                speaking_time_ms=data['speaking_time_ms'],
                speaking_ratio=data['speaking_ratio'],
                segments=data['segments_obj'],
                voice_characteristics=data['voice_characteristics']
            )
            speakers.append(speaker_info)

        # Speaker principal = celui qui parle le plus
        primary_speaker = max(speakers, key=lambda s: s.speaking_time_ms)

        result = DiarizationResult(
            speaker_count=len(speakers),
            speakers=speakers,
            primary_speaker_id=primary_speaker.speaker_id,
            total_duration_ms=total_duration_ms,
            method="speechbrain" + ("_cleaned" if self.enable_cleaning else "")
        )

        # Ajouter stats de nettoyage dans metadata (optionnel)
        if cleaning_stats:
            result.cleaning_stats = cleaning_stats

        logger.info(
            f"[SPEECHBRAIN] ✅ Diarisation terminée: "
            f"{result.speaker_count} speaker(s), "
            f"durée {result.total_duration_ms}ms"
        )

        return result

    def _compute_speaker_embeddings(
        self,
        segments: List[Dict[str, Any]],
        all_embeddings: np.ndarray
    ) -> Dict[str, np.ndarray]:
        """
        Calcule l'embedding moyen par speaker

        Args:
            segments: Segments avec speaker_id
            all_embeddings: Tous les embeddings extraits

        Returns:
            Dict {speaker_id: embedding_moyen}
        """
        speaker_embeddings = {}

        # Grouper embeddings par speaker
        for i, seg in enumerate(segments):
            speaker_id = seg['speaker_id']

            if speaker_id not in speaker_embeddings:
                speaker_embeddings[speaker_id] = []

            if i < len(all_embeddings):
                speaker_embeddings[speaker_id].append(all_embeddings[i])

        # Calculer moyenne par speaker
        for speaker_id, embs in speaker_embeddings.items():
            if embs:
                speaker_embeddings[speaker_id] = np.mean(embs, axis=0)

        return speaker_embeddings

    def _create_segments(
        self,
        labels: np.ndarray,
        timestamps: List[Tuple[float, float]]
    ) -> List[Dict[str, Any]]:
        """
        Crée la liste de segments à partir des labels de clustering

        Args:
            labels: Labels de clustering (un par fenêtre temporelle)
            timestamps: Timestamps (start, end) pour chaque fenêtre

        Returns:
            Liste de segments avec speaker_id, start, end
        """
        segments = []

        for i, (label, (start, end)) in enumerate(zip(labels, timestamps)):
            segments.append({
                'speaker_id': f'SPEAKER_{label:02d}',
                'start': start,
                'end': end,
                'duration': end - start,
                'confidence': 1.0
            })

        return segments

    # ... Reste des méthodes existantes ...
```

---

## Exemple d'Utilisation avec Nettoyage

```python
from services.diarization_speechbrain import SpeechBrainDiarization

# Initialiser avec nettoyage activé (défaut)
diarizer = SpeechBrainDiarization(enable_cleaning=True)

# Option 1 : Sans transcriptions
result = await diarizer.diarize("audio.wav", max_speakers=2)

# Option 2 : Avec transcriptions (meilleur nettoyage)
transcripts = [
    "Bonjour je suis content",
    "de vous parler",  # Phrase coupée détectée!
    "aujourd'hui de ce sujet."
]

result = await diarizer.diarize(
    audio_path="audio.wav",
    max_speakers=2,
    transcripts=transcripts
)

# Vérifier le nettoyage
print(f"Speakers détectés: {result.speaker_count}")
if hasattr(result, 'cleaning_stats'):
    print(f"Fusions effectuées: {len(result.cleaning_stats['merges_performed'])}")
    for merge in result.cleaning_stats['merges_performed']:
        print(f"  - {merge}")
```

---

## Intégration dans le Pipeline Audio Complet

### Modification de `audio_message_pipeline.py`

```python
class AudioMessagePipeline:
    """Pipeline complet: transcription + diarisation + traduction"""

    async def process_audio_message(
        self,
        audio_path: str,
        conversation_id: str,
        user_id: str
    ) -> Dict[str, Any]:
        """Traite un message audio complet"""

        # 1. Transcription (Whisper)
        transcription_result = await self.transcriber.transcribe(
            audio_path,
            source_language="auto"
        )

        segments_text = [seg['text'] for seg in transcription_result['segments']]

        # 2. Diarisation avec nettoyage + transcriptions
        diarization_result = await self.diarizer.diarize(
            audio_path=audio_path,
            max_speakers=2,  # ✨ Limiter à 2 pour éviter sur-segmentation
            transcripts=segments_text  # ✨ Améliore le nettoyage
        )

        # 3. Vérifier si nettoyage a corrigé des faux positifs
        if hasattr(diarization_result, 'cleaning_stats'):
            stats = diarization_result.cleaning_stats

            if stats['abnormal_transitions']:
                logger.warning(
                    "⚠️ Transitions anormales détectées (sur-segmentation probable)"
                )

            if stats['speakers_merged'] > 0:
                logger.info(
                    f"✅ Nettoyage: {stats['speakers_merged']} faux positif(s) corrigé(s)"
                )

        # 4. Aligner transcription et diarisation
        aligned_segments = self._align_transcription_diarization(
            transcription_result['segments'],
            diarization_result.speakers
        )

        # 5. Traduction si nécessaire
        # ...

        return {
            'transcription': transcription_result,
            'diarization': diarization_result,
            'aligned_segments': aligned_segments,
            'cleaning_performed': hasattr(diarization_result, 'cleaning_stats')
        }
```

---

## Configuration par Type d'Audio

```python
# Configuration adaptative selon contexte

def get_cleaner_for_context(audio_type: str) -> DiarizationCleaner:
    """Retourne un cleaner configuré pour le contexte"""

    if audio_type == "monologue":
        # Podcasts, messages vocaux, présentations
        return DiarizationCleaner(
            similarity_threshold=0.80,
            min_speaker_percentage=0.20,
            max_sentence_gap=1.0,
            min_transition_gap=0.5
        )

    elif audio_type == "dialogue":
        # Conversations 1-to-1, interviews
        return DiarizationCleaner(
            similarity_threshold=0.85,
            min_speaker_percentage=0.10,
            max_sentence_gap=0.5,
            min_transition_gap=0.3
        )

    elif audio_type == "meeting":
        # Réunions, tables rondes, débats
        return DiarizationCleaner(
            similarity_threshold=0.90,
            min_speaker_percentage=0.05,
            max_sentence_gap=0.3,
            min_transition_gap=0.2
        )

    else:
        # Défaut: configuration standard
        return DiarizationCleaner()


# Utilisation
audio_type = detect_audio_type(audio_path)  # "monologue", "dialogue", "meeting"
cleaner = get_cleaner_for_context(audio_type)

segments, stats = cleaner.clean_diarization(
    segments=raw_segments,
    embeddings=embeddings,
    transcripts=transcripts
)
```

---

## Tests d'Intégration

```python
import pytest
from services.diarization_speechbrain import SpeechBrainDiarization

@pytest.mark.asyncio
async def test_diarization_with_cleaning():
    """Test diarisation avec nettoyage automatique"""

    diarizer = SpeechBrainDiarization(enable_cleaning=True)

    # Audio monologue avec faux positif connu
    result = await diarizer.diarize(
        audio_path="test_data/monologue_false_positive.wav",
        max_speakers=2
    )

    # Vérifications
    assert result.speaker_count == 1, "Devrait détecter 1 seul speaker après nettoyage"
    assert hasattr(result, 'cleaning_stats'), "Stats de nettoyage manquantes"
    assert result.cleaning_stats['speakers_merged'] >= 1, "Devrait avoir fusionné"


@pytest.mark.asyncio
async def test_diarization_with_transcripts():
    """Test nettoyage avec transcriptions"""

    diarizer = SpeechBrainDiarization(enable_cleaning=True)

    transcripts = [
        "Bonjour je suis",
        "très content",  # Phrase coupée
        "de vous parler."
    ]

    result = await diarizer.diarize(
        audio_path="test_data/interrupted_sentence.wav",
        transcripts=transcripts
    )

    # Vérifier fusion des phrases coupées
    assert 'phrase coupée' in str(result.cleaning_stats['merges_performed'])


@pytest.mark.asyncio
async def test_diarization_real_dialogue():
    """Test avec vrai dialogue (ne doit PAS fusionner)"""

    diarizer = SpeechBrainDiarization(enable_cleaning=True)

    result = await diarizer.diarize(
        audio_path="test_data/real_dialogue_2_speakers.wav",
        max_speakers=3
    )

    # Ne doit pas fusionner un vrai dialogue
    assert result.speaker_count == 2, "Vrai dialogue ne doit pas être fusionné"
    assert result.cleaning_stats['speakers_merged'] == 0, "Aucune fusion"
```

---

## Métriques et Monitoring

```python
from prometheus_client import Counter, Histogram

# Métriques Prometheus
diarization_cleaning_counter = Counter(
    'diarization_cleaning_total',
    'Nombre de nettoyages effectués',
    ['result']  # 'merged' ou 'unchanged'
)

diarization_merge_counter = Counter(
    'diarization_merges_total',
    'Nombre de fusions de speakers',
    ['method']  # 'embedding', 'minority', 'phrase'
)

diarization_cleaning_duration = Histogram(
    'diarization_cleaning_duration_seconds',
    'Durée du nettoyage'
)

# Dans le code
with diarization_cleaning_duration.time():
    segments, stats = cleaner.clean_diarization(...)

if stats['speakers_merged'] > 0:
    diarization_cleaning_counter.labels(result='merged').inc()

    for merge_msg in stats['merges_performed']:
        if 'embedding' in merge_msg:
            diarization_merge_counter.labels(method='embedding').inc()
        elif 'minoritaire' in merge_msg:
            diarization_merge_counter.labels(method='minority').inc()
        elif 'phrase' in merge_msg:
            diarization_merge_counter.labels(method='phrase').inc()
else:
    diarization_cleaning_counter.labels(result='unchanged').inc()
```

---

## Prochaines Étapes

1. ✅ Créer `diarization_cleaner.py` - FAIT
2. ✅ Documenter algorithmes - FAIT
3. [ ] Intégrer dans `diarization_speechbrain.py`
4. [ ] Intégrer dans `diarization_service.py`
5. [ ] Ajouter tests unitaires
6. [ ] Ajouter tests d'intégration
7. [ ] Benchmarker performance
8. [ ] Déployer en production

**Voulez-vous que j'implémente l'intégration complète maintenant ?**
