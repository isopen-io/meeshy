/**
 * 13 — UN MÉDIA ABSENT DÉGRADE PROPREMENT, ET NE SE REDEMANDE PLUS (#7022).
 *
 * CE QUI EST MESURÉ EN PRODUCTION. 8 fichiers sur 2912 sont réellement absents
 * du volume (`docker exec meeshy-gateway`, boucle sur `filePath`, 2026-09-18).
 * Le cadrage du lot en annonçait 582 ; c'est faux, et c'est dit dans l'issue —
 * la mesure initiale lisait `fileUrl` comme un chemin de disque, ce qui
 * comptait 574 formes percent-encodées comme des absences. Le nombre change
 * l'ampleur du symptôme, jamais le devoir : une référence morte doit rendre un
 * état DESSINÉ, SILENCIEUX, et ne plus rien redemander.
 *
 * POURQUOI CE GATE NE FAIT PAS TOMBER UNE VRAIE REQUÊTE, et c'est une limite à
 * dire plutôt qu'à taire : **aucun média des fixtures de web-v2 n'est servi par
 * le réseau.** Ils sont tous `data:` — vérifié sur `fixtures-feed.ts`
 * (`feedPhotoStandIn`), `fixtures-stories.ts` (`STORY_PHOTO_STAND_IN`,
 * `REEL_CLIP_RGB`) et `fixtures-media.ts` (`MEDIA_BROKEN_IMAGE_DATA_URI`). Un
 * `page.route()` n'intercepte pas un `data:`, et il n'y a donc, dans le corpus
 * actuel, AUCUN 404 à observer. Ajouter une fixture servie par le réseau
 * toucherait des fichiers que six autres lots travaillent — c'est une suite
 * nommée dans l'issue, pas un raccourci pris ici en silence.
 *
 * CE QU'IL FAIT À LA PLACE, et pourquoi ce n'est pas un stub : il envoie un
 * évènement `error` RÉEL sur l'élément RÉEL que la route a monté. C'est
 * exactement l'évènement que le navigateur émet quand les octets ne viennent
 * pas — même type, même cible, même gestionnaire. Ce qui est mesuré ensuite est
 * la réponse de l'application entière, dans un vrai navigateur.
 *
 * ET IL MESURE CE QU'AUCUN TÉMOIN UNITAIRE NE PEUT VOIR — la survie à un
 * changement de ROUTE. Les témoins de `media-absent-surfaces.test.tsx`
 * démontent un composant ; ici on quitte l'écran, on charge un autre chunk, et
 * on revient. C'est le vrai geste de l'utilisateur, et c'est là que tout état
 * local se perd.
 *
 * `serviceWorker: false` — ce gate ne mesure pas le précache.
 */
import { contrastOf } from './lib/contrast.mjs';
import { launchChromium } from './lib/browser.mjs';
import { startDistServer } from './lib/gate-server.mjs';

const DIST = new URL('../dist/', import.meta.url).pathname;
const served = await startDistServer(DIST, { serviceWorker: false });
const BASE = served.base;

/** Le plancher AA pour du texte non agrandi. */
const AA_THRESHOLD = 4.5;

/** La story IMAGE des fixtures — la seule surface du corpus qui monte une
 * `<img>` de média dans une scène, donc la seule où l'échec s'observe. */
const STORY = 'st-amie-2';

const failures = [];
let invariants = 0;
const check = (ok, what) => {
  invariants += 1;
  if (!ok) failures.push(what);
};

const browser = await launchChromium();
const context = await browser.newContext({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });
const page = await context.newPage();

/** L'état de la scène, lu au DOM — jamais une capture d'écran : ce qui est
 * interrogé est ce qui EXISTE, pas ce qui est peint à un pixel près. */
