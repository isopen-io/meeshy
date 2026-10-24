import { describe, expect, it } from 'vitest';
import { MESSAGE_EFFECT_FLAGS } from '../types/message-effect-flags.js';
import { planShare, type ShareAction, type ShareEntry, type ShareMedia, type ShareMessage } from './share-plan.js';
import { SHARE_LIMITS } from './share-limits.js';

const { EPHEMERAL, EPHEMERAL_AFTER_READ, BLURRED } = MESSAGE_EFFECT_FLAGS;
const MB = 1024 * 1024;

const image = (id = 'img'): ShareMedia => ({ id, mimeType: 'image/jpeg', bytes: 2 * MB });
const video = (id = 'vid', durationMs = 14_000): ShareMedia => ({ id, mimeType: 'video/mp4', bytes: 20 * MB, durationMs });
const audio = (id = 'aud'): ShareMedia => ({ id, mimeType: 'audio/m4a', bytes: MB, durationMs: 30_000 });
const file = (id = 'doc'): ShareMedia => ({ id, mimeType: 'application/pdf', bytes: MB });

const message = (over: Partial<ShareMessage> = {}): ShareMessage => ({ id: 'm1', text: 'Bonjour', ...over });
const withPieces = (pieces: readonly ShareMedia[], over: Partial<ShareMessage> = {}): ShareMessage =>
  message({ pieces: pieces.map((piece, index) => ({ ...piece, id: piece.id ?? `p${index}` })), ...over });

const actionsOf = (entry: ShareEntry): readonly ShareAction[] => planShare({ entry }).actions;
const sorted = (actions: readonly ShareAction[]) => [...actions].sort();

