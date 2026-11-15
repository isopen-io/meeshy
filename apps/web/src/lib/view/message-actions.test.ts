import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import { attachmentDefaults, message, minutesAgo, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { menuScope } from '@/test-support/menu-viewer';

import {
  EXTENDED_REACTIONS,
  QUICK_REACTIONS,
  forwardMenuItems,
  messageDetailExposureOf,
  messageMenuContextOf,
  messageMenuItems,
  messageStarAction,
  starrableOf,
  translationChoices,
  type MessageMenuContext,
} from './message-actions';

/**
 * LES VERDICTS DE LA LOI PARTAGÉE (#11210) pour trois messages types, lus par
 * un membre inscrit d'un groupe : le texte d'un autre, le mien, la photo d'un
 * autre. Le menu en est une projection ; les drapeaux de sortie du contexte
 * (texte, protection, langues) restent ceux que chaque témoin pose.
 */
const NOW = Date.now();
const row = (overrides: Partial<Message> = {}): Message =>
  message({ id: 'm-1', senderId: 'u-autre', content: 'bonjour', originalLanguage: 'fr', translations: [], createdAt: minutesAgo(5), ...overrides });
const PHOTO = {
  ...attachmentDefaults,
  id: 'a-1',
  messageId: 'm-1',
  mimeType: 'image/jpeg',
  fileName: 'p.jpg',
  originalName: 'p.jpg',
  fileUrl: '/f/p.jpg',
  fileSize: 1024,
  uploadedBy: 'u-autre',
  createdAt: '2026-10-20T09:00:00.000Z',
} as Attachment;
const actionsOf = (subject: Message) => messageMenuContextOf(subject, { now: NOW, scope: menuScope() }).actions;
const THEIRS = actionsOf(row());
const MINE = actionsOf(row({ senderId: 'u-viewer' }));
const THEIR_PHOTO = actionsOf(row({ content: '', attachments: [PHOTO] }));

/** Un `MessageMenuContext` de base — « rien de protégé, deux langues », le texte d'un autre. */
const ctx = (overrides: Partial<MessageMenuContext> = {}): MessageMenuContext => ({
  hasText: true,
  isProtected: false,
  languageCount: 2,
  canForward: true,
  ...(THEIRS === undefined ? {} : { actions: THEIRS }),
  ...overrides,
});

describe('messageMenuItems — miroir MessageActionResolver.primaryActions, réduit (#5814 §1.2)', () => {
  test('message standard, deux langues ⇒ reply, copy, forward, translate · select, export · more (#11210)', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).toEqual(['reply', 'copy', 'forward', 'translate', 'select', 'export', 'more']);
  });

  test('message SANS texte (m3) ⇒ reply, forward · select · more — ni copy ni translate', () => {
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).toEqual(['reply', 'forward', 'select', 'more']);
  });

  test('message PROTÉGÉ (D-23) ⇒ ni copy ni translate, même avec du texte', () => {
    expect(messageMenuItems(ctx({ isProtected: true })).map((i) => i.id)).toEqual(['reply', 'forward', 'select', 'more']);
  });

  test('une seule langue ⇒ pas de translate, copy reste', () => {
    expect(messageMenuItems(ctx({ languageCount: 1 })).map((i) => i.id)).toEqual(['reply', 'copy', 'forward', 'select', 'export', 'more']);
  });

  /**
   * LE MENU PORTE DES CLÉS, JAMAIS DES LIBELLÉS (#7555). Cette loi est PURE :
   * elle ne connaît ni la langue du lecteur ni le catalogue chargé — elle
   * nomme ce qu'il faut dire, et `message-menu.tsx` le dit. Un libellé rendu
   * ici aurait à nouveau figé le français dans une loi que les sept langues
   * partagent.
   */
  test('chaque entrée porte une CLÉ de catalogue, jamais un libellé', () => {
    const keys = Object.fromEntries(messageMenuItems(ctx()).map((i) => [i.id, i.labelKey]));
    expect(keys).toEqual({
      select: 'message.menu.select',
      translate: 'message.menu.translate',
      copy: 'message.menu.copy',
      forward: 'message.menu.forward',
      reply: 'message.menu.reply',
      export: 'message.menu.export',
      more: 'message.menu.more',
    });
  });

  /**
   * TÉMOIN DE RANG SUR UNE LOCALE NON FRANÇAISE (leçon 261, #7555) — le
   * français ne peut PAS trancher : un libellé EN DUR et une clé de catalogue
   * rendent le même verdict en `fr`, exactement comme le rang 1 du Prisme
   * rend le même verdict pour une descente juste et pour un court-circuit.
   * L'anglais et l'arabe séparent les deux, et l'arabe est de plus la langue
   * RTL du produit : un menu qui ne l'a jamais servie ne l'a jamais essayée.
   */
  test('ces clés se SERVENT — anglais puis arabe, jamais une recopie du français', async () => {
    await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar')]);
    expect(messageMenuItems(ctx()).flatMap((i) => (i.catalog === 'pieces' ? [] : [translate('en', i.labelKey)]))).toEqual([
      'Reply',
      'Copy',
      'Forward',
      'Translate',
      'Select',
      'Make an image',
      'More…',
    ]);
    expect(messageMenuItems(ctx()).flatMap((i) => (i.catalog === 'pieces' ? [] : [translate('ar', i.labelKey)]))).toEqual([
      'رد',
      'نسخ',
      'إعادة توجيه',
      'ترجمة',
      'تحديد',
      'تحويل إلى صورة',
      'المزيد…',
    ]);
  });

  test('QUICK_REACTIONS et EXTENDED_REACTIONS — miroir MessageOverlayMenu.swift:99-104', () => {
    expect(QUICK_REACTIONS).toEqual(['😂', '❤️', '👍', '😮', '😢', '🔥']);
    expect(EXTENDED_REACTIONS.length).toBe(20);
    expect(EXTENDED_REACTIONS.slice(0, 6)).toEqual(QUICK_REACTIONS as unknown as string[]);
  });
});

