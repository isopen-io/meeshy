#!/usr/bin/env node
// LIGNE DE BASE « AVANT » [L-0.5] — conception § 8.2 (3) et § 9.2.
//
//   node apps/web-v3/scripts/baseline.mjs \
//     https://meeshy.me/l/<token> https://meeshy.me/story/<id> …
//
// Elle mesure `apps/web` EN PRODUCTION, pas la v3 : c'est le point de comparaison
// contre lequel chaque écran v3 à venir démontre un progrès. Sans elle, « la v3
// est plus légère » reste une opinion — § 8.2 : « le progrès se démontre contre
// baseline.json, jamais contre une intuition ».
//
// LES QUATRE GESTES QU'ELLE MESURE sont ceux du rôle premier, sur les routes que
// `apps/web` sert AUJOURD'HUI (`app/l/[token]`, `app/story/[postId]`,
// `app/reel/[postId]`, `app/post/[postId]`, `app/mood/[postId]`) — jamais les
// routes de la v3, qui n'existent pas encore.
//
// CE QU'ELLE N'INVENTE PAS
//
// Les identifiants de contenu (`<token>`, `<id>`) sont des PLACEHOLDERS : mesurer
// `/story/<id>` littéralement mesurerait une page d'erreur, pas une story. Une
// cible dont le placeholder n'a pas été remplacé sort en « à établir », avec sa
// raison — comme une cible que le réseau n'a pas laissée joindre. Un fichier de
// ligne de base à moitié rempli est utile ; un fichier plein de zéros est un
// mensonge qui se compare.
//
// DANS QUELLES CONDITIONS, ET POURQUOI ELLES SONT LA MOITIÉ DE LA MESURE
//
// Le § 8.3 exprime le premier pixel utile en « 3G Fast simulé, p75 », et c'est ce
// profil que `mesure-reseau.mjs` applique au gate de la v3. Une ligne de base
// prise en fibre de datacenter, en une exécution, produirait un « AVANT » qui ne
// se compare à AUCUN « APRÈS » — le module serait partagé, ses conditions non,
// et c'est la seule chose qui rendait la comparaison licite. Le profil se lit
// donc à son site unique (`profilReseau()`) et s'ÉCRIT dans le fichier : un
// chiffre qui ne dit pas dans quelles conditions il a été pris ne s'oppose à rien.
//
// ET SUR QUOI. Cette mesure ne vaut que prise sur `https://meeshy.me` : une URL
// d'une autre origine — localhost, staging — rendrait une ligne de base verte
// qui ne dit rien de la production. La garde est ICI, une fois, plutôt que dans
// chaque hôte qui lance la commande.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cheminDe,
  mesureIndisponible,
  mesureUrls,
  profilReseau,
  raisonLisible,
} from './mesure-reseau.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = join(ICI, '..', 'e2e', 'visual', 'baseline.json');

const APEX = 'https://meeshy.me';

export const CIBLES_PRODUCTION = [
  { geste: "atterrir sur l'accueil", route: '/', url: `${APEX}/` },
  { geste: 'ouvrir un lien partagé', route: '/l/[token]', url: `${APEX}/l/<token>` },
  { geste: 'lire une story', route: '/story/[postId]', url: `${APEX}/story/<id>` },
  { geste: 'lire un réel', route: '/reel/[postId]', url: `${APEX}/reel/<id>` },
  { geste: 'lire un post et ses commentaires', route: '/post/[postId]', url: `${APEX}/post/<id>` },
  { geste: 'lire une humeur', route: '/mood/[postId]', url: `${APEX}/mood/<id>` },
];

export const commandePour = (url) => `node apps/web-v3/scripts/baseline.mjs ${url}`;

export const estPlaceholder = (url) => /<[^>]+>/.test(url);

export const estDeProduction = (url) => {
  try {
    return new URL(url).origin === APEX;
  } catch {
    return false;
  }
};

// La route D'UNE URL VIVANTE. Les six cibles sont déclarées par gabarit
// (`/story/[postId]`) et mesurées par identifiant réel (`/story/68f0c1a2`) :
// sans cette traduction, le verdict ne pourrait pas dire si les six gestes du
// rôle premier sont TOUS représentés, et six lignes d'accueil passeraient pour
// une ligne de base complète.
const motifDeRoute = (route) =>
  new RegExp(
    `^${route
      .split('/')
      .map((segment) => (segment.startsWith('[') ? '[^/]+' : segment))
      .join('/')}$`,
  );

export const routeDe = (url) => {
  const chemin = cheminDe(url).replace(/\/+$/, '') || '/';
  return CIBLES_PRODUCTION.find((cible) => motifDeRoute(cible.route).test(chemin))?.route ?? null;
};

// Les conditions de la mesure, lues au site unique du profil. `rang` est le
// percentile que `mesureUrls` applique ; `repetitions`, le nombre d'exécutions
// sans lequel ce percentile n'existe pas.
export const optionsDeMesure = () => {
  const profil = profilReseau();
  return {
    profil,
    repetitions: profil?.repetitions ?? 1,
    rang: profil?.percentile ?? 75,
  };
};

