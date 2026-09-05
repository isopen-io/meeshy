// LE PÉRIMÈTRE DE LA ZONE v3 — UN site, et ce n'est pas une liste tapée à la main.
//
// § 4.9 : ce que la v3 SERT grandit d'une étape de bascule à l'autre, et le seul geste de la
// bascule est l'ajout d'un `PathPrefix` à la règle Traefik du routeur `frontend-v3`. Cette règle
// EST donc la liste ; toute autre en serait la jumelle, et une jumelle en retard laisserait
// passer un `<Link>` vers une route que le legacy sert encore — un lien mort, et le lint vert.
//
// « UN site » se dit au sens FORT côté v3 : ce fichier est le seul parseur de cette règle pour
// le lint ET pour le garde de la chaîne. `scripts/check-v3-pipeline.mjs` en portait un second —
// `claimedPathsOf` + `captures` — et les deux ne se contentaient pas de dupliquer la lecture :
// ils la CONTREDISAIENT. Le parseur d'ici ne reconnaissait que `PathPrefix(…)` et jetait
// `Path(…)` en silence, et son prédicat comparait contre `` `${prefixe}/` `` — donc `` `//` ``
// dès que l'étape 7 met `/` dans la règle, ce qui rendait CHAQUE `<Link>` de l'application
// fautif à l'étape même où `<Link>` devient universel. Le garde de la chaîne consomme désormais
// `cheminsReclames` / `capture` d'ici [revue #4414].
//
// IL RESTE UNE TROISIÈME LECTURE — et ce qu'elle annonçait est ARRIVÉ.
// `apps/web/__tests__/public/sw.v3-zone.test.ts` lit la MÊME ligne. Le paragraphe qui vivait ici
// disait : « le gate d'anti-divergence sous-compterait les chemins le jour où un `Path(…)`
// entrerait dans la règle ». Ce jour a été le 2026-09-01 : la vitrine a basculé sur staging par
// un `Path(`/`)`, et le seul chemin humain de la zone est resté invisible à ce lecteur — donc
// hors de `V3_ZONE_PREFIXES`, donc intercepté par le worker legacy chez tout visiteur revenant.
// Le risque énoncé n'avait pas de témoin : l'énoncer n'était pas le garder.
//
// Ce qui a changé depuis : ce lecteur reconnaît désormais les DEUX matchers et lit les DEUX
// déploiements, et surtout il a cessé d'être le gate d'anti-divergence. Ce rôle est passé à
// `scripts/check-v3-pipeline.mjs` — invariant « le worker legacy s'efface devant ce que la règle
// réclame », posé une fois PAR DÉPLOIEMENT et qui EXÉCUTE `belongsToV3Zone` au lieu de la
// recopier. Le témoin de `apps/web` garde ce qu'il est seul à pouvoir garder : le COMPORTEMENT du
// listener. La fusion complète de la lecture reste une décision de PLACEMENT — faire dépendre
// l'arbre de tests de l'app qui sert le trafic d'un module de `apps/web-v3` — et non un correctif
// de revue ; elle n'est simplement plus ce qui protège l'invariant.
//
// POURQUOI ICI, ET PAS À LA RACINE. La donnée lue est bien un fichier d'infrastructure de la
// racine, et `scripts/lib/` y serait l'adresse naturelle — mais l'invariant (i) de
// `scripts/check-v3-pipeline.mjs` interdit à tout fichier de `apps/web-v3/` d'atteindre le disque
// hors de son paquet par un chemin RELATIF (l'étage builder du Dockerfile ne copie que
// `apps/web-v3/`, donc un `../../scripts/lib/…` manquerait dans l'image). `eslint.config.mjs`
// devrait franchir cette frontière pour lire un module de la racine ; un garde de la racine, lui,
// descend sans rien casser. Le site unique vit donc du côté CONTRAINT, et la dépendance va dans
// le seul sens qui reste : racine → v3.
//
// `V3_ZONE_PREFIXES` (`apps/web/public/sw.js`) n'est PAS une source acceptable ici, et le fait
// qu'elle porte la même donnée ne suffit pas : le § 4.4 bis lui impose d'être en AVANCE sur le
// routeur (un préfixe y entre par un commit ANTÉRIEUR, pour que le worker legacy ait cessé
// d'intercepter avant que Traefik ne bascule). S'y fier autoriserait donc un `<Link>` pendant
// toute la fenêtre de propagation — exactement le sens dangereux. Le worker peut se retirer
// d'une route qu'il sert encore ; le lint, lui, ne peut pas anticiper.
//
// Le fichier lu est celui du DÉPÔT. Le `CLAUDE.md` racine rappelle que le compose de production
// de `/opt/meeshy/production/` en DIFFÈRE : c'est le même écart que gage déjà
// `apps/web/__tests__/public/sw.v3-zone.test.ts`, qui lit cette même ligne. Le dépôt est le
// jumeau tracké, et c'est lui que la revue oppose.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const COMPOSE_DE_PRODUCTION = 'docker-compose.prod.yml';

