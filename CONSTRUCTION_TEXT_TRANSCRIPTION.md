# Comment le texte de transcription est construit

## 📝 Processus complet

### Étape 1 : Whisper retourne des segments (phrases complètes)

```python
# Fichier: services/translator/src/services/transcription_service.py (ligne 283-298)

segments_raw, info = await loop.run_in_executor(
    None,
    lambda: model.transcribe(
        audio_path,
        beam_size=1,
        best_of=1,
        word_timestamps=return_timestamps,
        vad_filter=True
    )
)
```

**Whisper retourne naturellement des segments qui correspondent à des phrases complètes.**

Exemple de sortie Whisper :
```python
[
    Segment(text=" Bonjour comment allez-vous aujourd'hui mon ami", start=0.0, end=3.0),
    Segment(text=" C'est une belle journée n'est-ce pas", start=3.5, end=6.2),
]
```

---

### Étape 2 : Construction du texte complet (AVANT division)

```python
# Ligne 301-302

segments_list = list(segments_raw)
full_text = " ".join([s.text.strip() for s in segments_list])
```

**Le texte complet est créé en joignant TOUS les segments originaux de Whisper.**

Résultat :
```python
full_text = "Bonjour comment allez-vous aujourd'hui mon ami C'est une belle journée n'est-ce pas"
```

**⚠️ Point important:** Le texte est construit à partir des segments **ORIGINAUX** de Whisper (phrases complètes), **PAS** des segments divisés en 1-5 mots.

---

### Étape 3 : Conversion en objets TranscriptionSegment

```python
# Ligne 305-314

segments = []
if return_timestamps:
    # Créer les segments originaux de Whisper
    for s in segments_list:
        segments.append(TranscriptionSegment(
            text=s.text.strip(),
            start_ms=int(s.start * 1000),
            end_ms=int(s.end * 1000),
            confidence=getattr(s, 'avg_logprob', 0.0)
        ))
```

À ce stade, on a des segments de phrases complètes :
```python
[
    TranscriptionSegment(
        text="Bonjour comment allez-vous aujourd'hui mon ami",
        start_ms=0,
        end_ms=3000,
        confidence=0.95
    ),
    TranscriptionSegment(
        text="C'est une belle journée n'est-ce pas",
        start_ms=3500,
        end_ms=6200,
        confidence=0.93
    )
]
```

---

### Étape 4 : Division en sous-segments de 1-5 mots

```python
# Ligne 316-317

# Diviser en sous-segments de 1-5 mots pour synchronisation fine
segments = split_segments_into_words(segments, max_words=5)
```

**Cette fonction divise chaque segment en morceaux de maximum 5 mots.**

Résultat après division :
```python
[
    TranscriptionSegment(
        text="Bonjour comment allez-vous aujourd'hui",
        start_ms=0,
        end_ms=2142,
        confidence=0.95
    ),
    TranscriptionSegment(
        text="mon ami",
        start_ms=2142,
        end_ms=3000,
        confidence=0.95
    ),
    TranscriptionSegment(
        text="C'est une belle journée n'est-ce",
        start_ms=3500,
        end_ms=5350,
        confidence=0.93
    ),
    TranscriptionSegment(
        text="pas",
        start_ms=5350,
        end_ms=6200,
        confidence=0.93
    )
]
```

---

### Étape 5 : Retour du résultat

```python
# Ligne 321-330

return TranscriptionResult(
    text=full_text,  # ✅ Texte complet (phrases jointes)
    language=info.language,
    confidence=info.language_probability,
    segments=segments,  # ✅ Segments divisés (1-5 mots)
    duration_ms=int(info.duration * 1000),
    source="whisper",
    model="whisper_boost",
    processing_time_ms=processing_time
)
```

---

## 🔍 Exemple concret

### Entrée audio
> "Bonjour comment allez-vous aujourd'hui mon ami C'est une belle journée n'est-ce pas"

