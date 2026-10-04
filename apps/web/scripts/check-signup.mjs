#!/usr/bin/env node
/**
 * L'INSCRIPTION NE SE TERMINE PAS SANS NUMÉRO PLAUSIBLE (#9343).
 *
 * Directive porteur 2026-10-04 : « obliger le remplissage du numéro du
 * téléphone lors de la phase d'inscription uniquement dans les frontend ».
 * La passerelle reste permissive (une adresse seule crée toujours le compte) ;
 * c'est donc l'ÉCRAN, et lui seul, qui porte l'exigence — et un navigateur
 * réel est le seul témoin qui la voit comme l'utilisateur la vit : un bouton
 * réellement inactif, un champ qui ne s'ouvre pas, un refus réellement peint
 * sous le champ et cité par lui.
 *
 * CE QU'IL MESURE, sur `/signup` à 390 × 844 :
 *   1. à l'ouverture : le numéro est là, marqué requis ; aucun moyen de le
 *      passer (ni « Plus tard », ni « e-mail seulement ») ; l'adresse n'est
 *      pas parue ; « S'inscrire » est inactif ;
 *   2. SANS numéro, Entrée dans le champ n'avance rien : l'adresse ne paraît
 *      pas ;
 *   3. un numéro NON PLAUSIBLE (trop court, puis rempli d'un motif) quitté ⇒
 *      le refus est peint SOUS le champ, cité par `aria-describedby`,
 *      `aria-invalid` posé — et l'adresse ne paraît toujours pas ;
 *   4. un numéro PLAUSIBLE ⇒ le refus s'efface et l'adresse paraît ;
 *   5. l'adresse donnée ⇒ la carte paraît, « S'inscrire » s'active ;
 *      le numéro EFFACÉ ⇒ « S'inscrire » s'éteint et l'absence se dit ;
 *   6. le numéro rendu, « S'inscrire » envoie `POST /auth/register` avec le
 *      couple `phoneNumber` + `phoneCountryCode`.
 *
 * Aucune attente aveugle : chaque lecture suit une ATTENTE D'ÉTAT
 * (`waitForSelector`, `waitForFunction`, `waitForRequest`). Aucun gate ne
 * dépend du staging : la seule requête sortante permise est l'inscription,
 * servie ici ; toute autre est refusée.
 */
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;
const EMAIL = 'ada@meeshy.example';
const ATTENTE = { timeout: 5_000 };

const MOTS = {
  requis: 'Saisissez votre numéro de téléphone pour continuer.',
  tropCourt: 'Ce numéro est trop court : 9 chiffres au moins.',
  irreel: 'Ce numéro ne semble pas réel : vérifiez-le.',
};

const cors = (request) => ({
  'access-control-allow-origin': request.headers().origin ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? 'content-type, authorization',
});

const browser = await launchChromium();
const failures = [];
const constate = (ok, what) => {
  if (!ok) failures.push(what);
};

const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
const inscriptions = [];
await context.route('**/*', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === BASE) return route.continue();
  if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(request) });
  if (request.method() === 'POST' && url.pathname === '/api/v1/auth/register') {
    inscriptions.push(request.postDataJSON());
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      headers: cors(request),
      body: JSON.stringify({ success: false, error: 'Témoin : aucune passerelle' }),
    });
  }
  return route.abort();
});

const page = await context.newPage();
const erreurs = [];
page.on('pageerror', (e) => erreurs.push(e.message));

const PHONE = '#signup-phone';
const EMAIL_FIELD = '#signup-email';
const ERREUR = '#signup-phone-error';
const PRIMAIRE = '[data-signup-primary]';

const present = (selecteur) => page.$(selecteur).then((el) => el !== null);
const inactif = () => page.$eval(PRIMAIRE, (b) => b.disabled);
const refus = () => page.$eval(ERREUR, (p) => p.textContent?.trim() ?? '');
const saisit = (valeur) => page.fill(PHONE, valeur);
/** Quitter le champ : le refus ne se dit qu'une fois la saisie quittée. */
const quitte = () => page.$eval(PHONE, (input) => input.blur());
const citeLeRefus = () =>
  page.$eval(PHONE, (input) => ({
    decrit: (input.getAttribute('aria-describedby') ?? '').split(/\s+/u).includes('signup-phone-error'),
    invalide: input.getAttribute('aria-invalid') === 'true',
  }));

await page.goto(`${BASE}/signup`, { waitUntil: 'load' });
const pret = await page.waitForSelector(PHONE, { timeout: 8_000 }).then(() => true, () => false);
constate(pret, '/signup — le champ du numéro n’est jamais paru');

