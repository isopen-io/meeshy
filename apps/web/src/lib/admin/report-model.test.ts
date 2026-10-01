import { beforeAll, describe, expect, test } from 'bun:test';

import type { AdminReport } from '@/lib/api/admin-reports';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

import {
  REPORT_CLOSED_STATUSES,
  reportActionLinks,
  reportGestures,
  reportPersonName,
  reportReporterOf,
  reportModeratorOf,
  reportTimeline,
  reportTurnaround,
  reportedConversationOf,
  reportedOwnerOf,
  reportedTargetOf,
  REPORT_ACTIONS,
} from './report-model';

/**
 * **LE MODÈLE D’AFFICHAGE D’UN SIGNALEMENT** (#8876, #6726) — ce que les écrans
 * disent d’une ligne servie : qui est désigné (nommé, jamais par identifiant),
 * qui a signalé, quels gestes sont offerts dans quel état, la chronologie
 * HONNÊTE (une date non conservée ne s’invente pas) et les liens qui agissent.
 */

beforeAll(async () => {
  await Promise.all([loadAdminInterfaceCatalog('fr'), loadAdminInterfaceCatalog('en')]);
});

const OBJECT_ID = (seed: number) => seed.toString(16).padStart(24, '0');

const person = (seed: number, overrides: Partial<NonNullable<AdminReport['reporter']>> = {}) => ({
  id: OBJECT_ID(seed),
  username: `membre${seed}`,
  displayName: `Membre ${seed}`,
  avatar: null,
  ...overrides,
});

const MESSAGE_ENTITY: NonNullable<AdminReport['reportedEntity']> = {
  type: 'message',
  id: OBJECT_ID(2),
  label: null,
  owner: person(4),
  excerpt: 'Tu vas voir',
  isProtected: false,
  deleted: false,
  conversation: { id: OBJECT_ID(5), title: 'Famille' },
  members: null,
};

const report = (overrides: Partial<AdminReport> = {}): AdminReport => ({
  id: OBJECT_ID(1),
  reportedType: 'message',
  reportedEntityId: OBJECT_ID(2),
  reporterId: OBJECT_ID(3),
  reporterName: null,
  reportType: 'harassment',
  reason: 'Il me menace',
  status: 'pending',
  moderatorId: null,
  moderatorNotes: null,
  actionTaken: null,
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  resolvedAt: null,
  reporter: person(3),
  moderator: null,
  reportedEntity: MESSAGE_ENTITY,
  ...overrides,
});

const entityOf = (type: string, overrides: Partial<NonNullable<AdminReport['reportedEntity']>> = {}): Partial<AdminReport> => ({
  reportedType: type,
  reportedEntity: {
    type,
    id: OBJECT_ID(2),
    label: null,
    owner: null,
    excerpt: null,
    isProtected: false,
    deleted: false,
    conversation: null,
    members: null,
    ...overrides,
  },
});

