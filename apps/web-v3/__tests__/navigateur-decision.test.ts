import { decideLInterception, estNavigable, extraitLEchange } from '@/lib/realtime/navigateur-decision';

/**
 * LE NAVIGATEUR DE ZONE — la DÉCISION, séparée du geste (#5106).
 *
 * La logique qui décide « douce ou réelle » et celle qui découpe le document
 * reçu sont PURES : elles se prouvent ici, hors navigateur. Le module
 * `lib/realtime/navigateur.ts` ne fait plus que les brancher sur les
 * événements — c'est le patron des huit modules précédents (la peinture de
 * notifs, la décision d'audio…) : ce qui peut rougir en jest ne se découvre
 * pas en e2e.
 *
 * La FRONTIÈRE est la loi n° 1 : le lint `zone/lien-sortant-en-navigation-client`
 * garde le BUILD ; `decideLInterception` est son jumeau RUNTIME — un lien hors
 * de la liste navigable navigue RÉELLEMENT, toujours.
 */

describe('estNavigable — segment-aware, comme belongsToV3Zone, jamais un préfixe de chaîne', () => {
  const LISTE = ['/chats', '/chat/', '/feed'] as const;

  it.each([
    ['/chats', true],
    ['/chats/abc', true],
    ['/chatsfoo', false],
    ['/chat/lagos', true],
    ['/chat', false],
    ['/feed', true],
    ['/feed/reels', true],
    ['/login', false],
    ['/', false],
  ])('%s → %s', (chemin, attendu) => {
    expect(estNavigable(chemin, LISTE)).toBe(attendu);
  });
});

describe('decideLInterception — douce DANS la zone, réelle partout ailleurs', () => {
  const cadre = {
    origine: 'https://staging.meeshy.me',
    navigable: ['/chats', '/chat/', '/feed'] as readonly string[],
  };
  const lien = (surcharges: Partial<Parameters<typeof decideLInterception>[0]> = {}) => ({
    href: 'https://staging.meeshy.me/feed',
    target: '',
    telechargement: false,
    bouton: 0,
    modificateur: false,
    ...surcharges,
  });

  it('un lien interne navigable, clic nu → douce', () => {
    expect(decideLInterception(lien(), cadre)).toBe('douce');
  });

  it.each([
    ['hors de la liste navigable', lien({ href: 'https://staging.meeshy.me/login' })],
    ['vers une AUTRE origine', lien({ href: 'https://meeshy.me/feed' })],
    ['target=_blank', lien({ target: '_blank' })],
    ['download', lien({ telechargement: true })],
    ['clic du milieu', lien({ bouton: 1 })],
    ['avec un modificateur (cmd/ctrl/shift/alt)', lien({ modificateur: true })],
  ])('%s → réelle', (_nom, quoi) => {
    expect(decideLInterception(quoi, cadre)).toBe('reelle');
  });

  it("un ancrage sur la MÊME page (#…) → réelle : le navigateur natif sait déjà le faire sans un octet", () => {
    expect(
      decideLInterception(lien({ href: 'https://staging.meeshy.me/feed#haut' }), cadre),
    ).toBe('reelle');
  });
});

describe('extraitLEchange — ce que le document cible remet au swap', () => {
  const documentCible =
    '<!doctype html><html lang="fr" class="dark"><head><title>Notifications — Meeshy</title>' +
    '<style>.neuve{color:red}</style></head>' +
    '<body><main id="boite" data-module="/__v3/rt/notifs.abc.js">le corps neuf</main>' +
    '<script>ignore</script></body></html>';

  it('rend le titre, la feuille, le main et son module', () => {
    const echange = extraitLEchange(documentCible);
    expect(echange).not.toBeNull();
    expect(echange?.titre).toBe('Notifications — Meeshy');
    expect(echange?.feuille).toBe('.neuve{color:red}');
    expect(echange?.mainHtml).toContain('le corps neuf');
    expect(echange?.module).toBe('/__v3/rt/notifs.abc.js');
  });

  it('un document SANS <main> rend null — le swap refuse, la navigation réelle reprend', () => {
    expect(extraitLEchange('<!doctype html><html><body><p>hors zone</p></body></html>')).toBeNull();
  });

  it("un module HORS de `/__v3/rt/` est REFUSÉ — l'import ne quitte jamais la zone du temps réel", () => {
    const etranger =
      '<!doctype html><html><head><title>T</title><style>a{}</style></head>' +
      '<body><main data-module="https://evil.example/module.js">x</main></body></html>';
    expect(extraitLEchange(etranger)?.module).toBeNull();
    const horsZone =
      '<!doctype html><html><head><title>T</title><style>a{}</style></head>' +
      '<body><main data-module="/autre/chemin.js">x</main></body></html>';
    expect(extraitLEchange(horsZone)?.module).toBeNull();
  });

  it('un écran sans module rend module null — le swap reste légitime, rien à importer', () => {
    const sansModule =
      '<!doctype html><html><head><title>T</title><style>a{}</style></head>' +
      '<body><main>statique</main></body></html>';
    expect(extraitLEchange(sansModule)?.module).toBeNull();
  });
});
