#!/usr/bin/env node
/**
 * Gate de POIDS RESEAU de la zone v3 (§ 8.2 mesure n° 2, § 8.3, part du § 8.5).
 *
 *   node scripts/mesure-reseau.mjs --base http://127.0.0.1:3300
 *                                  [--chemins /,/l/abc] [--reseau 3g-fast] [--tirages 5]
 *                                  [--echantillons <identifiants.json>]
 *   node scripts/mesure-reseau.mjs --depuis-journal <fichier.json>
 *
 * Le second mode REAGREGE un journal deja collecte, sans navigateur : une
 * collecte faite sur une machine qui atteint la cible se commite et se relit
 * partout ailleurs. C'est aussi ce qui rend la regle d'agregation testable.
 *
 * LE PERIMETRE PAR DEFAUT, ET POURQUOI IL COMPTE. Les dix ecrans du role
 * PREMIER ont tous une route PARAMETREE (`/l/:token`, `/chats/:lien`,
 * `/stories/:id`, `/post/:id`…). Selectionner « les cles sans deux-points »
 * revenait donc a mesurer exactement les quatre routes CONNECTEES — la partie
 * P1 de l'enonce — et a rendre « 4/4 vertes » atteignable sans avoir jamais
 * charge un ecran du role premier. Le perimetre est desormais la liste des
 * chemins RESOLUS par l'echantillon de chaque ligne (`budgets.echantillons`),
 * et toute ligne sans echantillon sort NOMMEE en `non_mesuree` : tant qu'une
 * ligne du role premier n'est pas mesuree, le verdict n'est pas vert.
 *
 * Codes de sortie :
 *   0  mesure faite, tout tient dans son plafond ;
 *   1  un plafond GATE est depasse — les deux chiffres sont nommes ;
 *   2  mesure IMPOSSIBLE (pas de Chromium, cible injoignable, journal illisible)
 *      ou budgets.json ambigu (deux lignes pour un meme chemin) ;
 *   3  mesure INDETERMINEE : page en erreur, chemin sans plafond, grandeur non
 *      mesuree, plafond de temps non confronte faute de bridage, ou ligne du
 *      role premier jamais ouverte. Ni vert, ni rouge.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chargerBudgets } from './lib/budget-bundle.mjs';
import {
  CODE_PAR_VERDICT,
  collecter,
  evaluerReseau,
  mesureDuJournal,
  mesureBruteDuJournal,
  ouvrirNavigateur,
  p75DeMesures,
  PROFILS_RESEAU,
  verdictReseau,
} from './lib/poids-reseau.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (nom, defaut) => {
  const i = args.indexOf(nom);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : defaut;
};

const racine = resolve(arg('--racine', join(ICI, '..')));
const budgets = chargerBudgets(resolve(arg('--budgets', join(racine, 'budgets.json'))));
const json = arg('--json', null);
const depuisJournal = arg('--depuis-journal', null);
const base = (arg('--base', 'http://127.0.0.1:3300') ?? '').replace(/\/$/, '');
const dossierJournaux = arg('--journaux', null);
const profilReseau = arg('--reseau', '3g-fast');
const tirages = Math.max(1, Number(arg('--tirages', '5')) || 1);

const echec = (code, message) => {
  process.stderr.write(`[reseau] ${message}\n`);
  process.exit(code);
};

if (!PROFILS_RESEAU[profilReseau]) {
  echec(2, `profil reseau inconnu : « ${profilReseau} » — connus : ${Object.keys(PROFILS_RESEAU).join(', ')}`);
}

/**
 * Les identifiants qui rendent un chemin parametre OUVRABLE. Ils vivent par
 * defaut dans `budgets.json` (a `null` : la ligne sort alors NOMMEE en
 * `non_mesuree`), et un fichier passe en `--echantillons` les remplace — c'est
 * le chemin pratique pour une base de dev, dont les identifiants ne se
 * commitent pas.
 */
const fichierEchantillons = arg('--echantillons', null);
const echantillons = fichierEchantillons
  ? { ...(budgets.echantillons ?? {}), ...JSON.parse(readFileSync(resolve(fichierEchantillons), 'utf8')) }
  : (budgets.echantillons ?? {});

/** `/chats/:lien/medias` + « abc » ⇒ `/chats/abc/medias`. `null` si un segment reste a completer. */
const resoudreMotif = (motif, valeur) => {
  const segments = motif.split('/').filter(Boolean);
  const resolus = segments.map((s) => {
    if (!s.startsWith(':')) return s;
    const nom = s.slice(1).replace(/\*\??$/, '');
    const v = valeur !== null && typeof valeur === 'object' ? valeur[nom] : valeur;
    return typeof v === 'string' && v !== '' ? v : null;
  });
  return resolus.some((s) => s === null) ? null : `/${resolus.join('/')}`;
};