describe('messageMenuContextOf — dérivé du message, jamais une seconde loi de protection', () => {
  test('D-23 : un message flouté est protégé', () => {
    const result = messageMenuContextOf(
      {
        content: 'bonjour',
        isBlurred: true,
        isViewOnce: false,
        viewOnceCount: 0,
        translations: [],
      },
      { now: 1000 },
    );
    expect(result.isProtected).toBe(true);
    expect(result.hasText).toBe(true);
    expect(result.languageCount).toBe(1);
  });

  test('contenu vide (image seule) ⇒ hasText false', () => {
    const result = messageMenuContextOf(
      { content: '  ', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] },
      { now: 1000 },
    );
    expect(result.hasText).toBe(false);
    expect(result.hasImageableMedia).toBe(false);
  });

  test('une photo, une vidéo ou un vocal non masqués s’imagent ; une pièce floutée ou un document, non (#8693)', () => {
    const base = { content: '', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] };
    const piece = (mimeType: string, masked = false) => ({ mimeType, isBlurred: masked, isViewOnce: false });
    expect(messageMenuContextOf({ ...base, attachments: [piece('image/png')] }, { now: 1000 }).hasImageableMedia).toBe(true);
    expect(messageMenuContextOf({ ...base, attachments: [piece('audio/mp4')] }, { now: 1000 }).hasImageableMedia).toBe(true);
    expect(messageMenuContextOf({ ...base, attachments: [piece('image/png', true)] }, { now: 1000 }).hasImageableMedia).toBe(false);
    expect(messageMenuContextOf({ ...base, attachments: [piece('application/pdf')] }, { now: 1000 }).hasImageableMedia).toBe(false);
  });

  test('« Composer » n’offre que ce que le studio sait poser : une photo ou une vidéo (#8693)', () => {
    const base = { content: '', isBlurred: false, isViewOnce: false, viewOnceCount: 0, translations: [] };
    const piece = (mimeType: string) => ({ mimeType, isBlurred: false, isViewOnce: false });
    expect(messageMenuContextOf({ ...base, attachments: [piece('video/mp4')] }, { now: 1000 }).composableIndex).toBe(0);
    expect(messageMenuContextOf({ ...base, attachments: [piece('audio/mp4'), piece('image/jpeg')] }, { now: 1000 }).composableIndex).toBe(1);
    expect(messageMenuContextOf({ ...base, attachments: [piece('audio/mp4')] }, { now: 1000 }).composableIndex).toBeNull();
    expect(messageMenuContextOf({ ...base, isBlurred: true, attachments: [piece('image/jpeg')] }, { now: 1000 }).composableIndex).toBeNull();
  });

  /** LE CACHE ALLÉGÉ NE PORTE PAS LE CHAMP (#7527) — le témoin le passe donc
   * ABSENT, jamais `undefined` explicite derrière une assertion : c'est la
   * SIGNATURE qui doit l'accepter, et une assertion l'aurait justement
   * dispensée de le faire. */
  test('translations ABSENT (cache allégé) ⇒ languageCount = 1, pas TypeError', () => {
    const result = messageMenuContextOf(
      {
        content: 'nouveau message',
        isBlurred: false,
        isViewOnce: false,
        viewOnceCount: 0,
      },
      { now: 1000 },
    );
    expect(result.languageCount).toBe(1);
    expect(result.hasText).toBe(true);
    expect(result.isProtected).toBe(false);
  });
});

