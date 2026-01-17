# Audio Effects Architecture

## Structure

```
audio-effects/
├── index.ts                    # Centralized exports
├── EffectCard.tsx              # Individual effect tile (110 lines)
├── CarouselNavigation.tsx      # Scroll controls (55 lines)
├── EffectDetailsPreview.tsx    # Details container (100 lines)
├── effect-details/
│   ├── VoiceCoderDetails.tsx   # Voice coder config (184 lines)
│   ├── BackSoundDetails.tsx    # Background sound config (120 lines)
│   ├── BabyVoiceDetails.tsx    # Baby voice config (91 lines)
│   └── DemonVoiceDetails.tsx   # Demon voice config (91 lines)
└── hooks/
    └── useAudioEffects.ts      # State and selection logic (85 lines)
```

## Component Hierarchy

```
AudioEffectsCarousel (154 lines)
├── Header
│   └── Close Button
├── Carousel Container
│   ├── CarouselNavigation
│   │   ├── Left Scroll Button
│   │   └── Right Scroll Button
│   └── Effect Cards
│       ├── EffectCard (Reset)
│       ├── EffectCard (Voice Coder)
│       ├── EffectCard (Back Sound)
│       ├── EffectCard (Baby Voice)
│       └── EffectCard (Demon Voice)
└── EffectDetailsPreview
    ├── VoiceCoderDetails
    ├── BackSoundDetails
    ├── BabyVoiceDetails
    └── DemonVoiceDetails
```

## Refactoring Results

**Original:** 769 lines in single file
**Refactored:** 154 lines main + 695 lines extracted = 849 total (+80 lines for better structure)

### Key Improvements

1. **Single Responsibility Principle**
   - Each component handles one specific concern
   - Effect cards are now isolated and memoized
   - Details panels are separated by effect type

2. **Reusability**
   - `EffectCard` can be used elsewhere
   - `CarouselNavigation` is generic (containerId-based)
   - Effect detail components are independently testable

3. **Performance**
   - React.memo on all card components
   - useCallback in hooks for stable references
   - No unnecessary re-renders

4. **Maintainability**
   - Easy to add new effects (create new detail component)
   - Clear separation between UI and logic
   - Centralized exports for clean imports

## Usage

```tsx
import { AudioEffectsCarousel } from '@/components/video-calls/AudioEffectsCarousel';

<AudioEffectsCarousel
  effectsState={effectsState}
  onToggleEffect={handleToggle}
  onUpdateParams={handleUpdate}
  availableBackSounds={backSounds}
  onClose={handleClose}
/>
```

## Adding New Effect

1. Create `effect-details/NewEffectDetails.tsx`
2. Add to `EffectDetailsPreview.tsx`
3. Add tile config to `useEffectTiles` hook
4. Update exports in `index.ts`
