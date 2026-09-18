#!/usr/bin/env node
/**
 * CHAQUE PAGE D'ACCÈS TIENT DANS LA COLONNE CENTRÉE DE LA CONNEXION, SUR
 * TABLETTE COMME SUR ORDINATEUR (#6643).
 *
 * Directive porteur 2026-09-15 : « Les pages doivent être responsives et même
 * sur tablette ou ordinateur avoir le style de la page de connexion (au
 * centre) […] Les pages d'inscription, reset de mot de passe, 2FA, MFA doivent
 * être centrées même hors smartphone ! »
 *
 * CE QU'IL APPELLE « LA COLONNE » — sans lire aucun marqueur posé par le code
 * qu'il juge : le PLUS PETIT ANCÊTRE COMMUN de tout ce qui se lit ou se touche
 * dans l'écran (un nœud texte, un champ, un bouton, un lien), hors de ce qui
 * est `aria-hidden` (le halo d'ambiance) et de ce qui ne mesure qu'un pixel
 * (le texte `sr-only`). Un écran qui s'étale a pour ancêtre commun sa racine
 * pleine largeur ; un écran rangé dans la colonne a la colonne. Un témoin qui
 * chercherait un attribut rougirait sur son absence, pas sur la géométrie.
 *
 * CE QU'IL MESURE, pour chaque page et chaque état d'accès :
 *   1. à 1440 × 900 et 834 × 1194, la colonne est CENTRÉE (écart entre la
 *      marge gauche et la marge droite ≤ 1 px) et PAS PLUS LARGE que celle de
 *      la connexion, mesurée dans la même passe au même gabarit ;
 *   2. à 390 × 844, rien ne change pour le téléphone : la colonne est centrée
 *      et mesure exactement ce qu'elle mesure sur tablette — une borne posée
 *      au seul téléphone (une colonne qui y rétrécit) y rougirait ;
 *   3. aucun gabarit ne défile horizontalement ;
 *   4. la colonne de la connexion elle-même ne dépasse pas `max-w-sm` (384 px)
 *      — sans cette borne absolue, élargir la référence verdirait tout ;
 *   5. chaque ACTION PEINTE de l'écran (bouton ou lien à fond, d'au moins
 *      44 px de haut, posé dans un empilement vertical) prend la largeur de
 *      son conteneur, et son libellé n'en déborde pas (#6679). La vérification
 *      d'e-mail rendait « Vérifier » dans un carré de 56 px au libellé coupé,
 *      sans qu'aucune colonne ne sorte de ses marges : les points 1 à 4 ne
 *      pouvaient pas le voir.
 *
 * LES ÉTATS QUI NE S'ATTEIGNENT QU'APRÈS UNE RÉPONSE DU SERVEUR (second
 * facteur, e-mail envoyé, lien vérifié, mot de passe enregistré) sont servis
 * par des réponses SIMULÉES au niveau du navigateur : aucun gate ne dépend du
 * staging. Toute autre requête sortante est refusée.
 *
 * `CAPTURE_DIR=<dossier>` écrit une capture de chaque état à 1440 × 900, en
 * clair ET en sombre.
 */
import { mkdir } from 'node:fs/promises';
import { join, normalize } from 'node:path';

import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

/** `max-w-sm` de Tailwind : 24rem. */
const COLONNE_CONNEXION_MAX = 384;
const TOLERANCE = 1;
const ORDINATEUR = { width: 1440, height: 900 };
const TABLETTE = { width: 834, height: 1194 };
const TELEPHONE = { width: 390, height: 844 };
const EMAIL = 'ada@meeshy.example';

const DIST = new URL('../dist/', import.meta.url).pathname;
/* Le serveur vit dans `lib/` depuis #6988 : celui qui était écrit ici
   repliait TOUT sur `index.html`, y compris un `/assets/*.js` dont la lecture
   échouait — le navigateur rendait alors « Failed to fetch dynamically imported
   module » pour une panne transitoire, sans aucune trace au journal. */
