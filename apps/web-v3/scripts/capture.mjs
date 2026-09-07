#!/usr/bin/env node
/**
 * Capture les ecrans du POC aux deux schemas, a la largeur de reference
 * (390 x 844 — l'iPhone que les cibles montrent), pour qu'on JUGE le rendu au
 * lieu de le supposer. Les captures vont dans `rendu/`, non versionnees.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE ?? 'http://localhost:4173';
const SORTIE = new URL('../rendu/', import.meta.url).pathname;
mkdirSync(SORTIE, { recursive: true });

/**
 * L'INSTANT DE REFERENCE des captures.
 *
 * Les fixtures sont ancrees sur `Date.now()` pour que le fil se lise toujours
 * comme aujourd'hui (sinon il affiche « Hier » le lendemain). Mais alors deux
 * captures du MEME code different par leurs horodatages, et comparer un rendu
 * avant/apres devient impossible. On fige donc l'horloge de la page : les
 * fixtures restent relatives, et le resultat redevient reproductible.
 */
const INSTANT = new Date('2026-09-07T10:00:00Z');

const ECRANS = [
  { nom: 'liste', chemin: '/' },
  { nom: 'fil', chemin: '/c/c-equipe' },
  { nom: 'fil-direct', chemin: '/c/c-amina' },
];

/* Le Chromium prei-nstalle de l'environnement : la version de Playwright du
   depot attend une autre revision, et `playwright install` est proscrit ici. */
const navigateur = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
for (const schema of ['sombre', 'clair']) {
  const contexte = await navigateur.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: schema === 'clair' ? 'light' : 'dark',
  });
  for (const ecran of ECRANS) {
    const page = await contexte.newPage();
    await page.clock.setFixedTime(INSTANT);
    await page.goto(`${BASE}${ecran.chemin}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const fichier = `${SORTIE}${ecran.nom}.${schema}.png`;
    await page.screenshot({ path: fichier });
    console.log(`  ${ecran.nom} · ${schema}`);
    await page.close();
  }
  await contexte.close();
}
await navigateur.close();
