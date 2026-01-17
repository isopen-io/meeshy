# Architecture Unifiee - Traduction Audio/Texte/Documents

## Vue d'ensemble

Ce document decrit l'architecture unifiee pour la traduction de messages audio, texte et documents
dans Meeshy, avec support complet des langues africaines.

## Pipeline de Traduction Audio

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PIPELINE TRADUCTION AUDIO                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────┐    ┌─────────────┐    ┌───────────┐    ┌────────────────┐   │
│  │  AUDIO   │───>│     STT     │───>│ TRADUCTION│───>│      TTS       │   │
│  │  INPUT   │    │ (Whisper/   │    │   (NLLB)  │    │ (Chatterbox/   │   │
│  │          │    │  MMS-ASR)   │    │           │    │  MMS/Higgs)    │   │
│  └──────────┘    └─────────────┘    └───────────┘    └────────────────┘   │
│        │                │                 │                  │             │
│        │                │                 │                  │             │
│        │         ┌──────▼──────┐    ┌─────▼─────┐     ┌──────▼──────┐     │
│        │         │ Transcription│    │  Texte    │     │ Audio Output │    │
│        │         │    + Lang    │    │ Traduit   │     │ + Voix Clone │    │
│        │         └─────────────┘    └───────────┘     └─────────────┘     │
│        │                                                     │             │
│        └─────────────────┐                                   │             │
│                          ▼                                   │             │
│              ┌───────────────────┐                           │             │
│              │  VOICE PROFILE    │◄──────────────────────────┘             │
│              │  (Si clonage      │                                         │
│              │   disponible)     │                                         │
│              └───────────────────┘                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Services et Moteurs

### 1. STT (Speech-to-Text)

| Moteur | Langues | Qualite | Usage |
|--------|---------|---------|-------|
| **Whisper** | ~100 langues | Excellente | Langues europeennes, asiatiques |
| **MMS-ASR** | 1100+ langues | Bonne | Langues africaines sans support Whisper |

### 2. Traduction (NLLB-200)

| Support | Langues | Notes |
|---------|---------|-------|
| **NLLB-200** | 200+ langues | Support complet des langues africaines |

### 3. TTS (Text-to-Speech)

| Moteur | Langues | Clonage Voix | Usage |
|--------|---------|--------------|-------|
| **Chatterbox** | ~23 langues | Oui | Langues principales (fr, en, es, de, etc.) |
| **Higgs Audio** | ~30 langues | Oui | Langues africaines (sw, am, yo, ha, zu, ig) |
| **MMS TTS** | 1100+ langues | Non | Fallback pour langues sans Chatterbox/Higgs |
| **XTTS** | ~17 langues | Oui | Legacy, utilise pour certaines langues |

## Langues Africaines Supportees

### Avec TTS (MMS disponible)

| Code | Langue | NLLB Code | MMS Code | Clonage |
|------|--------|-----------|----------|---------|
| am | Amharic | amh_Ethi | amh | Higgs |
| sw | Swahili | swh_Latn | swh | Chatterbox |
| yo | Yoruba | yor_Latn | yor | MMS |
| ha | Hausa | hau_Latn | hau | Higgs |
| rw | Kinyarwanda | kin_Latn | kin | MMS |
| rn | Kirundi | run_Latn | run | MMS |
| sn | Shona | sna_Latn | sna | MMS |
| lg | Luganda | lug_Latn | lug | MMS |
| om | Oromo | gaz_Latn | orm | MMS |
| ti | Tigrinya | tir_Ethi | tir | MMS |
| ny | Chichewa | nya_Latn | nya | MMS |
| ee | Ewe | ewe_Latn | ewe | MMS |
| ff | Fula | fuv_Latn | ful | MMS |
| mg | Malagasy | plt_Latn | mlg | MMS |
| so | Somali | som_Latn | som | MMS |
| ts | Tsonga | tso_Latn | tso | MMS |

### Sans TTS (Transcription + Traduction uniquement)