describe('reportedTargetOf — l’élément signalé, NOMMÉ', () => {
  test('un membre : son nom, son genre en secondaire, un lien vers sa fiche', () => {
    const target = reportedTargetOf(report(entityOf('user', { label: 'Awa Diop' })), 'fr');

    expect(target.linkable).toBe(true);
    expect(target.ref).toEqual({ kind: 'user', id: OBJECT_ID(2), label: 'Awa Diop', secondary: 'Membre' });
  });

  test('un message : « Message de {auteur} », l’extrait en secondaire, la fiche de SA conversation', () => {
    const target = reportedTargetOf(report(), 'fr');

    expect(target.ref).toEqual({ kind: 'conversation', id: OBJECT_ID(5), label: 'Message de Membre 4', secondary: 'Tu vas voir' });
    expect(target.linkable).toBe(true);
  });

  test('un message protégé dit « Contenu protégé », jamais un secondaire vide', () => {
    const target = reportedTargetOf(
      report({ reportedEntity: { ...MESSAGE_ENTITY, excerpt: null, isProtected: true } }),
      'fr',
    );

    expect(target.ref.secondary).toBe('Contenu protégé');
  });

  test('un message sans extrait ni protection se situe par sa conversation', () => {
    const target = reportedTargetOf(report({ reportedEntity: { ...MESSAGE_ENTITY, excerpt: null } }), 'fr');

    expect(target.ref.secondary).toBe('dans Famille');
  });

  test('un message supprimé est barré : plus de fiche à ouvrir, mais le nom reste', () => {
    const target = reportedTargetOf(
      report({ reportedEntity: { ...MESSAGE_ENTITY, excerpt: null, deleted: true } }),
      'fr',
    );

    expect(target.ref.deleted).toBe(true);
    expect(target.ref.label).toBe('Message de Membre 4');
  });

  test('une conversation : son titre, sa fiche ; sans titre, la formule sans titre', () => {
    expect(reportedTargetOf(report(entityOf('conversation', { label: 'Équipe produit' })), 'fr').ref).toEqual({
      kind: 'conversation',
      id: OBJECT_ID(2),
      label: 'Équipe produit',
      secondary: 'Conversation',
    });
    expect(reportedTargetOf(report(entityOf('conversation')), 'fr').ref.label).toBe('Conversation sans titre');
  });

  test('une communauté : son nom, son créateur en secondaire', () => {
    const target = reportedTargetOf(report(entityOf('community', { label: 'Les voisins', owner: person(6) })), 'fr');

    expect(target.ref).toEqual({ kind: 'community', id: OBJECT_ID(2), label: 'Les voisins', secondary: 'Communauté · Membre 6' });
  });

  test('une publication ou une story : « {genre} de {auteur} », lien vers la fiche de publication', () => {
    const post = reportedTargetOf(report(entityOf('post', { owner: person(7), excerpt: 'Regardez ça' })), 'fr');
    const story = reportedTargetOf(report(entityOf('story', { owner: person(7) })), 'fr');

    expect(post.ref).toEqual({ kind: 'post', id: OBJECT_ID(2), label: 'Publication de Membre 7', secondary: 'Regardez ça' });
    expect(story.ref.label).toBe('Story de Membre 7');
    expect(story.linkable).toBe(true);
  });

  test('un commentaire et un son n’ont pas de fiche : nommés, jamais cliquables', () => {
    const comment = reportedTargetOf(report(entityOf('comment', { owner: person(8), excerpt: 'Nul' })), 'fr');
    const sound = reportedTargetOf(report(entityOf('sound', { label: 'Jingle' })), 'fr');

    expect(comment.ref.label).toBe('Commentaire de Membre 8');
    expect(comment.linkable).toBe(false);
    expect(sound.ref.label).toBe('Jingle');
    expect(sound.linkable).toBe(false);
  });

  test('une entité que le serveur n’a pas résolue se nomme par son genre, jamais par son identifiant', () => {
    const target = reportedTargetOf(report({ reportedType: 'user', reportedEntity: null }), 'fr');

    expect(target.ref.label).toBe('Membre');
    expect(`${target.ref.label} ${target.ref.secondary ?? ''}`).not.toMatch(/[0-9a-f]{24}/);
  });

  test('une entité disparue (supprimée, sans nom) est barrée et nommée par son genre', () => {
    const target = reportedTargetOf(report(entityOf('community', { deleted: true })), 'fr');

    expect(target.ref.deleted).toBe(true);
    expect(target.ref.label).toBe('Communauté');
  });

  test('suit la langue d’interface', () => {
    expect(reportedTargetOf(report(), 'en').ref.label).toBe('Message from Membre 4');
  });
});

describe('reportReporterOf / reportModeratorOf — les deux personnes', () => {
  test('un signalant avec compte est une personne nommée, avec son @pseudo', () => {
    const reporter = reportReporterOf(report(), 'fr');

    expect(reporter.kind).toBe('person');
    expect(reporter.kind === 'person' && reporter.ref).toEqual({ kind: 'user', id: OBJECT_ID(3), label: 'Membre 3', secondary: '@membre3', avatarUrl: null });
  });

  test('un expéditeur anonyme est désigné par le nom qu’il a donné', () => {
    expect(reportReporterOf(report({ reporterId: null, reporter: null, reporterName: 'Visiteur' }), 'fr')).toEqual({ kind: 'named', name: 'Visiteur' });
  });

  test('sans compte ni nom : « Anonyme »', () => {
    expect(reportReporterOf(report({ reporterId: null, reporter: null }), 'fr')).toEqual({ kind: 'anonymous' });
  });

  test('un compte signalant qui n’existe plus se dit « supprimé », pas « anonyme »', () => {
    expect(reportReporterOf(report({ reporter: null }), 'fr')).toEqual({ kind: 'gone' });
  });

  test('le modérateur : nommé, non assigné, ou compte supprimé', () => {
    expect(reportModeratorOf(report(), 'fr')).toEqual({ kind: 'none' });
    expect(reportModeratorOf(report({ moderatorId: OBJECT_ID(9), moderator: person(9) }), 'fr').kind).toBe('person');
    expect(reportModeratorOf(report({ moderatorId: OBJECT_ID(9), moderator: null }), 'fr')).toEqual({ kind: 'gone' });
  });
});

