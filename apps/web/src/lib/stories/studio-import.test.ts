import { describe, expect, test } from 'bun:test';

import { STUDIO_PAGE_MAX, currentStudioPage, emptyStudioDraft, withAddedPage, withText, withVisual, type StudioDraft } from './studio';
import { studioImportPlan } from './studio-import';

const media = (name: string, type = 'image/jpeg') => ({ name, type });
const empty = (): StudioDraft => emptyStudioDraft('fr');
const withBackground = (draft: StudioDraft): StudioDraft =>
  withVisual(draft, 'visual', {
    file: new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' }),
    previewUrl: 'blob:x',
    mediaType: 'image',
    upload: { phase: 'uploading', progress: 0 },
    caption: '',
    pose: { x: 0.5, y: 0.5, scale: 1, rotation: 0 },
  });

describe('studioImportPlan — N médias choisis font N scènes (#8533)', () => {
  test('sur une page sans fond, le PREMIER média la remplit et chaque suivant ouvre sa page, dans l’ordre du choix', () => {
    const files = [media('a.jpg'), media('b.mp4', 'video/mp4'), media('c.png', 'image/png')];
    const plan = studioImportPlan(empty(), files, 'fr');
    expect(plan.draft.pages.map((p) => p.id)).toEqual(['page-1', 'page-2', 'page-3']);
    expect(plan.placements.map((p) => [p.pageId, p.file.name])).toEqual([
      ['page-1', 'a.jpg'],
      ['page-2', 'b.mp4'],
      ['page-3', 'c.png'],
    ]);
    expect(plan.refused).toBeNull();
  });

  test('la scène COURANTE devient celle du premier média : on lit l’import depuis son début', () => {
    const plan = studioImportPlan(empty(), [media('a.jpg'), media('b.jpg')], 'fr');
    expect(plan.draft.currentPage).toBe('page-1');
  });

  test('une page qui porte déjà un fond n’est jamais écrasée : tous les médias ouvrent des pages neuves', () => {
    const plan = studioImportPlan(withBackground(empty()), [media('a.jpg'), media('b.jpg')], 'fr');
    expect(plan.placements.map((p) => p.pageId)).toEqual(['page-2', 'page-3']);
    expect(plan.draft.currentPage).toBe('page-2');
  });

  test('une page sans fond mais ÉCRITE reçoit le premier média sous son texte', () => {
    const draft = empty();
    const written = withText(draft, currentStudioPage(draft).texts[0]!.id, 'Bonjour');
    const plan = studioImportPlan(written, [media('a.jpg'), media('b.jpg')], 'fr');
    expect(plan.placements[0]!.pageId).toBe('page-1');
  });

  test('au-delà du plafond, les médias en trop sont REFUSÉS et comptés, jamais perdus en silence', () => {
    const files = Array.from({ length: STUDIO_PAGE_MAX + 3 }, (_, i) => media(`m${i}.jpg`));
    const plan = studioImportPlan(empty(), files, 'fr');
    expect(plan.draft.pages).toHaveLength(STUDIO_PAGE_MAX);
    expect(plan.placements).toHaveLength(STUDIO_PAGE_MAX);
    expect(plan.refused).toEqual({ reason: 'import-max', count: 3 });
  });

  test('le plafond compte les pages DÉJÀ ouvertes', () => {
    let draft = empty();
    for (let i = 1; i < STUDIO_PAGE_MAX - 1; i += 1) draft = withBackground(withAddedPage(draft, 'fr'));
    const plan = studioImportPlan(draft, [media('a.jpg'), media('b.jpg'), media('c.jpg')], 'fr');
    expect(plan.placements.map((p) => p.pageId)).toEqual([`page-${STUDIO_PAGE_MAX}`]);
    expect(plan.refused).toEqual({ reason: 'import-max', count: 2 });
  });

  test('un fichier qui n’est ni image ni vidéo est refusé par la porte, les autres passent', () => {
    const plan = studioImportPlan(empty(), [media('a.jpg'), media('son.mp3', 'audio/mpeg'), media('b.jpg')], 'fr');
    expect(plan.placements.map((p) => p.file.name)).toEqual(['a.jpg', 'b.jpg']);
    expect(plan.refused).toEqual({ reason: 'door', count: 1 });
  });

  test('aucun fichier ⇒ le brouillon reste le même objet', () => {
    const draft = empty();
    expect(studioImportPlan(draft, [], 'fr').draft).toBe(draft);
  });
});
