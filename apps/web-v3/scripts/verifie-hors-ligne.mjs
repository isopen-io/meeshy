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
const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const contexte = await navigateur.newContext({ viewport: { width: 390, height: 844 } });

/**
 * ATTENTION AU PIEGE DE MESURE : l'evenement `response` de Playwright se
 * declenche AUSSI pour ce que le service worker sert depuis son cache. Compter
 * tout rendrait une visite 2 aussi « chere » que la visite 1 et ferait
 * conclure que le precache ne sert a rien — l'inverse exact de la verite.
 * `fromServiceWorker()` separe les deux, et c'est la colonne RESEAU qui porte
 * l'argument du cout en zone rurale.
 */
const compte = (page) => {
  const reseau = { requetes: 0, octets: 0 };
  const cache = { requetes: 0, octets: 0 };
  page.on('response', async (r) => {
    const ou = r.fromServiceWorker() ? cache : reseau;
    ou.requetes += 1;
    try {
      ou.octets += (await r.body()).length;
    } catch {
      /* Reponse sans corps lisible : elle compte en requete, pas en octets. */
    }
  });
  return () => ({ reseau, cache });
};

const ligne = (nom, m) =>
  `  ${nom.padEnd(22)} reseau ${String(m.reseau.requetes).padStart(2)} req / ${(m.reseau.octets / 1024)
    .toFixed(1)
    .padStart(6)} Ko  ·  cache SW ${String(m.cache.requetes).padStart(2)} req / ${(m.cache.octets / 1024)
    .toFixed(1)
    .padStart(6)} Ko`;

// --- Visite 1 : tout est froid.
const p1 = await contexte.newPage();
const m1 = compte(p1);
await p1.goto(BASE, { waitUntil: 'networkidle' });
await p1.waitForTimeout(1500); // laisser le service worker precacher
const v1 = m1();
await p1.close();

// --- Visite 2 : le service worker est installe.
const p2 = await contexte.newPage();
const m2 = compte(p2);
await p2.goto(BASE, { waitUntil: 'networkidle' });
await p2.waitForTimeout(500);
const v2 = m2();
const titreEnLigne = await p2.locator('h1').first().textContent();
await p2.close();

// --- Visite 3 : RESEAU COUPE.
await contexte.setOffline(true);
const p3 = await contexte.newPage();
let horsLigneOk = false;
let titreHorsLigne = null;
try {
  await p3.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 10_000 });
  titreHorsLigne = await p3.locator('h1').first().textContent({ timeout: 5000 });
  // Le fil aussi doit s'ouvrir : une navigation interne ne doit toucher aucun reseau.
  await p3.getByRole('link', { name: /Equipe produit/ }).first().click();
  await p3.waitForTimeout(400);
  /* On verifie le COMPOSEUR, pas le separateur de jour : ce dernier depend
     de la date du jour, et le temoin tombait a minuit sans qu'une ligne de
     code ait bouge. Le composeur, lui, est present si et seulement si l'ecran
     du fil s'est reellement monte. */
  horsLigneOk = (await p3.getByPlaceholder('Message…').count()) > 0;
} catch (e) {
  titreHorsLigne = `ECHEC : ${e.message.split('\n')[0]}`;
}
await navigateur.close();

console.log(`
${ligne('visite 1 (froide)', v1)}
${ligne('visite 2 (SW installe)', v2)}
  titre en ligne         ${JSON.stringify(titreEnLigne)}
  visite 3 HORS LIGNE    titre ${JSON.stringify(titreHorsLigne)}
  fil ouvert hors ligne  ${horsLigneOk ? 'OUI' : 'NON'}
`);
process.exit(horsLigneOk ? 0 : 1);