describe('translationChoices — original puis les rangs du PRISME, jamais l’ordre du tableau', () => {
  test('témoin de RANG (leçon 261) : lecteur [es,en], message fr + trad en ⇒ servie au rang 2', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m2', 'en', 'Hello')],
    };
    const choices = translationChoices({
      message,
      preferredLanguages: ['es', 'en'],
      servedLanguage: 'en',
    });
    expect(choices).toEqual([
      { code: 'fr', isOriginal: true, isServed: false },
      { code: 'en', isOriginal: false, isServed: true },
    ]);
  });

  test('le reste des traductions, non couvertes par le prisme, ferme la liste', () => {
    const message = {
      originalLanguage: 'fr',
      translations: [translation('m9', 'en', 'Hello'), translation('m9', 'de', 'Hallo')],
    };
    const choices = translationChoices({ message, preferredLanguages: ['en'], servedLanguage: 'en' });
    expect(choices.map((c) => c.code)).toEqual(['fr', 'en', 'de']);
  });

  test('translations ABSENT ⇒ choices ne contient que l\'original, sans jeter', () => {
    const choices = translationChoices({
      message: { originalLanguage: 'fr' },
      preferredLanguages: ['en', 'es'],
      servedLanguage: 'fr',
    });
    expect(choices).toEqual([{ code: 'fr', isOriginal: true, isServed: true }]);
  });
});

describe('« Exporter en image » suit la garde de « Copier »', () => {
  test('un message texte ordinaire s’exporte, juste avant « Plus… »', () => {
    const ids = messageMenuItems(ctx()).map((i) => i.id);
    expect(ids.indexOf('export')).toBe(ids.indexOf('more') - 1);
  });

  test('un message PROTÉGÉ ne s’exporte pas : ce qui ne se copie pas ne se peint pas', () => {
    expect(messageMenuItems(ctx({ isProtected: true })).map((i) => i.id)).not.toContain('export');
  });

  test('un message sans texte ni média n’a rien à peindre', () => {
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).not.toContain('export');
  });

  test('« Imager » un message fait d’une seule photo, d’une vidéo ou d’un vocal (#8693)', () => {
    expect(messageMenuItems(ctx({ hasText: false, hasImageableMedia: true })).map((i) => i.id)).toContain('export');
    expect(messageMenuItems(ctx({ hasText: false, hasImageableMedia: true, isProtected: true })).map((i) => i.id)).not.toContain('export');
  });

  test('le menu rapide dit « Imager », jamais « Composer » (#8693)', () => {
    const items = messageMenuItems(ctx({ hasImageableMedia: true }));
    expect(items.find((i) => i.id === 'export')?.labelKey).toBe('message.menu.export');
    expect(items.map((i) => i.id)).not.toContain('compose');
  });

  test('« Export rapide » n’apparaît qu’avec un format par défaut enregistré, juste après « Exporter en image »', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).not.toContain('exportQuick');
    const ids = messageMenuItems(ctx({ hasDefaultExportFormat: true })).map((i) => i.id);
    expect(ids.indexOf('exportQuick')).toBe(ids.indexOf('export') + 1);
    expect(messageMenuItems(ctx({ hasDefaultExportFormat: true, isProtected: true })).map((i) => i.id)).not.toContain('exportQuick');
  });

  test('une vue unique ne propose que « Plus… »', () => {
    expect(messageMenuItems(ctx({ isViewOnce: true })).map((i) => i.id)).toEqual(['more']);
  });
});