const served = await startDistServer(DIST);
const BASE = served.base;

const CAPTURE_DIR = process.env.CAPTURE_DIR ?? null;
if (CAPTURE_DIR !== null) await mkdir(CAPTURE_DIR, { recursive: true });

/**
 * LES RÉPONSES DE LA PASSERELLE, par méthode et chemin. `'suspendue'` retient
 * la requête : l'écran reste dans l'état qui l'attend (« Vérification du
 * lien… »).
 */
const ok = (data) => ({ status: 200, body: { success: true, data } });
const REPONSES = {
  'POST /api/v1/auth/login': ok({
    requires2FA: true,
    twoFactorToken: 'jeton-du-temoin',
    user: { id: '0'.repeat(24), username: 'ada', email: EMAIL, firstName: 'Ada', lastName: 'Lovelace', displayName: 'Ada', avatar: null },
    message: 'Code requis',
  }),
  'POST /api/v1/auth/forgot-password': ok({ message: 'ok' }),
  'GET /api/v1/auth/reset-password/verify-token': ok({ valid: true }),
  'POST /api/v1/auth/reset-password': ok({ message: 'ok' }),
  'POST /api/v1/auth/magic-link/request': ok({ expiresInSeconds: 600 }),
  'POST /api/v1/auth/magic-link/validate': 'suspendue',
  'POST /api/v1/auth/verify-email': ok({ message: 'ok' }),
};

const remplit = async (page, champs) => {
  for (const [selecteur, valeur] of champs) await page.fill(selecteur, valeur);
};
const envoie = (page) => page.click('button[type="submit"]');

/**
 * LES PAGES ET ÉTATS D'ACCÈS. `pret` dit que l'écran est rendu ; `geste` mène
 * à l'état mesuré ; `fin` (sélecteur) ou `disparait` dit qu'il est atteint.
 * Aucun libellé n'y sert de repère : le vocabulaire change dans ce même lot.
 */
const REFERENCE = { nom: 'connexion — e-mail (porte par défaut)', chemin: '/login', pret: '#magic-link-email' };
const ETATS = [
  REFERENCE,
  { nom: 'connexion — mot de passe', chemin: '/login?methode=password', pret: '#login-username' },
  {
    nom: 'connexion — double authentification',
    chemin: '/login?methode=password',
    pret: '#login-username',
    geste: async (page) => {
      await remplit(page, [['#login-username', 'ada'], ['#login-password', 'secret-du-temoin']]);
      await envoie(page);
    },
    fin: '#login-2fa-code',
  },
  { nom: 'accueil', chemin: '/welcome', pret: 'a[href="/signup"]' },
  { nom: 'inscription', chemin: '/signup', pret: '#signup-email' },
  {
    nom: 'inscription — dépliée',
    chemin: '/signup',
    pret: '#signup-email',
    /* Une adresse valide déplie l'identité, le mot de passe, la langue et le
       bouton (D-72, deux barreaux) : c'est l'état le plus long de la page. */
    geste: async (page) => {
      await remplit(page, [['#signup-email', EMAIL]]);
    },
    fin: '#signup-password',
  },
  { nom: 'mot de passe oublié', chemin: '/forgot-password', pret: '#forgot-email' },
  {
    nom: 'mot de passe oublié — e-mail envoyé',
    chemin: '/forgot-password',
    pret: '#forgot-email',
    geste: async (page) => {
      await remplit(page, [['#forgot-email', EMAIL]]);
      await envoie(page);
    },
    disparait: '#forgot-email',
  },
  { nom: 'nouveau mot de passe — saisie', chemin: '/reset-password?token=jeton-du-temoin', pret: '#reset-password' },
  {
    nom: 'nouveau mot de passe — enregistré',
    chemin: '/reset-password?token=jeton-du-temoin',
    pret: '#reset-password',
    geste: async (page) => {
      await remplit(page, [['#reset-password', 'Sup3r!Secret1'], ['#reset-password-confirm', 'Sup3r!Secret1']]);
      await envoie(page);
    },
    fin: '[role="status"]',
  },
  { nom: 'nouveau mot de passe — lien invalide', chemin: '/reset-password', pret: 'a[href="/forgot-password"]' },
  { nom: 'lien par e-mail — demande', chemin: '/auth/magic-link', pret: '#magic-link-email' },
  {
    nom: 'lien par e-mail — envoyé',
    chemin: '/auth/magic-link',
    pret: '#magic-link-email',
    geste: async (page) => {
      await remplit(page, [['#magic-link-email', EMAIL]]);
      await envoie(page);
    },
    fin: '[role="timer"]',
  },
  { nom: 'lien par e-mail — validation en cours', chemin: '/auth/magic-link?token=jeton-du-temoin', pret: '[aria-busy="true"]' },
  { nom: 'lien par e-mail — lien invalide', chemin: '/auth/magic-link/validate', pret: 'a[href="/auth/magic-link"]' },
  { nom: 'vérification d’e-mail — code', chemin: `/auth/verify-email?email=${encodeURIComponent(EMAIL)}`, pret: '#verify-email-code' },
  {
    nom: 'vérification d’e-mail — vérifiée',
    chemin: `/auth/verify-email?email=${encodeURIComponent(EMAIL)}`,
    pret: '#verify-email-code',
    geste: async (page) => {
      await remplit(page, [['#verify-email-code', '123456']]);
      await envoie(page);
    },
    fin: '[role="status"]',
  },
  { nom: 'vérification d’e-mail — sans adresse', chemin: '/auth/verify-email', pret: 'a[href="/login"]' },
];