// Un fichier à `etablie: false` ne satisfait PAS le critère de fin (« baseline.json
// est commité avec des valeurs mesurées sur meeshy.me en production »). Il porte
// la forme et les commandes, pas les chiffres. Le dire dans le fichier lui-même,
// à côté de ce qu'il faut rejouer, est la seule façon qu'un manque reste un point
// OUVERT plutôt qu'un critère silencieusement réputé rempli.
export const POINT_OUVERT = {
  quoi: "La ligne de base n'est pas établie : aucune des cibles n'a rendu de chiffre. Ce fichier ne satisfait donc pas le critère « baseline.json commité avec des valeurs mesurées sur meeshy.me en production ».",
  a_rejouer: 'node apps/web-v3/scripts/baseline.mjs <les 6 urls, avec de vrais identifiants publics>',
  prerequis: [
    'un poste ou un runner CI dont le réseau sortant atteint meeshy.me (l’egress de la session de développement répond 403 à CONNECT meeshy.me:443) — l’hôte livré est le workflow .github/workflows/v3-baseline.yml, à lancer en workflow_dispatch',
    'de vrais identifiants publics de story / réel / post / humeur, à la place des placeholders, tous sous https://meeshy.me (une URL d’une autre origine est refusée : elle rendrait une ligne de base verte qui ne dit rien de la production)',
    'du temps : les six cibles sont mesurées sous le profil 3G Fast de budgets.json et répétées pour rendre un p75 — une passe complète dure une vingtaine de minutes, et un « AVANT » pris sans ce profil ne se compare à aucun « APRÈS »',
  ],
  verifier: 'curl -sS -o /dev/null -w "%{http_code}\\n" https://meeshy.me/ — 000 avec « CONNECT tunnel failed, response 403 » signifie que la mesure ne peut pas être prise ici',
};

export const composeBaseline = ({ date, mesures, profil = null }) => {
  const etablie = mesures.length > 0 && mesures.every((m) => m.statut === 'mesuré');
  return {
    mesure: 'apps/web (legacy) servi en production sur https://meeshy.me — la ligne de base « AVANT » de la v3',
    source: 'docs/product/MeeshyWebV3Design/conception-web-v3.md § 8.2 (3)',
    produit_par: 'node apps/web-v3/scripts/baseline.mjs <url…>',
    date,
    etablie,
    profil,
    repetitions: profil?.repetitions ?? null,
    percentile: profil?.percentile ?? null,
    point_ouvert: etablie ? null : POINT_OUVERT,
    mesures,
  };
};

// LE VERDICT QUE LE RAPPORT UNIQUE COMPTE — conception § 9.2, ligne « Ligne de base ».
//
// La ligne de base figure parmi les livrables de la machine de vérification, et
// `scripts/v3-rapport.mjs` n'en connaissait pas l'existence : il agrégeait six
// mesures et se déclarait complet sans jamais regarder la seule qui, elle,
// n'est pas établie. C'est le défaut que son propre en-tête nomme — « un
// instrument absent de l'agrégation ne rougit jamais : il n'existe pas ».
//
// Le verdict vit ICI, avec la donnée qu'il juge : relire `etablie` depuis la
// racine fabriquerait la jumelle que le § 9.2 interdit, et les deux lectures
// divergeraient au premier champ ajouté.
//
// TROIS SORTIES, ET « NON ÉTABLIE » N'EST PAS « ROUGE ». Une ligne de base non
// prise est un PRÉREQUIS manquant — un hôte dont le réseau sortant atteint
// meeshy.me — au même titre qu'un build ou un Chromium absent : elle sort NON
// EXÉCUTÉE (rapport incomplet, rc=2), jamais verte, jamais rouge. Ce qui est
// ROUGE est le fichier qui MENT : celui qui se déclare `etablie` sans porter de
// chiffres, seule façon dont ce critère de fin pourrait être réputé rempli sans
// qu'aucune mesure n'ait été prise.
// QUATRE FAÇONS DE MENTIR, ET « SE DÉCLARER ÉTABLIE SANS CHIFFRES » N'ÉTAIT QUE
// LA PLUS GROSSIÈRE. Le verdict ne regardait ni l'ORIGINE des URLs mesurées
// (une ligne de base de localhost sortait VERTE), ni le CODE HTTP servi (une
// page 404 comptait pour une story), ni le NOMBRE de gestes représentés (six
// lignes d'accueil valaient les six gestes du rôle premier), ni les CONDITIONS
// réseau (des chiffres pris en fibre ne s'opposent à aucun plafond du § 8.3).
// Un `maximum()` qui remplaçait les `null` par des `0` rendait de surcroît un
// zéro là où le fichier exige, partout ailleurs, un `null` qui se voit.
const maximum = (lignes, champ) => {
  const nombres = lignes.map((l) => l[champ]).filter((v) => typeof v === 'number');
  return nombres.length === 0 ? null : Math.max(...nombres);
};

const estObjet = (valeur) => typeof valeur === 'object' && valeur !== null;

const rouge = (raison) => ({ statut: 'rouge', raison, chiffres: null });