const perimetreParDefaut = () => {
  const chemins = [];
  const nonMesurees = [];

  for (const [motif, ligne] of Object.entries(budgets.routes ?? {})) {
    if (!motif.includes(':')) {
      chemins.push(motif);
      continue;
    }
    const valeur = ligne.echantillon ? (echantillons[ligne.echantillon] ?? null) : null;
    const chemin = valeur === null ? null : resoudreMotif(motif, valeur);
    if (chemin === null) {
      nonMesurees.push({
        motif,
        role_premier: ligne.role_premier === true,
        raison: ligne.echantillon
          ? `echantillon « ${ligne.echantillon} » a null dans budgets.json — un chemin parametre ne s'ouvre pas sans identifiant`
          : "la ligne ne declare aucun `echantillon` : impossible de fabriquer une URL a ouvrir",
      });
      continue;
    }
    chemins.push(chemin);
  }

  return { chemins, nonMesurees };
};

const cheminsDemandes = (arg('--chemins', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const perimetreImpose = cheminsDemandes.length > 0 || depuisJournal !== null;

const journauxCollectes = async (urls) => {
  const navigateur = await ouvrirNavigateur();
  try {
    const journaux = [];
    for (const url of urls) {
      for (let tirage = 0; tirage < tirages; tirage += 1) {
        const contexte = await navigateur.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
        });
        const page = await contexte.newPage();
        try {
          journaux.push({ ...(await collecter({ page, url, reseau: profilReseau })), tirage });
        } catch (erreur) {
          journaux.push({
            url,
            tirage,
            collecte_le: new Date().toISOString(),
            reseau: profilReseau,
            echec: String(erreur.message).slice(0, 300),
            statut_http: null,
            premier_pixel_ms: null,
            lcp_ms: null,
            cls: null,
            evenements: [],
          });
        } finally {
          await contexte.close();
        }
      }
    }
    return journaux;
  } finally {
    await navigateur.close();
  }
};

