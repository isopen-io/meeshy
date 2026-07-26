import { describe, it, expect } from 'vitest';
import {
  resolvePresenceVisibility,
  applyPresenceVisibility,
  type PresenceVisibilityInput,
  type PresenceVisibility,
} from '../utils/presence-visibility';
import type { GlobalUserRoleType } from '../types/role-types';

// Politique de visibilité de la présence — source de vérité privacy (qui voit
// `isOnline`/`lastActiveAt`). @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
// Ces tests VERROUILLENT la règle : un refactor ne doit jamais fuiter la présence
// (metadata leakage) ni masquer à tort la présence d'un pair légitime.

const inputFor = (overrides: Partial<PresenceVisibilityInput> = {}): PresenceVisibilityInput => ({
  isSelf: false,
  viewerRole: 'USER' as GlobalUserRoleType,
  areConnected: false,
  sharesConversation: false,
  targetShowOnlineStatus: true,
  targetShowLastSeen: true,
  targetIsDeactivated: false,
  isBlockedEitherWay: false,
  ...overrides,
});

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };
const FULL: PresenceVisibility = { showOnline: true, showLastSeenTimestamp: true };

describe('resolvePresenceVisibility — verrous de fuite de présence', () => {
  it('cache tout pour une cible désactivée, même à un modérateur global', () => {
    expect(resolvePresenceVisibility(inputFor({ targetIsDeactivated: true, viewerRole: 'ADMIN' as GlobalUserRoleType }))).toEqual(HIDDEN);
    expect(resolvePresenceVisibility(inputFor({ targetIsDeactivated: true, isSelf: true }))).toEqual(HIDDEN);
  });

  it('cache tout en cas de blocage (dans un sens ou l\'autre), même pour un privilégié', () => {
    expect(resolvePresenceVisibility(inputFor({ isBlockedEitherWay: true, viewerRole: 'BIGBOSS' as GlobalUserRoleType }))).toEqual(HIDDEN);
    expect(resolvePresenceVisibility(inputFor({ isBlockedEitherWay: true, areConnected: true, targetShowOnlineStatus: true }))).toEqual(HIDDEN);
  });

  it('la désactivation/blocage prime sur toute autre autorisation', () => {
    expect(resolvePresenceVisibility(inputFor({ targetIsDeactivated: true, areConnected: true, sharesConversation: true }))).toEqual(HIDDEN);
  });
});

describe('resolvePresenceVisibility — accès privilégié (self / modérateur global)', () => {
  it('self voit online + last seen, indépendamment des préférences privacy de la cible', () => {
    expect(resolvePresenceVisibility(inputFor({ isSelf: true, targetShowOnlineStatus: false, targetShowLastSeen: false }))).toEqual(FULL);
  });

  it('un modérateur global (MODERATOR/ADMIN/BIGBOSS) voit tout malgré l\'opt-out de la cible', () => {
    for (const role of ['MODERATOR', 'ADMIN', 'BIGBOSS'] as GlobalUserRoleType[]) {
      expect(
        resolvePresenceVisibility(inputFor({ viewerRole: role, targetShowOnlineStatus: false, targetShowLastSeen: false })),
      ).toEqual(FULL);
    }
  });

  it('un privilégié voit la présence sans être connecté ni partager de conversation', () => {
    expect(resolvePresenceVisibility(inputFor({ isSelf: true, areConnected: false, sharesConversation: false }))).toEqual(FULL);
  });
});

describe('resolvePresenceVisibility — pair non privilégié : gating par relation', () => {
  it('cache tout à un inconnu (ni connecté, ni conversation partagée)', () => {
    expect(resolvePresenceVisibility(inputFor({ areConnected: false, sharesConversation: false }))).toEqual(HIDDEN);
  });

  it('autorise via connexion (contacts)', () => {
    expect(resolvePresenceVisibility(inputFor({ areConnected: true }))).toEqual(FULL);
  });

  it('autorise via conversation partagée', () => {
    expect(resolvePresenceVisibility(inputFor({ areConnected: false, sharesConversation: true }))).toEqual(FULL);
  });

  it('sharesConversation absent (undefined) est traité comme false', () => {
    const { sharesConversation: _omit, ...rest } = inputFor();
    expect(resolvePresenceVisibility(rest as PresenceVisibilityInput)).toEqual(HIDDEN);
  });

  it('un rôle non-modérateur (AUDIT/ANALYST/AGENT) n\'est PAS privilégié', () => {
    for (const role of ['AUDIT', 'ANALYST', 'AGENT'] as GlobalUserRoleType[]) {
      expect(resolvePresenceVisibility(inputFor({ viewerRole: role }))).toEqual(HIDDEN);
    }
  });
});

describe('resolvePresenceVisibility — respect des préférences de la cible pour un pair autorisé', () => {
  it('targetShowOnlineStatus=false ⇒ tout caché même pour un pair connecté', () => {
    expect(resolvePresenceVisibility(inputFor({ areConnected: true, targetShowOnlineStatus: false }))).toEqual(HIDDEN);
  });

  it('online visible mais last seen masqué quand targetShowLastSeen=false', () => {
    expect(
      resolvePresenceVisibility(inputFor({ areConnected: true, targetShowOnlineStatus: true, targetShowLastSeen: false })),
    ).toEqual({ showOnline: true, showLastSeenTimestamp: false });
  });

  it('online + last seen visibles quand les deux préférences sont actives', () => {
    expect(
      resolvePresenceVisibility(inputFor({ sharesConversation: true, targetShowOnlineStatus: true, targetShowLastSeen: true })),
    ).toEqual(FULL);
  });
});

describe('applyPresenceVisibility — projection sans mutation', () => {
  const profile = () => ({ id: 'u1', isOnline: true as boolean | null, lastActiveAt: new Date(0) as Date | null });

  it('showOnline=false ⇒ isOnline forcé à null (pas de pastille)', () => {
    const out = applyPresenceVisibility(profile(), HIDDEN);
    expect(out.isOnline).toBeNull();
    expect(out.lastActiveAt).toBeNull();
  });

  it('showOnline=true / lastSeen=false ⇒ isOnline conservé, lastActiveAt masqué', () => {
    const out = applyPresenceVisibility(profile(), { showOnline: true, showLastSeenTimestamp: false });
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toBeNull();
  });

  it('visibilité complète ⇒ valeurs préservées', () => {
    const p = profile();
    const out = applyPresenceVisibility(p, FULL);
    expect(out.isOnline).toBe(true);
    expect(out.lastActiveAt).toEqual(new Date(0));
  });

  it('ne mute pas le profil source', () => {
    const p = profile();
    applyPresenceVisibility(p, HIDDEN);
    expect(p.isOnline).toBe(true);
    expect(p.lastActiveAt).toEqual(new Date(0));
  });

  it('préserve les autres champs du profil', () => {
    const out = applyPresenceVisibility(profile(), HIDDEN);
    expect(out.id).toBe('u1');
  });
});