export const ROUTEUR_V3 = 'frontend-v3';

// Le préfixe de la zone, et la part de ce préfixe qui ne porte QUE des actifs. `next.config.ts`
// pose `assetPrefix: '/__v3'` : c'est sous `/__v3/_next` que les bundles atterrissent, et nulle
// part ailleurs. Les deux constantes vivent ici parce que la SECONDE gouverne la distinction du
// paragraphe suivant, et qu'un garde qui les redéclarerait rouvrirait la jumelle.
export const PREFIXE_DE_ZONE = '/__v3';
export const ZONE_DACTIFS = `${PREFIXE_DE_ZONE}/_next`;

// LA ZONE DU TEMPS RÉEL (conception § 12.4) : `participate.<hash>.js` et `socket.io.<hash>.js`,
// servis par `app/rt/[nom]/route.ts` — et JOIGNABLES sous `/__v3/rt/` par une RÉÉCRITURE, parce
// que Next ignore tout segment de `app/` qui commence par `_` (`next/dist/build/entries.js`,
// `ignorePartFilter: (part) => part.startsWith('_')`) : `app/__v3/…` n'est pas une route, c'est
// un dossier privé. La réécriture est déclarée ICI, une fois, et lue par `next.config.ts` (qui la
// pose) comme par `scripts/check-v3-pipeline.mjs` (qui vérifie qu'elle atterrit sur une route
// servie, et que la règle du routeur ne réclame `/__v3/rt/` qu'à ce titre). Une seconde
// déclaration serait la jumelle qui laisse la règle réclamer un chemin mort.
export const ZONE_DU_TEMPS_REEL = `${PREFIXE_DE_ZONE}/rt`;

// LE TRAVAILLEUR DE ZONE (#4473) : `.rt/sw.js`, servi par `app/sw/route.ts` et
// joignable sous `/__v3/sw` — une adresse STABLE (jamais de hash : l'URL d'un
// Service Worker est son identité ; en changer enregistre un worker NEUF au
// lieu de mettre à jour l'existant). La « nécessité de portée » qui aurait
// exigé la racine (§ 7) est levée par l'en-tête `Service-Worker-Allowed: /`
// que la route pose : le script peut vivre DANS la zone, donc sous un chemin
// que `V3_ZONE_PREFIXES` couvre déjà (`/__v3`, segment-aware) — aucune fenêtre
// de propagation legacy à payer, contrairement à un actif servi à la racine.
export const ZONE_DU_TRAVAILLEUR = `${PREFIXE_DE_ZONE}/sw`;

export const REECRITURES_DE_ZONE = Object.freeze([
  Object.freeze({ source: `${ZONE_DU_TEMPS_REEL}/:nom`, destination: '/rt/:nom' }),
  Object.freeze({ source: ZONE_DU_TRAVAILLEUR, destination: '/sw' }),
]);

// La forme ROUTE d'un motif de réécriture (`/rt/:nom` → `/rt/[nom]`) : celle sous laquelle
// `scripts/check-v3-pipeline.mjs` inventorie ce que `app/` sert.
export const routeDeReecriture = (motif) => motif.replace(/:([A-Za-z0-9_]+)/g, '[$1]');

// Les chemins que la zone sert PAR réécriture, parmi les routes servies données — sous leur
// forme route, pour entrer dans le même inventaire que `app/`.
export const cheminsServisParReecriture = (routesServies) =>
  Object.freeze(
    REECRITURES_DE_ZONE.filter(({ destination }) =>
      routesServies.includes(routeDeReecriture(destination)),
    ).map(({ source }) => routeDeReecriture(source)),
  );