const browser = await launchChromium();
const failures = [];
const constate = (vrai, quoi) => {
  if (!vrai) failures.push(quoi);
};

/** La colonne, dans la page — voir le doc-comment de tête. */
const mesureColonne = (page) =>
  page.evaluate(() => {
    const coque = document.querySelector('a.skip-link')?.parentElement ?? null;
    const aire = (el) => {
      const r = el.getBoundingClientRect();
      return r.width * r.height;
    };
    const ecran =
      coque === null
        ? null
        : [...coque.children].filter((el) => !el.matches('a.skip-link, .floating-menus')).sort((a, b) => aire(b) - aire(a))[0] ?? null;
    if (ecran === null) return null;

    const perceptibles = [ecran, ...ecran.querySelectorAll('*')].filter((el) => {
      if (el.closest('[aria-hidden="true"]') !== null) return false;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 || r.height <= 1) return false;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      const porteTexte = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      return porteTexte || el.matches('input, textarea, select, button, a');
    });
    if (perceptibles.length === 0) return { perceptibles: 0 };

    const lignee = (el) => {
      const chaine = [];
      for (let n = el; n !== null; n = n.parentElement) chaine.unshift(n);
      return chaine;
    };
    const commun = perceptibles.slice(1).reduce((acc, el) => {
      const autre = lignee(el);
      let i = 0;
      while (i < acc.length && i < autre.length && acc[i] === autre[i]) i += 1;
      return acc.slice(0, i);
    }, lignee(perceptibles[0]));
    const colonne = commun[commun.length - 1];
    const r = colonne.getBoundingClientRect();
    /* Un fond peint distingue l'action principale d'un lien de texte ; un
       empilement vertical écarte les puces posées en rangée (l'indicatif du
       téléphone de l'inscription), qui n'ont pas à prendre toute la largeur. */
    const peinte = (style) => style.backgroundImage !== 'none' || !['rgba(0, 0, 0, 0)', 'transparent'].includes(style.backgroundColor);
    const empileVerticalement = (parent) => {
      const s = getComputedStyle(parent);
      if (s.display === 'block') return true;
      if (s.display.endsWith('flex')) return s.flexDirection.startsWith('column');
      if (s.display.endsWith('grid')) return s.gridTemplateColumns.trim().split(/\s+/).length === 1;
      return false;
    };
    const actions = perceptibles
      .filter(
        (el) =>
          el.matches('button, a') &&
          el.getBoundingClientRect().height >= 44 &&
          peinte(getComputedStyle(el)) &&
          el.parentElement !== null &&
          empileVerticalement(el.parentElement),
      )
      .map((el) => {
        const s = getComputedStyle(el.parentElement);
        return {
          libelle: (el.textContent ?? '').trim().slice(0, 40),
          largeur: el.getBoundingClientRect().width,
          conteneur: el.parentElement.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
          debordLibelle: el.scrollWidth - el.clientWidth,
        };
      });
    return {
      perceptibles: perceptibles.length,
      gauche: r.left,
      droite: innerWidth - r.right,
      largeur: r.width,
      debord: document.documentElement.scrollWidth - innerWidth,
      actions,
      element: `${colonne.tagName.toLowerCase()}.${[...colonne.classList].slice(0, 6).join('.')}`,
    };
  });

