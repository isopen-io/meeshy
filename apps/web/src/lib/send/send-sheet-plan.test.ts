import { describe, expect, test } from 'bun:test';

import {
  MAX_CONVERSATION_TARGETS,
  MAX_PUBLISH_TARGETS,
  planSend,
  publishOffered,
  targetKeyOf,
  type SendPayload,
  type SendPreview,
  type SendTarget,
} from './send-sheet-plan';

/**
 * LE PLAN D'UN ENVOI (#8884) — PUR : aucune requête, aucun DOM. Ce qui est
 * éprouvé ici est l'ORDRE et la FORME des opérations par cible ; que chaque
 * opération parte bien vers la passerelle est l'affaire de `send-sheet-run`.
 */
const preview = (over: Partial<SendPreview> = {}): SendPreview => ({ kind: 'text', text: 'Salut', ...over });

const messages = (over: Partial<Extract<SendPayload, { kind: 'messages' }>> = {}): SendPayload => ({
  kind: 'messages',
  conversationId: 'src',
  messages: [{ id: 'm1', content: 'Salut', originalLanguage: 'fr' }],
  preview: preview(),
  ...over,
});

const attachment = (over: Partial<Extract<SendPayload, { kind: 'attachment' }>> = {}): SendPayload => ({
  kind: 'attachment',
  conversationId: 'src',
  messageId: 'm7',
  attachmentId: 'a7',
  mime: 'image/jpeg',
  previewUrl: 'https://cdn/a7.jpg',
  mine: true,
  protected: false,
  ...over,
});

const publication = (over: Partial<Extract<SendPayload, { kind: 'publication' }>> = {}): SendPayload => ({
  kind: 'publication',
  postId: 'p1',
  postType: 'POST',
  url: 'https://meeshy.me/p/p1',
  preview: preview({ kind: 'publication' }),
  ...over,
});

const file = (name: string, type: string): File => new File([new Uint8Array(2)], name, { type });
const files = (...list: readonly File[]): SendPayload => ({ kind: 'files', files: list });

const conversation = (id: string): SendTarget => ({ kind: 'conversation', conversationId: id, label: id });
const contact = (id: string): SendTarget => ({ kind: 'contact', userId: id, label: id });
const publish = (as: 'POST' | 'STORY' | 'REEL'): SendTarget => ({ kind: 'publish', as });

const plan = (payload: SendPayload, targets: readonly SendTarget[], caption = '') => planSend({ payload, targets, caption, viewerId: 'me' });

const stepsOf = (payload: SendPayload, targets: readonly SendTarget[], caption = '') => {
  const result = plan(payload, targets, caption);
  if (!result.ok) throw new Error(`plan refusé : ${JSON.stringify(result.error)}`);
  return result.entries.map((entry) => entry.steps);
};

describe('publishOffered — quelles pastilles offrir', () => {
  test('une pièce image non protégée : POST, STORY, RÉEL', () => {
    expect(publishOffered(attachment())).toEqual(['POST', 'STORY', 'REEL']);
  });

  test('JAMAIS rien pour un contenu protégé', () => {
    expect(publishOffered(attachment({ protected: true }))).toEqual([]);
  });

  test('une pièce audio ou un document ne se publie pas', () => {
    expect(publishOffered(attachment({ mime: 'audio/webm' }))).toEqual([]);
    expect(publishOffered(attachment({ mime: 'application/pdf' }))).toEqual([]);
  });

  test('des fichiers image ou vidéo : les trois ; un fichier d’un autre genre : aucune', () => {
    expect(publishOffered(files(file('a.png', 'image/png'), file('b.mp4', 'video/mp4')))).toEqual(['POST', 'STORY', 'REEL']);
    expect(publishOffered(files(file('a.png', 'image/png'), file('b.pdf', 'application/pdf')))).toEqual([]);
    expect(publishOffered(files())).toEqual([]);
  });

  test('un média venu d’une publication ou d’un commentaire : les trois', () => {
    const media: SendPayload = { kind: 'media', url: 'https://cdn/x.jpg', mime: 'image/jpeg', name: 'x.jpg', preview: preview({ kind: 'image' }) };
    expect(publishOffered(media)).toEqual(['POST', 'STORY', 'REEL']);
  });

  test('une publication : STORY, RÉEL, POST (repost)', () => {
    expect(publishOffered(publication())).toEqual(['STORY', 'REEL', 'POST']);
  });

  test('un texte : POST seulement', () => {
    expect(publishOffered({ kind: 'text', text: 'Salut' })).toEqual(['POST']);
  });

  test('des messages : aucune, sauf UN message portant UN média non protégé', () => {
    expect(publishOffered(messages())).toEqual([]);
    const sole = { attachmentId: 'a1', mime: 'video/mp4', protected: false };
    expect(publishOffered(messages({ soleMedia: sole }))).toEqual(['POST', 'STORY', 'REEL']);
    expect(publishOffered(messages({ soleMedia: { ...sole, protected: true } }))).toEqual([]);
    expect(
      publishOffered(
        messages({
          messages: [
            { id: 'm1', content: '', originalLanguage: 'fr' },
            { id: 'm2', content: '', originalLanguage: 'fr' },
          ],
          soleMedia: sole,
        }),
      ),
    ).toEqual([]);
  });
});

