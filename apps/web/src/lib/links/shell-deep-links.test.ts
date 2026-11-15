import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { cheminDuLienEntrant, ecouterLiensEntrants, PONT_LIENS } from './shell-deep-links';

const SERVIS = ['/c/', '/u/', '/chat/'];
const isAppPath = (path: string): boolean => SERVIS.some((prefixe) => path.startsWith(prefixe) && path.length > prefixe.length);

describe('cheminDuLienEntrant', () => {
  test('une WebView d’avant Chrome 130 (hôte vide, chemin « //c/abc » pour un schéma non spécial) mène au même écran', () => {
    const Native = globalThis.URL;
    class LegacyURL extends Native {
      override get host(): string {
        return this.protocol === 'meeshy:' ? '' : super.host;
      }
      override get pathname(): string {
        return this.protocol === 'meeshy:' ? `//${super.host}${super.pathname}` : super.pathname;
      }
    }
    globalThis.URL = LegacyURL as typeof URL;
    try {
      expect(cheminDuLienEntrant('meeshy://c/abc', isAppPath)).toBe('/c/abc');
      expect(cheminDuLienEntrant('meeshy://c/abc?compose=1#x', isAppPath)).toBe('/c/abc?compose=1#x');
    } finally {
      globalThis.URL = Native;
    }
  });

  test('un App Link meeshy.me donne son chemin in-app, requête et fragment compris', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/c/abc?m=1#x', isAppPath)).toBe('/c/abc?m=1#x');
  });

  test('le schéma court meeshy:// se lit comme l’adresse web — son hôte est le premier segment (iOS DeepLinkRouter)', () => {
    expect(cheminDuLienEntrant('meeshy://c/abc', isAppPath)).toBe('/c/abc');
    expect(cheminDuLienEntrant('meeshy://u/alice?x=1', isAppPath)).toBe('/u/alice?x=1');
  });

  test('un chemin que l’app ne sert pas ne navigue pas — l’app n’a pas d’écran à lui donner', () => {
    expect(cheminDuLienEntrant('https://meeshy.me/privacy', isAppPath)).toBeNull();
    expect(cheminDuLienEntrant('meeshy://inconnu', isAppPath)).toBeNull();
  });

  test('un lien à jeton d’e-mail n’entre JAMAIS par meeshy:// — une page ou une app tierce y pousserait le jeton d’un autre compte (#10870)', () => {
    const tout = (): boolean => true;
    [
      'meeshy://auth/magic-link?token=x',
      'meeshy://auth/magic-link?via=email#token=x',
      'meeshy://auth/magic-link/validate#token=x',
      'meeshy://auth/magic-link/x',
      'meeshy://auth/email-link/magic-link#token=x',
      'meeshy://AUTH/Magic-Link?token=x',
      'meeshy://auth//magic-link/?token=x',
      'meeshy:///auth/magic-link?token=x',
      'meeshy://auth/magic%2Dlink?token=x',
      'meeshy://auth/verify-email?token=x&email=a%40b.co',
      'meeshy://auth/email-link/verify-email#token=x&email=a%40b.co',
      'meeshy://reset-password#token=x',
      'meeshy://auth/reset-password#token=x',
      'meeshy://auth/email-link/reset-password#token=x',
      'meeshy://auth/revoke-sessions#token=x',
      'meeshy://account/deletion#token=x',
      'meeshy://settings/verify-email-change#token=x',
    ].forEach((lien) => expect(cheminDuLienEntrant(lien, tout)).toBeNull());
  });

  test('le même lien à jeton reste ouvert par l’App Link https de meeshy.me', () => {
    const tout = (): boolean => true;
    expect(cheminDuLienEntrant('https://meeshy.me/auth/magic-link?via=email#token=x', tout)).toBe('/auth/magic-link?via=email#token=x');
  });

  test('un hôte étranger ou une adresse illisible ne navigue pas', () => {
    expect(cheminDuLienEntrant('https://evil.example/c/abc', isAppPath)).toBeNull();
    expect(cheminDuLienEntrant('pas une url', isAppPath)).toBeNull();
    expect(cheminDuLienEntrant('javascript:alert(1)', isAppPath)).toBeNull();
  });
});

type Rappel = (event: unknown) => void;

const coqueAvecPont = (): { coque: CoqueNative; ecoutes: Array<{ plugin: string; evenement: string; rappel: Rappel }> } => {
  const ecoutes: Array<{ plugin: string; evenement: string; rappel: Rappel }> = [];
  const coque: CoqueNative = {
    PluginHeaders: [{ name: PONT_LIENS, methods: [] }],
    addListener: (plugin, evenement, rappel) => {
      ecoutes.push({ plugin, evenement, rappel });
      return { remove: async () => undefined };
    },
  };
  return { coque, ecoutes };
};

describe('ecouterLiensEntrants', () => {
  test('un lien reçu par la coque navigue vers son chemin in-app', () => {
    const { coque, ecoutes } = coqueAvecPont();
    const visites: string[] = [];

    expect(ecouterLiensEntrants(coque, { isAppPath, navigate: (chemin) => visites.push(chemin) })).toBe(true);
    expect(ecoutes.map(({ plugin, evenement }) => [plugin, evenement])).toEqual([[PONT_LIENS, 'appUrlOpen']]);

    ecoutes[0]?.rappel({ url: 'https://meeshy.me/c/abc' });
    ecoutes[0]?.rappel({ url: 'https://meeshy.me/privacy' });
    ecoutes[0]?.rappel({ autre: 1 });

    expect(visites).toEqual(['/c/abc']);
  });

  test('un navigateur, ou une coque construite avant le pont, n’écoute rien', () => {
    const navigate = (): void => {
      throw new Error('aucune navigation attendue');
    };
    expect(ecouterLiensEntrants(undefined, { isAppPath, navigate })).toBe(false);
    expect(
      ecouterLiensEntrants(
        { PluginHeaders: [{ name: 'MeeshyShare' }], addListener: () => ({ remove: async () => undefined }) },
        { isAppPath, navigate },
      ),
    ).toBe(false);
    expect(ecouterLiensEntrants({ PluginHeaders: [{ name: PONT_LIENS }] }, { isAppPath, navigate })).toBe(false);
  });
});