describe('planShare — entrées × actions (contenu ordinaire), la matrice de la planche', () => {
  const rows: ReadonlyArray<readonly [string, ShareEntry, readonly ShareAction[]]> = [
    ['texte venu d’une autre app', { kind: 'text', text: 'Hello' }, ['send', 'publish-post', 'publish-story', 'studio']],
    [
      'lien',
      { kind: 'link', url: 'https://festival-lumiere.org' },
      ['send', 'caption', 'publish-post', 'publish-story', 'studio', 'copy-link', 'share-out'],
    ],
    ['1 image', { kind: 'media', media: [image()] }, ['send', 'caption', 'publish-post', 'publish-story', 'studio']],
    ['1 vidéo qui qualifie', { kind: 'media', media: [video()] }, ['send', 'caption', 'publish-post', 'publish-story', 'publish-reel', 'studio']],
    [
      '2 à 20 médias',
      { kind: 'media', media: [image('a'), image('b'), video('c')] },
      ['send', 'caption', 'reorder', 'grouping', 'publish-post', 'publish-story', 'publish-reel', 'studio'],
    ],
    ['un audio : story sur fond uni et post audio, jamais un réel (D13)', { kind: 'media', media: [audio()] }, ['send', 'caption', 'publish-post', 'publish-story', 'studio']],
    ['un fichier', { kind: 'media', media: [file()] }, ['send', 'caption']],
    ['deux fichiers', { kind: 'media', media: [file('a'), file('b')] }, ['send', 'caption', 'reorder', 'grouping']],
    [
      'une pièce d’un message (#9914)',
      { kind: 'piece', message: withPieces([image('p1'), image('p2'), image('p3')]), attachmentId: 'p3' },
      ['send', 'caption', 'publish-post', 'publish-story', 'studio', 'save', 'share-out'],
    ],
    [
      'un message entier à une photo',
      { kind: 'messages', messages: [withPieces([image('p1')])] },
      ['send', 'caption', 'publish-post', 'publish-story', 'studio', 'save', 'imager', 'copy-text', 'share-out'],
    ],
    [
      'un message entier à plusieurs pièces : ses pièces se retirent',
      { kind: 'messages', messages: [withPieces([image('p1'), image('p2')])] },
      ['send', 'caption', 'reorder', 'publish-post', 'publish-story', 'publish-reel', 'studio', 'save', 'imager', 'copy-text', 'share-out'],
    ],
    ['un message texte', { kind: 'messages', messages: [message()] }, ['send', 'caption', 'imager', 'copy-text']],
    [
      'plusieurs messages',
      { kind: 'messages', messages: [message({ id: 'a' }), message({ id: 'b' })] },
      ['send', 'caption', 'reorder', 'imager', 'copy-text'],
    ],
    ['une publication', { kind: 'post', url: 'https://meeshy.me/p/1' }, ['send', 'caption', 'publish-post', 'publish-story', 'copy-link', 'share-out']],
    [
      'une story — republiable et recomposable (D14, #12644)',
      { kind: 'story', url: 'https://meeshy.me/s/1' },
      ['send', 'caption', 'publish-post', 'publish-story', 'publish-reel', 'studio', 'copy-link', 'share-out'],
    ],
    ['un réel', { kind: 'reel', url: 'https://meeshy.me/r/1' }, ['send', 'caption', 'publish-post', 'publish-story', 'copy-link', 'share-out']],
    ['un profil (D15)', { kind: 'profile', url: 'https://meeshy.me/u/lea' }, ['send', 'caption', 'copy-link', 'share-out']],
    ['une invitation', { kind: 'invitation', url: 'https://meeshy.me/join/x' }, ['send', 'caption', 'copy-link', 'share-out']],
  ];

  it.each(rows)('%s', (_label, entry, expected) => {
    expect(sorted(actionsOf(entry))).toEqual(sorted(expected));
  });

  it('une photo seule ne fait pas un réel — et la planche dit pourquoi (V2)', () => {
    const plan = planShare({ entry: { kind: 'media', media: [image()] } });
    expect(plan.withheld).toContainEqual({ action: 'publish-reel', reason: 'single-photo-not-a-reel' });
  });

  it('une vidéo trop courte ne qualifie pas comme réel', () => {
    const plan = planShare({ entry: { kind: 'media', media: [video('v', 1_000)] } });
    expect(plan.actions).not.toContain('publish-reel');
    expect(plan.withheld).toContainEqual({ action: 'publish-reel', reason: 'not-a-reel' });
  });

  it('un mélange de fichiers et de médias ne se publie pas', () => {
    expect(actionsOf({ kind: 'media', media: [image(), file()] })).not.toContain('publish-post');
  });

  it('au-delà de 10 médias, la publication est retirée avec son motif', () => {
    const media = Array.from({ length: SHARE_LIMITS.maxPublicationMedia + 1 }, (_, index) => image(`i${index}`));
    const plan = planShare({ entry: { kind: 'media', media } });
    expect(plan.actions).not.toContain('publish-post');
    expect(plan.withheld).toContainEqual({ action: 'publish-post', reason: 'too-many-for-publication' });
  });

  it('le titre dit « Transférer » quand la source est un message, « Envoyer » sinon', () => {
    expect(planShare({ entry: { kind: 'messages', messages: [message()] } }).title).toBe('forward');
    expect(planShare({ entry: { kind: 'piece', message: withPieces([image('p')]), attachmentId: 'p' } }).title).toBe('forward');
    expect(planShare({ entry: { kind: 'media', media: [image()] } }).title).toBe('send');
  });
});

