import { describe, it, expect } from '@jest/globals';
import { remapStoryEffectsMediaIds } from '../storyEffectsMediaRemap';

const SOURCE_URL = 'https://gate.meeshy.me/u/posts/source-bg.jpg';
const COPY_URL = 'https://gate.meeshy.me/u/posts/copy-bg.jpg';
const FOREIGN_URL = 'https://cdn.example.com/elsewhere.jpg';
const idMap = { 'old-1': 'new-1' };
const urlMap = { [SOURCE_URL]: COPY_URL };

describe('remapStoryEffectsMediaIds — adresses des pièces copiées', () => {
  it('réécrit mediaURL du fond legacy vers l\'adresse de la copie, avec postMediaId', () => {
    const effects = { mediaObjects: [{ id: 'bg', postMediaId: 'old-1', mediaURL: SOURCE_URL, placement: 'background' }] };
    const result = remapStoryEffectsMediaIds(effects, idMap, urlMap);

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({
      mediaObjects: [{ id: 'bg', postMediaId: 'new-1', mediaURL: COPY_URL, placement: 'background' }],
    });
  });

  it('réécrit mediaURL même quand postMediaId est absent ou inconnu', () => {
    const effects = { mediaObjects: [{ id: 'bg', mediaURL: SOURCE_URL }] };
    const result = remapStoryEffectsMediaIds(effects, {}, urlMap);

    expect(result.changed).toBe(true);
    expect(result.effects).toEqual({ mediaObjects: [{ id: 'bg', mediaURL: COPY_URL }] });
  });

  it('laisse intacte une adresse étrangère aux pièces copiées', () => {
    const effects = { mediaObjects: [{ id: 'bg', postMediaId: 'old-1', mediaURL: FOREIGN_URL }] };
    const result = remapStoryEffectsMediaIds(effects, idMap, urlMap);

    expect(result.effects).toEqual({ mediaObjects: [{ id: 'bg', postMediaId: 'new-1', mediaURL: FOREIGN_URL }] });
  });

  it('réécrit aussi mediaURL des pistes audioPlayerObjects', () => {
    const effects = { audioPlayerObjects: [{ id: 'a', postMediaId: 'old-1', mediaURL: SOURCE_URL }] };
    const result = remapStoryEffectsMediaIds(effects, idMap, urlMap);

    expect(result.effects).toEqual({ audioPlayerObjects: [{ id: 'a', postMediaId: 'new-1', mediaURL: COPY_URL }] });
  });

  it('sans carte d\'adresses, comportement inchangé (rétrocompatible)', () => {
    const effects = { mediaObjects: [{ id: 'bg', postMediaId: 'old-1', mediaURL: SOURCE_URL }] };
    const result = remapStoryEffectsMediaIds(effects, idMap);

    expect(result.effects).toEqual({ mediaObjects: [{ id: 'bg', postMediaId: 'new-1', mediaURL: SOURCE_URL }] });
  });

  it('document v3 : mediaURL des payloads réécrit, adresse étrangère et objets sans adresse intacts', () => {
    const effects = {
      v: 3,
      scenes: [{
        id: 's1',
        objects: [
          { id: 'o1', kind: 'media', payload: { postMediaId: 'old-1', mediaURL: SOURCE_URL } },
          { id: 'o2', kind: 'media', payload: { postMediaId: 'zzz', mediaURL: FOREIGN_URL } },
          { id: 'o3', kind: 'text', payload: { text: SOURCE_URL } },
        ],
      }],
    };
    const result = remapStoryEffectsMediaIds(effects, idMap, urlMap);

    expect(result.changed).toBe(true);
    const objects = (result.effects as unknown as typeof effects).scenes[0].objects;
    expect(objects[0].payload).toEqual({ postMediaId: 'new-1', mediaURL: COPY_URL });
    expect(objects[1].payload).toEqual({ postMediaId: 'zzz', mediaURL: FOREIGN_URL });
    expect(objects[2].payload).toEqual({ text: SOURCE_URL });
  });

  it('document v3 : adresse seule (sans id connu) réécrite', () => {
    const effects = { v: 3, scenes: [{ id: 's1', objects: [{ id: 'o1', kind: 'audio', payload: { mediaURL: SOURCE_URL } }] }] };
    const result = remapStoryEffectsMediaIds(effects, {}, urlMap);

    expect(result.changed).toBe(true);
    expect((result.effects as unknown as typeof effects).scenes[0].objects[0].payload).toEqual({ mediaURL: COPY_URL });
  });
});