const CLE_DE_LA_REGLE = (routeur) => `traefik.http.routers.${routeur}.rule=`;

// `Path` ET `PathPrefix` : les deux matchers que Traefik distingue sur un chemin, et la
// distinction n'est pas cosmétique — `Path(`/`)` ne réclame QUE `/`, `PathPrefix(`/`)` réclame
// toute l'origine. Un parseur qui n'en connaît qu'un jette l'autre sans le dire.
const CHEMIN_RECLAME = /(PathPrefix|Path)\(`([^`]+)`\)/g;

export const regleDuRouteur = (compose, routeur = ROUTEUR_V3) => {
  const lignes = compose
    .split('\n')
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne.includes(CLE_DE_LA_REGLE(routeur)));

  if (lignes.length > 1) {
    throw new Error(
      `${lignes.length} règles déclarées pour le routeur ${routeur} dans ${COMPOSE_DE_PRODUCTION} : ` +
        'le périmètre de la zone v3 serait ambigu',
    );
  }

  const [ligne] = lignes;
  if (ligne === undefined) return null;

  const regle = ligne.slice(ligne.indexOf(CLE_DE_LA_REGLE(routeur)) + CLE_DE_LA_REGLE(routeur).length);
  return regle.replace(/^"/, '').replace(/"$/, '');
};

export const cheminsReclames = (regle) =>
  Object.freeze(
    [...regle.matchAll(CHEMIN_RECLAME)].map(([, matcher, valeur]) =>
      Object.freeze({ matcher, valeur }),
    ),
  );

// Le prédicat de Traefik, et non une approximation. `Path` est une ÉGALITÉ ; `PathPrefix` est un
// PRÉFIXE DE CHAÎNE, pas un préfixe de SEGMENTS — et cette nuance a coûté deux routes vivantes.
//
// Ce prédicat a longtemps comparé contre `` `${valeur}/` ``, c'est-à-dire un préfixe segmenté :
// il tenait `/login` pour HORS de `PathPrefix(`/l`)`. Traefik, lui, y répond OUI. Mesuré sur
// staging le 2026-09-01, la règle réclamant `PathPrefix(`/l`)` : `/login`, `/links` et `/lien`
// étaient tous les trois servis par la ZONE — donc par le 404 du routeur Pages de la v3 — alors
// que le legacy les sert et que rien ne les avait basculés. `/login` est l'appel à l'action de la
// vitrine ; il était mort depuis la bascule de l'étape 2.
//
// Un modèle PLUS PRUDENT que la réalité ne protège pas : il DÉCLARE une frontière que
// l'aiguilleur ne trace pas, et tout ce qui s'appuie dessus hérite du même angle mort. Le modèle
// suit donc Traefik, et c'est le RÈGLEMENT qui doit être écrit sans ambiguïté — un `PathPrefix`
// destiné à un sous-chemin s'écrit avec sa barre finale (`/l/`), ce que garde l'invariant « aucun
// PathPrefix ne vole une route voisine » de `scripts/check-v3-pipeline.mjs`.
//
// Bénéfice de bord : le cas dégénéré disparaît de lui-même. `PathPrefix(`/`)` (étape 7) capture
// bien toute l'origine, là où la comparaison contre `` `//` `` ne capturait plus rien — le
// périmètre le plus LARGE devenait équivalent au plus étroit.
export const capture = ({ matcher, valeur }, chemin) =>
  matcher === 'Path' ? chemin === valeur : chemin.startsWith(valeur);

