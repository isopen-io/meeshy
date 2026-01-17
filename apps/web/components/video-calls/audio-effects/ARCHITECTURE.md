# Audio Effects Carousel - Architecture

## Avant Refactorisation

```
┌──────────────────────────────────────────────────┐
│   AudioEffectsCarousel.tsx (769 lignes)          │
│                                                   │
│   ┌──────────────────────────────────────────┐   │
│   │ Header + Close Button                    │   │
│   └──────────────────────────────────────────┘   │
│                                                   │
│   ┌──────────────────────────────────────────┐   │
│   │ Carousel Navigation                      │   │
│   │ - Scroll buttons                         │   │
│   │ - Effect tiles (inline)                  │   │
│   │ - Status badges (inline)                 │   │
│   └──────────────────────────────────────────┘   │
│                                                   │
│   ┌──────────────────────────────────────────┐   │
│   │ Effect Details Panel                     │   │
│   │ - VoiceCoderDetails (inline)             │   │
│   │ - BackSoundDetails (inline)              │   │
│   │ - BabyVoiceDetails (inline)              │   │
│   │ - DemonVoiceDetails (inline)             │   │
│   └──────────────────────────────────────────┘   │
│                                                   │
│   ┌──────────────────────────────────────────┐   │
│   │ State Management (inline)                │   │
│   │ - selectedEffect                         │   │
│   │ - handleResetAll                         │   │
│   │ - handleEffectClick                      │   │
│   └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────┘
```

**Problèmes:**
- Un seul fichier trop volumineux
- Difficile à maintenir et tester
- Couplage fort entre UI et logique
- Pas de réutilisabilité
- Pas d'optimisation performance

---

## Après Refactorisation