describe('reportPersonName / reportedOwnerOf / reportedConversationOf — dire sans puce', () => {
  test('le nom d’une personne tient en un mot dans une phrase : jamais un identifiant', () => {
    expect(reportPersonName(reportReporterOf(report(), 'fr'), 'fr')).toBe('Membre 3');
    expect(reportPersonName({ kind: 'named', name: 'Visiteur' }, 'fr')).toBe('Visiteur');
    expect(reportPersonName({ kind: 'anonymous' }, 'fr')).toBe('Anonyme');
    expect(reportPersonName({ kind: 'gone' }, 'fr')).toBe('Compte supprimé');
    expect(reportPersonName({ kind: 'none' }, 'fr')).toBe('Non assigné');
  });

  test('le propriétaire d’un contenu est un compte (puce) ou un invité (nom seul)', () => {
    expect(reportedOwnerOf(report(), 'fr')?.kind).toBe('person');
    const guest = reportedOwnerOf(report({ reportedEntity: { ...MESSAGE_ENTITY, owner: person(4, { username: '', displayName: 'Invité' }) } }), 'fr');
    expect(guest).toEqual({ kind: 'named', name: 'Invité' });
    expect(reportedOwnerOf(report(entityOf('user')), 'fr')).toBeNull();
  });

  test('la conversation d’un message est nommée ; un autre genre n’en a pas', () => {
    expect(reportedConversationOf(report(), 'fr')).toEqual({ kind: 'conversation', id: OBJECT_ID(5), label: 'Famille' });
    expect(reportedConversationOf(report(entityOf('post')), 'fr')).toBeNull();
    expect(reportedConversationOf(report({ reportedEntity: { ...MESSAGE_ENTITY, conversation: { id: OBJECT_ID(5), title: null } } }), 'fr')?.label).toBe('Conversation sans titre');
    expect(
      reportedConversationOf(
        report({
          reportedEntity: {
            ...MESSAGE_ENTITY,
            conversation: { id: OBJECT_ID(5), title: null },
            members: {
              participants: [
                { displayName: 'Awa Diop', username: 'awa' },
                { displayName: 'Jean', username: 'jean' },
              ],
              total: 2,
            },
          },
        }),
        'fr',
      )?.label,
    ).toBe('Awa Diop et Jean');
  });
});

describe('reportGestures — quel geste dans quel état', () => {
  const viewer = OBJECT_ID(9);
  const mine = { moderatorId: viewer, moderator: person(9) };
  const gestures = (overrides: Partial<AdminReport>, id: string | null = viewer) => reportGestures(report(overrides), id);

  test('en attente : prendre en charge, résoudre, rejeter, classer, supprimer', () => {
    expect(gestures({ status: 'pending' })).toEqual(['assign', 'resolve', 'reject', 'dismiss', 'delete']);
  });

  test('en cours d’examen par un AUTRE modérateur : on peut encore le reprendre', () => {
    expect(gestures({ status: 'under_review', moderatorId: OBJECT_ID(8), moderator: person(8) })).toContain('assign');
  });

  test('en cours d’examen par MOI : « prendre en charge » n’a plus d’effet, il n’est pas offert', () => {
    expect(gestures({ status: 'under_review', ...mine })).toEqual(['resolve', 'reject', 'dismiss', 'delete']);
  });

  test('sans savoir qui lit, on offre la prise en charge plutôt que de la cacher', () => {
    expect(gestures({ status: 'under_review', ...mine }, null)).toContain('assign');
  });

  test('un dossier clos se rouvre ou se supprime ; il ne se résout pas une seconde fois', () => {
    for (const status of ['resolved', 'rejected', 'dismissed']) {
      expect(gestures({ status })).toEqual(['reopen', 'delete']);
    }
  });

  test('un statut inconnu n’offre que la suppression : fail-closed', () => {
    expect(gestures({ status: 'archived' })).toEqual(['delete']);
  });
});

describe('reportTimeline — une chronologie qui n’invente aucune date', () => {
  test('en attente : seulement la réception', () => {
    expect(reportTimeline(report())).toEqual([{ id: 'received', at: '2026-09-29T10:00:00.000Z' }]);
  });

  test('en cours d’examen : la prise en charge est datée par la dernière mise à jour', () => {
    const steps = reportTimeline(report({ status: 'under_review', moderatorId: OBJECT_ID(9), updatedAt: '2026-09-29T15:00:00.000Z' }));

    expect(steps).toEqual([
      { id: 'received', at: '2026-09-29T10:00:00.000Z' },
      { id: 'taken', at: '2026-09-29T15:00:00.000Z' },
    ]);
  });

  test('résolu : la prise en charge reste SANS date (la dernière mise à jour est la résolution) et la clôture est datée', () => {
    const steps = reportTimeline(
      report({ status: 'resolved', moderatorId: OBJECT_ID(9), updatedAt: '2026-09-30T08:00:00.000Z', resolvedAt: '2026-09-30T08:00:00.000Z' }),
    );

    expect(steps).toEqual([
      { id: 'received', at: '2026-09-29T10:00:00.000Z' },
      { id: 'taken', at: null },
      { id: 'closed', at: '2026-09-30T08:00:00.000Z', status: 'resolved' },
    ]);
  });

  test('classé sans suite : pas de date de résolution, la clôture prend la dernière mise à jour', () => {
    const steps = reportTimeline(report({ status: 'dismissed', moderatorId: OBJECT_ID(9), updatedAt: '2026-09-30T09:00:00.000Z', resolvedAt: null }));

    expect(steps.at(-1)).toEqual({ id: 'closed', at: '2026-09-30T09:00:00.000Z', status: 'dismissed' });
  });

  test('un dossier rouvert (en attente, ancienne résolution) ne montre ni prise en charge ni clôture périmées', () => {
    const steps = reportTimeline(report({ status: 'pending', moderatorId: OBJECT_ID(9), resolvedAt: '2026-09-30T08:00:00.000Z' }));

    expect(steps.map((step) => step.id)).toEqual(['received']);
  });
});