// LE PÉRIMÈTRE DE NAVIGATION — ce que la v3 sert à un HUMAIN, ce qui n'est pas ce que la règle
// réclame.
//
// À l'étape 1 du § 4.9, la règle ne réclame que `/__v3/_next` : « rien ne bascule, zéro trafic
// humain, seuls ses bundles sont joignables ». Prendre cette réclamation pour un périmètre de
// ROUTES fait dire au lint que `/__v3/_next/quelque-chose` est une page navigable — et le seul
// conseil qu'il puisse alors donner (« utilise `<Link>` ») est FAUX sur la seule cible qu'il
// atteigne. `scripts/check-v3-pipeline.mjs` faisait déjà cette distinction de son côté
// (`.filter(claim => !claim.value.startsWith(V3_ASSET_ZONE))`) ; elle est ici, une fois.
//
// Le périmètre de navigation est donc VIDE aujourd'hui, et c'est la vérité de l'étape 1 : aucun
// `<Link>` n'est correct, aucun `<a>` n'est de trop. Il se remplit à l'étape 2, avec `/l`.
export const perimetreDeNavigation = (compose) => {
  const regle = regleDuRouteur(compose);

  if (regle === null) {
    throw new Error(
      `la règle du routeur ${ROUTEUR_V3} est absente de ${COMPOSE_DE_PRODUCTION} : ` +
        'le périmètre de la zone v3 ne peut pas être déduit',
    );
  }

  const reclames = cheminsReclames(regle);

  if (reclames.length === 0) {
    throw new Error(
      `la règle du routeur ${ROUTEUR_V3} ne réclame aucun chemin : ${regle}`,
    );
  }

  // Tout ce que la règle réclame SOUS le préfixe de zone est un ACTIF — les bundles
  // (`/__v3/_next`) comme les modules du temps réel (`/__v3/rt/`) — jamais une page où un
  // `<Link>` mènerait. Le filtre porte donc sur le préfixe de ZONE, pas sur la seule sous-zone
  // des bundles : une sous-zone de plus ne doit pas faire apparaître une « navigation » fantôme.
  return Object.freeze(reclames.filter(({ valeur }) => !valeur.startsWith(PREFIXE_DE_ZONE)));
};

export const litLePerimetre = (racineDuDepot) =>
  perimetreDeNavigation(readFileSync(join(racineDuDepot, COMPOSE_DE_PRODUCTION), 'utf8'));

// LE COMPOSE PEUT ÊTRE HORS DU CONTEXTE, et ce n'est pas une anomalie.
//
// `eslint.config.mjs` lit la règle du routeur, qui vit à la RACINE. Or `next build` charge
// cette config, et l'étage builder du Dockerfile ne copie que `apps/web-v3/` (`.dockerignore`
// exclut de plus `docker-compose*.yml`) : dans l'image, le fichier est ABSENT. Mesuré, compose
// déplacé hors du dépôt : la passe de lint du build rend « ⨯ ESLint: ENOENT … » et ne linte
// RIEN, en sortant tout de même en RC=0. Une passe de vérification qui n'examine aucun fichier
// tout en affichant une erreur est pire qu'une passe absente : elle occupe la place de la
// vérification qu'on croit avoir, et `__tests__/workspace-contract.test.ts` exige justement que
// le build ne masque aucune erreur ESLint.
//
// D'où cette lecture TOLÉRANTE — et elle ne tolère QUE l'absence. Un compose présent mais dont
// la règle manque, est vide ou est déclarée deux fois reste une ERREUR : c'est une corruption
// du site unique, pas un contexte réduit. Seul `ENOENT` rend `null`, et `null` ne veut pas dire
// « périmètre vide » (qui est un verdict : « la v3 ne sert aucune route humaine ») mais
// « aucun verdict possible ici » — les deux appelants en tirent des conséquences différentes.
export const litLePerimetreSiPresent = (racineDuDepot) => {
  const chemin = join(racineDuDepot, COMPOSE_DE_PRODUCTION);

  const compose = (() => {
    try {
      return readFileSync(chemin, 'utf8');
    } catch (erreur) {
      if (erreur.code === 'ENOENT') return null;
      throw erreur;
    }
  })();

  return compose === null ? null : perimetreDeNavigation(compose);
};

// Ce que le lint peut JUGER : une navigation vers un chemin de l'origine courante. Une autre
// origine, une ancre, un `mailto:` ou un chemin relatif ne franchissent aucune frontière de zone
// — il n'y a rien à dire dessus, et prétendre le contraire ferait du bruit là où la règle doit
// mordre. Un `//hôte/chemin` est protocol-relative : c'est une AUTRE origine, malgré le `/`.
export const cheminDOrigine = (href) => {
  if (typeof href !== 'string') return null;
  if (!href.startsWith('/') || href.startsWith('//')) return null;

  const [chemin] = href.split(/[?#]/);
  return chemin === undefined || chemin === '' ? null : chemin;
};

export const servieParLaV3 = (chemin, perimetre) =>
  perimetre.some((reclame) => capture(reclame, chemin));
