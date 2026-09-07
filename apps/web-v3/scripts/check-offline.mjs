#!/usr/bin/env node
/**
 * VERIFIE LA PROMESSE DE LA VARIANTE A : apres UNE visite, l'application
 * s'ouvre HORS LIGNE et ne coute plus un octet.
 *
 * C'est le coeur de l'argument « moins cher des la deuxieme session » — une
 * promesse qu'on ne peut pas tenir sur parole. On mesure donc trois choses :
 * ce que coute la premiere visite, ce que coute la seconde, et si la troisieme
 * fonctionne reseau COUPE.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });

/**
 * ATTENTION AU PIEGE DE MESURE : l'evenement `response` de Playwright se
 * declenche AUSSI pour ce que le service worker sert depuis son cache. Compter
 * tout rendrait une visite 2 aussi « chere » que la visite 1 et ferait
 * conclure que le precache ne sert a rien — l'inverse exact de la verite.
 * `fromServiceWorker()` separe les deux, et c'est la colonne RESEAU qui porte
 * l'argument du cout en zone rurale.
 */
const count = (page) => {
  const network = { requests: 0, bytes: 0 };
  const cache = { requests: 0, bytes: 0 };
  page.on('response', async (r) => {
    const ou = r.fromServiceWorker() ? cache : network;
    ou.requests += 1;
    try {
      ou.bytes += (await r.body()).length;
    } catch {
      /* Reponse sans corps lisible : elle compte en requete, pas en octets. */
    }
  });
  return () => ({ network, cache });
};

const row = (name, m) =>
  `  ${name.padEnd(22)} reseau ${String(m.network.requests).padStart(2)} req / ${(m.network.bytes / 1024)
    .toFixed(1)
    .padStart(6)} Ko  ·  cache SW ${String(m.cache.requests).padStart(2)} req / ${(m.cache.bytes / 1024)
    .toFixed(1)
    .padStart(6)} Ko`;

// --- Visite 1 : tout est froid.
const p1 = await context.newPage();
const m1 = count(p1);
await p1.goto(BASE, { waitUntil: 'networkidle' });
await p1.waitForTimeout(1500); // laisser le service worker precacher
const v1 = m1();
await p1.close();

// --- Visite 2 : le service worker est installe.
const p2 = await context.newPage();
const m2 = count(p2);
await p2.goto(BASE, { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
const v2 = m2();
const onlineTitle = await p2.locator('h1').first().textContent();
await p2.close();

// --- Visite 3 : RESEAU COUPE.
await context.setOffline(true);
const p3 = await context.newPage();
let offlineOk = false;
let offlineTitle = null;
try {
  await p3.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  offlineTitle = await p3.locator('h1').first().textContent({ timeout: 5000 });
  /* Le fil aussi doit s'ouvrir : une navigation interne ne doit toucher aucun
     reseau. On clique la PREMIERE ligne, pas une conversation NOMMEE — la
     version precedente cherchait « Equipe produit » et est tombee le jour ou
     la fixture a change de titres (#5493), en signalant « le fil ne s'ouvre
     pas hors ligne » alors que le hors-ligne etait intact. Un temoin doit
     tomber sur ce qu'il MESURE, jamais sur le decor. */
  await p3.locator('[data-row] a').first().click();
  await p3.waitForTimeout(400);
  /* On verifie le COMPOSEUR, pas le separateur de jour : ce dernier depend
     de la date du jour, et le temoin tombait a minuit sans qu'une ligne de
     code ait bouge. Le composeur, lui, est present si et seulement si l'ecran
     du fil s'est reellement monte. */
  offlineOk = (await p3.getByPlaceholder('Message…').count()) > 0;
} catch (e) {
  offlineTitle = `ECHEC : ${e.message.split('\n')[0]}`;
}
await browser.close();

console.log(`
${row('visite 1 (froide)', v1)}
${row('visite 2 (SW installe)', v2)}
  titre en ligne         ${JSON.stringify(onlineTitle)}
  visite 3 HORS LIGNE    titre ${JSON.stringify(offlineTitle)}
  fil ouvert hors ligne  ${offlineOk ? 'OUI' : 'NON'}
`);
process.exit(offlineOk ? 0 : 1);