const CHAMPS_CHIFFRES = ['octets_transferes', 'requetes_avant_premier_pixel', 'lcp_ms'];

export const verdictDeLigneDeBase = (valeur) => {
  const illisible = rouge('baseline.json illisible ou absent');
  if (!estObjet(valeur)) return illisible;
  const { etablie, mesures, date, profil, repetitions, percentile, point_ouvert: pointOuvert } = valeur;
  if (typeof etablie !== 'boolean' || !Array.isArray(mesures)) return illisible;

  const chiffrees = mesures.filter((ligne) => ligne?.statut === 'mesuré');

  if (!etablie) {
    return {
      statut: 'non exécutée',
      raison: `${chiffrees.length}/${mesures.length} cible(s) mesurée(s) — prérequis : ${
        pointOuvert?.prerequis?.[0] ?? 'un hôte qui atteint meeshy.me'
      } ; à rejouer : ${pointOuvert?.a_rejouer ?? POINT_OUVERT.a_rejouer}`,
      chiffres: null,
    };
  }

  if (chiffrees.length !== mesures.length || chiffrees.length === 0) {
    return rouge(
      `baseline.json se déclare établie sans porter de chiffres (${chiffrees.length}/${mesures.length} mesurée(s))`,
    );
  }

  const etrangeres = chiffrees.filter((ligne) => !estDeProduction(ligne?.url));
  if (etrangeres.length > 0) {
    return rouge(
      `baseline.json ne mesure pas la production : ${etrangeres.length} ligne(s) hors de ${APEX} (${etrangeres[0]?.url})`,
    );
  }

  const manquantes = CIBLES_PRODUCTION.map((cible) => cible.route).filter(
    (route) => !chiffrees.some((ligne) => routeDe(ligne.url) === route),
  );
  if (manquantes.length > 0) {
    return rouge(
      `baseline.json ne couvre pas les gestes du rôle premier : route(s) absente(s) ${manquantes.join(', ')}`,
    );
  }

  if (!estObjet(profil)) {
    return rouge(
      "baseline.json est établie sans dire dans quelles conditions : chiffres non opposables au § 8.3, qui exprime le premier pixel utile en « 3G Fast simulé, p75 »",
    );
  }

  const creux = CHAMPS_CHIFFRES.filter((champ) => maximum(chiffrees, champ) === null);
  if (creux.length > 0) {
    return rouge(
      `baseline.json est établie mais aucune ligne ne porte de ${creux.join(', ')} — un chiffre absent ne se remplace pas par un zéro qui se compare`,
    );
  }

  return {
    statut: 'vert',
    raison: null,
    chiffres: {
      date,
      cibles: mesures.length,
      mesurees: chiffrees.length,
      octets_max_ko: Math.round(maximum(chiffrees, 'octets_transferes') / 1024),
      requetes_avant_premier_pixel_max: maximum(chiffrees, 'requetes_avant_premier_pixel'),
      lcp_max_ms: maximum(chiffrees, 'lcp_ms'),
      profil: profil.nom,
      repetitions: repetitions ?? profil.repetitions ?? null,
      percentile: percentile ?? profil.percentile ?? null,
    },
  };
};

const urlsDemandees = () => {
  const donnees = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (donnees.length === 0) return CIBLES_PRODUCTION.map((c) => c.url);
  return donnees;
};

const raisonDeRefus = (url) =>
  estPlaceholder(url)
    ? "identifiant de contenu non fourni : remplacer le placeholder par un contenu public réel, puis rejouer la commande"
    : `origine hors production : cette ligne de base mesure ${APEX} et rien d'autre — un chiffre pris ailleurs (localhost, staging) est vert et ne dit rien de la production`;

const main = async () => {
  const urls = urlsDemandees();
  const joignables = urls.filter((u) => !estPlaceholder(u) && estDeProduction(u));
  const options = optionsDeMesure();

  const mesurees = joignables.length
    ? await mesureUrls(joignables, commandePour, options).catch((erreur) =>
        joignables.map((url) =>
          mesureIndisponible({ url, commande: commandePour(url), raison: raisonLisible(erreur) }),
        ),
      )
    : [];

  const parUrl = new Map(mesurees.map((m) => [m.url, m]));
  const mesures = urls.map(
    (url) =>
      parUrl.get(url) ??
      mesureIndisponible({ url, commande: commandePour(url), raison: raisonDeRefus(url) }),
  );

  const baseline = composeBaseline({
    date: new Date().toISOString().slice(0, 10),
    mesures,
    profil: options.profil,
  });
  mkdirSync(dirname(SORTIE), { recursive: true });
  writeFileSync(SORTIE, `${JSON.stringify(baseline, null, 1)}\n`);

  const etablies = mesures.filter((m) => m.statut === 'mesuré').length;
  process.stdout.write(
    `${SORTIE} — ${etablies}/${mesures.length} mesurée(s), ${mesures.length - etablies} à établir\n`,
  );
  mesures
    .filter((m) => m.statut !== 'mesuré')
    .forEach((m) => process.stdout.write(`  à établir · ${m.url} · ${m.raison}\n`));

  return baseline.etablie ? 0 : 1;
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((rc) => process.exit(rc));
}