### Sortie de Whisper (segments originaux)
```python
[
    Segment(text=" Bonjour comment allez-vous aujourd'hui mon ami", start=0.0, end=3.0),
    Segment(text=" C'est une belle journée n'est-ce pas", start=3.5, end=6.2)
]
```

### Construction du texte complet (ligne 302)
```python
full_text = " ".join([s.text.strip() for s in segments_list])
# Résultat: "Bonjour comment allez-vous aujourd'hui mon ami C'est une belle journée n'est-ce pas"
```

### Division en sous-segments (ligne 317)
```python
segments = split_segments_into_words(segments, max_words=5)
# Résultat: 4 segments de 1-5 mots
```

### Résultat final
```python
TranscriptionResult(
    text="Bonjour comment allez-vous aujourd'hui mon ami C'est une belle journée n'est-ce pas",
    segments=[
        TranscriptionSegment(text="Bonjour comment allez-vous aujourd'hui", start_ms=0, end_ms=2142),
        TranscriptionSegment(text="mon ami", start_ms=2142, end_ms=3000),
        TranscriptionSegment(text="C'est une belle journée n'est-ce", start_ms=3500, end_ms=5350),
        TranscriptionSegment(text="pas", start_ms=5350, end_ms=6200)
    ]
)
```

---

## 📊 Récapitulatif

| Élément | Valeur | Source |
|---------|--------|--------|
| **full_text** | Texte complet (toutes phrases jointes) | Segments ORIGINAUX de Whisper (ligne 302) |
| **segments** | Liste de sous-segments (1-5 mots) | Segments DIVISÉS par split_segments_into_words (ligne 317) |
| **Ordre** | 1. Créer full_text → 2. Diviser segments | Important : le texte n'est PAS recréé après division |

---

## ⚠️ Points importants

1. **Le texte complet (`full_text`) est créé AVANT la division des segments**
   - Il provient des segments originaux de Whisper (phrases complètes)
   - La division en 1-5 mots n'affecte PAS le texte complet

2. **Les segments sont divisés APRÈS la création du texte**
   - La division ne modifie que les timestamps et la granularité
   - Le texte de chaque sous-segment est une partie du texte original

3. **Vérification de cohérence**
   - Si on joint tous les textes des segments divisés, on retrouve `full_text`
   - Les timestamps sont interpolés linéairement

---

## 🔧 Fonction de division des segments

```python
# Fichier: services/translator/src/utils/segment_splitter.py

def split_segments_into_words(
    segments: List[TranscriptionSegment],
    max_words: int = 5
) -> List[TranscriptionSegment]:
    """
    Divise les segments en sous-segments de max_words mots maximum.
    Interpole les timestamps pour chaque sous-segment.

    IMPORTANT: Ne modifie PAS le texte complet, seulement la granularité des segments.
    """
    result = []

    for segment in segments:
        words = re.findall(r'\S+', segment.text)

        if len(words) <= max_words:
            result.append(segment)
            continue

        # Diviser en chunks de max_words
        total_duration_ms = segment.end_ms - segment.start_ms
        ms_per_word = total_duration_ms / len(words)

        for i in range(0, len(words), max_words):
            chunk_words = words[i:i + max_words]
            chunk_text = " ".join(chunk_words)

            chunk_start_ms = int(segment.start_ms + i * ms_per_word)
            chunk_end_ms = int(segment.start_ms + (i + len(chunk_words)) * ms_per_word)

            result.append(TranscriptionSegment(
                text=chunk_text,
                start_ms=chunk_start_ms,
                end_ms=chunk_end_ms,
                confidence=segment.confidence
            ))

    return result
```

---

## ✅ Conclusion

Le champ `text` est construit par **simple jointure** des segments originaux de Whisper :

```python
full_text = " ".join([s.text.strip() for s in segments_list])
```

Cette opération se fait **AVANT** la division en sous-segments de 1-5 mots, garantissant que :
1. Le texte complet reste intact
2. Les segments divisés peuvent être utilisés pour la synchronisation audio/texte
3. La somme des textes des segments divisés = texte complet
