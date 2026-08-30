/**
 * Le poids de bundle de la zone v3, par route, mesure sur ce que le build SERT.
 *
 * La source est `.next/app-build-manifest.json` : c'est la table que Next lui-meme
 * consulte pour savoir quels morceaux poser dans le HTML d'une route. Pas une
 * heuristique d'import, pas un `du -sh` du repertoire : les octets qu'un
 * telephone telecharge pour cette route-la.
 *
 * Trois refus portent la mesure, et ils disent tous la meme chose — « je n'ai
 * pas pu mesurer » n'est pas « j'ai mesure zero » :
 *   - pas de manifeste  ⇒ la zone n'a jamais ete construite (rc=2) ;
 *   - un morceau reference mais absent du build ⇒ rc=2, jamais zero octet ;
 *   - zero route dans le manifeste ⇒ rc=0 et un rapport qui DIT « squelette
 *     vide » : c'est l'etat reel de la zone avant son premier ecran, et le
 *     masquer derriere un echec rendrait le gate inutilisable pendant tout L-0.5.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

import { confronterRatchet } from './ratchet.mjs';
import { cheminPublic, groupeDe, plafondDe } from './routes.mjs';

export class MesureImpossible extends Error {}

const gzipDe = (fichier) => gzipSync(readFileSync(fichier), { level: 9 }).length;

const lireJson = (fichier, quoi) => {
  try {
    return JSON.parse(readFileSync(fichier, 'utf8'));
  } catch (erreur) {
    throw new MesureImpossible(`${quoi} illisible (${fichier}) : ${erreur.message}`);
  }
};

export function chargerBudgets(fichier) {
  if (!existsSync(fichier)) {
    throw new MesureImpossible(
      `budgets.json introuvable (${fichier}) — les plafonds du § 8.3 vivent la, et nulle part ailleurs.`,
    );
  }
  return lireJson(fichier, 'budgets.json');
}

/**
 * Pese chaque route du manifeste. Un morceau cite deux fois par la meme route
 * ne compte qu'une fois : c'est un seul telechargement.
 */
export function mesurerManifeste({ racineNext, manifeste }) {
  if (!existsSync(manifeste)) {
    throw new MesureImpossible(
      `app-build-manifest.json introuvable (${manifeste}) — la zone n'a pas ete construite. Lancer : cd apps/web-v3 && bun run build`,
    );
  }

  const pages = lireJson(manifeste, 'app-build-manifest.json').pages ?? {};
  const poids = new Map();

  const peser = (relatif) => {
    if (poids.has(relatif)) return poids.get(relatif);
    const fichier = join(racineNext, relatif);
    if (!existsSync(fichier) || !statSync(fichier).isFile()) {
      throw new MesureImpossible(
        `le manifeste sert « ${relatif} », que le build n'a pas produit (${fichier}) — un fichier absent n'est pas un fichier vide.`,
      );
    }
    const octets = gzipDe(fichier);
    poids.set(relatif, octets);
    return octets;
  };

  return Object.entries(pages).map(([entree, fichiers]) => {
    const uniques = [...new Set(fichiers)].map((nom) => ({ nom, octets: peser(nom) }));
    return {
      entree_du_manifeste: entree,
      route: cheminPublic(entree),
      groupe: groupeDe(entree),
      fichiers: uniques,
      octets_total: uniques.reduce((total, f) => total + f.octets, 0),
    };
  });
}

/**
 * Le SOCLE d'un groupe : ce que TOUTES ses routes chargent. Il n'a de sens
 * qu'a partir de deux routes — sur une route seule, « ce que tout le monde
 * partage » serait la route entiere, et le code d'ecran tomberait a zero.
 * Ce zero-la masquerait exactement le depassement qu'on cherche.
 */
const socleDe = (routes) => {
  if (routes.length < 2) return [];
  const [premiere, ...autres] = routes;
  return premiere.fichiers.filter((f) =>
    autres.every((r) => r.fichiers.some((autre) => autre.nom === f.nom)),
  );
};

/** Rang le plus proche : la p95 d'une seule route est cette route. */
const p95 = (valeurs) => {
  if (!valeurs.length) return 0;
  const triees = [...valeurs].sort((a, b) => a - b);
  return triees[Math.max(0, Math.ceil(0.95 * triees.length) - 1)];
};

