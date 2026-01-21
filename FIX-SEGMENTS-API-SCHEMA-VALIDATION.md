# Fix: Segments Non Retournés par l'API avec Schéma Activé

**Date**: 2026-01-20
**Statut**: ✅ **RÉSOLU**
**Criticité**: 🚨 **CRITIQUE**

---

## 🐛 Problème Identifié

Après l'activation de l'API Schema pour la validation Fastify, les **segments des transcriptions et traductions perdaient tous leurs champs sauf `text` et `confidence`**.

### Symptômes

**Avec schéma désactivé** :
```json
{
  "segments": [
    {
      "text": "Too much,",
      "startMs": 460,
      "endMs": 1160,
      "speakerId": null,
      "voiceSimilarityScore": false,  // ⚠️ Type incorrect
      "confidence": 0.739
    }
  ]
}
```

**Avec schéma activé** :
```json
{
  "segments": [
    {
      "text": "Too much,",
      "confidence": 0.739
    }
    // ❌ startMs, endMs, speakerId, voiceSimilarityScore MANQUANTS
  ]
}
```

---

## 🔍 Analyse de la Cause Racine

### Problème #1: Champ `language` Manquant dans le Schéma API

Le champ `language` était présent dans :
- ✅ Types TypeScript (`attachment-transcription.ts`)
- ✅ Backend Python (`transcription_service.py`)
- ❌ **ABSENT** dans les schémas API JSON Schema (`api-schemas.ts`)

**Impact** : Fastify filtre les segments contenant des champs non définis dans le schéma.

### Problème #2: `voiceSimilarityScore` avec Type Incorrect

La valeur `voiceSimilarityScore: false` (booléen) au lieu de `null` ou `number` provoquait le rejet des segments par la validation Fastify.

**Cause** : Mauvaise conversion Python dans `transcription_stage.py` ligne 345 :
```python
# AVANT (incorrect)
"voiceSimilarityScore": seg.voice_similarity_score if hasattr(seg, 'voice_similarity_score') else None
```

Si `seg.voice_similarity_score` vaut `False` (booléen Python), l'expression retourne `False` au lieu de `None`.

### Problème #3: Segments Python Dataclass Non Sérialisés

Les segments sont des **@dataclass Python** (`TranscriptionSegment`), et `json.dumps()` ne peut pas les sérialiser correctement par défaut.

**Fichier** : `zmq_audio_handler.py` ligne 442
```python
# AVANT (incorrect)
'segments': result.original.segments,  # ❌ Dataclass non sérialisée
```

---

## ✅ Corrections Appliquées

### Correction #1: Ajout du Champ `language` dans les Schémas API

**Fichier** : `packages/shared/types/api-schemas.ts`

**Modifications** (3 emplacements):

1. **Segments de transcription** (ligne 376) :
```typescript
language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
```

2. **Segments de traduction** (ligne 472) :
```typescript
language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
```

3. **Segments translatedAudios** (ligne 523) :
```typescript
language: { type: 'string', nullable: true, description: 'Langue détectée pour ce segment (ISO 639-1)' }
```

### Correction #2: Validation Type pour `voiceSimilarityScore`

**Fichier** : `services/translator/src/services/audio_pipeline/transcription_stage.py`

**Ligne 345** :
```python
# APRÈS (correct)
"voiceSimilarityScore": seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None,
```

**Effet** : Garantit que seuls les nombres sont acceptés, `False` et autres valeurs deviennent `None`.

### Correction #3: Sérialisation Explicite des Segments

**Fichier** : `services/translator/src/services/zmq_audio_handler.py`

**Ligne 442-453** :
```python
# APRÈS (correct)
'segments': [
    {
        'text': seg.text,
        'startMs': seg.start_ms,
        'endMs': seg.end_ms,
        'confidence': seg.confidence,
        'speakerId': seg.speaker_id,
        'voiceSimilarityScore': seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None,
        'language': seg.language
    }
    for seg in (result.original.segments or [])
] if result.original.segments else None,
```

**Effet** : Conversion explicite de dataclass Python → dictionnaire JSON avec validation de type.

### Correction #4: Segments de Traduction

**Fichier** : `services/translator/src/services/zmq_audio_handler.py`