describe('planSend — messages (transfert)', () => {
  test('le transfert, puis la légende en second message', () => {
    const [steps] = stepsOf(messages(), [conversation('c1')], 'Regarde ça');
    expect(steps).toEqual([
      { kind: 'forward', sourceConversationId: 'src', messages: [{ id: 'm1', content: 'Salut', originalLanguage: 'fr' }] },
      { kind: 'text', text: 'Regarde ça' },
    ]);
  });

  test('sans légende, le transfert seul', () => {
    const [steps] = stepsOf(messages(), [conversation('c1')]);
    expect(steps).toHaveLength(1);
    expect(steps?.[0]?.kind).toBe('forward');
  });

  test('une légende blanche n’est pas une légende', () => {
    const [steps] = stepsOf(messages(), [conversation('c1')], '   \n ');
    expect(steps).toHaveLength(1);
  });

  test('une personne sans conversation : la conversation est ouverte D’ABORD', () => {
    const [steps] = stepsOf(messages(), [contact('u1')]);
    expect(steps?.map((s) => s.kind)).toEqual(['open-direct', 'forward']);
    expect(steps?.[0]).toEqual({ kind: 'open-direct', userId: 'u1' });
  });

  test('une entrée PAR cible, dans l’ordre choisi, chacune avec sa clé', () => {
    const result = plan(messages(), [conversation('c1'), contact('u1'), conversation('c2')]);
    expect(result.ok && result.entries.map((e) => e.key)).toEqual(['conversation:c1', 'contact:u1', 'conversation:c2']);
  });

  test('une cible donnée deux fois n’est planifiée qu’une fois', () => {
    const result = plan(messages(), [conversation('c1'), conversation('c1')]);
    expect(result.ok && result.entries).toHaveLength(1);
  });
});