describe('« Transférer » n\'apparaît que si la règle du serveur l\'admet (#5866)', () => {
  test('message transférable ⇒ l\'entrée est là, entre Copier et Traduire', () => {
    const ids = messageMenuItems(ctx()).map((i) => i.id);
    expect(ids).toContain('forward');
    expect(ids.indexOf('forward')).toBeGreaterThan(ids.indexOf('copy'));
    expect(ids.indexOf('forward')).toBeLessThan(ids.indexOf('translate'));
  });

  // La garde vit côté client AVANT l'aller-retour : `admitMessageForward`
  // refuse une vue unique côté serveur, et découvrir l'interdit après coup
  // serait une promesse rompue, pas une protection.
  test('message non transférable ⇒ aucune entrée, jamais une entrée grisée', () => {
    expect(messageMenuItems(ctx({ canForward: false })).map((i) => i.id)).not.toContain('forward');
  });

  test('son libellé vient du catalogue, comme les cinq autres', () => {
    const item = messageMenuItems(ctx()).find((i) => i.id === 'forward');
    expect(item?.labelKey).toBe('message.menu.forward');
  });
});

/**
 * **LE FAVORI DANS « PLUS… »** (#7378) — iOS range l'étoile dans la feuille
 * « Plus… », section « Faire », juste après l'épingle
 * (`MessageActionResolver.moreSections`, `ctx.isStarred ? .unstar : .star`).
 * Le web n'a pas d'épingle : l'étoile ouvre la section.
 *
 * Deux écarts assumés avec iOS, et les deux vont dans le sens de la vérité :
 * - iOS la propose SANS CONDITION, vue unique comprise (son magasin est local) ;
 *   le serveur refuse désormais la vue unique (409 `MESSAGE_NOT_STARRABLE`),
 *   donc l'entrée n'apparaît pas plutôt que d'échouer au tap ;
 * - l'état est INCONNU tant que l'ensemble des favoris n'est pas chargé :
 *   l'entrée n'apparaît pas plutôt que de dire « Ajouter » sur un message déjà
 *   en favori.
 */
describe('messageStarAction — l’étoile ne ment pas sur son état', () => {
  test('état CONNU, pas en favori ⇒ « Ajouter aux favoris »', () => {
    expect(messageStarAction({ starred: false, starrable: true })).toBe('star');
  });

  test('état CONNU, en favori ⇒ « Retirer des favoris »', () => {
    expect(messageStarAction({ starred: true, starrable: true })).toBe('unstar');
  });

  test('état INCONNU ⇒ aucune entrée, jamais une supposition', () => {
    expect(messageStarAction({ starred: undefined, starrable: true })).toBeNull();
  });

  test('message non favorisable ⇒ aucune entrée pour AJOUTER', () => {
    expect(messageStarAction({ starred: false, starrable: false })).toBeNull();
  });

  test('une étoile déjà posée se RETIRE toujours, même sur un message devenu non favorisable', () => {
    expect(messageStarAction({ starred: true, starrable: false })).toBe('unstar');
  });
});

describe('starrableOf — ce que le serveur accepterait (règle 2 de #7377)', () => {
  const base = { id: '66f0a1b2c3d4e5f6a7b8c9d0', isViewOnce: false, effectFlags: 0 } as const;
  const NOW = Date.parse('2026-09-22T10:00:00.000Z');

  test('un message ordinaire, flouté ou éphémère encore vivant se met en favori', () => {
    expect(starrableOf(base, { now: NOW })).toBe(true);
    expect(starrableOf({ ...base, expiresAt: new Date(NOW + 60_000) }, { now: NOW })).toBe(true);
  });

  test('la VUE UNIQUE ne se met pas en favori — par le booléen ET par le bit d’effet', () => {
    expect(starrableOf({ ...base, isViewOnce: true }, { now: NOW })).toBe(false);
    expect(starrableOf({ ...base, effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE }, { now: NOW })).toBe(false);
  });

  test('supprimé ou expiré : rien à mettre en favori', () => {
    expect(starrableOf({ ...base, deletedAt: new Date(NOW - 1000) }, { now: NOW })).toBe(false);
    expect(starrableOf({ ...base, expiresAt: new Date(NOW - 1000) }, { now: NOW })).toBe(false);
  });

  test('un message encore OPTIMISTE (`cid_…`) n’existe pas côté serveur', () => {
    expect(starrableOf({ ...base, id: 'cid_0f0e0d0c-0b0a-4908-8706-050403020100' }, { now: NOW })).toBe(false);
  });
});

