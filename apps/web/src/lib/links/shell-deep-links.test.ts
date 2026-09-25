import { describe, expect, test } from 'bun:test';

import type { CoqueNative } from '@/lib/native-shell';

import { cheminDuLienEntrant, ecouterLiensEntrants, PONT_LIENS } from './shell-deep-links';

const SERVIS = ['/c/', '/u/', '/chat/'];
const isAppPath = (path: string): boolean => SERVIS.some((prefixe) => path.startsWith(prefixe) && path.length > prefixe.length);

describe('cheminDuLienEntrant', () => {
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