describe('planShare — nature du contenu × actions', () => {
  it('flamme à durée : se transfère, durée présélectionnée, rien d’autre ne sort (V7)', () => {
    const plan = planShare({ entry: { kind: 'messages', messages: [message({ effectFlags: EPHEMERAL, ephemeralDuration: 3600 })] } });
    expect(sorted(plan.actions)).toEqual(sorted(['send', 'caption']));
    expect(plan.flame).toEqual({ maxDurationSeconds: 3600 });
    expect(plan.withheld.map((entry) => entry.reason)).toEqual(expect.arrayContaining(['flame']));
    expect(plan.withheld.map((entry) => entry.action)).toEqual(expect.arrayContaining(['imager', 'copy-text']));
  });

  it('vue unique dans une sélection : retirée avec son motif, le reste part dans l’ordre (D6, V3)', () => {
    const plan = planShare({
      entry: {
        kind: 'messages',
        messages: [message({ id: 'a' }), message({ id: 'b' }), withPieces([image('p')], { id: 'c', isViewOnce: true }), message({ id: 'd' })],
      },
    });
    expect(plan.kept).toEqual(['a', 'b', 'd']);
    expect(plan.withdrawn).toEqual([{ id: 'c', reason: 'view-once' }]);
    expect(plan.blocked).toBeNull();
    expect(plan.canSend).toBe(false);
  });

  it('une flamme après lecture est retirée de même', () => {
    const plan = planShare({
      entry: { kind: 'messages', messages: [message({ id: 'a' }), message({ id: 'b', effectFlags: EPHEMERAL | EPHEMERAL_AFTER_READ })] },
    });
    expect(plan.withdrawn).toEqual([{ id: 'b', reason: 'after-read' }]);
  });

  it('tout est protégé : la carte « ne sort pas de Meeshy », et rien ne part', () => {
    const plan = planShare({ entry: { kind: 'messages', messages: [message({ isViewOnce: true })] } });
    expect(plan.blocked).toBe('view-once');
    expect(plan.actions).toEqual([]);
    expect(plan.canSend).toBe(false);
  });

  it('une pièce à vue unique ne se transfère pas seule', () => {
    const plan = planShare({
      entry: { kind: 'piece', message: withPieces([image('a'), { ...image('b'), isViewOnce: true }]), attachmentId: 'b' },
    });
    expect(plan.blocked).toBe('view-once');
  });

  it('une pièce qui n’est pas du message ne part pas', () => {
    const plan = planShare({ entry: { kind: 'piece', message: withPieces([image('a')]), attachmentId: 'zzz' } });
    expect(plan.blocked).toBe('unavailable');
  });

  it('flouté : se transfère, flou hérité ; tout le reste interdit (D8)', () => {
    const plan = planShare({ entry: { kind: 'messages', messages: [withPieces([image('p')], { isBlurred: true, effectFlags: BLURRED })] } });
    expect(sorted(plan.actions)).toEqual(sorted(['send', 'caption']));
    expect(plan.blurInherited).toBe(true);
    expect(plan.withheld).toContainEqual({ action: 'publish-post', reason: 'blurred' });
    expect(plan.withheld).toContainEqual({ action: 'save', reason: 'blurred' });
  });

  it('une pièce floutée dans le message transféré : la copie hérite du flou, rien d’autre ne sort (D8)', () => {
    const plan = planShare({ entry: { kind: 'messages', messages: [withPieces([image('a'), { ...image('b'), isBlurred: true }])] } });
    expect(plan.blurInherited).toBe(true);
    expect(plan.actions).not.toContain('save');
  });

  it('chiffré : ne se publie pas, se copie sur l’appareil, avertit vers une destination non chiffrée (D7, V8)', () => {
    const plan = planShare({
      entry: { kind: 'messages', messages: [message({ encrypted: true })] },
      destinations: [
        { id: 'compta', encrypted: true },
        { id: 'equipe', encrypted: false },
        { id: 'ana' },
      ],
    });
    expect(plan.actions).not.toContain('publish-post');
    expect(plan.actions).toEqual(expect.arrayContaining(['send', 'copy-text', 'imager']));
    expect(plan.encryption).toEqual({ copyOnDevice: true, warnDestinationIds: ['equipe', 'ana'] });
  });

  it('une pièce chiffrée : publication retirée, enregistrement gardé', () => {
    const plan = planShare({
      entry: { kind: 'piece', message: withPieces([image('a')], { encrypted: true }), attachmentId: 'a' },
    });
    expect(plan.actions).toContain('save');
    expect(plan.withheld).toContainEqual({ action: 'publish-story', reason: 'encrypted' });
    expect(plan.encryption?.copyOnDevice).toBe(true);
  });

  it('une source en clair n’avertit de rien', () => {
    expect(planShare({ entry: { kind: 'messages', messages: [message()] }, destinations: [{ id: 'x' }] }).encryption).toBeNull();
  });

  it('un message qui cite un contenu protégé ne s’image pas (porteur 2026-10-08)', () => {
    const plan = planShare({ entry: { kind: 'messages', messages: [message({ citesProtected: true })] } });
    expect(plan.actions).not.toContain('imager');
    expect(plan.withheld).toContainEqual({ action: 'imager', reason: 'cites-protected' });
  });
});

