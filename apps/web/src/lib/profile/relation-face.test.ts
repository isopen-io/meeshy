import { describe, expect, test } from 'bun:test';

import type { RelationLevel } from '@meeshy/shared/types/relation';
import { resolveProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { circleLadderOf, faceSearch, PROFILE_FACES, relationActionsOf, requestedFaceOf, resolveProfileFace } from './relation-face';

const viewAt = (granted: RelationLevel, overrides: { readonly target?: RelationLevel; readonly blocked?: boolean } = {}) =>
  resolveProfileCircleView({
    viewerId: 'me',
    targetId: 'leo',
    grantedByViewer: granted,
    grantedByTarget: overrides.target ?? granted,
    sharesCommunity: false,
    blockedEitherWay: overrides.blocked ?? false,
    viewerMinor: 'adult',
    targetMinor: 'adult',
  });

const stateOf = (view: ReturnType<typeof viewAt> | null, id: string) => relationActionsOf(view)?.find((item) => item.id === id);

describe('la fiche d un autre : les actions selon le cercle commun', () => {
  test('un Proche ouvre le talkie, Ensemble et Bring ; un Ami n a que Bring, le talkie restant verrouillé dès Proche', () => {
    const close = viewAt('CLOSE');
    expect(stateOf(close, 'talkie')?.state).toBe('open');
    expect(stateOf(close, 'together')?.state).toBe('open');
    expect(stateOf(close, 'bring')?.state).toBe('open');
    const friend = viewAt('FRIEND');
    expect(stateOf(friend, 'bring')?.state).toBe('open');
    expect(stateOf(friend, 'talkie')).toEqual({ id: 'talkie', group: 'speak', state: 'locked', circle: 'CLOSE' });
  });

  test('un Public ne reçoit AUCUNE action de proximité ouverte, et chacune dit le cercle qui l ouvre', () => {
    const items = relationActionsOf(viewAt('PUBLIC')) ?? [];
    const proximity = items.filter((item) => ['talkie', 'together', 'bring', 'location', 'battery', 'unreachable'].includes(item.id));
    expect(proximity.length).toBeGreaterThan(0);
    expect(proximity.every((item) => item.state === 'locked')).toBe(true);
    expect(proximity.every((item) => item.circle !== 'PUBLIC')).toBe(true);
  });

  test('un inconnu peut DEMANDER à écrire : l action d écriture est offerte comme demande', () => {
    const write = stateOf(viewAt('PUBLIC'), 'write');
    expect(write?.state).toBe('open');
    expect(write?.request).toBe(true);
  });

  test('le niveau commun est le plus bas des deux accords : accordé par moi seul, rien ne s ouvre', () => {
    const view = viewAt('CLOSE', { target: 'PUBLIC' });
    expect(stateOf(view, 'talkie')?.state).toBe('locked');
  });

  test('une cible bloquée ne montre que des rangées verrouillées', () => {
    const items = relationActionsOf(viewAt('CLOSE', { blocked: true })) ?? [];
    expect(items.every((item) => item.state === 'locked')).toBe(true);
  });

  test('sans verdict servi (passerelle plus ancienne), aucune action n est inventée : null', () => {
    expect(relationActionsOf(null)).toBeNull();
  });

  test('un verrou ne porte que le cercle : ni valeur, ni champ voisin', () => {
    const locked = relationActionsOf(viewAt('PUBLIC'))?.find((item) => item.state === 'locked');
    expect(Object.keys(locked ?? {}).sort()).toEqual(['circle', 'group', 'id', 'state']);
  });
});

describe('Notre cercle', () => {
  test('dit le niveau commun et ce qui manque pour monter : qui doit accorder', () => {
    const ladder = circleLadderOf(viewAt('FRIEND', { target: 'ACQUAINTANCE' }));
    expect(ladder?.level).toBe('ACQUAINTANCE');
    expect(ladder?.missing?.byTarget).toBe(true);
    expect(ladder?.missing?.byViewer).toBe(false);
  });

  test('sur soi-même ou sans verdict, rien à dire', () => {
    expect(circleLadderOf(null)).toBeNull();
  });

  test('vers une cible bloquée ou partie, aucun accord n est servi : rien à dire, jamais « au plus près »', () => {
    expect(circleLadderOf(viewAt('CLOSE', { blocked: true }))).toBeNull();
  });
});

describe('les faces', () => {
  test('trois faces, Vitrine d abord', () => {
    expect(PROFILE_FACES).toEqual(['vitrine', 'liens', 'actions']);
  });

  test('une adresse inconnue retombe sur le défaut', () => {
    expect(resolveProfileFace({ requested: 'nimporte', fallback: 'vitrine' })).toBe('vitrine');
    expect(resolveProfileFace({ requested: 'actions', fallback: 'vitrine' })).toBe('actions');
  });
});

describe('les liens déjà partagés', () => {
  test('un ancien ?tab=details mène à la face Actions ; ?face= prime ; sinon rien', () => {
    expect(requestedFaceOf(new URLSearchParams('tab=details'))).toBe('actions');
    expect(requestedFaceOf(new URLSearchParams('tab=details&face=liens'))).toBe('liens');
    expect(requestedFaceOf(new URLSearchParams('tab=posts'))).toBeNull();
  });

  test('quitter la face Actions ouverte par un ancien ?tab=details la quitte vraiment', () => {
    const toVitrine = faceSearch({ search: new URLSearchParams('tab=details'), face: 'vitrine', fallback: 'vitrine' });
    expect(requestedFaceOf(toVitrine)).toBeNull();
    expect(toVitrine.toString()).toBe('');
    const toLiens = faceSearch({ search: new URLSearchParams('tab=details&x=1'), face: 'liens', fallback: 'vitrine' });
    expect(requestedFaceOf(toLiens)).toBe('liens');
    expect(toLiens.get('x')).toBe('1');
    expect(faceSearch({ search: new URLSearchParams('tab=posts'), face: 'actions', fallback: 'vitrine' }).get('tab')).toBe('posts');
  });
});