describe('messageDetailExposureOf — la feuille « Plus… » ne fait pas fuir un contenu non ouvert (#8008)', () => {
  const base = { content: 'bonjour', isBlurred: false, isViewOnce: false, viewOnceCount: 0 };

  test('un message ordinaire expose ses langues et ses pièces', () => {
    expect(messageDetailExposureOf(base, { now: 1000 })).toBe(true);
  });

  test('flouté : ni langues à explorer, ni pièces nommées', () => {
    expect(messageDetailExposureOf({ ...base, isBlurred: true }, { now: 1000 })).toBe(false);
  });

  test('à vue unique, scellée ou déjà ouverte : rien non plus', () => {
    expect(messageDetailExposureOf({ ...base, isViewOnce: true }, { now: 1000 })).toBe(false);
    expect(messageDetailExposureOf({ ...base, isViewOnce: true, viewOnceCount: 1 }, { now: 1000 })).toBe(false);
  });
});

/**
 * #9039 — « TRANSFÉRER » PROPOSE D'IMAGER LA DISCUSSION. Le sous-menu de
 * Transférer garde le transfert (armer la sélection) et ajoute « Imager la
 * discussion », sous la garde d'« Imager » : ce qui ne se copie pas ne se
 * peint pas.
 */
describe('forwardMenuItems — le sous-menu de « Transférer » (#9039)', () => {
  test('un message imageable ⇒ transférer, puis imager la discussion', () => {
    expect(forwardMenuItems(ctx()).map((i) => [i.id, i.labelKey, i.glyph])).toEqual([
      ['forward', 'message.menu.forward', 'arrowBendUpRight'],
      ['exportDiscussion', 'message.menu.exportDiscussion', 'imageSquare'],
    ]);
  });

  test('un message fait d’un seul média s’image aussi en discussion', () => {
    expect(forwardMenuItems(ctx({ hasText: false, hasImageableMedia: true })).map((i) => i.id)).toEqual(['forward', 'exportDiscussion']);
  });

  test('un message protégé (flouté, éphémère) se transfère mais ne s’image pas', () => {
    expect(forwardMenuItems(ctx({ isProtected: true })).map((i) => i.id)).toEqual(['forward']);
  });

  test('« Imager la discussion » se dit dans les sept langues, jamais par sa clé', async () => {
    for (const language of ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar'] as const) {
      await loadInterfaceCatalog(language);
      expect(translate(language, 'message.menu.exportDiscussion')).not.toBe('message.menu.exportDiscussion');
    }
    expect(translate('fr', 'message.menu.exportDiscussion')).toBe('Imager la discussion');
  });
});

describe('« Modifier » — juste après « Répondre », dans le groupe principal (#10581, #11210)', () => {
  test('offert sur mon message ⇒ « Modifier » suit « Répondre »', () => {
    expect(messageMenuItems(ctx({ canEdit: true, ...(MINE === undefined ? {} : { actions: MINE }) })).map((i) => i.id)).toEqual([
      'reply',
      'edit',
      'copy',
      'forward',
      'translate',
      'select',
      'export',
      'more',
    ]);
  });

  test('sur le message d’un autre, l’hôte a beau le croire : la loi ne l’admet pas', () => {
    expect(messageMenuItems(ctx({ canEdit: true })).map((i) => i.id)).not.toContain('edit');
  });

  test('non offert (défaut) ⇒ absent', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).not.toContain('edit');
    expect(messageMenuItems(ctx({ canEdit: false })).map((i) => i.id)).not.toContain('edit');
  });

  test('sans texte, rien à modifier — même offert', () => {
    expect(messageMenuItems(ctx({ canEdit: true, hasText: false })).map((i) => i.id)).not.toContain('edit');
  });

  test('une vue unique reste réduite à « Plus… »', () => {
    expect(messageMenuItems(ctx({ canEdit: true, isViewOnce: true })).map((i) => i.id)).toEqual(['more']);
  });

  test('son libellé est une clé du catalogue du fil, son glyphe le crayon', () => {
    const edit = messageMenuItems(ctx({ canEdit: true, ...(MINE === undefined ? {} : { actions: MINE }) })).find((i) => i.id === 'edit');
    expect(edit).toEqual({ id: 'edit', catalog: 'pieces', labelKey: 'message.edit.action', glyph: 'pencilSimple', group: 'primary' });
  });
});