const lireScene = () =>
  page.evaluate(() => {
    const dessiné = document.querySelector('[data-media-unavailable]');
    return {
      images: document.querySelectorAll('img[src]:not([src=""])').length,
      dessiné: dessiné === null ? null : dessiné.getAttribute('data-media-unavailable'),
      annonce: dessiné === null ? null : dessiné.getAttribute('aria-label'),
      rôle: dessiné === null ? null : dessiné.getAttribute('role'),
      /* Le CHROME de la story : la barre de progression et l'auteur. S'il
         disparaît avec le média, la dégradation n'est plus « propre » — elle
         a emporté l'écran. */
      chrome: document.body.innerText.trim().length,
      boutons: document.querySelectorAll('[data-media-unavailable] button').length,
    };
  });

/** Fait échouer le média monté, comme le ferait un fichier absent. */
const casserLeMedia = () =>
  page.evaluate(() => {
    const el = document.querySelector('img[src]:not([src=""])') ?? document.querySelector('video[src]');
    if (el === null) return false;
    el.dispatchEvent(new Event('error'));
    return true;
  });

await page.goto(`${BASE}/story/${STORY}`, { waitUntil: 'load' });
await page.waitForSelector('img[src]', { timeout: 15_000 });

/* ── 1. AVANT L'ÉCHEC — rien n'est masqué par précaution ─────────────────── */
const avant = await lireScene();
check(
  avant.images >= 1 && avant.dessiné === null,
  `avant tout échec, la story devrait SERVIR son image : ${JSON.stringify(avant)}`,
);
const chromeAvant = avant.chrome;

/* ── 2. L'ÉCHEC — l'état dessiné prend la place, et rien d'autre ne bouge ── */
check(await casserLeMedia(), 'aucun élément média à faire échouer — la fixture a changé de forme');
await page.waitForTimeout(250);
const après = await lireScene();

check(
  après.dessiné !== null,
  `après l'échec, aucun état DESSINÉ : le média absent laisse un trou ou l'icône de lien brisé — ${JSON.stringify(après)}`,
);
check(
  après.images === 0,
  `l'image MORTE est encore dans le document après l'échec (${après.images}) — le navigateur y peint son icône de lien brisé`,
);
check(
  après.rôle === 'img' && typeof après.annonce === 'string' && après.annonce.length > 0,
  `l'état dessiné est MUET pour un lecteur d'écran — rôle « ${après.rôle} », annonce « ${après.annonce} » (dimension 5)`,
);
check(
  après.annonce !== 'media.unavailable',
  `l'annonce sert la CLÉ du catalogue au lieu de sa traduction : « ${après.annonce} »`,
);
check(
  après.boutons === 0,
  `l'état dessiné porte ${après.boutons} bouton(s) — il n'y a RIEN à retenter sur des octets disparus (loi 4)`,
);
check(
  après.chrome >= chromeAvant,
  `le CHROME de la story a rétréci avec le média (${chromeAvant} → ${après.chrome}) : la dégradation a emporté l'écran autour`,
);

/* ── 3. LISIBLE — le libellé se lit sur la scène, qui est sombre ─────────── */
const contraste = await contrastOf(page, '[data-media-unavailable] p');
check(
  contraste !== null && contraste >= AA_THRESHOLD,
  `le libellé « média indisponible » est à ${contraste === null ? 'introuvable' : `${contraste.toFixed(2)}:1`} sur la scène — plancher AA ${AA_THRESHOLD}:1`,
);

/* ── 4. LE CŒUR DU LOT — la connaissance SURVIT au changement de route ─────
 *
 * EN NAVIGATION D'APPLICATION, jamais par `page.goto`. La distinction n'est pas
 * un détail de gate, c'est la définition même de ce qui est mesuré : `goto`
 * RECHARGE le document, donc détruit le contexte JavaScript — le registre s'y
 * vide légitimement, comme au premier lancement. Le premier jet de ce gate le
 * faisait, et il rougissait sur du code juste : il mesurait « un rechargement
 * oublie », ce que personne ne conteste.
 *
 * Ce que l'utilisateur fait, lui, c'est quitter l'écran et y revenir SANS
 * quitter l'application — et c'est là qu'un état local se perd pendant que la
 * session, elle, dure. Vérifié : après `pushState` + `popstate` puis
 * `goBack()`, un marqueur posé sur `window` survit aux deux sauts, et le
 * routeur a bien changé d'écran entre-temps.
 */