describe('planSend — une pièce de message', () => {
  test('la mienne : UNE copie serveur, la légende dans le même message', () => {
    const [steps] = stepsOf(attachment(), [conversation('c1')], 'Tiens');
    expect(steps).toEqual([{ kind: 'copy-attachment', messageId: 'm7', content: 'Tiens' }]);
  });

  test('la mienne sans légende : la clé content est absente', () => {
    const [steps] = stepsOf(attachment(), [conversation('c1')]);
    expect(steps).toEqual([{ kind: 'copy-attachment', messageId: 'm7' }]);
  });

  test('celle d’un autre : un transfert, la légende en second message', () => {
    const [steps] = stepsOf(attachment({ mine: false }), [conversation('c1')], 'Tiens');
    expect(steps).toEqual([
      { kind: 'forward-attachment', messageId: 'm7', sourceConversationId: 'src' },
      { kind: 'text', text: 'Tiens' },
    ]);
  });

  test('la mienne mais PROTÉGÉE (éphémère) : un transfert, pour que la copie HÉRITE de la durée — jamais une copie serveur permanente', () => {
    const [steps] = stepsOf(attachment({ protected: true }), [conversation('c1')], 'Tiens');
    expect(steps).toEqual([
      { kind: 'forward-attachment', messageId: 'm7', sourceConversationId: 'src' },
      { kind: 'text', text: 'Tiens' },
    ]);
  });

  test('publier : from-attachment avec le format et la légende', () => {
    const [post, story, reel] = stepsOf(attachment(), [publish('POST'), publish('STORY'), publish('REEL')], 'Beau');
    expect(post).toEqual([{ kind: 'publish-attachment', attachmentId: 'a7', format: 'POST', content: 'Beau' }]);
    expect(story).toEqual([{ kind: 'publish-attachment', attachmentId: 'a7', format: 'STORY', content: 'Beau' }]);
    expect(reel).toEqual([{ kind: 'publish-attachment', attachmentId: 'a7', format: 'REEL', content: 'Beau' }]);
  });

  test('publier un contenu protégé est REFUSÉ', () => {
    const result = plan(attachment({ protected: true }), [publish('POST')]);
    expect(result).toEqual({ ok: false, error: { kind: 'protected' } });
  });

  test('un média protégé peut encore être envoyé à une conversation (le serveur juge le transfert)', () => {
    expect(plan(attachment({ protected: true }), [conversation('c1')]).ok).toBe(true);
  });

  test('un seul message portant un seul média : publier passe par sa pièce', () => {
    const payload = messages({ soleMedia: { attachmentId: 'a1', mime: 'image/png', protected: false } });
    const [steps] = stepsOf(payload, [publish('STORY')]);
    expect(steps).toEqual([{ kind: 'publish-attachment', attachmentId: 'a1', format: 'STORY' }]);
  });

  test('des messages sans média ne se publient pas', () => {
    expect(plan(messages(), [publish('POST')])).toEqual({ ok: false, error: { kind: 'unsupported', targetKey: 'publish:POST' } });
  });
});

describe('planSend — une publication', () => {
  test('vers une conversation : UN message texte, la légende puis l’adresse', () => {
    const [steps] = stepsOf(publication(), [conversation('c1')], 'À voir');
    expect(steps).toEqual([{ kind: 'text', text: 'À voir\nhttps://meeshy.me/p/p1' }]);
  });

  test('sans légende : l’adresse seule', () => {
    const [steps] = stepsOf(publication(), [conversation('c1')]);
    expect(steps).toEqual([{ kind: 'text', text: 'https://meeshy.me/p/p1' }]);
  });

  test('republier : un repost, isQuote si et seulement s’il y a une légende', () => {
    const [withCaption] = stepsOf(publication(), [publish('STORY')], 'Bravo');
    expect(withCaption).toEqual([{ kind: 'repost', postId: 'p1', format: 'STORY', content: 'Bravo', isQuote: true }]);
    const [silent] = stepsOf(publication(), [publish('REEL')]);
    expect(silent).toEqual([{ kind: 'repost', postId: 'p1', format: 'REEL', isQuote: false }]);
  });
});