describe('planShare — ensemble / séparément, légende (D3, D4)', () => {
  it('« Ensemble » par défaut dès deux pièces ; la légende est le texte du message, du premier en « Séparément »', () => {
    const plan = planShare({ entry: { kind: 'media', media: [image('a'), image('b')] } });
    expect(plan.grouping).toEqual({ default: 'together' });
    expect(plan.caption).toEqual({ placement: 'message-text', whenSeparate: 'first-message', maxLength: 5000 });
  });

  it('une seule pièce : pas de choix de regroupement', () => {
    expect(planShare({ entry: { kind: 'media', media: [image()] } }).grouping).toBeNull();
  });

  it('la légende d’un transfert part en message à part, juste après la copie (D4)', () => {
    expect(planShare({ entry: { kind: 'messages', messages: [message()] } }).caption?.placement).toBe('separate-message');
    expect(
      planShare({ entry: { kind: 'piece', message: withPieces([image('p')]), attachmentId: 'p' } }).caption?.placement,
    ).toBe('separate-message');
  });

  it('un texte venu d’une autre app n’a pas de légende : il EST le contenu', () => {
    expect(planShare({ entry: { kind: 'text', text: 'x' } }).caption).toBeNull();
  });
});

describe('planShare — plafonds (D10, V9)', () => {
  it('22 fichiers et 612 Mo : retirer les 2 derniers, bouton désactivé', () => {
    const media = [
      ...Array.from({ length: 20 }, (_, index) => ({ id: `f${index}`, mimeType: 'image/jpeg', bytes: 23 * MB })),
      { id: 'f20', mimeType: 'video/mp4', bytes: 12 * MB, durationMs: 10_000 },
      { id: 'f21', mimeType: 'video/mp4', bytes: 140 * MB, durationMs: 60_000 },
    ];
    const plan = planShare({ entry: { kind: 'media', media }, destinations: [{ id: 'd' }] });
    expect(plan.limits.files).toBe(22);
    expect(plan.limits.trimCount).toBe(2);
    expect(plan.canSend).toBe(false);
  });

  it('les octets seuls peuvent imposer de retirer', () => {
    const media = [
      { id: 'a', mimeType: 'video/mp4', bytes: 300 * MB, durationMs: 10_000 },
      { id: 'b', mimeType: 'video/mp4', bytes: 300 * MB, durationMs: 10_000 },
    ];
    expect(planShare({ entry: { kind: 'media', media } }).limits.trimCount).toBe(1);
  });

  it('au-delà de 10 destinataires, l’envoi attend', () => {
    const destinations = Array.from({ length: SHARE_LIMITS.maxRecipients + 1 }, (_, index) => ({ id: `d${index}` }));
    const plan = planShare({ entry: { kind: 'text', text: 'x' }, destinations });
    expect(plan.limits.overRecipients).toBe(1);
    expect(plan.canSend).toBe(false);
  });

  it('sous les plafonds, avec un destinataire : on envoie', () => {
    expect(planShare({ entry: { kind: 'media', media: [image()] }, destinations: [{ id: 'ana' }] }).canSend).toBe(true);
  });

  it('sans destinataire, rien ne part encore', () => {
    expect(planShare({ entry: { kind: 'media', media: [image()] } }).canSend).toBe(false);
  });
});