await page.evaluate(() => {
  history.pushState({}, '', '/stories');
  dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForSelector('text=Stories', { timeout: 15_000 });
await page.goBack();
await page.waitForTimeout(600);
const auRetour = await lireScene();

/**
 * ET CE QUE CE GATE NE PEUT PAS MESURER — dit ici, en témoin, plutôt que caché
 * dans un commentaire.
 *
 * Le média de cette fixture est un `data:` (`STORY_PHOTO_STAND_IN`), comme TOUS
 * les médias du corpus. Or le registre refuse délibérément `data:` et `blob:` :
 * son travail est d'épargner une REQUÊTE RÉSEAU, et une URL de données n'en
 * coûte aucune — la retenir remplirait un cache borné d'adresses qui ne
 * reviendront jamais, en évinçant les absences réelles.
 *
 * Au retour, la surface REDEMANDE donc son `data:`, et c'est juste. La survie
 * de la connaissance à travers un démontage — le cœur du lot — se mesure sur
 * une source de RÉSEAU, ce que le corpus ne porte pas : elle est gardée par
 * `media-absent-surfaces.test.tsx`, qui monte les trois surfaces sur de vraies
 * URLs, envoie de vrais `error`, démonte et remonte.
 *
 * Ce témoin fige donc la frontière, pour qu'elle se voie : le jour où une
 * fixture servie par le réseau entre dans le corpus, il TOMBE, et la bonne
 * réaction sera de mesurer ici la survie qu'on ne peut aujourd'hui qu'affirmer
 * ailleurs.
 */
check(
  auRetour.images === 1 && auRetour.dessiné === null,
  `un média \`data:\` devrait être RE-TENTÉ au retour (il ne coûte aucune requête, donc n'entre pas au registre) : ` +
    `${JSON.stringify(auRetour)} — si cette fixture est passée au réseau, mesurer ici la SURVIE (images === 0).`,
);

/* ── 5. CONTRE-ÉPREUVE — le registre ne masque QUE ce qui a échoué ─────────
 *
 * Sans elle, « masquer tous les médias » passerait au vert. Elle se joue dans
 * la MÊME session (le registre porte encore l'échec du § 2), donc en navigation
 * d'application elle aussi. */
await page.evaluate(() => {
  history.pushState({}, '', '/story/st-video');
  dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForTimeout(600);
const voisine = await page.evaluate(() => ({
  medias: document.querySelectorAll('video[src], img[src]:not([src=""])').length,
  dessiné: document.querySelector('[data-media-unavailable]') !== null,
}));

check(
  voisine.medias >= 1 && !voisine.dessiné,
  `une AUTRE story, dont le média est vivant, est masquée elle aussi : ${JSON.stringify(voisine)} — ` +
    'le registre retiendrait des sources au lieu de retenir des échecs.',
);

await context.close();
await browser.close();
served.close();

if (failures.length > 0) {
  console.error(`check-medias-absents : ${failures.length} échec(s) sur ${invariants} invariants`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(
  `check-medias-absents : vert — ${invariants} invariants : un média dont les octets ne viennent pas rend un état DESSINÉ, ` +
    'ANNONCÉ, lisible sur la scène et SANS bouton ; le chrome de la story reste entier ; une story voisine, vivante, ' +
    "charge normalement. La SURVIE de la connaissance à un démontage n'est PAS mesurée ici — tous les médias du corpus " +
    'sont des `data:`, qui ne coûtent aucune requête et n\'entrent donc pas au registre ; elle est gardée par ' +
    '`media-absent-surfaces.test.tsx`, sur de vraies URLs.',
);