describe('planSend — fichiers et médias', () => {
  const pics = files(file('a.png', 'image/png'), file('b.png', 'image/png'));

  test('vers une conversation : UN message qui porte les fichiers et la légende', () => {
    const [steps] = stepsOf(pics, [conversation('c1')], 'Vacances');
    expect(steps).toEqual([{ kind: 'send-files', content: 'Vacances' }]);
  });

  test('vers plusieurs : chacune reçoit SON envoi (le moteur décide qui téléverse)', () => {
    const all = stepsOf(pics, [conversation('c1'), contact('u1'), conversation('c2')]);
    expect(all.map((s) => s.map((x) => x.kind))).toEqual([['send-files'], ['open-direct', 'send-files'], ['send-files']]);
  });

  test('publier : UNE publication par fichier, chacune avec la légende', () => {
    const [steps] = stepsOf(pics, [publish('STORY')], 'Regarde');
    expect(steps).toEqual([
      { kind: 'publish-file', format: 'STORY', fileIndex: 0, caption: 'Regarde' },
      { kind: 'publish-file', format: 'STORY', fileIndex: 1, caption: 'Regarde' },
    ]);
  });

  test('un média venu d’ailleurs compte pour UN fichier', () => {
    const media: SendPayload = { kind: 'media', url: 'https://cdn/x.jpg', mime: 'image/jpeg', name: 'x.jpg', preview: preview({ kind: 'image' }) };
    const [conv, post] = stepsOf(media, [conversation('c1'), publish('POST')]);
    expect(conv).toEqual([{ kind: 'send-files' }]);
    expect(post).toEqual([{ kind: 'publish-file', format: 'POST', fileIndex: 0 }]);
  });

  test('publier des fichiers qui ne sont ni image ni vidéo : refusé', () => {
    expect(plan(files(file('a.pdf', 'application/pdf')), [publish('POST')])).toEqual({
      ok: false,
      error: { kind: 'unsupported', targetKey: 'publish:POST' },
    });
  });

  test('pas plus de dix fichiers à publier d’un coup', () => {
    const many = files(...Array.from({ length: 11 }, (_, i) => file(`${i}.png`, 'image/png')));
    expect(plan(many, [publish('POST')])).toEqual({ ok: false, error: { kind: 'too-many-files', max: 10 } });
  });
});

describe('planSend — un texte', () => {
  test('vers une conversation : légende, texte, adresse — un seul message', () => {
    const [steps] = stepsOf({ kind: 'text', text: 'Un extrait', url: 'https://x.test/a' }, [conversation('c1')], 'Lis ça');
    expect(steps).toEqual([{ kind: 'text', text: 'Lis ça\nUn extrait\nhttps://x.test/a' }]);
  });

  test('publier : un post texte', () => {
    const [steps] = stepsOf({ kind: 'text', text: 'Un extrait' }, [publish('POST')]);
    expect(steps).toEqual([{ kind: 'publish-text', format: 'POST', content: 'Un extrait' }]);
  });

  test('un texte ne fait ni story ni réel', () => {
    expect(plan({ kind: 'text', text: 'x' }, [publish('STORY')])).toEqual({ ok: false, error: { kind: 'unsupported', targetKey: 'publish:STORY' } });
  });
});

describe('planSend — les bornes', () => {
  test('aucune cible : refusé', () => {
    expect(plan(messages(), [])).toEqual({ ok: false, error: { kind: 'no-targets' } });
  });

  test('dix destinataires au plus', () => {
    const ten = Array.from({ length: MAX_CONVERSATION_TARGETS }, (_, i) => conversation(`c${i}`));
    expect(plan(messages(), ten).ok).toBe(true);
    expect(plan(messages(), [...ten, contact('u1')])).toEqual({ ok: false, error: { kind: 'too-many-targets', max: 10 } });
  });

  test('les pastilles de publication ne comptent pas dans les dix', () => {
    const ten = Array.from({ length: MAX_CONVERSATION_TARGETS }, (_, i) => conversation(`c${i}`));
    const payload = attachment();
    expect(plan(payload, [...ten, publish('POST'), publish('STORY'), publish('REEL')]).ok).toBe(true);
    expect(MAX_PUBLISH_TARGETS).toBe(3);
  });

  test('on ne s’écrit pas à soi-même', () => {
    expect(plan(messages(), [contact('me')])).toEqual({ ok: false, error: { kind: 'self-target' } });
  });

  test('une légende de plus de 5000 caractères ne se publie pas', () => {
    const long = 'x'.repeat(5001);
    expect(plan(attachment(), [publish('POST')], long)).toEqual({ ok: false, error: { kind: 'caption-too-long', max: 5000 } });
    expect(plan(attachment(), [conversation('c1')], long).ok).toBe(true);
  });

  test('la clé d’une cible est stable', () => {
    expect(targetKeyOf(conversation('c1'))).toBe('conversation:c1');
    expect(targetKeyOf(contact('u1'))).toBe('contact:u1');
    expect(targetKeyOf(publish('REEL'))).toBe('publish:REEL');
  });
});
