import { describe, expect, test } from 'bun:test';

import { parseCanvasDocument, type CanvasDocument } from '@/lib/canvas/document';

import { announceBackgroundSound, marqueePlan, MARQUEE_GAP_PX, MARQUEE_SPEED_PX_PER_S } from './sound-announcement';

const audio = (payload: Record<string, unknown>) => ({
  id: 'bgsound',
  kind: 'audio',
  anchor: { t: 'free', x: 0.5, y: 0.5 },
  plane: 'bg',
  z: 0,
  transform: { scale: 1, rotation: 0, opacity: 1 },
  payload,
});

function documentWith(params: { readonly objects?: readonly unknown[]; readonly sound?: unknown }): CanvasDocument {
  const doc = parseCanvasDocument({
    v: 3,
    scenes: [{ id: 's1', objects: params.objects ?? [] }],
    ...(params.sound !== undefined ? { sound: params.sound } : {}),
  });
  if (doc === null) throw new Error('vecteur de test invalide');
  return doc;
}

describe('announceBackgroundSound — la provenance du fond (miroir BackgroundSoundBadge.announcement)', () => {
  test('aucun fond ⇒ rien à annoncer', () => {
    expect(announceBackgroundSound({ document: documentWith({}), sceneIndex: 0 })).toEqual({ kind: 'none' });
  });

  test('un audio de PREMIER PLAN n’est pas un fond', () => {
    const document = documentWith({ objects: [audio({ isBackground: false, soundId: 'snd1', name: 'Titre' })] });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'none' });
  });

  test('un fond SANS soundId est un son original ⇒ la sinusoïde', () => {
    const document = documentWith({ objects: [audio({ isBackground: true, mediaURL: 'a.m4a', name: 'Ma voix' })] });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'original' });
  });

  test('un fond EMPRUNTÉ (soundId) ⇒ le crédit « titre · @auteur »', () => {
    const document = documentWith({
      objects: [audio({ isBackground: true, soundId: 'snd1', name: 'Pluie en forêt', soundAuthorUsername: 'sam' })],
    });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Pluie en forêt · @sam' });
  });

  test('le @ déjà présent n’est pas doublé, les blancs sont rognés', () => {
    const document = documentWith({
      objects: [audio({ isBackground: true, soundId: 'snd1', name: '  Pluie  ', soundAuthorUsername: ' @@sam ' })],
    });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Pluie · @sam' });
  });

  test('sans titre ⇒ le @pseudo seul ; sans auteur ⇒ le titre seul', () => {
    const noTitle = documentWith({ objects: [audio({ isBackground: true, soundId: 'snd1', soundAuthorUsername: 'sam' })] });
    const noAuthor = documentWith({ objects: [audio({ isBackground: true, soundId: 'snd1', name: 'Pluie' })] });
    expect(announceBackgroundSound({ document: noTitle, sceneIndex: 0 })).toEqual({ kind: 'credit', text: '@sam' });
    expect(announceBackgroundSound({ document: noAuthor, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Pluie' });
  });

  test('un emprunt SANS métadonnées reste un crédit « ♫ — », jamais la sinusoïde', () => {
    const document = documentWith({ objects: [audio({ isBackground: true, soundId: 'snd1', name: '   ' })] });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: '♫ —' });
  });

  test('le document qui déclare une piste de BIBLIOTHÈQUE prime, les métadonnées viennent de l’objet de fond', () => {
    const document = documentWith({
      objects: [audio({ isBackground: true, name: 'Pluie', soundAuthorUsername: 'sam' })],
      sound: { source: { t: 'library', soundId: 'snd_forest' }, volume: 1 },
    });
    expect(announceBackgroundSound({ document, sceneIndex: 0 })).toEqual({ kind: 'credit', text: 'Pluie · @sam' });
  });

  test('document `library` sans objet ⇒ crédit générique ; `original` ⇒ sinusoïde', () => {
    const library = documentWith({ sound: { source: { t: 'library', soundId: 'snd' }, volume: 1 } });
    const original = documentWith({ sound: { source: { t: 'original' }, volume: 1 } });
    expect(announceBackgroundSound({ document: library, sceneIndex: 0 })).toEqual({ kind: 'credit', text: '♫ —' });
    expect(announceBackgroundSound({ document: original, sceneIndex: 0 })).toEqual({ kind: 'original' });
  });

  test('une scène hors du document ⇒ rien', () => {
    expect(announceBackgroundSound({ document: documentWith({}), sceneIndex: 4 })).toEqual({ kind: 'none' });
  });
});

describe('marqueePlan — défile seulement si le texte dépasse, jamais sous mouvement réduit', () => {
  test('le texte tient ⇒ statique', () => {
    expect(marqueePlan({ contentWidth: 100, boxWidth: 160, reducedMotion: false })).toEqual({ kind: 'static' });
  });

  test('largeurs inconnues (rien de mesuré) ⇒ statique', () => {
    expect(marqueePlan({ contentWidth: 0, boxWidth: 0, reducedMotion: false })).toEqual({ kind: 'static' });
  });

  test('le texte dépasse ⇒ un cycle « largeur + espace » à 28 px/s', () => {
    const plan = marqueePlan({ contentWidth: 256, boxWidth: 160, reducedMotion: false });
    expect(MARQUEE_GAP_PX).toBe(24);
    expect(MARQUEE_SPEED_PX_PER_S).toBe(28);
    expect(plan).toEqual({ kind: 'scroll', shiftPx: 280, durationS: 10 });
  });

  test('mouvement réduit ⇒ statique tronqué, même quand le texte dépasse', () => {
    expect(marqueePlan({ contentWidth: 400, boxWidth: 160, reducedMotion: true })).toEqual({ kind: 'static' });
  });
});