const cors = (request) => ({
  'access-control-allow-origin': request.headers().origin ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': request.headers()['access-control-request-headers'] ?? 'content-type, authorization',
});

const ouvre = async (etat, viewport, scheme) => {
  const context = await browser.newContext({ viewport, colorScheme: scheme });
  const retenues = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === BASE) return route.continue();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors(request) });
    const reponse = REPONSES[`${request.method()} ${url.pathname}`];
    if (reponse === undefined) return route.abort();
    if (reponse === 'suspendue') {
      retenues.push(route);
      return undefined;
    }
    return route.fulfill({
      status: reponse.status,
      contentType: 'application/json',
      headers: cors(request),
      body: JSON.stringify(reponse.body),
    });
  });
  const page = await context.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  const ferme = async () => {
    await Promise.all(retenues.map((route) => route.abort().catch(() => undefined)));
    await context.close();
  };

  await page.goto(`${BASE}${etat.chemin}`, { waitUntil: 'load' });
  const pret = await page.waitForSelector(etat.pret, { timeout: 8_000 }).then(() => true, () => false);
  if (!pret) return { page, ferme, atteint: false, erreurs };
  if (etat.geste !== undefined) await etat.geste(page);
  const atteint =
    etat.fin !== undefined
      ? await page.waitForSelector(etat.fin, { timeout: 8_000 }).then(() => true, () => false)
      : etat.disparait !== undefined
        ? await page.waitForSelector(etat.disparait, { state: 'detached', timeout: 8_000 }).then(() => true, () => false)
        : true;
  /* Les barreaux de l'inscription et les états qui paraissent s'ANIMENT
     (ressort de `RungReveal`) : la géométrie se lit une fois posée. */
  await page.waitForTimeout(400);
  return { page, ferme, atteint, erreurs };
};

const slug = (nom) =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const bilan = [];
/** La largeur de chaque colonne à 834 × 1194 — le téléphone doit recevoir la
 * MÊME : c'est ce que « rien ne change à 390 » veut dire pour une colonne
 * bornée à 384 px, et ce qui rougirait sur une borne posée au seul téléphone. */
const largeurTablette = new Map();

