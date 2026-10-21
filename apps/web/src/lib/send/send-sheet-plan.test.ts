import { describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import type { ShareMessage } from '@meeshy/shared/utils/share-plan';
import { SHARE_LIMITS } from '@meeshy/shared/utils/share-limits';

import { planSend, targetKeyOf, type SendPayload, type SendTarget } from './send-sheet-plan';

/**
 * LE PLAN D'UN ENVOI (#8884, #10948) — PUR. Éprouvé ici : l'ORDRE et la FORME
 * des opérations par cible, à partir du verdict de `planShare`.
 */
const exitOf = (id: string, over: Partial<ShareMessage> = {}): ShareMessage => ({ id, text: 'Salut', ...over });

const messages = (exit: readonly ShareMessage[], over: Partial<Extract<SendPayload, { kind: 'messages' }>> = {}): SendPayload => ({
  kind: 'messages',
  conversationId: 'src',
  messages: exit.map((m) => ({ id: m.id, content: m.text ?? '', originalLanguage: 'fr' })),
  exit,
  preview: { kind: 'text', text: 'Salut' },
  ...over,
});

const piece = (over: Partial<ShareMessage> = {}, mime = 'image/jpeg'): SendPayload => ({
  kind: 'attachment',
  conversationId: 'src',
  messageId: 'm7',
  attachmentId: 'a3',
  mime,
  previewUrl: 'https://cdn/a3.jpg',
  exit: exitOf('m7', { pieces: [{ id: 'a1', mimeType: mime }, { id: 'a2', mimeType: mime }, { id: 'a3', mimeType: mime }], ...over }),
});

const publication = (postType: 'POST' | 'STORY' | 'REEL' = 'POST'): SendPayload => ({
  kind: 'publication',
  postId: 'p1',
  postType,
  url: 'https://meeshy.me/p/p1',
  preview: { kind: 'publication' },
});

const file = (name: string, type: string, size = 2): File => new File([new Uint8Array(size)], name, { type });
const files = (...list: readonly File[]): SendPayload => ({ kind: 'files', files: list });

const conversation = (id: string, encrypted = false): SendTarget => ({ kind: 'conversation', conversationId: id, label: id, ...(encrypted ? { encrypted } : {}) });
const contact = (id: string): SendTarget => ({ kind: 'contact', userId: id, label: id });
const publish = (as: 'POST' | 'STORY' | 'REEL'): SendTarget => ({ kind: 'publish', as });

const plan = (payload: SendPayload, targets: readonly SendTarget[], caption = '', extra: Partial<Parameters<typeof planSend>[0]> = {}) =>
  planSend({ payload, targets, caption, viewerId: 'me', ...extra });

const stepsOf = (payload: SendPayload, targets: readonly SendTarget[], caption = '', extra: Partial<Parameters<typeof planSend>[0]> = {}) => {
  const result = plan(payload, targets, caption, extra);
  if (!result.ok) throw new Error(`plan refusé : ${JSON.stringify(result.error)}`);
  return result.entries.map((entry) => entry.steps);
};

describe('des messages', () => {
  test('le transfert, puis la légende en message à part (D4)', () => {
    expect(stepsOf(messages([exitOf('m1')]), [conversation('c1')], 'Regarde')).toEqual([
      [
        { kind: 'forward', sourceConversationId: 'src', messages: [{ id: 'm1', content: 'Salut', originalLanguage: 'fr' }] },
        { kind: 'text', text: 'Regarde' },
      ],
    ]);
  });

  test('une sélection mixte : le protégé est retiré, le reste part dans l’ordre (D6)', () => {
    const [steps] = stepsOf(messages([exitOf('a'), exitOf('b', { isViewOnce: true }), exitOf('c')]), [conversation('c1')]);
    expect(steps?.[0]).toMatchObject({ kind: 'forward', messages: [{ id: 'a' }, { id: 'c' }] });
  });

  test('tout est protégé : refusé, rien ne part', () => {
    expect(plan(messages([exitOf('b', { isViewOnce: true })]), [conversation('c1')])).toEqual({ ok: false, error: { kind: 'blocked' } });
  });

  test('un message que le web ne sait pas recopier est retiré (D7)', () => {
    const [steps] = stepsOf(messages([exitOf('a'), exitOf('b', { encrypted: true })], { unsendable: ['b'] }), [conversation('c1')]);
    expect(steps?.[0]).toMatchObject({ kind: 'forward', messages: [{ id: 'a' }] });
  });

  test('une personne sans conversation : la conversation directe est ouverte D’ABORD', () => {
    expect(stepsOf(messages([exitOf('m1')]), [contact('u1')])[0]?.[0]).toEqual({ kind: 'open-direct', userId: 'u1' });
  });

  test('créer un groupe avec deux personnes : la conversation de groupe d’abord, un seul envoi (D12)', () => {
    const target: SendTarget = { kind: 'new-group', userIds: ['u1', 'u2'], title: 'Léa, Léon' };
    const result = stepsOf(messages([exitOf('m1')]), [target]);
    expect(result).toHaveLength(1);
    expect(result[0]?.[0]).toEqual({ kind: 'open-group', userIds: ['u1', 'u2'], title: 'Léa, Léon' });
  });

  test('la durée choisie d’une flamme est portée par l’étape de transfert, pas par la légende', () => {
    const flame = exitOf('m1', { effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 3600 });
    const [steps] = stepsOf(messages([flame]), [conversation('c1')], 'Vite', { forwardDuration: 600 });
    expect(steps?.[0]).toMatchObject({ kind: 'forward', ephemeralDuration: 600 });
    expect(steps?.[1]).toEqual({ kind: 'text', text: 'Vite' });
  });

  test('un seul message à une seule pièce se publie par sa pièce', () => {
    const one = messages([exitOf('m1', { pieces: [{ id: 'a1', mimeType: 'image/jpeg' }] })]);
    expect(stepsOf(one, [publish('STORY')], 'Belle')).toEqual([[{ kind: 'publish-attachment', attachmentId: 'a1', format: 'STORY', content: 'Belle' }]]);
  });

  test('après un retrait D6, la pièce publiée est celle du message GARDÉ, jamais celle du message retiré en tête', () => {
    const secret = exitOf('m1', { text: null, isViewOnce: true, pieces: [{ id: 'a-secret', mimeType: 'image/jpeg', isViewOnce: true }] });
    const kept = exitOf('m2', { text: null, pieces: [{ id: 'a-ok', mimeType: 'image/jpeg' }] });
    expect(stepsOf(messages([secret, kept]), [publish('STORY')])).toEqual([[{ kind: 'publish-attachment', attachmentId: 'a-ok', format: 'STORY' }]]);
  });

  test('un message retiré SANS pièce en tête ne fait pas refuser l’envoi vers une publication et une conversation', () => {
    const secretText = exitOf('m0', { isViewOnce: true });
    const kept = exitOf('m2', { text: null, pieces: [{ id: 'a-ok', mimeType: 'image/jpeg' }] });
    const result = plan(messages([secretText, kept]), [conversation('c1'), publish('STORY')]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.entries[1]?.steps).toEqual([{ kind: 'publish-attachment', attachmentId: 'a-ok', format: 'STORY' }]);
  });

  test('le contenu que la file ÉCRIT ne garde que les messages qui partent : le texte d’un message retiré (D6) n’est jamais stocké', () => {
    const secret = exitOf('m1', { text: 'secret', isViewOnce: true });
    const kept = exitOf('m2', { text: 'public' });
    const payload = messages([secret, kept], { unsendable: ['m9'] });
    const result = plan(payload, [conversation('c1')]);
    if (!result.ok) throw new Error('plan refusé');
    expect(JSON.stringify(result.payload)).not.toContain('secret');
    expect(result.payload).toEqual(messages([kept], { preview: payload.kind === 'messages' ? payload.preview : { kind: 'messages' } }));
  });

  test('des messages sans média ne se publient pas', () => {
    expect(plan(messages([exitOf('m1')]), [publish('POST')])).toEqual({ ok: false, error: { kind: 'unsupported', targetKey: 'publish:POST' } });
  });
});

describe('une pièce d’un message (#9914)', () => {
  test('seule la pièce choisie part, nommée par son id, la légende juste après', () => {
    expect(stepsOf(piece(), [conversation('c1')], 'Fourvière')).toEqual([
      [
        { kind: 'forward-attachment', messageId: 'm7', attachmentId: 'a3', sourceConversationId: 'src' },
        { kind: 'text', text: 'Fourvière' },
      ],
    ]);
  });

  test('publier : depuis la pièce', () => {
    expect(stepsOf(piece(), [publish('POST')])).toEqual([[{ kind: 'publish-attachment', attachmentId: 'a3', format: 'POST' }]]);
  });

  test('une flamme ne se publie pas', () => {
    expect(plan(piece({ effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 60 }), [publish('POST')]).ok).toBe(false);
  });
});

describe('des fichiers venus d’ailleurs', () => {
  test('ensemble (défaut, D3) : UN message, la légende en est le texte', () => {
    expect(stepsOf(files(file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')), [conversation('c1')], 'Lyon')).toEqual([
      [{ kind: 'send-files', indexes: [0, 1], content: 'Lyon' }],
    ]);
  });

  test('séparément : un message par fichier, la légende sur le premier', () => {
    expect(stepsOf(files(file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')), [conversation('c1')], 'Lyon', { grouping: 'separate' })).toEqual([
      [
        { kind: 'send-files', indexes: [0], content: 'Lyon' },
        { kind: 'send-files', indexes: [1] },
      ],
    ]);
  });

  test('un audio et un document partent comme des fichiers (D9)', () => {
    expect(stepsOf(files(file('a.m4a', 'audio/mp4'), file('b.pdf', 'application/pdf')), [conversation('c1')])).toEqual([[{ kind: 'send-files', indexes: [0, 1] }]]);
  });

  test('vingt et un fichiers : refusé, en disant combien retirer (D10)', () => {
    const many = Array.from({ length: SHARE_LIMITS.maxFiles + 1 }, (_, i) => file(`${i}.jpg`, 'image/jpeg'));
    expect(plan(files(...many), [conversation('c1')])).toEqual({ ok: false, error: { kind: 'over-limits', trimCount: 1 } });
  });

  test('publier : UNE publication par fichier, chacune avec la légende', () => {
    expect(stepsOf(files(file('a.jpg', 'image/jpeg'), file('b.jpg', 'image/jpeg')), [publish('POST')], 'Lyon')).toEqual([
      [
        { kind: 'publish-file', format: 'POST', fileIndex: 0, caption: 'Lyon' },
        { kind: 'publish-file', format: 'POST', fileIndex: 1, caption: 'Lyon' },
      ],
    ]);
  });

  test('un fichier qui n’est ni image ni vidéo ne se publie pas d’ici', () => {
    expect(plan(files(file('a.pdf', 'application/pdf')), [publish('POST')]).ok).toBe(false);
  });
});

describe('une publication, un profil, une invitation, un texte', () => {
  test('une publication part en carte : la légende puis l’adresse', () => {
    expect(stepsOf(publication(), [conversation('c1')], 'Regarde')).toEqual([[{ kind: 'text', text: 'Regarde\nhttps://meeshy.me/p/p1' }]]);
  });

  test('republier : isQuote si et seulement s’il y a une légende', () => {
    expect(stepsOf(publication(), [publish('POST')])).toEqual([[{ kind: 'repost', postId: 'p1', format: 'POST', isQuote: false }]]);
    expect(stepsOf(publication(), [publish('STORY')], 'Oui')).toEqual([[{ kind: 'repost', postId: 'p1', format: 'STORY', content: 'Oui', isQuote: true }]]);
  });

  test('une story ne se republie pas (D14)', () => {
    expect(plan(publication('STORY'), [publish('STORY')]).ok).toBe(false);
  });

  test('le profil part par son adresse (D15)', () => {
    expect(stepsOf({ kind: 'profile', userId: 'u', url: 'https://meeshy.me/u/lea', name: 'Léa' }, [conversation('c1')])).toEqual([[{ kind: 'text', text: 'https://meeshy.me/u/lea' }]]);
  });

  test('un texte avec adresse : un seul message, texte puis adresse', () => {
    expect(stepsOf({ kind: 'text', text: 'Programme', url: 'https://x.org' }, [conversation('c1')], 'Tiens')).toEqual([[{ kind: 'text', text: 'Tiens\nProgramme\nhttps://x.org' }]]);
  });

  test('publier un texte : un post', () => {
    expect(stepsOf({ kind: 'text', text: 'Bonjour' }, [publish('POST')])).toEqual([[{ kind: 'publish-text', format: 'POST', content: 'Bonjour' }]]);
  });
});

describe('les garde-fous', () => {
  test('aucune cible : refusé', () => {
    expect(plan(messages([exitOf('m1')]), [])).toEqual({ ok: false, error: { kind: 'no-targets' } });
  });

  test('dix destinataires au plus, publications comprises (D10)', () => {
    const ten = Array.from({ length: SHARE_LIMITS.maxRecipients }, (_, i) => conversation(`c${i}`));
    expect(plan(files(file('a.jpg', 'image/jpeg')), [...ten, publish('STORY')])).toEqual({ ok: false, error: { kind: 'too-many-targets', max: SHARE_LIMITS.maxRecipients } });
    expect(plan(files(file('a.jpg', 'image/jpeg')), ten).ok).toBe(true);
  });

  test('une cible donnée deux fois n’est planifiée qu’une fois', () => {
    const result = plan(messages([exitOf('m1')]), [conversation('c1'), conversation('c1')]);
    expect(result.ok && result.entries.map((e) => e.key)).toEqual(['conversation:c1']);
  });

  test('on ne s’écrit pas à soi-même', () => {
    expect(plan(messages([exitOf('m1')]), [contact('me')])).toEqual({ ok: false, error: { kind: 'self-target' } });
  });

  test('une légende de plus de 5000 caractères est refusée', () => {
    expect(plan(files(file('a.jpg', 'image/jpeg')), [conversation('c1')], 'x'.repeat(5001))).toEqual({ ok: false, error: { kind: 'caption-too-long', max: 5000 } });
  });

  test('la clé d’une cible est stable, un groupe neuf quel que soit l’ordre des personnes', () => {
    expect(targetKeyOf(conversation('c1'))).toBe('conversation:c1');
    expect(targetKeyOf(contact('u1'))).toBe('contact:u1');
    expect(targetKeyOf(publish('REEL'))).toBe('publish:REEL');
    expect(targetKeyOf({ kind: 'new-group', userIds: ['b', 'a'], title: '' })).toBe(targetKeyOf({ kind: 'new-group', userIds: ['a', 'b'], title: 'x' }));
  });
});