if (pret) {
  // 1. L'ouverture.
  constate((await page.$eval(PHONE, (i) => i.getAttribute('aria-required'))) === 'true', '1 — le numéro n’est pas marqué requis (`aria-required`)');
  constate(!(await present('[data-signup-skip-phone]')), '1 — un bouton pour PASSER le numéro est encore rendu');
  const texte = await page.evaluate(() => document.body.innerText);
  constate(!/Plus tard|e-mail seulement/u.test(texte), '1 — « Plus tard » ou « e-mail seulement » se lit encore à l’écran');
  constate(!(await present(EMAIL_FIELD)), '1 — l’adresse est parue avant tout numéro');
  constate(await inactif(), '1 — « S’inscrire » est actif sans numéro');

  // 2. Sans numéro, Entrée n'avance rien.
  await page.focus(PHONE);
  await page.keyboard.press('Enter');
  constate(!(await present(EMAIL_FIELD)), '2 — sans numéro, Entrée a fait paraître l’adresse');
  constate(inscriptions.length === 0, '2 — sans numéro, une inscription est partie');

  // 3. Non plausible ⇒ refus sous le champ, rien ne s'ouvre.
  await saisit('061234');
  await quitte();
  const courtDit = await page.waitForSelector(ERREUR, ATTENTE).then(() => true, () => false);
  constate(courtDit, '3 — un numéro trop court quitté ne dit aucun refus sous le champ');
  if (courtDit) {
    constate((await refus()) === MOTS.tropCourt, `3 — refus « trop court » attendu, lu « ${await refus()} »`);
    const cite = await citeLeRefus();
    constate(cite.decrit, '3 — le champ ne cite pas son refus (`aria-describedby`)');
    constate(cite.invalide, '3 — le champ n’est pas marqué invalide (`aria-invalid`)');
    constate((await page.$eval(ERREUR, (p) => p.getAttribute('role'))) === 'alert', '3 — le refus n’est pas annoncé (`role="alert"`)');
  }
  constate(!(await present(EMAIL_FIELD)), '3 — un numéro trop court a fait paraître l’adresse');

  await saisit('1111100000');
  const irreelDit = await page
    .waitForFunction(({ sel, mot }) => document.querySelector(sel)?.textContent?.trim() === mot, { sel: ERREUR, mot: MOTS.irreel }, ATTENTE)
    .then(() => true, () => false);
  constate(irreelDit, '3 — « 1111100000 » ne dit pas « ne semble pas réel »');
  constate(!(await present(EMAIL_FIELD)), '3 — « 1111100000 » a fait paraître l’adresse');

  // 4. Plausible ⇒ l'adresse paraît, le refus s'efface.
  await saisit('0612345678');
  const adresse = await page.waitForSelector(EMAIL_FIELD, ATTENTE).then(() => true, () => false);
  constate(adresse, '4 — un numéro plausible ne fait pas paraître l’adresse');
  constate(!(await present(ERREUR)), '4 — le refus survit à un numéro plausible');

  if (adresse) {
    // 5. La carte, puis le numéro effacé.
    await page.fill(EMAIL_FIELD, EMAIL);
    const actif = await page
      .waitForFunction((sel) => document.querySelector(sel)?.disabled === false, PRIMAIRE, ATTENTE)
      .then(() => true, () => false);
    constate(actif, '5 — numéro et adresse donnés, « S’inscrire » reste inactif');
    await saisit('');
    const eteint = await page
      .waitForFunction((sel) => document.querySelector(sel)?.disabled === true, PRIMAIRE, ATTENTE)
      .then(() => true, () => false);
    constate(eteint, '5 — le numéro effacé, « S’inscrire » reste actif');
    const absenceDite = await page
      .waitForFunction(({ sel, mot }) => document.querySelector(sel)?.textContent?.trim() === mot, { sel: ERREUR, mot: MOTS.requis }, ATTENTE)
      .then(() => true, () => false);
    constate(absenceDite, '5 — le numéro effacé, l’absence ne se dit pas sous le champ');

    // 6. Le numéro rendu, l'inscription part avec le couple.
    await saisit('0612345678');
    await page.waitForFunction((sel) => document.querySelector(sel)?.disabled === false, PRIMAIRE, ATTENTE).catch(() => undefined);
    const envoi = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/api/v1/auth/register'), ATTENTE);
    await page.click(PRIMAIRE);
    const parti = await envoi.then(() => true, () => false);
    constate(parti, '6 — « S’inscrire » n’a envoyé aucune inscription');
    const corps = inscriptions.at(-1) ?? {};
    constate(corps.phoneNumber === '0612345678', `6 — la charge ne porte pas le numéro (lu ${JSON.stringify(corps.phoneNumber)})`);
    constate(typeof corps.phoneCountryCode === 'string' && corps.phoneCountryCode.length === 2, '6 — la charge ne porte pas le pays du numéro');
    constate(corps.email === EMAIL, '6 — la charge ne porte pas l’adresse');
  }
}

constate(erreurs.length === 0, `erreurs de page : ${erreurs.join(' · ')}`);

await context.close();
await browser.close();
served.close();

console.log(`
  écran mesuré     /signup (390 × 844)
  inscriptions     ${inscriptions.length}`);

if (failures.length > 0) {
  console.error(`\n  ${failures.length} invariant(s) rompu(s) :`);
  for (const e of failures) console.error(`    · ${e}`);
  console.error("\n  L'inscription ne se termine pas sans numéro plausible — et le dit sous le champ.\n");
  process.exit(1);
}
console.log("\n  Sans numéro plausible, rien n'avance ; le refus se dit sous le champ ; avec un numéro, on s'inscrit.\n");
