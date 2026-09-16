#!/usr/bin/env node
/**
 * **L'ACTION PRIMAIRE DE `/chat/:lien` TIENT DANS LE PREMIER ÉCRAN** (#5561) —
 * le critère de fin de l'issue, mesuré dans un VRAI navigateur sur le document
 * PRODUIT (`dist/`).
 *
 * > « L'action primaire reste dans le premier écran dans TOUS ses états, y
 * > compris en refus. La v3 mesurait ça au pixel parce qu'un refus qui pousse
 * > « Créer un compte » hors de l'écran fait perdre l'utilisateur au moment
 * > exact où il hésitait. »
 *
 * Un témoin unitaire prouve qu'un bouton est RENDU ; il ne peut pas dire à
 * quelle ORDONNÉE il tombe une fois le clavier, la carte d'invitation, le détail
 * des droits et le formulaire empilés. C'est une mesure de géométrie, et elle
 * n'existe que dans un navigateur.
 *
 * **AUCUN RÉSEAU.** Le `dist` par défaut est construit en `fixtures` : la
 * lecture de l'invitation passe par `fixtures-link-join.ts`, jamais par la
 * passerelle. Toute requête sortante est ABANDONNÉE — ce gate ne peut pas
 * dépendre d'un service, ni en réveiller un.
 *
 * Les quatre états viennent du corpus de fixtures, et chacun rend une action
 * primaire DIFFÉRENTE :
 *
 *  1. le formulaire d'invité — « Continuer en anonyme » ;
 *  2. le même, après un refus de SAISIE (pseudo vide) : le formulaire est
 *     GARDÉ, le message s'ajoute, et le bouton ne doit pas être poussé dehors ;
 *  3. un lien qui EXIGE un compte — aucun formulaire, « Se connecter » devient
 *     l'action primaire ;
 *  4. un lien EXPIRÉ — le bandeau remplace tout, « Revenir à l'accueil » reste.
 *
 * Sur un refus de LECTURE (4), l'écran ne rend PAS les deux sorties `?next=` :
 * elles appartiennent à l'état où l'invitation a pu être lue. Mesurer leur
 * présence ici affirmerait un état qui n'existe pas.
 *
 * `CAPTURE_DIR=<dossier>` écrit une capture par état et par gabarit.
 */
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';

/** Les deux gabarits que #5561 nomme. 360 est le plus étroit des téléphones
 * courants ; 390 celui de la planche. */
const ETROIT = { width: 360, height: 640 };
const TELEPHONE = { width: 390, height: 844 };

/** Une cible tactile ne descend pas sous 44 px (règle du dépôt, dimension 5). */
const CIBLE_MIN = 44;

