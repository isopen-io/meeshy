/**
 * Ce que la liste et le détail SERVENT d'un mineur dans Meeshy Global (#9927) :
 * `viewerWriteRestriction: 'minor-global'`, et — sur la ligne de liste — Global
 * rangée dans les archives (`userPreferences[0].isArchived: true`) quelle que
 * soit la préférence stockée. Rien n'est écrit : la règle est calculée à chaque
 * lecture depuis `User.birthDate`, et revient d'elle-même aux 18 ans.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import {
  loadViewerBirthDate,
  servedListRowRestriction,
} from '../../../../routes/conversations/viewerWriteRestriction';

const NOW = new Date('2026-10-10T12:00:00.000Z');
const TEEN = new Date('2010-02-01T00:00:00.000Z');
const ADULT = new Date('1990-02-01T00:00:00.000Z');

const reader = (birthDate: Date | null) => ({
  user: { findUnique: jest.fn(async () => ({ birthDate })) },
});

describe('loadViewerBirthDate — une lecture au plus, et seulement si la page contient Global', () => {
  it('ne lit rien sans conversation globale', async () => {
    const prisma = reader(TEEN);
    expect(await loadViewerBirthDate(prisma, { userId: 'u1', isAnonymous: false, conversationTypes: ['group', 'direct'] })).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('ne lit rien pour un lecteur anonyme', async () => {
    const prisma = reader(TEEN);
    expect(await loadViewerBirthDate(prisma, { userId: 'u1', isAnonymous: true, conversationTypes: ['global'] })).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('lit la date de naissance une fois quand Global est dans la page', async () => {
    const prisma = reader(TEEN);
    expect(await loadViewerBirthDate(prisma, { userId: 'u1', isAnonymous: false, conversationTypes: ['group', 'global'] })).toEqual(TEEN);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('servedListRowRestriction — la ligne de liste', () => {
  it('mineur dans Global : restriction servie, archivée même si la préférence dit le contraire', () => {
    const served = servedListRowRestriction({
      conversationType: 'global',
      birthDate: TEEN,
      now: NOW,
      userPreferences: [{ isPinned: true, isMuted: false, isArchived: false, tags: ['x'] }],
    });
    expect(served.viewerWriteRestriction).toBe('minor-global');
    expect(served.userPreferences).toEqual([{ isPinned: true, isMuted: false, isArchived: true, tags: ['x'] }]);
  });

  it('mineur dans Global sans préférence stockée : une ligne complète, archivée', () => {
    const served = servedListRowRestriction({ conversationType: 'global', birthDate: TEEN, now: NOW, userPreferences: [] });
    expect(served.userPreferences).toEqual([
      expect.objectContaining({ isArchived: true, isPinned: false, isMuted: false, tags: [], categoryId: null, customName: null, reaction: null }),
    ]);
  });

  it('majeur, âge inconnu ou conversation non globale : la préférence passe telle quelle, restriction null', () => {
    const prefs = [{ isPinned: false, isMuted: false, isArchived: false }];
    for (const input of [
      { conversationType: 'global', birthDate: ADULT },
      { conversationType: 'global', birthDate: null },
      { conversationType: 'group', birthDate: TEEN },
    ]) {
      const served = servedListRowRestriction({ ...input, now: NOW, userPreferences: prefs });
      expect(served.viewerWriteRestriction).toBeNull();
      expect(served.userPreferences).toBe(prefs);
    }
  });

  it('18 ans le jour même : Global revient d’elle-même hors des archives', () => {
    const served = servedListRowRestriction({
      conversationType: 'global',
      birthDate: new Date('2008-10-10T00:00:00.000Z'),
      now: NOW,
      userPreferences: [{ isArchived: false }],
    });
    expect(served.viewerWriteRestriction).toBeNull();
    expect(served.userPreferences).toEqual([{ isArchived: false }]);
  });
});
