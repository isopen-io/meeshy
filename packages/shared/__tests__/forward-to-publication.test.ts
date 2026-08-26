import { describe, it, expect } from 'vitest';
import {
  defaultPublicationTargetFor,
  publicationTargetsFor,
  postTypeForPublicationTarget,
  publicationNeedsCaptureConfirmation,
} from '../utils/forward-to-publication.js';

describe('defaultPublicationTargetFor — le format découle du média', () => {
  it('une image devient un POST', () => {
    expect(defaultPublicationTargetFor('image/jpeg')).toBe('POST');
    expect(defaultPublicationTargetFor('image/png')).toBe('POST');
    expect(defaultPublicationTargetFor('image/webp')).toBe('POST');
  });

  it('une vidéo devient un REEL — le fil des réels est la seule surface qui la joue', () => {
    expect(defaultPublicationTargetFor('video/mp4')).toBe('REEL');
    expect(defaultPublicationTargetFor('video/quicktime')).toBe('REEL');
  });

  it("un son devient un REEL aussi : en POST il n'aurait aucune surface pour être écouté", () => {
    expect(defaultPublicationTargetFor('audio/mpeg')).toBe('REEL');
    expect(defaultPublicationTargetFor('audio/ogg')).toBe('REEL');
  });

  it("un document n'a AUCUNE destination publique — le fil ne sait pas le rendre", () => {
    expect(defaultPublicationTargetFor('application/pdf')).toBeNull();
    expect(defaultPublicationTargetFor('text/plain')).toBeNull();
    expect(defaultPublicationTargetFor('application/zip')).toBeNull();
  });

  it('un type absent ou vide ne propose rien plutôt que de deviner', () => {
    expect(defaultPublicationTargetFor(null)).toBeNull();
    expect(defaultPublicationTargetFor(undefined)).toBeNull();
    expect(defaultPublicationTargetFor('')).toBeNull();
  });

  it("ne rend JAMAIS STORY : l'éphémère se demande, il ne se déduit pas", () => {
    for (const mime of ['image/jpeg', 'video/mp4', 'audio/mpeg', 'application/pdf']) {
      expect(defaultPublicationTargetFor(mime)).not.toBe('STORY');
    }
  });
});

describe('publicationTargetsFor — ce que la feuille propose', () => {
  it('offre le format déduit PUIS la story, pour une image', () => {
    expect(publicationTargetsFor('image/jpeg')).toEqual(['POST', 'STORY']);
  });

  it('offre le réel puis la story, pour une vidéo comme pour un son', () => {
    expect(publicationTargetsFor('video/mp4')).toEqual(['REEL', 'STORY']);
    expect(publicationTargetsFor('audio/mpeg')).toEqual(['REEL', 'STORY']);
  });

  it("n'offre RIEN pour un document — pas même la story", () => {
    expect(publicationTargetsFor('application/pdf')).toEqual([]);
  });
});

describe('postTypeForPublicationTarget', () => {
  it('une story est un post de type STORY, le modèle du dépôt', () => {
    expect(postTypeForPublicationTarget('STORY')).toBe('STORY');
    expect(postTypeForPublicationTarget('POST')).toBe('POST');
    expect(postTypeForPublicationTarget('REEL')).toBe('REEL');
  });
});

describe('publicationNeedsCaptureConfirmation — publier une capture se confirme', () => {
  it('exige la confirmation pour un média capturé par l’application', () => {
    expect(publicationNeedsCaptureConfirmation({ capturedInApp: true, target: 'POST' })).toBe(true);
    expect(publicationNeedsCaptureConfirmation({ capturedInApp: true, target: 'REEL' })).toBe(true);
    expect(publicationNeedsCaptureConfirmation({ capturedInApp: true, target: 'STORY' })).toBe(true);
  });

  it("ne la demande PAS pour un média venu de la galerie : il a déjà été vu et gardé", () => {
    expect(publicationNeedsCaptureConfirmation({ capturedInApp: false, target: 'POST' })).toBe(false);
    expect(publicationNeedsCaptureConfirmation({ capturedInApp: false, target: 'REEL' })).toBe(false);
  });
});
