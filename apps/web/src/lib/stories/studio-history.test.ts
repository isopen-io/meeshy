import { describe, expect, test } from 'bun:test';

import {
  STUDIO_HISTORY_MAX,
  emptyStudioHistory,
  rebaseStudioLive,
  recordStudioStep,
  redoStudioStep,
  undoStudioStep,
  withoutBirthStep,
} from './studio-history';
import { currentStudioPage, emptyStudioDraft, withAddedText, withAudience, withPostText, withText, withVisual, withVisualUpload, type StudioDraft } from './studio';
import { IDENTITY_POSE } from './studio-pose';

const empty = (): StudioDraft => emptyStudioDraft('fr');
const seedId = (draft: StudioDraft) => currentStudioPage(draft).texts[0]!.id;

const visual = () => ({
  previewUrl: 'blob:bg',
  mediaType: 'image' as const,
  upload: { phase: 'uploading' as const, progress: 0 },
  caption: '',
  pose: IDENTITY_POSE,
});

/** L'HISTORIQUE du plateau (#8413) — annuler/rétablir, les tuiles du rail
 * droit : ce qu'il défait, ce sont les gestes sur les OBJETS. */
describe('recordStudioStep / undoStudioStep / redoStudioStep', () => {
  test('annuler rend l’état d’AVANT le geste, rétablir celui d’après', () => {
    const before = empty();
    const after = withAddedText(before, 'fr');
    const history = recordStudioStep(emptyStudioHistory, before, null);
    const undone = undoStudioStep(history, after)!;
    expect(undone.draft).toBe(before);
    const redone = redoStudioStep(undone.history, undone.draft)!;
    expect(redone.draft).toBe(after);
  });

  test('rien à annuler ni à rétablir ⇒ null', () => {
    expect(undoStudioStep(emptyStudioHistory, empty())).toBeNull();
    expect(redoStudioStep(emptyStudioHistory, empty())).toBeNull();
  });

  test('la frappe dans UN même texte se coalise en UN pas', () => {
    const start = empty();
    const id = seedId(start);
    const a = withText(start, id, 'B');
    const b = withText(a, id, 'Bo');
    const history = recordStudioStep(recordStudioStep(emptyStudioHistory, start, `text:${id}`), a, `text:${id}`);
    expect(history.past).toHaveLength(1);
    expect(undoStudioStep(history, b)!.draft).toBe(start);
  });

  test('un nouveau geste EFFACE ce qu’on pouvait rétablir', () => {
    const start = empty();
    const next = withAddedText(start, 'fr');
    const undone = undoStudioStep(recordStudioStep(emptyStudioHistory, start, null), next)!;
    expect(undone.history.future).toHaveLength(1);
    expect(recordStudioStep(undone.history, undone.draft, null).future).toHaveLength(0);
  });

  test('enregistrer DEUX fois le même état n’empile qu’un pas (un rendu rejoué ne double rien)', () => {
    const start = empty();
    expect(recordStudioStep(recordStudioStep(emptyStudioHistory, start, null), start, null).past).toHaveLength(1);
  });

  test(`l’historique est BORNÉ à ${STUDIO_HISTORY_MAX} pas`, () => {
    const history = Array.from({ length: STUDIO_HISTORY_MAX + 10 }, () => empty()).reduce((h, draft) => recordStudioStep(h, draft, null), emptyStudioHistory);
    expect(history.past).toHaveLength(STUDIO_HISTORY_MAX);
  });
});

describe('rebaseStudioLive — ce qui s’est passé DEPUIS reste vrai', () => {
  test('un média restauré garde l’état de montée ACTUEL de ce même fichier', () => {
    const placed = withVisual(empty(), 'visual', visual());
    const ready = withVisualUpload(placed, 'visual', { phase: 'ready', postMediaId: 'pm', fileUrl: 'f.jpg' });
    const rebased = rebaseStudioLive(placed, ready);
    expect(currentStudioPage(rebased).background?.upload).toEqual({ phase: 'ready', postMediaId: 'pm', fileUrl: 'f.jpg' });
  });

  test('l’audience et le texte du post ne se défont pas : ils décident de l’ENVOI, pas de la scène', () => {
    const restored = empty();
    const current = withPostText(withAudience(empty(), 'PUBLIC'), 'Corps');
    const rebased = rebaseStudioLive(restored, current);
    expect(rebased.visibility).toBe('PUBLIC');
    expect(rebased.postText).toBe('Corps');
  });
});

/** UN TEXTE LAISSÉ VIDE NE LAISSE PAS DE PAS FANTÔME (#9140, jumelle de
 * `ComposerTextSceneDoor.returnsToDocument` iOS, #9137) — « T+ » puis fermer
 * sans écrire rend l'historique d'avant : « Annuler » ne rejoue pas un geste
 * qui n'a rien laissé. */
describe('withoutBirthStep — le pas qui a fait naître un texte retiré vide', () => {
  const born = (draft: StudioDraft) => currentStudioPage(draft).texts.at(-1)!.id;

  test('le dernier pas de la clé du texte, pris AVANT sa naissance, est oublié', () => {
    const before = empty();
    const id = born(withAddedText(before, 'fr'));
    const history = recordStudioStep(emptyStudioHistory, before, `text:${id}`);
    expect(withoutBirthStep(history, id)).toEqual(emptyStudioHistory);
  });

  test('un texte qui existait déjà garde son pas : « Annuler » rend ce qu’il disait', () => {
    const before = withText(empty(), seedId(empty()), 'abc');
    const history = recordStudioStep(emptyStudioHistory, before, `text:${seedId(before)}`);
    expect(withoutBirthStep(history, seedId(before))).toBe(history);
  });

  test('un autre geste depuis : rien n’est oublié', () => {
    const before = empty();
    const id = born(withAddedText(before, 'fr'));
    const history = recordStudioStep(emptyStudioHistory, before, null);
    expect(withoutBirthStep(history, id)).toBe(history);
  });
});