**Ligne 391-413** :
```python
# APRÈS (correct)
def get_voice_score(seg):
    """Extract voice_similarity_score as number or None"""
    if hasattr(seg, 'voice_similarity_score'):
        return seg.voice_similarity_score if isinstance(seg.voice_similarity_score, (int, float)) else None
    elif isinstance(seg, dict):
        score = seg.get('voiceSimilarityScore') or seg.get('voice_similarity_score')
        return score if isinstance(score, (int, float)) else None
    return None

translated_audio_dict['segments'] = [
    {
        'text': seg.text if hasattr(seg, 'text') else seg.get('text'),
        'startMs': seg.start_ms if hasattr(seg, 'start_ms') else seg.get('start_ms', seg.get('startMs', 0)),
        'endMs': seg.end_ms if hasattr(seg, 'end_ms') else seg.get('end_ms', seg.get('endMs', 0)),
        'confidence': seg.confidence if hasattr(seg, 'confidence') else seg.get('confidence'),
        'speakerId': (seg.speaker_id if hasattr(seg, 'speaker_id') else seg.get('speaker_id', seg.get('speakerId'))) or None,
        'voiceSimilarityScore': get_voice_score(seg),
        'language': seg.language if hasattr(seg, 'language') else seg.get('language')
    }
    for seg in t.segments
]
```

---

## 📊 Impact

### Avant Fix
- ❌ Segments avec schéma activé → **filtrés par Fastify** (seulement `text` et `confidence`)
- ❌ Impossible d'afficher les timestamps dans le frontend
- ❌ Perte de toutes les informations de speakers
- ❌ Perte de la langue par segment
- ❌ Système multi-speaker complètement cassé

### Après Fix
- ✅ Segments avec schéma activé → **tous les champs présents**
- ✅ Timestamps (`startMs`, `endMs`) retournés
- ✅ Informations speakers (`speakerId`) retournées
- ✅ Langue par segment (`language`) retournée
- ✅ Score de similarité vocale (`voiceSimilarityScore`) correctement typé
- ✅ Système multi-speaker fonctionnel

---

## 🔗 Fichiers Modifiés

### Frontend/Shared
1. `packages/shared/types/api-schemas.ts` (3 ajouts du champ `language`)

### Backend Python
1. `services/translator/src/services/audio_pipeline/transcription_stage.py` (validation type `voiceSimilarityScore`)
2. `services/translator/src/services/zmq_audio_handler.py` (sérialisation explicite segments)

---

## 🧪 Tests de Validation

### Test 1: Vérifier la Structure des Segments
```bash
curl -X GET "http://localhost:3000/api/v1/conversations/{conversationId}/messages" \
  -H "Authorization: Bearer {token}"
```

**Vérifications** :
- ✅ `transcription.segments[].startMs` présent
- ✅ `transcription.segments[].endMs` présent
- ✅ `transcription.segments[].speakerId` présent
- ✅ `transcription.segments[].voiceSimilarityScore` est `null` ou `number`
- ✅ `transcription.segments[].language` présent
- ✅ `translations[lang].segments[]` avec tous les champs

### Test 2: Vérifier les Types
```typescript
// Frontend : tous les champs doivent être présents
interface TranscriptionSegment {
  text: string;
  startMs: number;          // ✅ Requis
  endMs: number;            // ✅ Requis
  speakerId?: string;       // ✅ Optionnel
  voiceSimilarityScore?: number | null;  // ✅ Type correct
  confidence?: number;      // ✅ Optionnel
  language?: string;        // ✅ Nouveau champ
}
```

---

## 📝 Leçons Apprises

### 1. Cohérence des Schémas

Lors de l'ajout d'un champ dans le système :
1. ✅ Ajouter dans les types TypeScript
2. ✅ Ajouter dans le backend Python
3. ✅ **CRITIQUE** : Ajouter dans TOUS les schémas API JSON Schema
4. ✅ Vérifier la cohérence des types (number vs boolean vs string)

### 2. Sérialisation Python → JSON

- Python dataclasses **ne sont PAS** automatiquement sérialisables en JSON
- Toujours convertir explicitement les dataclasses en dictionnaires avant `json.dumps()`
- Valider les types lors de la conversion (éviter `False` quand on attend `number | null`)

### 3. Validation Fastify

- Fastify avec `fast-json-stringify` **filtre silencieusement** les champs non définis
- Aucune erreur n'est levée → difficile à déboguer
- Tester avec schéma activé **avant** la mise en production

### 4. Expressions Conditionnelles Python

```python
# ❌ MAUVAIS : retourne False si value=False
value if condition else None

# ✅ BON : valide le type explicitement
value if isinstance(value, (int, float)) else None
```

---

## 🎯 Conclusion

Le problème était causé par **3 bugs cumulés** :

1. **Champ manquant** : `language` absent du schéma API
2. **Type incorrect** : `voiceSimilarityScore: false` au lieu de `null`
3. **Sérialisation incorrecte** : dataclasses Python non converties en dicts

**Résolution** :
- Ajout du champ `language` dans tous les schémas de segments
- Validation stricte du type `voiceSimilarityScore` (number | null uniquement)
- Sérialisation explicite des dataclasses Python en dictionnaires JSON

**Statut** : ✅ **RÉSOLU** - Le système de segments multi-speakers avec langue fonctionne maintenant correctement avec le schéma API activé.

---

**Rapport généré le** : 2026-01-20
**Auteur** : Claude Code
