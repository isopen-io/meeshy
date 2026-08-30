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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mesureIndisponible, mesureUrls, raisonLisible } from './mesure-reseau.mjs';

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

// Un fichier à `etablie: false` ne satisfait PAS le critère de fin (« baseline.json
// est commité avec des valeurs mesurées sur meeshy.me en production »). Il porte
// la forme et les commandes, pas les chiffres. Le dire dans le fichier lui-même,
// à côté de ce qu'il faut rejouer, est la seule façon qu'un manque reste un point
// OUVERT plutôt qu'un critère silencieusement réputé rempli.
export const POINT_OUVERT = {
  quoi: "La ligne de base n'est pas établie : aucune des cibles n'a rendu de chiffre. Ce fichier ne satisfait donc pas le critère « baseline.json commité avec des valeurs mesurées sur meeshy.me en production ».",
  a_rejouer: 'node apps/web-v3/scripts/baseline.mjs <les 6 urls, avec de vrais identifiants publics>',
  prerequis: [
    'un poste ou un runner CI dont le réseau sortant atteint meeshy.me (l’egress de la session de développement répond 403 à CONNECT meeshy.me:443)',
    'de vrais identifiants publics de story / réel / post / humeur, à la place des placeholders',
  ],
  verifier: 'curl -sS -o /dev/null -w "%{http_code}\\n" https://meeshy.me/ — 000 avec « CONNECT tunnel failed, response 403 » signifie que la mesure ne peut pas être prise ici',
};

export const composeBaseline = ({ date, mesures }) => {
  const etablie = mesures.length > 0 && mesures.every((m) => m.statut === 'mesuré');
  return {
    mesure: 'apps/web (legacy) servi en production sur https://meeshy.me — la ligne de base « AVANT » de la v3',
    source: 'docs/product/MeeshyWebV3Design/conception-web-v3.md § 8.2 (3)',
    produit_par: 'node apps/web-v3/scripts/baseline.mjs <url…>',
    date,
    etablie,
    point_ouvert: etablie ? null : POINT_OUVERT,
    mesures,
  };
};

const urlsDemandees = () => {
  const donnees = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (donnees.length === 0) return CIBLES_PRODUCTION.map((c) => c.url);
  return donnees;
};

const main = async () => {
  const urls = urlsDemandees();
  const joignables = urls.filter((u) => !estPlaceholder(u));

  const mesurees = joignables.length
    ? await mesureUrls(joignables, commandePour).catch((erreur) =>
        joignables.map((url) =>
          mesureIndisponible({ url, commande: commandePour(url), raison: raisonLisible(erreur) }),
        ),
      )
    : [];

  const parUrl = new Map(mesurees.map((m) => [m.url, m]));
  const mesures = urls.map(
    (url) =>
      parUrl.get(url) ??
      mesureIndisponible({
        url,
        commande: commandePour(url),
        raison:
          "identifiant de contenu non fourni : remplacer le placeholder par un contenu public réel, puis rejouer la commande",
      }),
  );

  const baseline = composeBaseline({ date: new Date().toISOString().slice(0, 10), mesures });
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