const ecrireJournaux = (journaux) => {
  if (!dossierJournaux) return;
  mkdirSync(resolve(dossierJournaux), { recursive: true });
  for (const journal of journaux) {
    const nom =
      new URL(journal.url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'racine';
    writeFileSync(
      join(resolve(dossierJournaux), `${nom}-${journal.tirage ?? 0}.json`),
      `${JSON.stringify(journal, null, 2)}\n`,
    );
  }
};

/** Les N tirages d'une meme URL rendent UNE mesure, au rang p75 (§ 8.3). */
const mesuresDesJournaux = (journaux) => {
  const parUrl = new Map();
  for (const journal of journaux) {
    if (!parUrl.has(journal.url)) parUrl.set(journal.url, []);
    parUrl.get(journal.url).push(journal);
  }

  return [...parUrl.values()].map((lot) => {
    const [echecDeCollecte] = lot.filter((j) => j.echec).map((j) => j.echec);
    const mesure =
      lot.length === 1
        ? mesureDuJournal({ journal: lot[0], budgets })
        : evaluerReseau({ mesure: p75DeMesures(lot.map(mesureBruteDuJournal)), budgets });
    return { ...mesure, ...(echecDeCollecte ? { echec: echecDeCollecte } : {}) };
  });
};

const couvertureDe = (mesures, nonMesurees) => {
  const motifsMesures = new Set(mesures.map((m) => m.motif_de_budget).filter(Boolean));
  const declarees = Object.entries(budgets.routes ?? {});
  const manquantes = declarees
    .filter(([motif]) => !motifsMesures.has(motif))
    .map(([motif, ligne]) => {
      const dite = nonMesurees.find((n) => n.motif === motif);
      return (
        dite ?? {
          motif,
          role_premier: ligne.role_premier === true,
          raison: perimetreImpose
            ? 'hors du perimetre demande (--chemins / --depuis-journal)'
            : 'aucune mesure ne porte cette ligne',
        }
      );
    });

  return {
    lignes_de_budget: declarees.length,
    mesurees: [...motifsMesures].sort(),
    non_mesurees: manquantes,
    role_premier_non_mesure: manquantes.filter((m) => m.role_premier).map((m) => m.motif),
  };
};

const rendre = (journaux, nonMesurees = []) => {
  const mesures = mesuresDesJournaux(journaux);
  const couverture = couvertureDe(mesures, nonMesurees);
  const depassements = mesures.flatMap((m) => m.depassements ?? []);
  const ecartsDeCible = mesures.flatMap((m) => m.ecarts_de_cible ?? []);
  const sansConditions = mesures.flatMap((m) => m.sans_conditions ?? []);

  /**
   * Un ecran du role PREMIER jamais ouvert ne rend pas le rapport vert. C'est
   * la moitie que la mesure de couverture ajoute au verdict : « aucun plafond
   * depasse » et « tous les plafonds confrontes » sont deux affirmations
   * differentes, et seule la seconde autorise le vert.
   */
  const trou =
    !perimetreImpose && couverture.role_premier_non_mesure.length > 0 ? ['incomplet'] : [];
  const verdict = trou.length && verdictReseau(mesures) === 'vert' ? 'incomplet' : verdictReseau(mesures);

  const rapport = {
    genere_le: new Date().toISOString(),
    base,
    conditions: { reseau: depuisJournal ? 'journal' : profilReseau, tirages: depuisJournal ? null : tirages },
    verdict,
    couverture,
    mesures,
    depassements,
    ecarts_de_cible: ecartsDeCible,
    sans_conditions: sansConditions,
  };
  if (json) writeFileSync(resolve(json), `${JSON.stringify(rapport, null, 2)}\n`);

  for (const m of mesures) {
    const poids =
      m.octets_total === null
        ? `non pese (${m.requetes_sans_poids} req)`.padStart(11)
        : `${(m.octets_total / 1024).toFixed(1).padStart(8)} Ko`;
    process.stdout.write(
      `[reseau] ${(m.chemin ?? '?').padEnd(24)} ${poids}  ` +
        `${String(m.requetes_total).padStart(3)} req  ` +
        `avant 1er pixel: ${m.requetes_avant_premier_pixel ?? 'non mesure'}  ` +
        `en cours: ${m.requetes_en_cours}  ` +
        `FCP: ${m.premier_pixel_ms === null ? 'non mesure' : `${Math.round(m.premier_pixel_ms)} ms`}  ` +
        `LCP: ${m.lcp_ms === null ? 'non mesure' : `${Math.round(m.lcp_ms)} ms`}  ${m.statut}` +
        `${m.raison ? ` — ${m.raison}` : ''}\n`,
    );
  }

  process.stdout.write(
    `[reseau] couverture : ${couverture.mesurees.length}/${couverture.lignes_de_budget} ligne(s) de budget mesuree(s)\n`,
  );
  /**
   * Sur un perimetre IMPOSE (--chemins / --depuis-journal), la liste des lignes
   * non couvertes est du bruit : l'appelant a nomme ce qu'il voulait mesurer.
   * Elle reste dans le JSON — c'est le rapport agrege qui la compte.
   */
  if (!perimetreImpose) {
    for (const n of couverture.non_mesurees) {
      process.stdout.write(
        `[reseau] NON MESUREE${n.role_premier ? ' (ROLE PREMIER)' : ''} — ${n.motif} : ${n.raison}\n`,
      );
    }
  }
  for (const s of sansConditions) process.stdout.write(`[reseau] SANS CONDITIONS — ${s}\n`);
  for (const e of ecartsDeCible) {
    process.stdout.write(`[reseau] HORS CIBLE (ne casse pas la CI, § 8.3) — ${e}\n`);
  }
  if (depassements.length) {
    process.stderr.write('[reseau] ECHEC — plafonds GATE depasses :\n');
    for (const d of depassements) process.stderr.write(`  - ${d}\n`);
  }
  if (verdict !== 'vert' && !depassements.length) {
    process.stderr.write(
      `[reseau] ${verdict.toUpperCase()} — aucun verdict n'est prononce sur les lignes ci-dessus ; un rapport indetermine n'est pas vert.\n`,
    );
  }

  process.exit(CODE_PAR_VERDICT[verdict] ?? 3);
};

if (depuisJournal) {
  const fichier = resolve(depuisJournal);
  if (!existsSync(fichier)) echec(2, `journal introuvable : ${fichier}`);
  const contenu = JSON.parse(readFileSync(fichier, 'utf8'));
  rendre(Array.isArray(contenu) ? contenu : [contenu]);
} else {
  const { chemins, nonMesurees } = cheminsDemandes.length
    ? { chemins: cheminsDemandes, nonMesurees: [] }
    : perimetreParDefaut();
  const urls = chemins.map((c) => `${base}${c}`);
  if (!urls.length) echec(2, 'aucun chemin a mesurer : passer --chemins, ou poser un echantillon');
  try {
    const journaux = await journauxCollectes(urls);
    ecrireJournaux(journaux);
    rendre(journaux, nonMesurees);
  } catch (erreur) {
    echec(2, `MESURE IMPOSSIBLE — ${erreur.message}`);
  }
}
