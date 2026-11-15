import { describe, expect, it } from 'vitest';
import { conversationAccentPalette, conversationAccentPaletteFromPrimary } from '../../utils/conversation-colors';
import { APPEARANCE_GAMUT } from '../../design/appearance/gamut';
import {
  APPEARANCE_VERSION,
  DEFAULT_APPEARANCE,
  appearanceFromPreferences,
  parseConversationAppearance,
  readConversationAppearance,
  resolveAppearanceAccent,
  type ConversationAppearance,
} from '../conversation-appearance';

const ATTACHMENT = '65f0a1b2c3d4e5f607182930';
const valid = (over: Record<string, unknown> = {}) => ({ v: 1, background: { kind: 'signature' }, accent: null, animate: true, ...over });

describe('parseConversationAppearance — strict, à l’écriture', () => {
  it('lit chaque forme valide', () => {
    expect(APPEARANCE_VERSION).toBe(1);
    const forms: unknown[] = [
      valid(),
      valid({ background: { kind: 'design', pack: 'heritages', design: 'zellige' } }),
      valid({ background: { kind: 'solid', color: 'lagon' }, accent: 'framboise' }),
      valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.8, blur: 24 } }),
      valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0, blur: 0 }, animate: false }),
    ];
    forms.forEach((form) => expect(parseConversationAppearance(form)).toEqual(form));
  });

  it.each([
    ['kind inconnu', valid({ background: { kind: 'video' } })],
    ['voile > 0,8', valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.85, blur: 0 } })],
    ['voile hors pas de 0,05', valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.33, blur: 0 } })],
    ['flou > 24', valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.2, blur: 25 } })],
    ['flou fractionnaire', valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.2, blur: 2.5 } })],
    ['pièce jointe qui n’est pas un ObjectId', valid({ background: { kind: 'photo', attachmentId: 'abc', veil: 0.2, blur: 0 } })],
    ['couleur unie hors gamme', valid({ background: { kind: 'solid', color: 'fuchsia' } })],
    ['accent hors gamme', valid({ accent: 'fuchsia' })],
    ['accent absent', { v: 1, background: { kind: 'signature' }, animate: true }],
    ['version 2', valid({ v: 2 })],
    ['pack au slug invalide', valid({ background: { kind: 'design', pack: 'Hé ritages', design: 'zellige' } })],
    ['champ en trop dans le fond', valid({ background: { kind: 'signature', extra: 1 } })],
    ['animate non booléen', valid({ animate: 'oui' })],
    ['null', null],
    ['chaîne', 'signature'],
  ])('refuse : %s', (_label, input) => {
    expect(parseConversationAppearance(input)).toBeNull();
  });
});

describe('readConversationAppearance — tolérant par champ, côté clients', () => {
  it('absent ou illisible ⇒ l’apparence par défaut (Signature, accent calculé, animations)', () => {
    expect(DEFAULT_APPEARANCE).toEqual({ v: 1, background: { kind: 'signature' }, accent: null, animate: true });
    [undefined, null, 3, 'x', [], {}].forEach((input) => expect(readConversationAppearance(input)).toEqual(DEFAULT_APPEARANCE));
  });

  it('un fond d’une passerelle plus récente retombe sur Signature SANS perdre l’accent', () => {
    expect(readConversationAppearance(valid({ background: { kind: 'hologram', depth: 3 }, accent: 'azur', animate: false }))).toEqual({
      v: 1,
      background: { kind: 'signature' },
      accent: 'azur',
      animate: false,
    });
  });

  it('un champ AJOUTÉ par une passerelle plus récente à un fond connu ne le fait pas tomber', () => {
    expect(
      readConversationAppearance(valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 0.2, blur: 4, focus: { x: 0.5, y: 0.3 } } })).background,
    ).toEqual({ kind: 'photo', attachmentId: ATTACHMENT, veil: 0.2, blur: 4 });
    expect(readConversationAppearance(valid({ background: { kind: 'signature', extra: 1 } })).background).toEqual({ kind: 'signature' });
  });

  it('un accent illisible retombe sur l’accent calculé SANS perdre le fond', () => {
    expect(readConversationAppearance(valid({ background: { kind: 'solid', color: 'olive' }, accent: 'couleur-future' }))).toEqual({
      v: 1,
      background: { kind: 'solid', color: 'olive' },
      accent: null,
      animate: true,
    });
  });

  it('un voile hors bornes rend le fond photo illisible, pas la conversation', () => {
    expect(readConversationAppearance(valid({ background: { kind: 'photo', attachmentId: ATTACHMENT, veil: 3, blur: 1 }, accent: 'prune' })).background).toEqual({ kind: 'signature' });
  });

  it('relit sans les perdre une apparence valide', () => {
    const appearance: ConversationAppearance = valid({ background: { kind: 'design', pack: 'essentiels', design: 'aurore' }, accent: 'indigo' }) as ConversationAppearance;
    expect(readConversationAppearance(appearance)).toEqual(appearance);
  });
});

describe('appearanceFromPreferences — la projection du tableau userPreferences du wire', () => {
  it('lit l’entrée unique du lecteur', () => {
    expect(appearanceFromPreferences([{ isPinned: true, appearance: valid({ accent: 'lagon' }) }])).toMatchObject({ accent: 'lagon' });
  });

  it('retombe sur le défaut : tableau vide, entrée sans apparence, appearance null, valeur non-tableau', () => {
    [[], [{}], [{ appearance: null }], [null], undefined, null, 'x', { appearance: valid({ accent: 'lagon' }) }].forEach((input) =>
      expect(appearanceFromPreferences(input)).toEqual(DEFAULT_APPEARANCE),
    );
  });
});

describe('resolveAppearanceAccent — l’accent EFFECTIF', () => {
  const computed = conversationAccentPalette({ name: 'x', type: 'group', language: 'fr', theme: 'work' });
  const appearance = (accent: ConversationAppearance['accent']): ConversationAppearance => ({ ...DEFAULT_APPEARANCE, accent });

  it('sans accent personnel, la palette calculée est rendue inchangée', () => {
    ['light', 'dark'].forEach((scheme) =>
      expect(resolveAppearanceAccent({ computedPrimary: computed.primary, appearance: appearance(null), scheme: scheme as 'light' | 'dark' })).toEqual(computed),
    );
  });

  it('avec un accent de la gamme, la primaire est celle du schéma et se décline à ±30°', () => {
    const light = resolveAppearanceAccent({ computedPrimary: computed.primary, appearance: appearance('framboise'), scheme: 'light' });
    const dark = resolveAppearanceAccent({ computedPrimary: computed.primary, appearance: appearance('framboise'), scheme: 'dark' });
    expect(light).toEqual(conversationAccentPaletteFromPrimary(APPEARANCE_GAMUT.framboise.light.accent));
    expect(dark).toEqual(conversationAccentPaletteFromPrimary(APPEARANCE_GAMUT.framboise.dark.accent));
    expect(light.primary).not.toBe(dark.primary);
  });
});
