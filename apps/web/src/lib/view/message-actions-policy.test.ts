import { beforeAll, describe, expect, test } from 'bun:test';

import type { ActionConversation } from '@meeshy/shared/utils/message-action-policy';

import { attachmentDefaults, message, minutesAgo, translation } from '@/lib/api/fixtures-base';
import type { Attachment, Message } from '@/lib/api/types';
import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { loadMessagePiecesCatalog, translateMessagePieces } from '@/lib/i18n-message-pieces-catalog';
import { menuScope } from '@/test-support/menu-viewer';

import {
  MAX_PRIMARY_MENU_ACTIONS,
  menuConversationOf,
  menuViewerOf,
  messageMenuContextOf,
  messageMenuGroups,
  messageMenuItems,
  type ActionScope,
  type MenuViewer,
  type MessageMenuContext,
  type MessageMenuItem,
} from './message-actions';

/**
 * #11210 — LE MENU D'UN MESSAGE EST UNE PROJECTION DE `messageActionsFor`.
 * Le web ne compose plus aucune règle de rôle ni d'auteur : ce que le lecteur
 * peut faire vient de la loi partagée (`packages/shared/utils/
 * message-action-policy.ts`), et ce fichier ne dit que ce que l'écran SAIT
 * servir, groupé, Répondre en tête.
 */

beforeAll(async () => {
  await Promise.all([loadInterfaceCatalog('fr'), loadMessagePiecesCatalog('fr')]);
});

const NOW = Date.parse('2026-10-20T12:00:00.000Z');

const scopeOf = (
  options: { readonly viewer?: Partial<MenuViewer>; readonly conversation?: Partial<ActionConversation> } = {},
): ActionScope => menuScope(options.viewer, options.conversation);

const row = (overrides: Partial<Message> = {}): Message =>
  message({
    id: 'm-1',
    conversationId: 'c-a',
    senderId: 'u-other',
    content: 'Bonjour à tous',
    originalLanguage: 'fr',
    translations: [translation('m-1', 'en', 'Hello all')],
    createdAt: new Date(NOW - 10 * 60 * 1000),
    ...overrides,
  });

const ctxOf = (
  subject: Message,
  scope: ActionScope = scopeOf(),
  host: Partial<MessageMenuContext> = {},
  failed = false,
): MessageMenuContext => ({
  ...messageMenuContextOf(subject, { now: NOW, scope, failed }),
  piecesLabels: true,
  ...host,
});

const ids = (items: readonly MessageMenuItem[]): readonly string[] => items.map((item) => item.id);

describe('les RÔLES viennent de la loi partagée, jamais d’une règle locale', () => {
  test('un USER membre n’a pas « Retirer » sur le message d’un autre', () => {
    expect(messageMenuGroups(ctxOf(row())).moderation).toEqual([]);
  });

  test('un MODERATOR de plateforme l’a, au menu rapide, dans le groupe de modération', () => {
    const groups = messageMenuGroups(ctxOf(row(), scopeOf({ viewer: { platformRole: 'MODERATOR' } })));
    expect(ids(groups.moderation)).toEqual(['remove']);
  });

  test('le modérateur de la CONVERSATION l’a aussi, jamais dans une conversation directe', () => {
    expect(ids(messageMenuGroups(ctxOf(row(), scopeOf({ viewer: { conversationRole: 'moderator' } }))).moderation)).toEqual(['remove']);
    const direct = scopeOf({ viewer: { conversationRole: 'moderator', platformRole: 'ADMIN' }, conversation: { type: 'direct' } });
    expect(messageMenuGroups(ctxOf(row(), direct)).moderation).toEqual([]);
  });

  test('AUDIT et ANALYST valent USER : rien à retirer', () => {
    expect(messageMenuGroups(ctxOf(row(), scopeOf({ viewer: { platformRole: 'AUDIT' } }))).moderation).toEqual([]);
    expect(messageMenuGroups(ctxOf(row(), scopeOf({ viewer: { platformRole: 'ANALYST' } }))).moderation).toEqual([]);
  });

  test('sur son propre message, on ne se retire pas soi-même : on supprime', () => {
    const groups = messageMenuGroups(ctxOf(row({ senderId: 'u-viewer' }), scopeOf({ viewer: { platformRole: 'MODERATOR' } })));
    expect(groups.moderation).toEqual([]);
    expect(ids(groups.destructive)).toEqual(['delete']);
  });

  test('sans la loi (aucun lecteur connu), rien de ce qu’un rôle ou un auteur décide ne s’offre — fermé par défaut', () => {
    const bare = { ...messageMenuContextOf(row(), { now: NOW }), piecesLabels: true };
    const all = ids(messageMenuItems(bare));
    expect(all).not.toContain('reply');
    expect(all).not.toContain('edit');
    expect(all).not.toContain('remove');
    expect(all).not.toContain('delete');
  });
});