```
┌─────────────────────────────────────────────────────────────────┐
│   AudioEffectsCarousel.tsx (154 lignes) - ORCHESTRATION         │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Header + Close Button                                    │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ Carousel Container                                       │  │
│   │   ├─ CarouselNavigation.tsx (55 lignes) ━━━━━━━━━┐      │  │
│   │   │    - Left/Right scroll buttons                │      │  │
│   │   │    - Generic (containerId based)              │      │  │
│   │   │    - React.memo                               │      │  │
│   │   └───────────────────────────────────────────────┘      │  │
│   │                                                           │  │
│   │   ├─ EffectCard.tsx (110 lignes) ━━━━━━━━━━━━━━━┐      │  │
│   │   │    - Individual tile component                │      │  │
│   │   │    - Active/Selected states                   │      │  │
│   │   │    - Status badges                            │      │  │
│   │   │    - React.memo                               │      │  │
│   │   │                                                │      │  │
│   │   │    Used 5 times:                              │      │  │
│   │   │    • Reset tile                               │      │  │
│   │   │    • Voice Coder                              │      │  │
│   │   │    • Back Sound                               │      │  │
│   │   │    • Baby Voice                               │      │  │
│   │   │    • Demon Voice                              │      │  │
│   │   └───────────────────────────────────────────────┘      │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ EffectDetailsPreview.tsx (100 lignes) ━━━━━━━━━━┐       │  │
│   │    - Details container/router                     │       │  │
│   │    - Conditional rendering by effect type         │       │  │
│   │    - React.memo                                   │       │  │
│   │                                                    │       │  │
│   │    ├─ VoiceCoderDetails.tsx (184 lignes) ────────┤       │  │
│   │    │   • Presets selector                         │       │  │
│   │    │   • 4 sliders (retune, strength, vibrato..)  │       │  │
│   │    │   • Scale + Key selectors                    │       │  │
│   │    │   • Harmonization toggle                     │       │  │
│   │    │   • React.memo                               │       │  │
│   │    │                                               │       │  │
│   │    ├─ BackSoundDetails.tsx (120 lignes) ──────────┤       │  │
│   │    │   • File upload                              │       │  │
│   │    │   • Volume slider                            │       │  │
│   │    │   • Loop mode (N_TIMES/N_MINUTES)            │       │  │
│   │    │   • React.memo                               │       │  │
│   │    │                                               │       │  │
│   │    ├─ BabyVoiceDetails.tsx (91 lignes) ───────────┤       │  │
│   │    │   • Pitch slider                             │       │  │
│   │    │   • Formant slider                           │       │  │
│   │    │   • Breathiness slider                       │       │  │
│   │    │   • React.memo                               │       │  │
│   │    │                                               │       │  │
│   │    └─ DemonVoiceDetails.tsx (91 lignes) ──────────┤       │  │
│   │        • Pitch slider                             │       │  │
│   │        • Distortion slider                        │       │  │
│   │        • Reverb slider                            │       │  │
│   │        • React.memo                               │       │  │
│   └────────────────────────────────────────────────────       │  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│   hooks/useAudioEffects.ts (85 lignes) - LOGIQUE MÉTIER         │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ useAudioEffects Hook                                     │  │
│   │   - selectedEffect state                                 │  │
│   │   - handleResetAll (useCallback)                         │  │
│   │   - handleEffectClick (useCallback)                      │  │
│   │   - getEffectStatus (useCallback)                        │  │
│   └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│   ┌──────────────────────────────────────────────────────────┐  │
│   │ useEffectTiles Hook                                      │  │
│   │   - Returns tiles configuration array                    │  │
│   │   - Internationalized titles                             │  │
│   │   - Color/gradient schemes                               │  │
│   └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│   index.ts (13 lignes) - EXPORTS CENTRALISÉS                    │
│                                                                  │
│   • EffectCard                                                  │
│   • CarouselNavigation                                          │
│   • EffectDetailsPreview                                        │
│   • VoiceCoderDetails                                           │
│   • BackSoundDetails                                            │
│   • BabyVoiceDetails                                            │
│   • DemonVoiceDetails                                           │
│   • useAudioEffects                                             │
│   • useEffectTiles                                              │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌─────────────────┐
│  Parent Page    │
│                 │
│  effectsState   │──┐
│  onToggleEffect │  │
│  onUpdateParams │  │
│  ...            │  │
└─────────────────┘  │
                     │
                     ▼
         ┌─────────────────────────────┐
         │  AudioEffectsCarousel       │
         │                             │
         │  useEffectTiles(t) ────────┐│
         │  useAudioEffects(...)  ────┤│
         └─────────────────────────────┘│
                     │                  │
                     │                  │
           ┌─────────┴──────────┐      │
           │                    │      │
           ▼                    ▼      │
    ┌─────────────┐      ┌──────────────────┐
    │EffectCard   │      │EffectDetails     │
    │  (x5)       │      │Preview           │
    │             │      │                  │
    │ • Reset     │      │ selectedEffect?  │
    │ • VoiceCoder│      │                  │
    │ • BackSound │      │ ├─VoiceCoderDet  │
    │ • BabyVoice │      │ ├─BackSoundDet   │
    │ • DemonVoice│      │ ├─BabyVoiceDet   │
    └─────────────┘      │ └─DemonVoiceDet  │
                         └──────────────────┘
           │                    │
           │                    │
           └────────┬───────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  User Interactions  │
         │                     │
         │  • Click tile       │
         │  • Adjust sliders   │
         │  • Toggle effects   │
         │  • Load presets     │
         └─────────────────────┘
```

## Performance Optimizations

```
React.memo Applied:
├─ EffectCard ✓
├─ CarouselNavigation ✓
├─ EffectDetailsPreview ✓
├─ VoiceCoderDetails ✓
├─ BackSoundDetails ✓
├─ BabyVoiceDetails ✓
└─ DemonVoiceDetails ✓

useCallback Applied:
├─ handleResetAll ✓
├─ handleEffectClick ✓
└─ getEffectStatus ✓

Stable References:
├─ effectTiles (memoized) ✓
└─ Hook returns (stable) ✓
```

## Benefits Summary

| Aspect | Improvement |
|--------|-------------|
| **File Size** | 769 → 154 lines (-80%) |
| **Modularity** | 1 file → 10 files |
| **Testability** | Monolithic → Unit testable |
| **Reusability** | None → High |
| **Performance** | No memo → 8 memoized |
| **Maintainability** | Low → High |
| **Extensibility** | Hard → Easy (add 1 file) |
