import { BACK_SOUNDS, VOICE_CODER_PRESETS } from '@/utils/audio-effect-presets';

describe('BACK_SOUNDS', () => {
  it('is an empty readonly array', () => {
    expect(BACK_SOUNDS).toEqual([]);
  });

  it('is an array', () => {
    expect(Array.isArray(BACK_SOUNDS)).toBe(true);
  });
});

describe('VOICE_CODER_PRESETS', () => {
  it('contains exactly 4 presets', () => {
    expect(Object.keys(VOICE_CODER_PRESETS)).toHaveLength(4);
  });

  it('has a voix-naturelle preset', () => {
    expect(VOICE_CODER_PRESETS['voix-naturelle']).toBeDefined();
    expect(VOICE_CODER_PRESETS['voix-naturelle'].name).toBe('Voix Naturelle');
    expect(VOICE_CODER_PRESETS['voix-naturelle'].params.harmonization).toBe(false);
    expect(VOICE_CODER_PRESETS['voix-naturelle'].params.strength).toBe(30);
    expect(VOICE_CODER_PRESETS['voix-naturelle'].params.scale).toBe('chromatic');
    expect(VOICE_CODER_PRESETS['voix-naturelle'].params.naturalVibrato).toBe(70);
  });

  it('has a pop-star preset with harmonization enabled', () => {
    expect(VOICE_CODER_PRESETS['pop-star']).toBeDefined();
    expect(VOICE_CODER_PRESETS['pop-star'].name).toBe('Pop Star');
    expect(VOICE_CODER_PRESETS['pop-star'].params.harmonization).toBe(true);
    expect(VOICE_CODER_PRESETS['pop-star'].params.strength).toBe(70);
    expect(VOICE_CODER_PRESETS['pop-star'].params.scale).toBe('major');
  });

  it('has an effet-robot preset with maximum retune speed', () => {
    expect(VOICE_CODER_PRESETS['effet-robot']).toBeDefined();
    expect(VOICE_CODER_PRESETS['effet-robot'].name).toBe('Effet Robot');
    expect(VOICE_CODER_PRESETS['effet-robot'].params.retuneSpeed).toBe(95);
    expect(VOICE_CODER_PRESETS['effet-robot'].params.strength).toBe(90);
    expect(VOICE_CODER_PRESETS['effet-robot'].params.naturalVibrato).toBe(5);
  });

  it('has a correction-subtile preset', () => {
    expect(VOICE_CODER_PRESETS['correction-subtile']).toBeDefined();
    expect(VOICE_CODER_PRESETS['correction-subtile'].name).toBe('Correction Subtile');
    expect(VOICE_CODER_PRESETS['correction-subtile'].params.strength).toBe(40);
    expect(VOICE_CODER_PRESETS['correction-subtile'].params.scale).toBe('major');
    expect(VOICE_CODER_PRESETS['correction-subtile'].params.naturalVibrato).toBe(60);
  });

  it('all presets have pitch 0 and key C', () => {
    for (const preset of Object.values(VOICE_CODER_PRESETS)) {
      expect(preset.params.pitch).toBe(0);
      expect(preset.params.key).toBe('C');
    }
  });

  it('all presets have a name and description string', () => {
    for (const preset of Object.values(VOICE_CODER_PRESETS)) {
      expect(typeof preset.name).toBe('string');
      expect(typeof preset.description).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.description.length).toBeGreaterThan(0);
    }
  });
});