export function evaluer({ mesures, budgets, ratchet = { valeurs: {} } }) {
  const groupes = [...new Set(mesures.map((m) => m.groupe))].sort();

  const routes = [];
  const lignesDeGroupe = [];

  for (const groupe of groupes) {
    const duGroupe = mesures.filter((m) => m.groupe === groupe);
    const socle = socleDe(duGroupe);
    const noms = new Set(socle.map((f) => f.nom));
    const octetsSocle = socle.reduce((total, f) => total + f.octets, 0);

    const evaluees = duGroupe
      .map((m) => {
        const octetsEcran = m.fichiers
          .filter((f) => !noms.has(f.nom))
          .reduce((total, f) => total + f.octets, 0);
        const { plafond, source, statut } = plafondDe({
          budgets,
          route: m.route,
          groupe: m.groupe,
        });
        return {
          route: m.route,
          entree_du_manifeste: m.entree_du_manifeste,
          groupe: m.groupe,
          octets_total: m.octets_total,
          octets_socle: octetsSocle,
          octets_ecran: octetsEcran,
          plafond_ecran: plafond,
          source_du_plafond: source,
          statut_du_plafond: statut,
          /**
           * `sans-plafond` n'est PAS `vert`. `plafondDe()` calculait deja le
           * statut `ABSENT` — aucune ligne, aucun groupe — et l'appelant le
           * jetait : une route qu'aucun plafond ne gouverne sortait verte,
           * sans un mot. Un ecran hors de toute table n'est pas un ecran
           * conforme, c'est un ecran que personne ne mesure.
           */
          statut:
            plafond === null
              ? 'sans-plafond'
              : octetsEcran > plafond
                ? 'depassement'
                : 'vert',
        };
      })
      .sort((a, b) => b.octets_ecran - a.octets_ecran);

    routes.push(...evaluees);

    const plafondSocle = budgets.groupes?.[groupe]?.socle ?? null;
    lignesDeGroupe.push({
      groupe,
      socle_octets: octetsSocle,
      plafond_socle: plafondSocle,
      statut_du_plafond: budgets.groupes?.[groupe]?.statut ?? 'CIBLE',
      ecran_le_plus_lourd_octets: Math.max(0, ...evaluees.map((e) => e.octets_ecran)),
      cumul_p95_octets: p95(duGroupe.map((m) => m.octets_total)),
      statut: plafondSocle !== null && octetsSocle > plafondSocle ? 'depassement' : 'vert',
    });
  }

  const sansPlafond = routes
    .filter((r) => r.statut === 'sans-plafond')
    .map(
      (r) =>
        `${r.route} (${r.groupe}) — ecran ${r.octets_ecran} o (${ko(r.octets_ecran)}) : aucune ligne de budgets.json, aucun plafond de groupe`,
    );

  const franchissements = [
    ...routes
      .filter((r) => r.statut === 'depassement')
      .map((r) => ({
        statutDuPlafond: r.statut_du_plafond,
        phrase: `${r.route} — ecran ${r.octets_ecran} o (${ko(r.octets_ecran)}) > plafond ${r.plafond_ecran} o (${ko(r.plafond_ecran)}, ${r.statut_du_plafond} par ${r.source_du_plafond})`,
      })),
    ...lignesDeGroupe
      .filter((g) => g.statut !== 'vert')
      .map((g) => ({
        statutDuPlafond: g.statut_du_plafond,
        phrase: `${g.groupe} — socle ${g.socle_octets} o (${ko(g.socle_octets)}) > plafond ${g.plafond_socle} o (${ko(g.plafond_socle)}, ${g.statut_du_plafond})`,
      })),
  ];

  /**
   * Un GATE casse la CI ; une CIBLE se RAPPORTE (§ 8.3). Confondre les deux
   * rendrait le gate inutilisable pendant tout L-0.5 : les cibles sont, par
   * definition, des chiffres que la premiere mesure doit encore confirmer.
   */
  const depassements = franchissements.filter((f) => f.statutDuPlafond === 'GATE').map((f) => f.phrase);
  const ecartsDeCible = franchissements
    .filter((f) => f.statutDuPlafond !== 'GATE')
    .map((f) => f.phrase);

  /**
   * Le RATCHET du § 8.3 : une valeur ENREGISTREE ne remonte jamais. Une
   * regression casse la CI meme quand le plafond CIBLE tient encore — c'est
   * tout l'objet de la phrase « jusque-la le gate enregistre la valeur mesuree
   * et interdit toute regression ».
   */
  const courant = valeursDuRatchet({ routes, lignesDeGroupe });
  const regressions = confronterRatchet({ enregistre: ratchet.valeurs ?? {}, courant });

  const verdict =
    mesures.length === 0
      ? 'squelette-vide'
      : depassements.length || regressions.length
        ? 'depassement'
        : sansPlafond.length
          ? 'sans-plafond'
          : 'vert';

  return {
    verdict,
    routes,
    groupes: lignesDeGroupe,
    depassements,
    regressions,
    sans_plafond: sansPlafond,
    ecarts_de_cible: ecartsDeCible,
    ratchet: { valeurs_courantes: courant, enregistre_le: ratchet.genere_le ?? null },
  };
}

/** Les grandeurs cliquetables : des octets, jamais des temps. */
export function valeursDuRatchet({ routes, lignesDeGroupe }) {
  return Object.fromEntries([
    ...routes.map((r) => [`bundle:${r.route}:ecran_octets`, r.octets_ecran]),
    ...lignesDeGroupe.map((g) => [`bundle:${g.groupe}:socle_octets`, g.socle_octets]),
  ]);
}

export const ko = (octets) => `${(octets / 1024).toFixed(1)} Ko`;