describe('reportTurnaround — combien de temps', () => {
  const NOW = new Date('2026-09-30T12:00:00.000Z');

  test('un dossier clos se mesure de la réception à la résolution', () => {
    const turnaround = reportTurnaround(report({ status: 'resolved', resolvedAt: '2026-09-29T12:00:00.000Z' }), NOW);

    expect(turnaround).toEqual({ kind: 'closed', milliseconds: 2 * 3_600_000 });
  });

  test('un dossier ouvert se mesure de la réception à maintenant', () => {
    expect(reportTurnaround(report(), NOW)).toEqual({ kind: 'open', milliseconds: 26 * 3_600_000 });
  });

  test('un dossier classé sans suite n’a pas de durée de résolution', () => {
    expect(reportTurnaround(report({ status: 'dismissed', resolvedAt: null }), NOW)).toBeNull();
  });

  test('un dossier rouvert est ouvert, même avec une ancienne date de résolution', () => {
    expect(reportTurnaround(report({ status: 'pending', resolvedAt: '2026-09-29T12:00:00.000Z' }), NOW)?.kind).toBe('open');
  });
});

describe('reportActionLinks — des liens qui agissent, jamais un geste dupliqué', () => {
  test('un membre signalé : sa fiche, onglet Sécurité, pour bannir', () => {
    const links = reportActionLinks(report(entityOf('user', { label: 'Awa' })), 'fr');

    expect(links).toEqual([
      { id: 'memberSecurity', target: { kind: 'entity', entity: 'user', id: OBJECT_ID(2), search: { tab: 'security' } } },
    ]);
  });

  test('un message : l’auteur (onglet Sécurité) et la conversation pour la lecture souveraine', () => {
    const links = reportActionLinks(report(), 'fr');

    expect(links.map((link) => link.id)).toEqual(['authorSecurity', 'conversationReading']);
    expect(links[0]).toEqual({
      id: 'authorSecurity',
      name: 'Membre 4',
      target: { kind: 'entity', entity: 'user', id: OBJECT_ID(4), search: { tab: 'security' } },
    });
    expect(links[1]?.target).toEqual({ kind: 'entity', entity: 'conversation', id: OBJECT_ID(5) });
  });

  test('un message d’un invité (sans @pseudo) n’offre pas de fiche membre : son identifiant n’est pas celui d’un compte', () => {
    const links = reportActionLinks(
      report({ reportedEntity: { ...MESSAGE_ENTITY, owner: person(4, { username: '' }) } }),
      'fr',
    );

    expect(links.map((link) => link.id)).toEqual(['conversationReading']);
  });

  test('une publication : la fiche pour la retirer, puis l’auteur', () => {
    const links = reportActionLinks(report(entityOf('post', { owner: person(7) })), 'fr');

    expect(links.map((link) => link.id)).toEqual(['post', 'authorSecurity']);
  });

  test('une publication supprimée n’a plus de fiche à ouvrir', () => {
    const links = reportActionLinks(report(entityOf('post', { owner: person(7), deleted: true })), 'fr');

    expect(links.map((link) => link.id)).toEqual(['authorSecurity']);
  });

  test('une conversation, une communauté : leur fiche ; un son : rien', () => {
    expect(reportActionLinks(report(entityOf('conversation')), 'fr').map((link) => link.id)).toEqual(['conversation']);
    expect(reportActionLinks(report(entityOf('community')), 'fr').map((link) => link.id)).toEqual(['community']);
    expect(reportActionLinks(report(entityOf('sound')), 'fr')).toEqual([]);
  });
});

describe('les actions consignables — celles que la passerelle accepte, et rien d’autre', () => {
  test('cinq actions, dans l’ordre de la gravité', () => {
    expect(REPORT_ACTIONS).toEqual(['none', 'warning_sent', 'content_removed', 'user_suspended', 'user_banned']);
  });

  test('les statuts qui clôturent', () => {
    expect(REPORT_CLOSED_STATUSES).toEqual(['resolved', 'rejected', 'dismissed']);
  });
});
