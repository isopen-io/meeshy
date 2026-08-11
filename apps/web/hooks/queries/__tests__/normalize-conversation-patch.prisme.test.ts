/**
 * `conversation:updated` porte désormais le Prisme de la ligne de liste. Ces
 * témoins fixent le seul point qui n'est pas mécanique : un `null` reçu doit
 * ÊTRE APPLIQUÉ (il périme la carte de l'ancien texte après une édition), pas
 * ignoré comme une clé absente.
 */
import { normalizeConversationPatch } from '../use-socket-cache-sync';

describe('normalizeConversationPatch — Prisme de la ligne de liste', () => {
  it('laisse passer la carte des aperçus traduits', () => {
    const patch = normalizeConversationPatch({ lastMessageTranslations: { fr: 'Bonjour' } });
    expect(patch.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
  });

  it('APPLIQUE le vide reçu — la carte de l\'ancien texte doit disparaître de la ligne', () => {
    const patch = normalizeConversationPatch({ lastMessageTranslations: null });
    expect('lastMessageTranslations' in patch).toBe(true);
    expect(patch.lastMessageTranslations).toBeUndefined();

    const cached = { id: 'c1', lastMessageTranslations: { fr: 'Bonjour, texte AVANT édition' } };
    expect({ ...cached, ...patch }.lastMessageTranslations).toBeUndefined();
  });

  it('refuse un tableau — sinon `[\'Bonjour\']` traverserait comme une carte indexée par des entiers', () => {
    const patch = normalizeConversationPatch({ lastMessageTranslations: ['Bonjour'] });
    expect(patch.lastMessageTranslations).toBeUndefined();
  });

  it('écarte les entrées non textuelles', () => {
    const patch = normalizeConversationPatch({ lastMessageTranslations: { fr: 'Bonjour', es: 42 } });
    expect(patch.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
  });

  it('applique la langue d\'origine, `null` compris', () => {
    expect(normalizeConversationPatch({ lastMessageOriginalLanguage: 'en' }).lastMessageOriginalLanguage)
      .toBe('en');
    const cleared = normalizeConversationPatch({ lastMessageOriginalLanguage: null });
    expect('lastMessageOriginalLanguage' in cleared).toBe(true);
    expect(cleared.lastMessageOriginalLanguage).toBeUndefined();
  });

  it('ne fabrique aucune des deux clés quand la charge utile ne décrit pas le dernier message', () => {
    const patch = normalizeConversationPatch({ title: 'Nouveau titre' });
    expect('lastMessageTranslations' in patch).toBe(false);
    expect('lastMessageOriginalLanguage' in patch).toBe(false);
  });
});