for (const viewport of [ORDINATEUR, TABLETTE, TELEPHONE]) {
  const gabarit = `${viewport.width}×${viewport.height}`;
  const estTelephone = viewport === TELEPHONE;
  const capture = CAPTURE_DIR !== null && viewport === ORDINATEUR;
  const schemes = capture ? ['light', 'dark'] : ['light'];
  let reference = null;

  for (const etat of ETATS) {
    for (const scheme of schemes) {
      const tag = `${etat.nom} @ ${gabarit}`;
      const { page, ferme, atteint, erreurs } = await ouvre(etat, viewport, scheme);
      if (!atteint) {
        if (scheme === 'light') constate(false, `${tag} : l'état n'est pas atteint (${etat.fin ?? etat.disparait ?? etat.pret}) — le témoin ne mesure rien`);
        await ferme();
        continue;
      }
      if (capture) await page.screenshot({ path: join(CAPTURE_DIR, `${slug(etat.nom)}.${scheme}.${viewport.width}x${viewport.height}.png`) });
      if (scheme !== 'light') {
        await ferme();
        continue;
      }

      const m = await mesureColonne(page);
      await ferme();
      constate(erreurs.length === 0, `${tag} : erreur de page — ${erreurs.join(' | ')}`);
      if (m === null || m.perceptibles === 0) {
        constate(false, `${tag} : aucun contenu perceptible trouvé — le témoin ne mesure rien`);
        continue;
      }
      if (etat === REFERENCE) {
        reference = m;
        constate(
          m.largeur <= Math.min(COLONNE_CONNEXION_MAX, viewport.width) + TOLERANCE,
          `${tag} : la colonne de la connexion mesure ${m.largeur.toFixed(1)} px, au-delà de max-w-sm (${COLONNE_CONNEXION_MAX})`,
        );
      }
      const ecart = Math.abs(m.gauche - m.droite);
      bilan.push({ etat: etat.nom, gabarit, largeur: Math.round(m.largeur), gauche: Math.round(m.gauche), droite: Math.round(m.droite) });
      constate(m.debord <= 0, `${tag} : la page défile horizontalement (${m.debord} px de trop)`);
      for (const a of m.actions) {
        constate(a.debordLibelle <= TOLERANCE, `${tag} : le libellé « ${a.libelle} » déborde de son bouton de ${a.debordLibelle} px`);
        constate(
          a.conteneur - a.largeur <= TOLERANCE,
          `${tag} : « ${a.libelle} » mesure ${a.largeur.toFixed(1)} px dans un conteneur de ${a.conteneur.toFixed(1)} px — l'action ne prend pas la largeur de sa colonne`,
        );
      }
      constate(
        ecart <= TOLERANCE,
        `${tag} : la colonne n'est pas centrée — marge gauche ${m.gauche.toFixed(1)} px, droite ${m.droite.toFixed(1)} px (${m.element})`,
      );
      if (viewport === TABLETTE) largeurTablette.set(etat.nom, m.largeur);
      if (reference === null) continue;
      if (estTelephone) {
        const tablette = largeurTablette.get(etat.nom);
        constate(
          tablette !== undefined && Math.abs(m.largeur - tablette) <= TOLERANCE,
          `${tag} : sur téléphone la colonne mesure ${m.largeur.toFixed(1)} px, sur tablette ${tablette?.toFixed(1) ?? '—'} — ` +
            `le téléphone ne reçoit pas la même colonne (${m.element})`,
        );
      } else {
        constate(
          m.largeur <= reference.largeur + TOLERANCE,
          `${tag} : la colonne s'étale sur ${m.largeur.toFixed(1)} px, plus large que celle de la connexion (${reference.largeur.toFixed(1)}) (${m.element})`,
        );
      }
    }
  }
}

await browser.close();
served.close();

const largeurDe = new Map();
for (const ligne of bilan) {
  const cle = ligne.etat;
  largeurDe.set(cle, [...(largeurDe.get(cle) ?? []), `${ligne.gabarit} ${ligne.largeur} px (${ligne.gauche}/${ligne.droite})`]);
}
console.log('\n  colonne mesurée — largeur (marge gauche/droite)');
for (const [etat, mesures] of largeurDe) console.log(`    ${etat.padEnd(42)} ${mesures.join(' · ')}`);

if (failures.length > 0) {
  console.error(`\ncheck-access-column : ${failures.length} échec(s)`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `\ncheck-access-column : vert — ${ETATS.length} états d'accès × 3 gabarits, chaque colonne centrée et pas plus large que celle de la connexion.\n`,
);
