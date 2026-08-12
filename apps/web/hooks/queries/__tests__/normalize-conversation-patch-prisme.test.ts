/**
 * `conversation:updated` — le Prisme Linguistique de la ligne de liste.
 *
 * Le défaut fermé ici : après une ÉDITION, la ligne de liste affichait le texte
 * D'AVANT, indéfiniment, jusqu'à un rechargement complet.
 *
 * La chaîne : `GET /conversations` hydrate `lastMessageTranslations` (la carte
 * du prisme du lecteur) ; `formatLastMessage` PRÉFÈRE cette traduction à
 * `lastMessagePreview` ; une édition périme `Message.translations` côté serveur
 * dans la même écriture. Le patch socket n'écrasait QUE l'aperçu — la carte
 * restait celle de l'ANCIEN texte, et c'est elle qui s'affichait.
 *
 * Le serveur porte désormais les deux champs sur le fil. Ce fichier vérifie que
 * le patch les fait entrer dans le cache AVEC LA MÊME FORME que le chemin REST
 * (`transformersService.extractPreviewTranslations`) : sans quoi le cache
 * détiendrait deux formes pour un même champ selon le transport — exactement ce
 * que le doc-comment du normaliseur reproche déjà aux dates.
 */

import { normalizeConversationPatch } from '../use-socket-cache-sync';

describe('normalizeConversationPatch — Prisme de la ligne de liste', () => {
  it('carries the reader-scoped translations map into the patch', () => {
    const patch = normalizeConversationPatch({
      lastMessagePreview: 'Hello',
      lastMessageOriginalLanguage: 'en',
      lastMessageTranslations: { fr: 'Bonjour' },
    });

    expect(patch.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
    expect(patch.lastMessageOriginalLanguage).toBe('en');
  });

  // LE témoin du défaut. Le serveur envoie `null` — une VALEUR, pas une absence.
  // La clé doit rester présente dans le patch avec `undefined`, parce que le
  // cache applique `{ ...conv, ...patch }` : une clé ABSENTE laisserait la carte
  // périmée en place, et la ligne continuerait d'afficher l'ancien texte traduit.
  it('expires a stale map when the server reports a null one after an edit', () => {
    const patch = normalizeConversationPatch({
      lastMessagePreview: 'Hello (edited)',
      lastMessageOriginalLanguage: 'en',
      lastMessageTranslations: null,
    });

    expect('lastMessageTranslations' in patch).toBe(true);
    expect(patch.lastMessageTranslations).toBeUndefined();

    const merged = { ...{ lastMessageTranslations: { fr: 'Bonjour' } }, ...patch };
    expect(merged.lastMessageTranslations).toBeUndefined();
  });

  it('drops entries that are not strings, matching the REST transformer', () => {
    const patch = normalizeConversationPatch({
      lastMessageTranslations: { fr: 'Bonjour', es: 42, de: null },
    });

    expect(patch.lastMessageTranslations).toEqual({ fr: 'Bonjour' });
  });

  it('normalises an unusable original language to undefined rather than writing garbage', () => {
    const patch = normalizeConversationPatch({ lastMessageOriginalLanguage: 123 });

    expect('lastMessageOriginalLanguage' in patch).toBe(true);
    expect(patch.lastMessageOriginalLanguage).toBeUndefined();
  });

  // Un `conversation:updated` de renommage ne parle pas d'aperçu. Toucher la
  // carte dans ce cas l'effacerait sans raison — la ligne retomberait sur
  // l'original alors que rien du dernier message n'a changé.
  it('leaves the prism untouched when the event carries no preview fields', () => {
    const patch = normalizeConversationPatch({ title: 'Renamed' });

    expect('lastMessageTranslations' in patch).toBe(false);
    expect('lastMessageOriginalLanguage' in patch).toBe(false);
  });
});
