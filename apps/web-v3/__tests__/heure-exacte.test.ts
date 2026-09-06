/**
 * L'HEURE DE RÉCEPTION EXACTE DÈS LE PREMIER OCTET (décision porteur
 * 2026-09-06) — le socle : `heureExacte` rend l'heure dans le fuseau du
 * LECTEUR, `fuseauDuLecteur` lit le cookie que le module pose, et chaque
 * repli rend '' ou null plutôt qu'une heure dans le MAUVAIS fuseau — le
 * défaut que le relatif « il y a 27 min » évitait, et que ce socle doit
 * continuer d'éviter sans le scintillement du remplacement.
 *
 * @jest-environment node
 */
import { fuseauDuLecteur } from '@/app/session';
import { COOKIE_DE_FUSEAU, fuseauPlausible, heureExacte } from '@/lib/temps';

const requeteAvecCookie = (cookie: string | null): Request =>
  new Request('https://staging.meeshy.me/chats/abc', {
    headers: cookie === null ? {} : { cookie },
  });

describe("l'heure exacte dans le fuseau du lecteur", () => {
  it("rend l'heure de réception dans le fuseau demandé, pas celui du serveur", () => {
    expect(heureExacte('2026-09-06T12:00:00.000Z', 'fr', 'Europe/Paris')).toBe('14:00');
    expect(heureExacte('2026-09-06T12:00:00.000Z', 'fr', 'America/Sao_Paulo')).toBe('09:00');
  });

  it("rend '' sur un fuseau que l'ICU refuse — jamais une heure dans le mauvais fuseau", () => {
    expect(heureExacte('2026-09-06T12:00:00.000Z', 'fr', 'Meeshy/Nulle_Part')).toBe('');
  });

  it("rend '' sur un instant illisible", () => {
    expect(heureExacte('pas-une-date', 'fr', 'Europe/Paris')).toBe('');
  });
});

describe('le cookie du fuseau', () => {
  it('lit un identifiant IANA posé par le module', () => {
    expect(fuseauDuLecteur(requeteAvecCookie(`${COOKIE_DE_FUSEAU}=Europe%2FParis`))).toBe('Europe/Paris');
  });

  it("rend null sans cookie — le site d'appel sert alors le relatif", () => {
    expect(fuseauDuLecteur(requeteAvecCookie(null))).toBeNull();
    expect(fuseauDuLecteur(requeteAvecCookie('meeshy_session=x'))).toBeNull();
  });

  it('refuse une forme qui ne ressemble pas à un fuseau', () => {
    expect(fuseauDuLecteur(requeteAvecCookie(`${COOKIE_DE_FUSEAU}=${encodeURIComponent('<script>alert(1)</script>')}`))).toBeNull();
    expect(fuseauDuLecteur(requeteAvecCookie(`${COOKIE_DE_FUSEAU}=${encodeURIComponent('x'.repeat(200))}`))).toBeNull();
  });

  it('la forme plausible reste stricte : lettres, chiffres, _ + / - seulement', () => {
    expect(fuseauPlausible('Europe/Paris')).toBe(true);
    expect(fuseauPlausible('Etc/GMT+8')).toBe(true);
    expect(fuseauPlausible('')).toBe(false);
    expect(fuseauPlausible('1Fuseau')).toBe(false);
  });
});