const DIST = new URL('../dist/', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const p = normalize(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '');
  for (const f of [join(DIST, p), join(DIST, `${p}.html`), join(DIST, p, 'index.html'), join(DIST, 'index.html')]) {
    try {
      if (!(await stat(f)).isFile()) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
      res.end(await readFile(f));
      return;
    } catch {
      /* candidat suivant */
    }
  }
  res.writeHead(404).end('404');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}`;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

/** Les liens du corpus de fixtures (`lib/api/fixtures-link-join.ts`). */
const OUVERT = 'mshy_equipe-deploiement_7f3a';
const COMPTE_EXIGE = 'mshy_annonces_2b91';
const EXPIRE = 'mshy_atelier-juin_c4d0';

/**
 * `pret` dit que l'écran est rendu ; `geste` mène à l'état mesuré ; `primaire`
 * est le sélecteur de l'action qui doit tenir dans le premier écran.
 */
const ETATS = [
  {
    nom: 'invité — formulaire au repos',
    chemin: `/chat/${OUVERT}`,
    pret: '[data-guest-form]',
    primaire: '[data-guest-submit]',
  },
  {
    nom: 'invité — refus de saisie (pseudo vide)',
    chemin: `/chat/${OUVERT}`,
    pret: '[data-guest-form]',
    geste: async (page) => {
      await page.click('[data-guest-submit]');
    },
    fin: '[data-guest-nickname][aria-invalid="true"]',
    primaire: '[data-guest-submit]',
    /* Le formulaire est GARDÉ : c'est la moitié de la promesse de #5561. */
    garde: '[data-guest-form]',
  },
  {
    nom: 'compte exigé — aucune porte anonyme',
    chemin: `/chat/${COMPTE_EXIGE}`,
    pret: 'a[href^="/login"]',
    primaire: 'a[href^="/login"]',
    absent: '[data-guest-form]',
  },
  {
    nom: 'lien expiré — le bandeau remplace tout',
    chemin: `/chat/${EXPIRE}`,
    pret: '[role="alert"]',
    primaire: 'a[href="/"]',
    absent: '[data-guest-form]',
  },
];

const browser = await launchChromium();
const failures = [];
const bilan = [];
const check = (ok, quoi) => {
  if (ok) console.log(`  ok    ${quoi}`);
  else {
    failures.push(quoi);
    console.log(`  FAUX  ${quoi}`);
  }
};

const slug = (nom) =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const ouvre = async (etat, viewport) => {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
  /* AUCUN octet ne part vers l'extérieur : le `dist` est en fixtures, et ce
     gate ne doit dépendre d'aucun service. */
  await context.route('**/*', (route) =>
    new URL(route.request().url()).origin === BASE ? route.continue() : route.abort(),
  );
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));

  await page.goto(`${BASE}${etat.chemin}`, { waitUntil: 'load' });
  const pret = await page.waitForSelector(etat.pret, { timeout: 8_000 }).then(() => true, () => false);
  if (pret && etat.geste !== undefined) await etat.geste(page);
  const atteint =
    pret && etat.fin !== undefined
      ? await page.waitForSelector(etat.fin, { timeout: 8_000 }).then(() => true, () => false)
      : pret;
  /* La géométrie se lit une fois posée — les états d'accès s'animent. */
  await page.waitForTimeout(350);
  return { page, context, pret, atteint, erreurs };
};

for (const viewport of [ETROIT, TELEPHONE]) {
  const gabarit = `${viewport.width}×${viewport.height}`;
  console.log(`\n  ${gabarit}`);

  for (const etat of ETATS) {
    const { page, context, pret, atteint, erreurs } = await ouvre(etat, viewport);
    check(pret, `${gabarit} · ${etat.nom} : l'écran se rend`);
    check(atteint, `${gabarit} · ${etat.nom} : l'état mesuré est atteint`);

    if (!atteint) {
      await context.close();
      continue;
    }

    if (CAPTURE_DIR !== null) {
      await page.screenshot({ path: join(CAPTURE_DIR, `${slug(etat.nom)}.${viewport.width}x${viewport.height}.png`) });
    }

    const mesure = await page.evaluate((selecteur) => {
      const cible = document.querySelector(selecteur);
      if (cible === null) return null;
      const r = cible.getBoundingClientRect();
      return {
        bas: Math.round(r.bottom),
        haut: Math.round(r.top),
        hauteur: Math.round(r.height),
        texte: (cible.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        debord: document.documentElement.scrollWidth - window.innerWidth,
      };
    }, etat.primaire);

    if (mesure === null) {
      check(false, `${gabarit} · ${etat.nom} : l'action primaire (${etat.primaire}) existe`);
      await context.close();
      continue;
    }

    /* LE CRITÈRE DE FIN : le bas de l'action primaire ne dépasse pas le bas de
       l'écran. Pas « visible après défilement » — DANS le premier écran. */
    check(
      mesure.bas <= viewport.height,
      `${gabarit} · ${etat.nom} : « ${mesure.texte} » tient dans le premier écran (bas ${mesure.bas} ≤ ${viewport.height})`,
    );
    check(
      mesure.hauteur >= CIBLE_MIN,
      `${gabarit} · ${etat.nom} : l'action primaire fait au moins ${CIBLE_MIN} px (obtenu ${mesure.hauteur})`,
    );
    check(mesure.debord <= 0, `${gabarit} · ${etat.nom} : aucun débordement horizontal (obtenu ${mesure.debord} px)`);
    check(erreurs.length === 0, `${gabarit} · ${etat.nom} : aucune erreur de page (${erreurs.join(' | ') || 'aucune'})`);

    if (etat.garde !== undefined) {
      const garde = await page.locator(etat.garde).count();
      check(garde > 0, `${gabarit} · ${etat.nom} : le formulaire est GARDÉ après le refus`);
    }
    if (etat.absent !== undefined) {
      const absent = await page.locator(etat.absent).count();
      check(absent === 0, `${gabarit} · ${etat.nom} : aucun formulaire d'invité n'est offert`);
    }

    bilan.push({ gabarit, etat: etat.nom, bas: mesure.bas, hauteur: mesure.hauteur, marge: viewport.height - mesure.bas });
    await context.close();
  }
}

await browser.close();
server.close();

console.log('\n  action primaire — bas (marge sous elle)');
for (const ligne of bilan) {
  console.log(`    ${`${ligne.gabarit} ${ligne.etat}`.padEnd(58)} bas ${String(ligne.bas).padStart(4)} px · marge ${ligne.marge} px`);
}

if (failures.length > 0) {
  console.error(`\ncheck-join-first-screen : ${failures.length} échec(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `\ncheck-join-first-screen : vert — ${ETATS.length} états de /chat/:lien × 2 gabarits, l'action primaire dans le premier écran partout.\n`,
);
