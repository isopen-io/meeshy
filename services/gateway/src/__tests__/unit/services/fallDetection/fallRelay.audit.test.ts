/**
 * L'AUDIT ADVERSARIAL du socle serveur de la chute (#18748) : chaque constat a son témoin.
 * B1 — un lecteur qui perd l'accès perd aussi la bannière (push de remplacement `lifted`).
 * B2 — un épisode clos ne se rouvre pas par le même rapport (pierre tombale).
 * I1/I2 — l'accord ne vaut qu'à la version courante, et jamais sous 15 ans déclarés.
 * I4 — l'état servi après un regain d'accès est re-jugé par la loi avant d'émettre.
 * I5 — le retrait de l'accord purge dans le verrou, ou échoue sans rien écrire.
 * I6 — au-delà de 3 épisodes sur 24 h, le push ne perce plus.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { fallAllowedAmong } from '../../../../services/fallDetection/fallAccess';
import { fallSnapshotFor, reconcileFallOfAccount, refreshFallBetween } from '../../../../services/fallDetection/fallRelay';
import { ADMIN, ANALYSTE, CHUTE, MIN, PERSONNE, SANG, SANG_REFUSE, T0, monde } from './fallWorld';

const audience = (m: ReturnType<typeof monde>) =>
  fallAllowedAmong(m.deps.prisma, { subjectId: PERSONNE, otherIds: [SANG, ANALYSTE, ADMIN], subjectIs: 'target', now: new Date(T0) });

describe('B1 — qui perd l\'accès perd la bannière', () => {
  it('un retrait par personne remplace la bannière du Sang alerté', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerA(SANG);
    await refreshFallBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });

  it('un blocage remplace la bannière', async () => {
    const m = monde();
    await m.rapporter();
    m.bloquer(SANG);
    await refreshFallBetween(m.deps, { userA: PERSONNE, userB: SANG });
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });

  it('la perte du rôle d\'équipe remplace la bannière du collègue', async () => {
    const m = monde({ role: 'ANALYST' });
    await m.rapporter();
    m.changerRole(ADMIN, 'USER');
    await reconcileFallOfAccount(m.deps, ADMIN);
    expect(m.poussesA(ADMIN)).toEqual(['detected', 'lifted']);
    expect(m.poussesA(SANG)).toEqual(['detected']);
  });

  it('un nouvel épisode remplace la bannière de qui ne le reçoit plus', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerA(SANG);
    m.avancer(15 * MIN);
    expect(await m.rapporter(new Date(T0 + 14 * MIN).toISOString())).toEqual({ kind: 'recorded' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });

  it('une réponse donnée après une perte d\'accès : withdrawn et remplacement, jamais « a répondu »', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerA(SANG);
    await m.repondre();
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });

  it('pendant l\'éventail, un lecteur retiré après le premier push ne reçoit ni l\'état ni le push', async () => {
    const m = monde({ role: 'ANALYST' });
    m.pendantLePush(async () => {
      m.retirerA(SANG);
      m.retirerA(ANALYSTE);
      m.retirerA(ADMIN);
    });
    await m.rapporter();
    expect(m.pushes.filter((p) => p.kind === 'detected')).toHaveLength(1);
    const alerted = m.pushes[0]!.readerId;
    for (const other of [SANG, ANALYSTE, ADMIN].filter((id) => id !== alerted)) {
      expect(m.vers(other).filter((e) => e.event === SERVER_EVENTS.FALL_DETECTED)).toEqual([]);
      expect(m.poussesA(other)).toEqual([]);
    }
  });

  it('un rapport sans accord qui efface un épisode résiduel prévient les lecteurs servis', async () => {
    const m = monde();
    await m.rapporter();
    m.retirerAccord();
    expect(await m.rapporter()).toEqual({ kind: 'consent-required' });
    expect(m.vers(SANG).at(-1)?.data).toEqual({ userId: PERSONNE, reason: 'withdrawn' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });
});

describe('B2 — un épisode clos ne se rouvre pas par le même rapport', () => {
  it('« Je vais bien » puis le même rapport : dédupliqué, aucun push', async () => {
    const m = monde();
    await m.rapporter();
    await m.repondre();
    m.avancer(MIN);
    expect(await m.rapporter()).toEqual({ kind: 'deduplicated' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'responded']);
    expect(await fallSnapshotFor(m.deps, SANG)).toEqual({ items: [] });
  });

  it('retrait de l\'accord, nouvel accord, même rapport : dédupliqué', async () => {
    const m = monde();
    await m.rapporter();
    await m.retirerEtPurger();
    m.consentir();
    expect(await m.rapporter()).toEqual({ kind: 'deduplicated' });
    expect(m.poussesA(SANG)).toEqual(['detected', 'lifted']);
  });

  it('une chute à plus de 10 min de l\'épisode clos ouvre un épisode neuf', async () => {
    const m = monde();
    await m.rapporter();
    await m.repondre();
    m.avancer(12 * MIN);
    expect(await m.rapporter(new Date(T0 + 11 * MIN).toISOString())).toEqual({ kind: 'recorded' });
  });
});

describe('I1/I2 — l\'accord ne vaut qu\'à la version courante, et jamais sous 15 ans déclarés', () => {
  it('un accord sur un texte ancien : rien n\'est collecté, et la loi ne sert personne', async () => {
    const m = monde({ version: '2026-01-01' });
    expect(await m.rapporter()).toEqual({ kind: 'consent-required' });
    expect(m.pushes).toEqual([]);
    expect([...(await audience(m))]).toEqual([]);
  });

  it('une date de naissance déclarée après l\'accord, sous 15 ans : coupé, collecte comprise', async () => {
    const m = monde();
    m.naissance(new Date('2013-03-01T00:00:00.000Z'));
    expect([...(await audience(m))]).toEqual([]);
    expect(await m.rapporter()).toEqual({ kind: 'consent-required' });
    expect(m.pushes).toEqual([]);
  });
});

describe('I4 — un regain d\'accès est re-jugé avant d\'émettre', () => {
  it('rendu puis retiré pendant la lecture de la position : aucun état ne part', async () => {
    const m = monde();
    await m.rapporter();
    const before = m.vers(SANG_REFUSE).length;
    m.rendreA(SANG_REFUSE);
    m.pendantLaPosition(async () => m.retirerA(SANG_REFUSE));
    await refreshFallBetween(m.deps, { userA: PERSONNE, userB: SANG_REFUSE });
    expect(m.vers(SANG_REFUSE).slice(before).filter((e) => e.event === SERVER_EVENTS.FALL_DETECTED)).toEqual([]);
    expect(await fallSnapshotFor(m.deps, SANG_REFUSE)).toEqual({ items: [] });
  });
});

describe('I5 — le retrait de l\'accord purge dans le verrou, ou échoue sans rien écrire', () => {
  it('verrou pris : le retrait lève, l\'accord reste, l\'épisode aussi', async () => {
    const m = monde();
    await m.rapporter();
    m.verrouPris();
    await expect(m.retirerEtPurger()).rejects.toThrow();
    expect(await fallSnapshotFor(m.deps, SANG)).not.toEqual({ items: [] });
    expect(m.poussesA(SANG)).toEqual(['detected']);
  });
});

describe('I6 — au plus 3 épisodes par 24 h percent', () => {
  it('le quatrième épisode de la journée est servi et poussé sans percer', async () => {
    const m = monde();
    for (let i = 0; i < 4; i += 1) {
      expect(await m.rapporter(new Date(T0 + i * 15 * MIN).toISOString())).toEqual({ kind: 'recorded' });
      m.avancer(15 * MIN);
    }
    expect(m.pushes.filter((p) => p.readerId === SANG && p.kind === 'detected').map((p) => p.urgent)).toEqual([true, true, true, false]);
    expect(m.vers(SANG).filter((e) => e.event === SERVER_EVENTS.FALL_DETECTED)).toHaveLength(4);
  });
});

describe('mineur — rien de l\'épisode ne se lit dans une clé', () => {
  it('aucune clé du cache ne porte l\'identifiant de la personne', async () => {
    const m = monde();
    await m.rapporter();
    await m.repondre();
    await m.rapporter(CHUTE);
    expect(m.cache.entries.size).toBeGreaterThan(0);
    for (const key of m.cache.entries.keys()) expect(key.toLowerCase()).not.toContain(PERSONNE);
  });
});