describe('le chiffrement de bout en bout retire ce que le serveur lirait', () => {
  const e2ee = scopeOf({ conversation: { encryptionMode: 'e2ee' } });

  test('« Traduire » mène à la traduction sur l’appareil, jamais au serveur', () => {
    const all = ids(messageMenuItems(ctxOf(row(), e2ee)));
    expect(all).toContain('translateOnDevice');
    expect(all).not.toContain('translate');
  });

  test('l’analyse et la transcription sont absentes, et « Plus » le dit discrètement', () => {
    const ctx = ctxOf(row(), e2ee);
    expect(ctx.actions?.verdicts.sentiment).toBeNull();
    expect(ctx.actions?.verdicts.transcribe).toBeNull();
    expect(ids(messageMenuGroups(ctx).more)).toEqual(['more', 'e2eeNotice']);
  });

  test('sans chiffrement, ni l’une ni l’autre mention : « Traduire » bascule entre les traductions servies', () => {
    const ctx = ctxOf(row());
    expect(ids(messageMenuItems(ctx))).toContain('translate');
    expect(ids(messageMenuGroups(ctx).more)).toEqual(['more']);
  });
});

describe('le TYPE du contenu ajoute ses gestes', () => {
  test('un message supprimé n’offre ni Répondre ni Sélectionner — seulement de le masquer chez soi', () => {
    const groups = messageMenuGroups(ctxOf(row({ deletedAt: minutesAgo(1), content: '' })));
    expect(ids(groups.primary)).toEqual([]);
    expect(ids(groups.organize)).toEqual([]);
    expect(ids(groups.more)).toEqual([]);
    expect(ids(groups.destructive)).toEqual(['delete']);
  });

  test('un lien offre « Ouvrir le lien » et « Copier le lien », juste après Répondre', () => {
    const ctx = ctxOf(row({ content: 'Regarde https://meeshy.me/a-propos.' }));
    expect(ids(messageMenuGroups(ctx).primary).slice(0, 3)).toEqual(['reply', 'openLink', 'copyLink']);
    expect(ctx.link).toBe('https://meeshy.me/a-propos');
  });

  test('un lieu offre « Ouvrir dans Plans » et « Copier l’adresse »', () => {
    const place = { latitude: 48.8566, longitude: 2.3522, name: 'Hôtel de Ville', address: 'Place de l’Hôtel de Ville, Paris' };
    const ctx = ctxOf(row({ content: '', messageType: 'location', metadata: { location: place } }));
    expect(ids(messageMenuGroups(ctx).primary)).toEqual(['reply', 'openInMaps', 'copyAddress', 'forward']);
    expect(ctx.place?.address).toBe('Place de l’Hôtel de Ville, Paris');
  });

  test('une carte de contact offre de l’enregistrer', () => {
    const vcard = {
      ...attachmentDefaults,
      id: 'a-1',
      messageId: 'm-1',
      mimeType: 'text/vcard',
      fileName: 'amina.vcf',
      originalName: 'amina.vcf',
      fileUrl: '/u/amina.vcf',
      fileSize: 120,
      uploadedBy: 'u-other',
      createdAt: '2026-10-20T11:00:00.000Z',
    } as Attachment;
    const ctx = ctxOf(row({ content: '', attachments: [vcard] }));
    expect(ids(messageMenuGroups(ctx).primary)).toContain('saveContact');
  });

  test('un envoi en échec offre « Réessayer » EN TÊTE, quand l’hôte sait réessayer', () => {
    const failed = row({ id: 'cid_1', senderId: 'u-viewer' });
    expect(ids(messageMenuGroups(ctxOf(failed, scopeOf(), { canRetry: true }, true)).primary)[0]).toBe('retry');
    expect(ids(messageMenuItems(ctxOf(failed, scopeOf(), {}, true)))).not.toContain('retry');
  });
});

