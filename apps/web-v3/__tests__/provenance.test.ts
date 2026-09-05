/**
 * @jest-environment node
 */

import { chargementSpeculatif, origineEtrangere, PROVENANCE, refusDOrigine, sansEffet } from '@/app/provenance';

/**
 * LES DEUX GARDES DE PROVENANCE, sur les en-têtes que les navigateurs
 * ÉCRIVENT — pas sur une intention. Une spéculation n'a aucun effet ; un
 * formulaire vient de Meeshy ; un agent qui ne dit rien de sa provenance
 * passe, parce que la garde protège des navigateurs et ne remplace pas la
 * créance.
 */

const requete = (entetes: Record<string, string> = {}, url = 'https://meeshy.me/chat/x'): Request => new Request(url, { headers: entetes });

describe('un chargement spéculatif', () => {
  it.each([
    ['Sec-Purpose: prefetch (Chrome, règles de spéculation)', { 'sec-purpose': 'prefetch' }],
    ['Sec-Purpose: prefetch;prerender (Chrome, prérendu)', { 'sec-purpose': 'prefetch;prerender' }],
    ['Sec-Purpose: prefetch;anonymous-client-ip', { 'sec-purpose': 'prefetch;anonymous-client-ip' }],
    ['Purpose: prefetch (agents plus anciens)', { purpose: 'prefetch' }],
    ['X-Purpose: preview (Safari, Top Hit)', { 'x-purpose': 'preview' }],
    ['X-moz: prefetch (Firefox)', { 'x-moz': 'prefetch' }],
  ])('est reconnu — %s', (_, entetes) => {
    expect(chargementSpeculatif(requete(entetes))).toBe(true);
  });

  it('n’est pas une navigation ordinaire, ni un Sec-Purpose qui dit autre chose', () => {
    expect(chargementSpeculatif(requete())).toBe(false);
    expect(chargementSpeculatif(requete({ 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' }))).toBe(false);
    expect(chargementSpeculatif(requete({ 'sec-purpose': 'unknown' }))).toBe(false);
  });

  it('reçoit un 503 vide et non conservable — jamais un 204 qu’un clic réutiliserait', async () => {
    const reponse = sansEffet();
    expect(reponse.status).toBe(503);
    expect(await reponse.text()).toBe('');
    expect(reponse.headers.get('cache-control')).toBe('no-store');
  });
});

describe('l’origine d’un formulaire', () => {
  it('fait foi de Sec-Fetch-Site quand il est là — cross-site refuse, le reste passe', () => {
    expect(origineEtrangere(requete({ 'sec-fetch-site': 'cross-site', origin: 'https://meeshy.me' }))).toBe(true);
    expect(origineEtrangere(requete({ 'sec-fetch-site': 'same-origin', origin: 'https://evil.example' }))).toBe(false);
    expect(origineEtrangere(requete({ 'sec-fetch-site': 'same-site' }))).toBe(false);
    expect(origineEtrangere(requete({ 'sec-fetch-site': 'none' }))).toBe(false);
  });

  it('compare Origin à l’hôte SERVI — celui du proxy d’abord, puis Host, puis l’adresse', () => {
    expect(origineEtrangere(requete({ origin: 'https://meeshy.me' }))).toBe(false);
    expect(origineEtrangere(requete({ origin: 'https://MEESHY.me' }))).toBe(false);
    expect(origineEtrangere(requete({ origin: 'https://evil.example' }))).toBe(true);
    expect(origineEtrangere(requete({ origin: 'https://meeshy.me', 'x-forwarded-host': 'staging.meeshy.me' }))).toBe(true);
    expect(origineEtrangere(requete({ origin: 'https://staging.meeshy.me', 'x-forwarded-host': 'staging.meeshy.me, interne' }))).toBe(false);
    expect(origineEtrangere(requete({ origin: 'http://127.0.0.1:3300', host: '127.0.0.1:3300' }, 'http://127.0.0.1:3300/chat/x'))).toBe(false);
  });

  it('refuse une Origin opaque (« null ») ou illisible', () => {
    expect(origineEtrangere(requete({ origin: 'null' }))).toBe(true);
    expect(origineEtrangere(requete({ origin: 'pas une origine' }))).toBe(true);
  });

  it('laisse passer un agent qui ne dit rien de sa provenance', () => {
    expect(origineEtrangere(requete())).toBe(false);
  });

  it('refuse par un état DESSINÉ : 403, la raison, et la porte à reprendre', async () => {
    const reponse = refusDOrigine(new Request('https://meeshy.me/chat/lagos-q1', { method: 'POST' }));
    const html = await reponse.text();
    expect(reponse.status).toBe(403);
    expect(reponse.headers.get('cache-control')).toBe('no-store, private');
    expect(html).toContain(`<h1>${PROVENANCE.titre}</h1>`);
    expect(html).toContain(PROVENANCE.corps);
    expect(html).toContain('<a class="action primaire" href="/chat/lagos-q1">');
  });
});