| Code | Langue | NLLB Code | Notes |
|------|--------|-----------|-------|
| ln | Lingala | lin_Latn | TTS MMS HTTP 403 |
| ig | Igbo | ibo_Latn | TTS MMS HTTP 403 |
| zu | Zulu | zul_Latn | TTS MMS HTTP 403 |
| xh | Xhosa | xho_Latn | TTS MMS HTTP 403 |
| wo | Wolof | wol_Latn | TTS MMS HTTP 403 |

### Camerounaises (Sans TTS)

| Code | Langue | NLLB Code | Notes |
|------|--------|-----------|-------|
| bas | Basaa | - | Pas de support NLLB/TTS |
| ksf | Bafia | - | Pas de support NLLB/TTS |
| nnh | Ngiemboon | - | Pas de support NLLB/TTS |

## Architecture des Services

### Fichiers de Services

```
services/translator/src/services/
├── transcription_service.py      # STT (Whisper + MMS-ASR)
├── unified_tts_service.py        # TTS unifie (Chatterbox/Higgs/XTTS + MMS)
├── mms_tts_service.py            # MMS TTS (1100+ langues)
├── xtts_tts_service.py           # XTTS v2 (legacy) - RENOMME
├── voice_clone_service.py        # Clonage vocal (OpenVoice)
├── translation_ml_service.py     # Traduction NLLB-200
├── language_capabilities.py      # Registre des capacites par langue
└── audio_message_pipeline.py     # Pipeline complet
```

### Flow de Selection TTS

```python
def select_tts_engine(language: str) -> TTSEngine:
    """
    Selection automatique du moteur TTS base sur:
    1. language_capabilities.py pour determiner le moteur
    2. Disponibilite du clonage vocal
    """
    cap = language_capabilities.get_capability(language)

    if cap.tts_engine == TTSEngine.CHATTERBOX:
        return ChatterboxBackend(clone_voice=True)
    elif cap.tts_engine == TTSEngine.MMS:
        return MMSBackend(clone_voice=False)
    elif cap.tts_engine == TTSEngine.XTTS:
        return XTTSBackend(clone_voice=True)
    else:
        raise LanguageCapabilityError("TTS not available")
```

## APIs

### FastAPI (HTTP)

- `POST /v1/audio/transcriptions` - Transcription audio
- `POST /v1/tts` - Synthese vocale
- `POST /v1/voice-message` - Pipeline complet
- `POST /api/v1/voice/translate` - Traduction vocale sync
- `POST /api/v1/voice/translate/async` - Traduction vocale async

### ZMQ (Socket)

- `audio_process` - Pipeline audio complet
- `transcription_only` - Transcription seule
- `translate_text` - Traduction texte
- `tts_only` - Synthese vocale seule

## Plan d'Implementation

### Phase 1: Corrections Immediates (Actuelle)
- [x] Corriger compute_type float16 -> int8 pour CPU
- [x] Ajouter import get_transcription_service
- [ ] Ajouter codes NLLB manquants pour langues africaines
- [ ] Integrer MMS dans unified_tts_service
- [ ] Renommer tts_service.py en xtts_tts_service.py

### Phase 2: Ameliorations Pipeline
- [ ] Ajouter selection automatique du moteur TTS
- [ ] Implementer fallback MMS pour langues sans Chatterbox
- [ ] Ajouter cache pour modeles MMS

### Phase 3: Documents
- [ ] Support traduction PDF
- [ ] Support traduction DOCX
- [ ] Support sous-titres video (SRT/VTT)

### Phase 4: Temps Reel
- [ ] Streaming transcription
- [ ] Streaming TTS
- [ ] WebSocket pour progression

## Notes Techniques

### Codes NLLB vs Codes ISO

NLLB utilise le format `{iso639-3}_{script}`:
- `fra_Latn` = Francais (Latin script)
- `amh_Ethi` = Amharic (Ethiopic script)
- `arb_Arab` = Arabe (Arabic script)

### MMS vs NLLB

- **MMS** utilise des codes ISO 639-3 simples: `amh`, `swh`, `yor`
- **NLLB** utilise des codes avec script: `amh_Ethi`, `swh_Latn`, `yor_Latn`

Les deux systemes sont compatibles mais necessitent une conversion.
