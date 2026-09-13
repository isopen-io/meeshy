import nextConfig from '../../next.config';

/**
 * `next.config.security.js` a existé sans être importé nulle part — le
 * gateway Traefik ne les posait pas non plus (#3628). Ce témoin épingle le
 * SEUL point d'entrée réel : `next.config.ts` → `headers()`.
 *
 * La CSP est désormais construite depuis l'audit de domaine réel (#5728,
 * suite de #3628) et servie en `Content-Security-Policy-Report-Only` —
 * jamais encore en mode bloquant (`Content-Security-Policy`), réservé à une
 * vérification staging bout en bout. Voir le commentaire de
 * `reportOnlyCspHeader` dans `next.config.security.js`.
 */
describe('next.config headers — en-têtes de sécurité (#3628)', () => {
  type HeaderRule = { source: string; headers: { key: string; value: string }[] };

  const findGlobalRule = (rules: HeaderRule[]) =>
    rules.find((rule) => rule.source === '/:path*');

  it('sert les en-têtes de sécurité non-CSP sur toutes les routes', async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const globalRule = findGlobalRule(rules);

    expect(globalRule).toBeDefined();

    const keys = globalRule!.headers.map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'X-Frame-Options',
        'X-Content-Type-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'X-DNS-Prefetch-Control',
        'X-Download-Options',
      ]),
    );
    // La bascule en mode bloquant exige une vérification staging bout en
    // bout (#5728) — jamais le header bloquant tant qu'elle n'est pas faite.
    expect(keys).not.toContain('Content-Security-Policy');
    expect(keys).toContain('Content-Security-Policy-Report-Only');
  });

  it("n'interdit jamais camera/microphone/geolocation en self — Meeshy appelle, enregistre des vocaux et partage la position", async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const globalRule = findGlobalRule(rules)!;

    const permissionsPolicy = globalRule.headers.find(
      (h) => h.key === 'Permissions-Policy',
    );

    expect(permissionsPolicy).toBeDefined();
    // Une valeur vide ("camera=()") refuse la fonctionnalité à TOUT contexte,
    // y compris same-origin, et casserait silencieusement les appels et
    // l'enregistrement vocal — la forme correcte autorise au moins `self`.
    expect(permissionsPolicy!.value).toMatch(/camera=\(self\)/);
    expect(permissionsPolicy!.value).toMatch(/microphone=\(self\)/);
    expect(permissionsPolicy!.value).toMatch(/geolocation=\(self\)/);
  });

  it('conserve les en-têtes PWA existants (Cache-Control du service worker)', async () => {
    const rules = (await nextConfig.headers!()) as HeaderRule[];
    const swRule = rules.find((rule) => rule.source === '/sw.js');

    expect(swRule).toBeDefined();
    expect(swRule!.headers.map((h) => h.key)).toEqual(
      expect.arrayContaining(['Cache-Control', 'Service-Worker-Allowed']),
    );
  });
});
