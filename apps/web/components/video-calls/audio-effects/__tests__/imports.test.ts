/**
 * IMPORTS TEST
 * Verify all audio effects exports are accessible
 */

import {
  EffectCard,
  CarouselNavigation,
  EffectDetailsPreview,
  VoiceCoderDetails,
  BackSoundDetails,
  BabyVoiceDetails,
  DemonVoiceDetails,
  useAudioEffects,
  useEffectTiles,
} from '../index';

describe('Audio Effects Exports', () => {
  it('should export all components', () => {
    expect(EffectCard).toBeDefined();
    expect(CarouselNavigation).toBeDefined();
    expect(EffectDetailsPreview).toBeDefined();
    expect(VoiceCoderDetails).toBeDefined();
    expect(BackSoundDetails).toBeDefined();
    expect(BabyVoiceDetails).toBeDefined();
    expect(DemonVoiceDetails).toBeDefined();
  });

  it('should export all hooks', () => {
    expect(useAudioEffects).toBeDefined();
    expect(useEffectTiles).toBeDefined();
  });
});