describe('« Enregistrer » — un message à exactement une pièce enregistrable (#10599)', () => {
  const photo = (overrides: Partial<MessageMenuContext> = {}) =>
    ctx({ hasText: false, hasImageableMedia: true, ...(THEIR_PHOTO === undefined ? {} : { actions: THEIR_PHOTO }), ...overrides });

  test('dans le groupe principal, après « Transférer », comme la loi partagée le range (#11210)', () => {
    expect(messageMenuItems(photo({ canSave: true })).map((i) => i.id)).toEqual(['reply', 'forward', 'save', 'select', 'export', 'more']);
  });

  test('le mot est celui de la visionneuse, le glyphe celui de la pièce', async () => {
    const save = messageMenuItems(photo({ canSave: true })).find((i) => i.id === 'save');
    expect(save).toEqual({ id: 'save', catalog: 'interface', labelKey: 'media.viewer.save', glyph: 'downloadSimple', group: 'primary' });
    await loadInterfaceCatalog('fr');
    expect(translate('fr', 'media.viewer.save')).toBe('Enregistrer');
  });

  test('sans pièce enregistrable, pas d’entrée', () => {
    expect(messageMenuItems(ctx()).map((i) => i.id)).not.toContain('save');
  });

  test('fail-closed : un contenu protégé ou qui ne sort pas ne l’offre jamais, même si l’hôte le croit', () => {
    expect(messageMenuItems(photo({ canSave: true, isProtected: true })).map((i) => i.id)).not.toContain('save');
    expect(messageMenuItems(photo({ canSave: true, leaves: false })).map((i) => i.id)).not.toContain('save');
    expect(messageMenuItems(photo({ canSave: true, isViewOnce: true })).map((i) => i.id)).toEqual(['more']);
  });
});

describe('messageMenuItems — « Ajouter à mes stickers » (#10630)', () => {
  const sticker = { hasText: false, sticker: { inLibrary: false, hasPicture: true } } as const;

  test('offert SEULEMENT quand le sticker n’est pas déjà dans la bibliothèque, rangé dans « Organiser » (#11210)', () => {
    expect(messageMenuItems(ctx(sticker)).map((i) => i.id)).toEqual(['reply', 'forward', 'select', 'addSticker', 'more']);
    expect(messageMenuItems(ctx({ hasText: false, sticker: { inLibrary: true, hasPicture: true } })).map((i) => i.id)).not.toContain('addSticker');
    expect(messageMenuItems(ctx({ hasText: false })).map((i) => i.id)).not.toContain('addSticker');
  });

  test('son libellé vit dans le catalogue du fil', () => {
    expect(messageMenuItems(ctx(sticker)).find((i) => i.id === 'addSticker')).toEqual({
      id: 'addSticker',
      catalog: 'pieces',
      labelKey: 'message.sticker.add',
      glyph: 'downloadSimple',
      group: 'organize',
    });
  });

  test('jamais « Enregistrer » sur un sticker, rangé ou non, même avec une pièce enregistrable', () => {
    expect(messageMenuItems(ctx({ ...sticker, canSave: true })).map((i) => i.id)).not.toContain('save');
    expect(messageMenuItems(ctx({ hasText: false, sticker: { inLibrary: true, hasPicture: true }, canSave: true })).map((i) => i.id)).not.toContain('save');
  });

  test('un sticker SANS image jointe (glyphe emoji, gabarit seul) n’offre pas un ajout voué à l’échec', () => {
    expect(messageMenuItems(ctx({ hasText: false, sticker: { inLibrary: false, hasPicture: false } })).map((i) => i.id)).not.toContain('addSticker');
  });

  test('un contenu qui ne sort pas ne s’ajoute pas', () => {
    expect(messageMenuItems(ctx({ ...sticker, isProtected: true })).map((i) => i.id)).not.toContain('addSticker');
  });
});
