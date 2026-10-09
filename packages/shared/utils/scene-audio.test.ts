import { describe, expect, it } from 'vitest';

import {
  backgroundAudioOf,
  backgroundSoundProvenance,
  isBackgroundAudio,
  SCENE_AUDIO_CHIP_BARS,
  sceneAudioChipForm,
  sceneAudioPresence,
  soundAuthorTag,
} from './scene-audio';

const audio = (payload: Record<string, unknown> = {}) => ({ kind: 'audio', payload });

describe('sceneAudioPresence — ce qu’un son donne à voir sur la scène (#9737)', () => {
  it('un audio de FOND ne produit aucun pixel : il se dit hors scène', () => {
    expect(sceneAudioPresence(audio({ isBackground: true }))).toBe('offstage');
    expect(isBackgroundAudio(audio({ isBackground: true }))).toBe(true);
  });

  it('un audio de PREMIER PLAN se rend en pastille — `isBackground` absent ou faux', () => {
    expect(sceneAudioPresence(audio())).toBe('chip');
    expect(sceneAudioPresence(audio({ isBackground: false }))).toBe('chip');
    expect(sceneAudioPresence(audio({ isBackground: 'true' }))).toBe('chip');
  });

  it('un objet qui n’est pas un audio n’est pas concerné, même marqué fond', () => {
    expect(sceneAudioPresence({ kind: 'media', payload: { isBackground: true } })).toBeNull();
    expect(isBackgroundAudio({ kind: 'media', payload: { isBackground: true } })).toBe(false);
  });
});

describe('sceneAudioChipForm — la forme de la pastille (miroir StoryAudioIdentity.form)', () => {
  it('sans soundId ⇒ un enregistrement, avec ses échantillons finis', () => {
    expect(sceneAudioChipForm(audio({ waveformSamples: [0.2, 'x', 0.8, Number.NaN] }))).toEqual({
      kind: 'recording',
      samples: [0.2, 0.8],
    });
    expect(sceneAudioChipForm(audio({ name: 'Mémo du mardi' }))).toEqual({ kind: 'recording', samples: [] });
  });

  it('un tableau FORGÉ de 100 000 échantillons rend au plus 24 barres, prises à pas régulier dans la tête de l’entrée', () => {
    const forged = Array.from({ length: 100_000 }, (_, i) => i);
    const form = sceneAudioChipForm(audio({ waveformSamples: forged }));
    expect(SCENE_AUDIO_CHIP_BARS).toBe(24);
    expect(form.kind).toBe('recording');
    const samples = form.kind === 'recording' ? form.samples : [];
    expect(samples.length).toBe(24);
    expect(samples[0]).toBe(0);
    expect(samples[23]).toBe(4095);
    expect(samples.every((value, i) => i === 0 || value > (samples[i - 1] ?? -1))).toBe(true);
  });

  it('25 échantillons se ramènent à 24, 24 restent intacts', () => {
    const of = (length: number) => sceneAudioChipForm(audio({ waveformSamples: Array.from({ length }, (_, i) => i / length) }));
    const exact = of(24);
    const over = of(25);
    expect(exact.kind === 'recording' ? exact.samples.length : -1).toBe(24);
    expect(over.kind === 'recording' ? over.samples.length : -1).toBe(24);
  });

  it('soundId ⇒ un emprunt « titre · @auteur », sans onde même si des échantillons existent', () => {
    expect(
      sceneAudioChipForm(audio({ soundId: 's1', name: ' Nuit ', soundAuthorUsername: '@belva', waveformSamples: [1] })),
    ).toEqual({ kind: 'borrowed', label: 'Nuit · @belva' });
  });

  it('un emprunt sans métadonnées reste un emprunt, sans libellé', () => {
    expect(sceneAudioChipForm(audio({ soundId: 's1' }))).toEqual({ kind: 'borrowed', label: undefined });
  });
});

describe('soundAuthorTag', () => {
  it('pose un seul @ et rend undefined sans auteur', () => {
    expect(soundAuthorTag('@@belva ')).toBe('@belva');
    expect(soundAuthorTag('@')).toBeUndefined();
    expect(soundAuthorTag(null)).toBeUndefined();
  });
});

describe('backgroundSoundProvenance — la provenance du fond', () => {
  it('sans déclaration ni objet de fond ⇒ null', () => {
    expect(backgroundSoundProvenance({ documentSound: undefined, objects: [audio()] })).toBeNull();
  });

  it('l’objet de fond décide par soundId', () => {
    expect(backgroundSoundProvenance({ documentSound: undefined, objects: [audio({ isBackground: true })] })).toBe('original');
    expect(
      backgroundSoundProvenance({ documentSound: undefined, objects: [audio({ isBackground: true, soundId: 's1' })] }),
    ).toBe('library');
  });

  it('la déclaration du document prime sur l’objet', () => {
    expect(
      backgroundSoundProvenance({ documentSound: { source: { t: 'library' } }, objects: [audio({ isBackground: true })] }),
    ).toBe('library');
    expect(backgroundSoundProvenance({ documentSound: { source: { t: 'original' } }, objects: [] })).toBe('original');
    expect(backgroundSoundProvenance({ documentSound: { source: { t: 'autre' } }, objects: [] })).toBeNull();
  });

  it('backgroundAudioOf rend le premier audio de fond', () => {
    const fond = audio({ isBackground: true, name: 'a' });
    expect(backgroundAudioOf([audio(), fond])).toBe(fond);
    expect(backgroundAudioOf([audio()])).toBeUndefined();
  });
});