describe('la forme du menu rapide', () => {
  test('Répondre ouvre le groupe principal, qui porte au plus six entrées', () => {
    const ctx = ctxOf(row({ senderId: 'u-viewer', content: 'Voir https://meeshy.me' }), scopeOf(), { canEdit: true, canSave: false });
    const { primary, more } = messageMenuGroups(ctx);
    expect(primary[0]?.id).toBe('reply');
    expect(primary.length).toBeLessThanOrEqual(MAX_PRIMARY_MENU_ACTIONS);
    expect(ids(primary)).toEqual(['reply', 'openLink', 'copyLink', 'edit', 'copy', 'forward']);
    expect(ids(more)).toEqual(['translate', 'more']);
  });

  test('les groupes se suivent dans l’ordre principal · organiser · plus · modération · destructif', () => {
    const ctx = ctxOf(row(), scopeOf({ viewer: { platformRole: 'ADMIN' } }));
    const groups = messageMenuItems(ctx).map((item) => item.group);
    const order = ['primary', 'organize', 'more', 'moderation', 'destructive'];
    expect([...groups].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual([...groups]);
    expect(new Set(groups)).toEqual(new Set(order));
  });

  test('« Organiser » range Sélectionner et l’épingle que la loi admet', () => {
    expect(ids(messageMenuGroups(ctxOf(row())).organize).slice(0, 2)).toEqual(['select', 'pin']);
    expect(ids(messageMenuGroups(ctxOf(row({ pinnedAt: minutesAgo(5) }))).organize).slice(0, 2)).toEqual(['select', 'unpin']);
    expect(ids(messageMenuGroups(ctxOf(row(), scopeOf({ viewer: { hasAccount: false, isAnonymous: true } }))).organize)).toEqual(['select', 'export']);
  });

  test('Répondre porte la flèche de réponse, plus la baguette magique (#7564)', () => {
    const reply = messageMenuItems(ctxOf(row())).find((item) => item.id === 'reply');
    expect(reply?.glyph).toBe('arrowUUpLeft');
  });

  test('un invité qui n’a pas le droit d’écrire ne répond pas', () => {
    const guest = scopeOf({ viewer: { hasAccount: false, isAnonymous: true, canSendMessages: false, platformRole: null } });
    expect(ids(messageMenuItems(ctxOf(row(), guest)))).not.toContain('reply');
  });

  test('chaque nouvelle entrée se dit en français depuis son catalogue — jamais par sa clé', () => {
    const ctx = ctxOf(row({ content: 'https://meeshy.me' }), scopeOf({ viewer: { platformRole: 'BIGBOSS' } }), { canRetry: true });
    const labels = messageMenuItems(ctx).map((item) =>
      item.catalog === 'pieces' ? translateMessagePieces('fr', item.labelKey) : translate('fr', item.labelKey),
    );
    expect(labels).toContain('Ouvrir le lien');
    expect(labels).toContain('Copier le lien');
    expect(labels).toContain('Retirer');
    expect(labels).toContain('Supprimer');
    expect(labels.every((label) => !label.includes('message.'))).toBe(true);
  });

  test('« Supprimer » porte la variante destructive, séparée du reste', () => {
    const items = messageMenuItems(ctxOf(row({ senderId: 'u-viewer' })));
    expect(items.at(-1)).toMatchObject({ id: 'delete', group: 'destructive', glyph: 'trash' });
  });
});

describe('menuConversationOf — la conversation que la loi lit', () => {
  test('une conversation pas encore lue est jugée CHIFFRÉE : ni modification ni transfert avant de savoir', () => {
    const unread: ActionScope = { viewer: menuScope().viewer, conversation: menuConversationOf(undefined) };
    const all = ids(messageMenuItems(ctxOf(row({ senderId: 'u-viewer' }), unread, { canEdit: true })));
    expect(all).not.toContain('edit');
    expect(all).not.toContain('forward');
  });

  test('une conversation lue porte son type, son régime et ses règles d’écriture', () => {
    expect(
      menuConversationOf({ type: 'broadcast', encryptionMode: 'server', isActive: true, isAnnouncementChannel: true, defaultWriteRole: 'admin' }),
    ).toEqual({ type: 'broadcast', encryptionMode: 'server', isActive: true, isAnnouncementChannel: true, defaultWriteRole: 'admin' });
  });
});

describe('menuViewerOf — le lecteur explicite, composé une fois pour l’écran', () => {
  test('un inscrit : son compte, son rôle de plateforme et celui de la conversation', () => {
    const viewer = menuViewerOf({
      viewer: { id: 'u-viewer', isAnonymous: false },
      participants: [{ id: 'p-1', userId: 'u-viewer', role: 'moderator', permissions: { canSendMessages: true } }],
      conversation: { currentUserRole: 'admin', isMember: true },
      platformRole: 'AUDIT',
    });
    expect(viewer).toEqual({
      id: 'u-viewer',
      participantId: 'p-1',
      hasAccount: true,
      isAnonymous: false,
      platformRole: 'AUDIT',
      conversationRole: 'admin',
      canSendMessages: true,
      isActiveMember: true,
    });
  });

  test('un invité d’un lien : aucun compte, aucun rôle de plateforme, sa permission d’envoi', () => {
    const viewer = menuViewerOf({
      viewer: { id: 'p-guest', isAnonymous: true },
      participants: [{ id: 'p-guest', role: 'member', permissions: { canSendMessages: false } }],
      conversation: { isMember: true },
      platformRole: 'ADMIN',
    });
    expect(viewer).toMatchObject({ hasAccount: false, isAnonymous: true, platformRole: null, canSendMessages: false, participantId: 'p-guest' });
  });

  test('aucune conversation lue : ni membre, ni rôle — fermé par défaut', () => {
    expect(menuViewerOf({ viewer: { id: null, isAnonymous: true }, participants: undefined, conversation: undefined, platformRole: null })).toMatchObject({
      id: '',
      hasAccount: false,
      isActiveMember: false,
      canSendMessages: false,
    });
  });
});
