import { describe, expect, test } from 'bun:test';

import {
  MAX_POST_MEDIA,
  draftIsEmpty,
  draftRefusal,
  emptyDraft,
  hasFailedUpload,
  hasPendingUpload,
  publishableMedia,
  qualifyingMedia,
  withContent,
  withMediaAdded,
  withMediaRemoved,
  withType,
  withUpload,
  type DraftMedia,
} from './draft';

/**
 * LE BROUILLON D'UNE PUBLICATION (#7449) — des lois sans DOM, et c'est tout
 * l'intérêt de les avoir sorties de l'écran.
 */

const media = (key: string, mimeType: string, durationMs: number | null = null): DraftMedia => ({
  key,
  name: `${key}.bin`,
  mimeType,
  previewUrl: `blob:${key}`,
  durationMs,
  upload: { phase: 'sending' },
});

describe('composer un brouillon', () => {
  test('un brouillon neuf est vide et refuse de partir', () => {
    const draft = emptyDraft('POST');
    expect(draftIsEmpty(draft)).toBe(true);
    expect(draftRefusal(draft)).toBe('empty');
  });

  test('un mot suffit à un POST', () => {
    expect(draftRefusal(withContent(emptyDraft('POST'), 'Bonjour'))).toBeNull();
  });

  test('ajouter puis retirer ramène au vide — le retrait passe par la CLÉ, pas par un index', () => {
    const draft = withMediaAdded(emptyDraft('POST'), [media('a', 'image/jpeg'), media('b', 'image/png')]);
    const after = withMediaRemoved(withMediaRemoved(draft, 'a'), 'b');
    expect(after.media.length).toBe(0);
    expect(draftIsEmpty(after)).toBe(true);
  });

  test('le plafond de médias est celui du dépôt, et ce qui dépasse est ÉCARTÉ ici', () => {
    const many = Array.from({ length: MAX_POST_MEDIA + 4 }, (_, i) => media(`m${i}`, 'image/jpeg'));
    expect(withMediaAdded(emptyDraft('POST'), many).media.length).toBe(MAX_POST_MEDIA);
  });
});

describe('la qualification d’un RÉEL suit la composition, pas l’état du réseau', () => {
  test('une vidéo EN VOL qualifie déjà — sa durée est connue du fichier local', () => {
    const draft = withMediaAdded(emptyDraft('REEL'), [media('v', 'video/mp4', 9_000)]);
    expect(hasPendingUpload(draft)).toBe(true);
    expect(draftRefusal(draft)).toBeNull();
  });

  /* Le texte est là pour ISOLER la loi visée : sans lui, un brouillon dont le
     seul média a échoué est « vide », ce qui est vrai mais dit autre chose. */
  test('un envoi ÉCHOUÉ ne compte plus — le réel redevient non qualifiant', () => {
    const draft = withMediaAdded(withContent(emptyDraft('REEL'), 'une légende'), [media('v', 'video/mp4', 9_000)]);
    const failed = withUpload(draft, 'v', { phase: 'failed' });
    expect(hasFailedUpload(failed)).toBe(true);
    expect(qualifyingMedia(failed).length).toBe(0);
    expect(draftRefusal(failed)).toBe('reel-without-qualifying-media');
  });

  test('basculer POST → RÉEL sur un texte seul REFUSE, et le retour l’autorise', () => {
    const post = withContent(emptyDraft('POST'), 'un texte');
    expect(draftRefusal(post)).toBeNull();
    const reel = withType(post, 'REEL');
    expect(draftRefusal(reel)).toBe('reel-without-qualifying-media');
    expect(draftRefusal(withType(reel, 'POST'))).toBeNull();
  });
});

describe('ce qui PART n’est que ce que la passerelle a accepté', () => {
  test('seuls les médias PRÊTS portent un postMediaId dans l’envoi', () => {
    let draft = withMediaAdded(emptyDraft('POST'), [media('a', 'image/jpeg'), media('b', 'image/png')]);
    draft = withUpload(draft, 'a', { phase: 'ready', postMediaId: 'pm-a' });
    expect(publishableMedia(draft)).toEqual([{ postMediaId: 'pm-a', mimeType: 'image/jpeg', durationMs: null }]);
  });
});
