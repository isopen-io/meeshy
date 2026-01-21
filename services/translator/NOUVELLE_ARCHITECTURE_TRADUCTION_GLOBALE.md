# Nouvelle Architecture: Traduction Globale par Speaker

**Date:** 2026-01-21
**Objectif:** Analyser et implémenter l'approche de traduction globale par speaker au lieu de segment par segment

---

## Table des Matières

1. [Comparaison des Architectures](#1-comparaison-des-architectures)
2. [Avantages de la Nouvelle Approche](#2-avantages-de-la-nouvelle-approche)
3. [Défis Techniques](#3-défis-techniques)
4. [Plan d'Implémentation](#4-plan-dimplémentation)
5. [Code d'Implémentation](#5-code-dimplémentation)

---

## 1. Comparaison des Architectures

### Architecture ACTUELLE (Segment par Segment)

```
Audio Source (25s, 2 speakers)
    ↓
Transcription + Diarisation
    ↓ (34 segments identifiés)
    ├─ Segment 1: "Ok," (s1, 0.5s-1.1s)
    ├─ Segment 2: "c'est à chacun" (s1, 1.2s-2.3s)
    ├─ Segment 3: "de se battre" (s1, 2.3s-3.3s)
    └─ ... 31 autres segments ...
    ↓
Traduction SEGMENT PAR SEGMENT
    ├─ "Ok," → "Okay,"
    ├─ "c'est à chacun" → "it's up to everyone"
    ├─ "de se battre" → "to fight"
    └─ ...
    ↓
Synthèse SEGMENT PAR SEGMENT
    ├─ TTS("Okay,", voice_s1) → audio_seg_1.mp3
    ├─ TTS("it's up to everyone", voice_s1) → audio_seg_2.mp3
    ├─ TTS("to fight", voice_s1) → audio_seg_3.mp3
    └─ ...
    ↓
Concaténation avec silences
    └─ audio_final.mp3
```

**❌ Problèmes:**
- **Perte de contexte:** Chaque segment traduit indépendamment
- **Incohérence:** "c'est à chacun de se battre" traduit en 2 morceaux perd le sens
- **Appels API multiples:** 34 appels de traduction au lieu de 2
- **Synthèse fragmentée:** 34 synthèses courtes au lieu de 2 longues
- **Manque de fluidité:** Les segments individuels peuvent avoir des ruptures de ton

### Architecture PROPOSÉE (Traduction Globale par Speaker)

```
Audio Source (25s, 2 speakers)
    ↓
Transcription + Diarisation
    ↓ (34 segments identifiés)
    ├─ s1: segments [1,2,3,5,7,...] (25 segments)
    └─ s0: segments [4,6,8,...] (9 segments)
    ↓
Regroupement par Speaker
    ├─ s1: "Ok, c'est à chacun de se battre pour avoir exactement ce qu'il veut..."
    │      (texte complet, 383 chars)
    │      + timestamps: [(0.5s,1.1s), (1.2s,2.3s), (2.3s,3.3s), ...]
    │
    └─ s0: "Jusqu'à ce que tu aies fait ton rêve..."
           (texte complet, 120 chars)
           + timestamps: [(17.5s,18.1s), (18.1s,18.2s), ...]
    ↓
Traduction GLOBALE (2 appels seulement)
    ├─ s1 (fr→en): "Ok, it's up to everyone to fight for exactly what they want..."
    │              (texte traduit complet avec contexte)
    │
    └─ s0 (fr→en): "Until you've made your dream..."
                   (texte traduit complet avec contexte)
    ↓
Synthèse GLOBALE (2 synthèses longues)
    ├─ TTS(texte_complet_s1, voice_s1) → audio_s1_full.mp3 (~18s)
    │
    └─ TTS(texte_complet_s0, voice_s0) → audio_s0_full.mp3 (~7s)
    ↓
Re-découpage par Timestamps Originaux
    ├─ audio_s1_full.mp3 → découper selon timestamps originaux
    │   ├─ [0-600ms] → audio_seg_1.mp3 (aligne avec 0.5s-1.1s original)
    │   ├─ [600-1700ms] → audio_seg_2.mp3 (aligne avec 1.2s-2.3s original)
    │   └─ ...
    │
    └─ audio_s0_full.mp3 → découper selon timestamps originaux
        └─ ...
    ↓
Réassemblage avec Silences selon Ordre Original
    └─ Intercaler segments selon timestamps + insérer silences
       → audio_final.mp3
```

**✅ Avantages:**
- **Contexte complet:** Traduction cohérente avec contexte
- **Moins d'appels:** 2 traductions au lieu de 34
- **Synthèse naturelle:** Audio fluide sans ruptures artificielles
- **Qualité supérieure:** Intonation et rythme naturels

---

## 2. Avantages de la Nouvelle Approche

### 2.1 Qualité de Traduction

**AVANT (segment par segment):**
```
Segment 1: "Ok,"                → "Okay,"
Segment 2: "c'est à chacun"     → "it's up to everyone"
Segment 3: "de se battre"       → "to fight"
Segment 4: "pour avoir"         → "to have"

❌ Problème: Phrase "c'est à chacun de se battre pour avoir ce qu'il veut"
           traduite en 5 morceaux perd le sens global
```

**APRÈS (traduction globale):**
```
Texte complet: "Ok, c'est à chacun de se battre pour avoir exactement ce qu'il veut..."

✅ Résultat: "Ok, it's up to everyone to fight for exactly what they want..."
             Traduction cohérente avec contexte complet
```

### 2.2 Performance API

| Métrique | Avant | Après | Gain |
|----------|-------|-------|------|
| **Appels traduction** | 34 | 2 | **94% de réduction** |
| **Temps traduction** | ~6.8s (34×200ms) | ~0.4s (2×200ms) | **94% plus rapide** |
| **Coût API** | 34× tarif | 2× tarif | **94% d'économie** |

### 2.3 Qualité Audio

**AVANT (34 synthèses courtes):**
```
audio_seg_1.mp3: "Okay," (durée: 0.5s)
    ↓ silence 100ms
audio_seg_2.mp3: "it's up to everyone" (durée: 1.2s)
    ↓ silence 0ms (consécutif)
audio_seg_3.mp3: "to fight" (durée: 0.8s)

❌ Problème: Ruptures entre segments, manque de fluidité
```

**APRÈS (1 synthèse longue):**
```
audio_s1_full.mp3: "Ok, it's up to everyone to fight for exactly what they want..."
                   (durée: 18s, audio continu et naturel)

✅ Résultat: Audio fluide sans ruptures artificielles
```

### 2.4 Simplicité du Pipeline

**Réduction de complexité:**
- ❌ AVANT: 34 traductions + 34 synthèses + 34 concaténations
- ✅ APRÈS: 2 traductions + 2 synthèses + 1 découpage + 1 réassemblage

---

## 3. Défis Techniques

### 3.1 Re-découpage Audio par Timestamps

**Problème:**
Comment découper `audio_s1_full.mp3` (18s d'audio continu) selon les timestamps originaux (34 segments)?

**Exemple:**
```
Texte original s1: "Ok, c'est à chacun de se battre pour avoir ce qu'il veut"
Timestamps:
  - "Ok," → 0.5s-1.1s (600ms)
  - "c'est à chacun" → 1.2s-2.3s (1100ms)
  - "de se battre" → 2.3s-3.3s (1000ms)

Texte traduit s1: "Ok, it's up to everyone to fight for what they want"
Audio synthétisé: 15s continu

❓ Comment mapper:
  - [0-600ms] de audio_s1_full.mp3 → Segment 1 "Ok,"
  - [600-1700ms] de audio_s1_full.mp3 → Segment 2 "it's up to everyone"
  - [1700-2700ms] de audio_s1_full.mp3 → Segment 3 "to fight"
```

**Solutions possibles:**

#### **Option A: Découpage Proportionnel Simple** 🟡

```python
# Calculer les proportions de caractères
total_chars = len(texte_traduit_complet)
char_positions = []  # Position de chaque segment dans le texte

# Découper l'audio proportionnellement
for seg in segments:
    start_ratio = seg.char_start / total_chars
    end_ratio = seg.char_end / total_chars

    audio_start_ms = start_ratio * audio_duration_ms
    audio_end_ms = end_ratio * audio_duration_ms

    extract_audio(audio_full, audio_start_ms, audio_end_ms)
```

**Avantages:** Simple, rapide
**Inconvénients:** Imprécis si vitesse de parole variable

#### **Option B: Forced Alignment avec Whisper** 🟢 RECOMMANDÉ

```python
# Utiliser Whisper en mode "word-level timestamps"
# pour obtenir les timestamps exacts de chaque mot traduit

from faster_whisper import WhisperModel

# 1. Synthétiser l'audio complet
audio_s1_full = synthesize(texte_traduit_complet, voice_s1)

# 2. Transcription avec timestamps mot par mot
model = WhisperModel("base")
segments, info = model.transcribe(
    audio_s1_full,
    word_timestamps=True  # ✅ Timestamps précis par mot
)

# 3. Mapper les mots aux segments originaux
for original_seg in original_segments:
    # Trouver les mots correspondants dans la transcription
    matching_words = find_matching_words(original_seg.translated_text, segments)

    # Extraire l'audio entre start et end du premier/dernier mot
    audio_start_ms = matching_words[0].start * 1000
    audio_end_ms = matching_words[-1].end * 1000

    segment_audio = extract_audio(audio_s1_full, audio_start_ms, audio_end_ms)
```

**Avantages:**
- ✅ Précision au niveau du mot
- ✅ S'adapte automatiquement aux variations de vitesse
- ✅ Utilise Whisper déjà dans la stack

**Inconvénients:**
- Temps de traitement supplémentaire (~2s par speaker)
- Nécessite transcription de l'audio synthétisé

#### **Option C: Time-Stretching avec Alignement** 🟢

```python
# 1. Découper proportionnellement (Option A)
# 2. Ajuster chaque segment à sa durée cible

for i, seg in enumerate(segments):
    # Découpage proportionnel
    seg_audio = extract_proportional(audio_full, i)

    # Calculer durée cible (durée originale)
    target_duration_ms = seg.original_end_ms - seg.original_start_ms
    actual_duration_ms = get_duration(seg_audio)

    # Time-stretch si nécessaire
    if abs(actual_duration_ms - target_duration_ms) > tolerance:
        seg_audio = librosa.time_stretch(
            seg_audio,
            rate=actual_duration_ms / target_duration_ms
        )
```

**Avantages:**
- ✅ Alignement parfait avec timestamps originaux
- ✅ Qualité audio préservée (phase vocoder)

**Inconvénients:**
- Légère distorsion si ratio > 1.2×

### 3.2 Ordre de Réassemblage

**Problème:**
Après re-découpage, comment intercaler les segments des différents speakers selon l'ordre chronologique original?

**Solution:**

```python
# 1. Créer une liste ordonnée de tous les segments (tous speakers)
all_segments = []

for speaker_id, speaker_audio_full in speaker_audios.items():
    # Re-découper selon timestamps originaux
    for seg in speaker_segments[speaker_id]:
        segment_audio = extract_with_alignment(speaker_audio_full, seg)
        all_segments.append({
            'audio': segment_audio,
            'speaker_id': speaker_id,
            'start_ms': seg.original_start_ms,
            'end_ms': seg.original_end_ms,
            'order': seg.original_index
        })

# 2. Trier par ordre original
all_segments.sort(key=lambda s: s['order'])

# 3. Concaténer avec silences
final_audio = AudioSegment.empty()

for i, seg in enumerate(all_segments):
    # Insérer silence si gap
    if i > 0:
        gap_ms = seg['start_ms'] - all_segments[i-1]['end_ms']
        if gap_ms > 100:  # Minimum 100ms
            final_audio += AudioSegment.silent(duration=min(gap_ms, 3000))

    # Ajouter le segment
    final_audio += seg['audio']
```

### 3.3 Synchronisation Labiale (Lip Sync)

**Problème:**
Si l'audio synthétisé ne correspond pas exactement aux durées originales, le lip sync sera désynchronisé.

**Solution:**
Time-stretching obligatoire pour maintenir les durées exactes.

```python
for seg in segments:
    # Durée originale FIXE
    target_duration = seg.original_end_ms - seg.original_start_ms

    # Ajuster l'audio synthétisé
    seg.audio = time_stretch_to_exact_duration(seg.audio, target_duration)
```

---

## 4. Plan d'Implémentation

### Phase 1: Préparation (Étapes 1-3)

#### **Étape 1: Modifier la structure des données**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
@dataclass
class SpeakerText:
    """Texte complet d'un speaker avec mapping vers segments originaux"""
    speaker_id: str
    full_text: str  # Texte concaténé de tous les segments
    segments: List[Dict[str, Any]]  # Segments originaux avec positions
    # Position de chaque segment dans full_text
    segment_char_positions: List[Tuple[int, int]]  # [(start, end), ...]

@dataclass
class SpeakerTranslation:
    """Traduction globale d'un speaker"""
    speaker_id: str
    original_text: str
    translated_text: str
    source_language: str
    target_language: str
    segments_mapping: List[Dict[str, Any]]  # Mapping segments originaux

@dataclass
class SpeakerAudio:
    """Audio synthétisé complet d'un speaker"""
    speaker_id: str
    full_audio_path: str
    duration_ms: int
    word_timestamps: Optional[List[Dict[str, Any]]]  # Timestamps Whisper
```
```

#### **Étape 2: Fonction de regroupement par speaker**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
def group_segments_by_speaker(
    segments: List[Dict[str, Any]]
) -> Dict[str, SpeakerText]:
    """
    Regroupe les segments par speaker en conservant l'ordre.

    Args:
        segments: Segments de transcription avec speaker_id

    Returns:
        Dict[speaker_id → SpeakerText] avec texte complet et positions
    """
    speakers_data = {}

    for seg in segments:
        speaker_id = seg.get('speaker_id', 's0')

        if speaker_id not in speakers_data:
            speakers_data[speaker_id] = {
                'segments': [],
                'text_parts': [],
                'char_positions': []
            }

        speakers_data[speaker_id]['segments'].append(seg)
        speakers_data[speaker_id]['text_parts'].append(seg['text'])

    # Construire SpeakerText pour chaque speaker
    result = {}

    for speaker_id, data in speakers_data.items():
        # Concaténer avec espaces
        full_text = ' '.join(data['text_parts'])

        # Calculer positions des segments dans le texte complet
        char_positions = []
        current_pos = 0

        for text_part in data['text_parts']:
            start_pos = current_pos
            end_pos = current_pos + len(text_part)
            char_positions.append((start_pos, end_pos))
            current_pos = end_pos + 1  # +1 pour l'espace

        result[speaker_id] = SpeakerText(
            speaker_id=speaker_id,
            full_text=full_text,
            segments=data['segments'],
            segment_char_positions=char_positions
        )

    return result
```

#### **Étape 3: Fonction de traduction globale**

**Fichier:** `audio_pipeline/translation_stage.py`

```python
async def translate_speakers_globally(
    self,
    speakers_text: Dict[str, SpeakerText],
    source_language: str,
    target_language: str
) -> Dict[str, SpeakerTranslation]:
    """
    Traduit le texte complet de chaque speaker en UNE fois.

    Args:
        speakers_text: Textes complets par speaker
        source_language: Langue source
        target_language: Langue cible

    Returns:
        Dict[speaker_id → SpeakerTranslation]
    """
    translations = {}

    # Traduire chaque speaker en parallèle
    tasks = []
    for speaker_id, speaker_text in speakers_text.items():
        task = self._translate_speaker_text(
            speaker_id,
            speaker_text,
            source_language,
            target_language
        )
        tasks.append(task)

    results = await asyncio.gather(*tasks)

    for result in results:
        translations[result.speaker_id] = result

    return translations

async def _translate_speaker_text(
    self,
    speaker_id: str,
    speaker_text: SpeakerText,
    source_language: str,
    target_language: str
) -> SpeakerTranslation:
    """Traduit le texte complet d'un speaker"""

    logger.info(
        f"[TRANSLATION] 🌍 Traduction globale {speaker_id}: "
        f"{len(speaker_text.full_text)} chars"
    )

    # Appel de traduction unique avec contexte complet
    translation_result = await self.translation_service.translate_with_structure(
        text=speaker_text.full_text,
        source_lang=source_language,
        target_lang=target_language,
        channel="AUDIO_PIPELINE"
    )

    translated_text = translation_result['translated_text']

    logger.info(
        f"[TRANSLATION] ✅ {speaker_id}: "
        f"'{speaker_text.full_text[:50]}...' → "
        f"'{translated_text[:50]}...'"
    )

    return SpeakerTranslation(
        speaker_id=speaker_id,
        original_text=speaker_text.full_text,
        translated_text=translated_text,
        source_language=source_language,
        target_language=target_language,
        segments_mapping=[
            {
                'segment_index': i,
                'original_text': seg['text'],
                'char_start': pos[0],
                'char_end': pos[1]
            }
            for i, (seg, pos) in enumerate(
                zip(speaker_text.segments, speaker_text.segment_char_positions)
            )
        ]
    )
```

### Phase 2: Synthèse et Re-découpage (Étapes 4-6)

#### **Étape 4: Synthèse globale par speaker**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
async def synthesize_speakers_globally(
    self,
    speaker_translations: Dict[str, SpeakerTranslation],
    speaker_voice_maps: Dict[str, SpeakerVoiceMap],
    target_language: str
) -> Dict[str, SpeakerAudio]:
    """
    Synthétise le texte complet de chaque speaker en UNE fois.

    Args:
        speaker_translations: Traductions globales par speaker
        speaker_voice_maps: Voice models par speaker
        target_language: Langue cible

    Returns:
        Dict[speaker_id → SpeakerAudio] avec audio complet
    """
    speaker_audios = {}

    # Synthétiser chaque speaker en parallèle
    tasks = []
    for speaker_id, translation in speaker_translations.items():
        voice_map = speaker_voice_maps.get(speaker_id)

        task = self._synthesize_speaker_full(
            speaker_id,
            translation,
            voice_map,
            target_language
        )
        tasks.append(task)

    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, Exception):
            logger.error(f"[SYNTH] Erreur synthèse: {result}")
            continue

        speaker_audios[result.speaker_id] = result

    return speaker_audios

async def _synthesize_speaker_full(
    self,
    speaker_id: str,
    translation: SpeakerTranslation,
    voice_map: SpeakerVoiceMap,
    target_language: str
) -> SpeakerAudio:
    """Synthétise le texte complet d'un speaker"""

    logger.info(
        f"[SYNTH] 🎤 Synthèse globale {speaker_id}: "
        f"{len(translation.translated_text)} chars"
    )

    # Synthétiser TOUT le texte en UNE fois
    output_path = os.path.join(
        self.temp_dir,
        f"speaker_{speaker_id}_full.mp3"
    )

    tts_result = await self.tts_service.synthesize_with_voice(
        text=translation.translated_text,
        speaker_audio_path=voice_map.audio_reference_path if voice_map else None,
        target_language=target_language,
        output_format="mp3",
        message_id=f"{speaker_id}_full",
        conditionals=voice_map.voice_model.chatterbox_conditionals if voice_map else None
    )

    if not tts_result or not tts_result.audio_path:
        raise RuntimeError(f"Échec synthèse {speaker_id}")

    logger.info(
        f"[SYNTH] ✅ {speaker_id}: {tts_result.duration_ms}ms généré"
    )

    # IMPORTANT: Obtenir word-level timestamps via Whisper
    word_timestamps = await self._get_word_timestamps(
        tts_result.audio_path,
        translation.translated_text,
        target_language
    )

    return SpeakerAudio(
        speaker_id=speaker_id,
        full_audio_path=tts_result.audio_path,
        duration_ms=tts_result.duration_ms,
        word_timestamps=word_timestamps
    )
```

#### **Étape 5: Obtenir timestamps mot par mot avec Whisper**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
async def _get_word_timestamps(
    self,
    audio_path: str,
    expected_text: str,
    language: str
) -> List[Dict[str, Any]]:
    """
    Obtient les timestamps précis de chaque mot via Whisper.

    Args:
        audio_path: Audio synthétisé
        expected_text: Texte attendu
        language: Langue de l'audio

    Returns:
        Liste de {word: str, start: float, end: float}
    """
    from faster_whisper import WhisperModel

    logger.info(f"[ALIGNMENT] Analyse timestamps mot par mot: {audio_path}")

    # Utiliser model base pour rapidité
    model = WhisperModel("base", device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        language=language,
        word_timestamps=True,  # ✅ Activer timestamps par mot
        condition_on_previous_text=False
    )

    # Extraire tous les mots avec timestamps
    words = []
    for segment in segments:
        if hasattr(segment, 'words'):
            for word in segment.words:
                words.append({
                    'word': word.word.strip(),
                    'start': word.start,
                    'end': word.end,
                    'probability': word.probability
                })

    logger.info(f"[ALIGNMENT] ✅ {len(words)} mots détectés")

    return words
```

#### **Étape 6: Re-découper l'audio selon les segments originaux**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
async def slice_speaker_audio_by_segments(
    self,
    speaker_audio: SpeakerAudio,
    speaker_translation: SpeakerTranslation,
    original_segments: List[Dict[str, Any]]
) -> List[SegmentSynthesisResult]:
    """
    Découpe l'audio complet du speaker selon les segments originaux.

    Utilise les word-level timestamps de Whisper pour un alignement précis.

    Args:
        speaker_audio: Audio complet du speaker avec timestamps
        speaker_translation: Traduction avec mapping segments
        original_segments: Segments originaux avec timestamps

    Returns:
        Liste de SegmentSynthesisResult pour chaque segment
    """
    from pydub import AudioSegment

    results = []
    full_audio = AudioSegment.from_file(speaker_audio.full_audio_path)

    logger.info(
        f"[SLICE] Découpage {speaker_audio.speaker_id}: "
        f"{len(original_segments)} segments"
    )

    for i, seg_info in enumerate(speaker_translation.segments_mapping):
        original_seg = original_segments[seg_info['segment_index']]

        # Extraire la portion du texte traduit correspondant à ce segment
        # Via mapping char_start/char_end
        seg_translated_text = speaker_translation.translated_text[
            seg_info['char_start']:seg_info['char_end']
        ]

        # Trouver les timestamps des mots correspondants
        seg_words = self._find_words_for_segment(
            seg_translated_text,
            speaker_audio.word_timestamps
        )

        if not seg_words:
            logger.warning(f"[SLICE] Aucun mot trouvé pour segment {i}")
            continue

        # Extraire l'audio entre le premier et dernier mot
        start_ms = int(seg_words[0]['start'] * 1000)
        end_ms = int(seg_words[-1]['end'] * 1000)

        segment_audio = full_audio[start_ms:end_ms]

        # Sauvegarder le segment
        segment_path = os.path.join(
            self.temp_dir,
            f"seg_{i}_{speaker_audio.speaker_id}.mp3"
        )
        segment_audio.export(segment_path, format="mp3")

        # Calculer durée cible (originale)
        target_duration_ms = original_seg['end_ms'] - original_seg['start_ms']
        actual_duration_ms = len(segment_audio)

        # Time-stretch si nécessaire pour alignement parfait
        if abs(actual_duration_ms - target_duration_ms) > target_duration_ms * 0.1:
            segment_path = await self._time_stretch_segment(
                segment_path,
                actual_duration_ms,
                target_duration_ms
            )
            actual_duration_ms = target_duration_ms

        results.append(SegmentSynthesisResult(
            segment_index=i,
            speaker_id=speaker_audio.speaker_id,
            text=seg_translated_text,
            audio_path=segment_path,
            duration_ms=actual_duration_ms,
            silence_before_ms=0,  # Sera calculé plus tard
            silence_after_ms=0,
            success=True
        ))

        logger.debug(
            f"[SLICE] Segment {i}: "
            f"{start_ms}-{end_ms}ms → {actual_duration_ms}ms "
            f"(cible: {target_duration_ms}ms)"
        )

    return results

def _find_words_for_segment(
    self,
    segment_text: str,
    all_words: List[Dict[str, Any]],
    start_word_index: int = 0
) -> List[Dict[str, Any]]:
    """
    Trouve les mots dans all_words qui correspondent au segment_text.

    Utilise fuzzy matching pour robustesse.
    """
    import difflib

    segment_words_expected = segment_text.lower().split()
    matched_words = []

    i = start_word_index
    while i < len(all_words) and len(matched_words) < len(segment_words_expected):
        word = all_words[i]['word'].lower().strip('.,!?;:')
        expected = segment_words_expected[len(matched_words)]

        # Fuzzy match (tolérance pour variations)
        similarity = difflib.SequenceMatcher(None, word, expected).ratio()

        if similarity > 0.7:  # 70% similarité
            matched_words.append(all_words[i])

        i += 1

    return matched_words

async def _time_stretch_segment(
    self,
    audio_path: str,
    current_duration_ms: int,
    target_duration_ms: int
) -> str:
    """Ajuste la durée d'un segment via time-stretching"""
    import librosa
    import soundfile as sf

    stretch_rate = current_duration_ms / target_duration_ms

    logger.info(
        f"[STRETCH] {current_duration_ms}ms → {target_duration_ms}ms "
        f"(rate={stretch_rate:.3f})"
    )

    loop = asyncio.get_event_loop()

    def stretch():
        y, sr = librosa.load(audio_path, sr=None)
        y_stretched = librosa.effects.time_stretch(y, rate=stretch_rate)
        sf.write(audio_path, y_stretched, sr)
        return audio_path

    return await loop.run_in_executor(None, stretch)
```

### Phase 3: Réassemblage Final (Étape 7)

#### **Étape 7: Réassembler tous les segments dans l'ordre**

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
async def reassemble_final_audio(
    self,
    all_segment_results: Dict[str, List[SegmentSynthesisResult]],
    original_segments: List[Dict[str, Any]],
    output_path: str
) -> Tuple[str, int]:
    """
    Réassemble tous les segments découpés dans l'ordre chronologique original.

    Args:
        all_segment_results: Segments découpés par speaker
        original_segments: Segments originaux avec ordre et timestamps
        output_path: Chemin de sortie

    Returns:
        (audio_path, duration_ms)
    """
    from pydub import AudioSegment

    # 1. Créer une liste ordonnée de tous les segments
    ordered_segments = []

    for speaker_id, results in all_segment_results.items():
        for result in results:
            # Trouver le segment original correspondant
            original_seg = original_segments[result.segment_index]

            ordered_segments.append({
                'result': result,
                'original': original_seg,
                'order': result.segment_index,
                'start_ms': original_seg['start_ms'],
                'end_ms': original_seg['end_ms']
            })

    # 2. Trier par ordre original
    ordered_segments.sort(key=lambda s: s['order'])

    logger.info(
        f"[REASSEMBLE] Assemblage final: {len(ordered_segments)} segments"
    )

    # 3. Concaténer avec silences
    final_audio = AudioSegment.empty()

    for i, seg_data in enumerate(ordered_segments):
        # Insérer silence si gap
        if i > 0:
            prev_end = ordered_segments[i-1]['end_ms']
            curr_start = seg_data['start_ms']
            gap_ms = curr_start - prev_end

            if gap_ms >= 100:  # Minimum 100ms
                silence_duration = min(gap_ms, 3000)  # Max 3s
                final_audio += AudioSegment.silent(duration=silence_duration)
                logger.debug(f"[REASSEMBLE] Silence {i}: {silence_duration}ms")

        # Ajouter le segment
        segment_audio = AudioSegment.from_file(seg_data['result'].audio_path)
        final_audio += segment_audio

        logger.debug(
            f"[REASSEMBLE] Segment {i} ({seg_data['result'].speaker_id}): "
            f"{len(segment_audio)}ms"
        )

    # 4. Exporter
    final_audio.export(output_path, format="mp3")

    duration_ms = len(final_audio)

    logger.info(
        f"[REASSEMBLE] ✅ Audio final: {duration_ms}ms → {output_path}"
    )

    return (output_path, duration_ms)
```

---

## 5. Code d'Implémentation

### Pipeline Complet avec Nouvelle Architecture

**Fichier:** `audio_pipeline/multi_speaker_synthesis.py`

```python
async def synthesize_multi_speaker_global(
    self,
    segments: List[Dict[str, Any]],
    source_audio_path: str,
    diarization_result: Any,
    user_voice_model: Optional[Any],
    source_language: str,
    target_language: str,
    output_path: str,
    message_id: str = "unknown"
) -> Tuple[str, int, List[SegmentSynthesisResult]]:
    """
    Pipeline complet de synthèse multi-speaker avec traduction globale.

    NOUVELLE ARCHITECTURE:
    1. Regrouper segments par speaker
    2. Traduire texte COMPLET de chaque speaker
    3. Synthétiser audio COMPLET de chaque speaker
    4. Re-découper selon timestamps originaux
    5. Réassembler dans l'ordre avec silences

    Args:
        segments: Segments de transcription avec speaker_id
        source_audio_path: Audio source
        diarization_result: Résultat diarisation
        user_voice_model: Modèle vocal utilisateur
        source_language: Langue source
        target_language: Langue cible
        output_path: Chemin de sortie
        message_id: ID du message

    Returns:
        (audio_path, duration_ms, segment_results)
    """

    logger.info(
        f"[MULTI_SPEAKER_GLOBAL] 🚀 Pipeline global: "
        f"{len(segments)} segments, {source_language}→{target_language}"
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 1: Créer voice models par speaker (avec conditionals)
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 1/7] Création voice models...")
    speaker_voice_maps = await self.create_speaker_voice_maps(
        segments=segments,
        source_audio_path=source_audio_path,
        diarization_result=diarization_result,
        user_voice_model=user_voice_model
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 2: Regrouper segments par speaker
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 2/7] Regroupement par speaker...")
    speakers_text = group_segments_by_speaker(segments)

    logger.info(
        f"[MULTI_SPEAKER_GLOBAL] Speakers groupés: "
        f"{', '.join(f'{sid} ({len(st.segments)} segs)' for sid, st in speakers_text.items())}"
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 3: Traduire texte COMPLET de chaque speaker
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 3/7] Traduction globale par speaker...")
    speaker_translations = await self.translate_speakers_globally(
        speakers_text=speakers_text,
        source_language=source_language,
        target_language=target_language
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 4: Synthétiser audio COMPLET de chaque speaker
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 4/7] Synthèse globale par speaker...")
    speaker_audios = await self.synthesize_speakers_globally(
        speaker_translations=speaker_translations,
        speaker_voice_maps=speaker_voice_maps,
        target_language=target_language
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 5: Re-découper audio selon segments originaux
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 5/7] Re-découpage par timestamps...")
    all_segment_results = {}

    for speaker_id, speaker_audio in speaker_audios.items():
        speaker_translation = speaker_translations[speaker_id]
        speaker_text = speakers_text[speaker_id]

        segment_results = await self.slice_speaker_audio_by_segments(
            speaker_audio=speaker_audio,
            speaker_translation=speaker_translation,
            original_segments=speaker_text.segments
        )

        all_segment_results[speaker_id] = segment_results

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 6: Réassembler tous les segments dans l'ordre
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 6/7] Réassemblage final...")
    final_audio_path, duration_ms = await self.reassemble_final_audio(
        all_segment_results=all_segment_results,
        original_segments=segments,
        output_path=output_path
    )

    # ═══════════════════════════════════════════════════════════════════
    # ÉTAPE 7: Validation et nettoyage
    # ═══════════════════════════════════════════════════════════════════
    logger.info("[STEP 7/7] Validation...")

    # Aplatir les résultats
    flat_results = [
        result
        for results in all_segment_results.values()
        for result in results
    ]

    success_count = sum(1 for r in flat_results if r.success)
    total_count = len(flat_results)

    logger.info(
        f"[MULTI_SPEAKER_GLOBAL] ✅ Pipeline terminé: "
        f"{success_count}/{total_count} segments, "
        f"{duration_ms}ms audio final"
    )

    return (final_audio_path, duration_ms, flat_results)
```

---

## 6. Comparaison Performance

### Métriques de Performance

| Métrique | Architecture Actuelle | Nouvelle Architecture | Gain |
|----------|----------------------|----------------------|------|
| **Appels traduction** | 34 | 2 | **94% ↓** |
| **Appels TTS** | 34 | 2 | **94% ↓** |
| **Temps traduction** | ~6.8s | ~0.4s | **16× plus rapide** |
| **Temps synthèse TTS** | ~25s (séquentiel) | ~4s (parallèle) | **6× plus rapide** |
| **Re-découpage** | - | ~2s | +2s |
| **Temps TOTAL** | ~31s | ~6.4s | **79% ↓** |

### Qualité Audio

| Critère | Actuelle | Nouvelle | Amélioration |
|---------|----------|----------|--------------|
| **Cohérence traduction** | Segments isolés | Contexte complet | ✅ Meilleure |
| **Fluidité audio** | Ruptures entre segments | Audio continu | ✅ Meilleure |
| **Intonation** | Artificielle | Naturelle | ✅ Meilleure |
| **Synchronisation** | Time-stretch par segment | Time-stretch global | ✅ Plus précis |

---

## 7. Conclusion

### Recommandation: ✅ ADOPTER la Nouvelle Architecture

**Raisons:**

1. **Performance:** 79% de réduction du temps (31s → 6.4s)
2. **Qualité:** Traduction cohérente avec contexte complet
3. **Coût:** 94% de réduction des appels API
4. **Fluidité:** Audio naturel sans ruptures artificielles
5. **Maintenabilité:** Pipeline plus simple (7 étapes vs 34 itérations)

**Trade-offs acceptables:**

- +2s pour re-découpage et alignement Whisper
- Complexité additionnelle du re-découpage (gérable avec Whisper word-timestamps)

**Implémentation progressive:**

1. **Phase 1** (1-2 jours): Implémenter regroupement + traduction globale
2. **Phase 2** (2-3 jours): Synthèse globale + re-découpage Whisper
3. **Phase 3** (1 jour): Tests et optimisations

**Total:** 4-6 jours de développement pour gains massifs de performance et qualité.
