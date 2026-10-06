import { describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { levelThreshold } from '@meeshy/shared/utils/game/levels';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';

import {
  afterAbandon,
  afterAccept,
  afterConsent,
  afterInvite,
  afterPrestige,
  afterSealBought,
  afterSeasonClaim,
  withConsentResult,
  withDuoId,
  withPseudonym,
  withShowcaseOrder,
  withVisibility,
} from './game-optimistic-v2';

/**
 * LES MISES À JOUR OPTIMISTES DE LA VAGUE 2 (#9481) — pures : une NOUVELLE valeur,
 * ou la MÊME référence quand le geste n’a pas de sens (rien n’a bougé, rien à
 * restaurer). Ce que le serveur seul connaît (le pseudonyme tiré, l’identifiant
 * du duo) reste absent jusqu’à sa réponse.
 */
const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const view = (
  extras: Parameters<typeof gameBlockWithExtrasFixture>[1] = {},
  facts: Parameters<typeof gameBlockWithExtrasFixture>[0] = {},
): EngagementWithGame => ({ ...base, game: gameBlockWithExtrasFixture(facts, extras) });
const asking = (): EngagementWithGame => view({ league: { consented: false, pseudonym: null, group: null, friendIds: [], friendsWeekPoints: {} } });

describe('le consentement à la ligue', () => {
  test('consentir ouvre la ligue, sans inventer le pseudonyme que le serveur tire', () => {
    const next = afterConsent(asking(), { consent: true });
    expect(next.game?.league?.access).toBe('open');
    expect(next.game?.league?.pseudonym).toBeNull();
  });

  test('le pseudonyme choisi s’affiche tout de suite', () => {
    expect(afterConsent(asking(), { consent: true, pseudonym: 'Aigrette-77' }).game?.league?.pseudonym).toBe('Aigrette-77');
  });

  test('la réponse du serveur pose le pseudonyme tiré', () => {
    const next = withConsentResult(afterConsent(asking(), { consent: true }), { consent: true, pseudonym: 'Colibri-0042' });
    expect(next.game?.league?.pseudonym).toBe('Colibri-0042');
  });

  test('retirer le consentement ferme la ligue publique et efface le groupe et le pseudonyme', () => {
    const next = afterConsent(view(), { consent: false });
    expect(next.game?.league?.access).toBe('consent-required');
    expect(next.game?.league?.current).toBeNull();
    expect(next.game?.league?.pseudonym).toBeNull();
  });

  test('une ligue verrouillée ou fermée aux mineurs ne s’ouvre pas en local : même référence', () => {
    const locked = view();
    const closed: EngagementWithGame = locked.game?.league === undefined ? locked : { ...locked, game: { ...locked.game, league: { ...locked.game.league, access: 'minor' } } };
    expect(afterConsent(closed, { consent: true })).toBe(closed);
  });

  test('un ancien serveur (aucune ligue) : rien ne bouge', () => {
    const old: EngagementWithGame = { ...base };
    expect(afterConsent(old, { consent: true })).toBe(old);
  });

  test('changer de pseudonyme', () => {
    expect(withPseudonym(view(), 'Aigrette-77').game?.league?.pseudonym).toBe('Aigrette-77');
  });
});

describe('le duo', () => {
  const none = (): EngagementWithGame => {
    const v = view();
    return v.game?.duo === undefined ? v : { ...v, game: { ...v.game, duo: { ...v.game.duo, unlocked: true, status: 'none', duoId: null, role: null, partner: null, mission: null, progress: null, reward: null } } };
  };

  test('inviter pose une invitation envoyée, sans identifiant ni mission : le serveur les donne', () => {
    const next = afterInvite(none(), { id: 'friend-2', displayName: 'Léa' });
    expect(next.game?.duo).toMatchObject({ status: 'invited', role: 'inviter', partner: { userId: 'friend-2', displayName: 'Léa' }, duoId: null, mission: null });
  });

  test('l’identifiant rendu par le serveur se pose', () => {
    expect(withDuoId(afterInvite(none(), { id: 'friend-2', displayName: 'Léa' }), 'duo-9').game?.duo?.duoId).toBe('duo-9');
  });

  test('accepter active le duo, quitter l’abandonne', () => {
    const invited = view();
    const pending: EngagementWithGame = invited.game?.duo === undefined ? invited : { ...invited, game: { ...invited.game, duo: { ...invited.game.duo, status: 'invited', role: 'invitee' } } };
    expect(afterAccept(pending).game?.duo?.status).toBe('active');
    expect(afterAbandon(view()).game?.duo?.status).toBe('abandoned');
  });

  test('un duo qui n’existe pas : rien ne bouge', () => {
    const sans = none();
    expect(afterAccept(sans)).toBe(sans);
    expect(afterAbandon(sans)).toBe(sans);
  });
});

describe('la saison', () => {
  test('réclamer une étape l’ajoute aux étapes réclamées, dans l’ordre, et avance la prochaine récompense', () => {
    const next = afterSeasonClaim(view(), 4);
    expect(next.game?.season?.claimedSteps).toEqual([1, 2, 3, 4]);
    expect(next.game?.season?.nextReward?.step).toBe(5);
  });

  test('une étape non atteinte ou déjà réclamée : même référence', () => {
    const v = view();
    expect(afterSeasonClaim(v, 40)).toBe(v);
    expect(afterSeasonClaim(v, 2)).toBe(v);
  });

  test('acheter le Sceau le pose et retire son prix du solde', () => {
    const v = view({}, { balance: 12 });
    const next = afterSealBought(v);
    expect(next.game?.season?.sealOwned).toBe(true);
    expect(next.game?.treasury.held).toBe((v.game?.treasury.held ?? 0) - (v.game?.season?.sealPrice ?? 0));
  });

  test('un solde insuffisant : même référence', () => {
    const poor = view();
    expect(afterSealBought(poor)).toBe(poor);
  });

  test('un Sceau déjà possédé : même référence', () => {
    const v = view({}, { balance: 12 });
    const owned: EngagementWithGame = v.game?.season == null ? v : { ...v, game: { ...v.game, season: { ...v.game.season, sealOwned: true } } };
    expect(afterSealBought(owned)).toBe(owned);
  });
});

describe('la vitrine et la visibilité', () => {
  test('l’ordre rangé se pose', () => {
    expect(withShowcaseOrder(view(), ['trophy.flame.100']).game?.trophies?.order).toEqual(['trophy.flame.100']);
  });

  test('un réglage de visibilité se pose sans toucher les autres', () => {
    const next = withVisibility(view(), { showcase: 'me' });
    expect(next.game?.visibility).toEqual({ showcase: 'me', rank: 'friends', treasury: 'friends', atlas: 'me' });
  });
});

describe('le Prestige', () => {
  const atTop = (): EngagementWithGame => ({ ...base, game: gameBlockWithExtrasFixture({ score: levelThreshold(100) + 40, prestige: 1 }) });

  test('le niveau et le score repartent, l’étoile se pose, la Gloire monte, le trophée entre dans la vitrine', () => {
    const before = atTop();
    expect(before.game?.prestige?.canPrestige).toBe(true);
    const next = afterPrestige(before);
    expect(next.game?.level).toMatchObject({ level: 1, score: 0, record: 1, prestige: 2, canPrestige: false });
    expect(next.game?.prestige).toMatchObject({ stars: 2, canPrestige: false });
    expect(next.game?.glory.glory).toBe((before.game?.glory.glory ?? 0) + 1000);
    expect(next.game?.trophies?.items.map((item) => item.key)).toContain('trophy.prestige.2');
    expect(next.game?.trophies?.order[0]).toBe('trophy.prestige.2');
  });

  test('le trésor, lui, ne bouge pas', () => {
    const before = atTop();
    expect(afterPrestige(before).game?.treasury).toEqual(before.game?.treasury);
  });

  test('la ligue et le duo se referment : le record repart à 1', () => {
    const next = afterPrestige(atTop());
    expect(next.game?.league).toMatchObject({ unlocked: false, access: 'locked', current: null });
    expect(next.game?.duo?.unlocked).toBe(false);
  });

  test('sans proposition ouverte (niveau trop bas) : même référence', () => {
    const v = view();
    expect(afterPrestige(v)).toBe(v);
  });

  test('un ancien serveur (aucune extension prestige) : même référence', () => {
    const old: EngagementWithGame = { ...base };
    expect(afterPrestige(old)).toBe(old);
  });
});
