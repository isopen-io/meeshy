/**
 * @jest-environment node
 */

import { lisLeVisiteur } from '@/app/(public)/l/[token]/visiteur';

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const visiteur = (entetes: Readonly<Record<string, string>>, url = 'https://meeshy.me/l/8fz3') =>
  lisLeVisiteur({ entetes: new Headers(entetes), url: new URL(url) });

describe('lisLeVisiteur — tout vient des EN-TÊTES : le rôle premier n’exécute rien', () => {
  it('lit l’appareil, le navigateur et le type depuis le user-agent', () => {
    const lu = visiteur({ 'user-agent': UA_IPHONE });

    expect(lu.appareil).toEqual({ os: 'iOS', navigateur: 'Safari', type: 'mobile' });
  });

  it('nomme la source sociale depuis le referrer', () => {
    expect(visiteur({ referer: 'https://l.wl.co/' }).source).toBe('WhatsApp');
    expect(visiteur({ referer: 'https://t.me/x' }).source).toBe('Telegram');
  });

  it('nomme la source sociale depuis un navigateur in-app quand le referrer manque', () => {
    expect(visiteur({ 'user-agent': 'Mozilla/5.0 Instagram 300.0' }).source).toBe('Instagram');
  });

  it('dit « Direct » sans referrer, jamais « inconnu »', () => {
    expect(visiteur({}).source).toBe('Direct');
  });

  it('lit la langue demandée, sa liste complète et son libellé lisible', () => {
    const lu = visiteur({ 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' });

    expect(lu.langue.etiquette).toBe('fr-FR');
    expect(lu.langue.liste).toBe('fr-FR,fr;q=0.9,en;q=0.8');
    expect(lu.langue.libelle).toContain('rançais');
    expect(lu.langue.drapeau).toBe('🇫🇷');
  });

  it('ne fabrique aucun drapeau quand la langue ne porte pas de région', () => {
    expect(visiteur({ 'accept-language': 'fr' }).langue.drapeau).toBeNull();
  });

  it('retombe sur la langue du document quand aucune n’est demandée', () => {
    expect(visiteur({}).langue.etiquette).toBe('fr');
  });

  it('prend la première adresse de x-forwarded-for', () => {
    expect(visiteur({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }).ip).toBe('203.0.113.7');
  });

  it('récolte les UTM du clic, et rien d’autre de la requête', () => {
    const lu = visiteur({}, 'https://meeshy.me/l/8fz3?utm_source=wa&utm_medium=chat&x=1');

    expect(lu.utm).toEqual({ utmClickSource: 'wa', utmClickMedium: 'chat' });
  });
});

describe('estUnRobot — c’est LUI qui décide qui reçoit le repli', () => {
  it.each([
    'facebookexternalhit/1.1',
    'WhatsApp/2.23.20.0 A',
    'Twitterbot/1.0',
    'Slackbot-LinkExpanding 1.0',
    'TelegramBot (like TwitterBot)',
    'LinkedInBot/1.0',
    'Discordbot/2.0',
    'Mozilla/5.0 (compatible; Googlebot/2.1)',
    'Mozilla/5.0 (compatible; bingbot/2.0)',
    'Mozilla/5.0 (compatible; SomeNewCrawler/1.0)',
  ])('%s reçoit le repli', (ua) => {
    expect(visiteur({ 'user-agent': ua }).estUnRobot).toBe(true);
  });

  it.each([UA_IPHONE, 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0.0.0 Safari/537.36'])(
    '%s reçoit la redirection',
    (ua) => {
      expect(visiteur({ 'user-agent': ua }).estUnRobot).toBe(false);
    },
  );

  it('traite un user-agent absent comme un humain : la redirection est le chemin nominal', () => {
    expect(visiteur({}).estUnRobot).toBe(false);
  });
});
