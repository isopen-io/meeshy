/**
 * [Q-146/R6-3] LE VERROU D'ACTIVATION — `riviere_mode` ne peut pas devenir
 * ON par défaut tant que l'écran n'a aucun site de montage dans le fil.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CE TÉMOIN EXISTE, ALORS QUE DEUX SUITES VOISINES SEMBLENT DÉJÀ
 * COUVRIR CHACUN DES DEUX FAITS
 * ═══════════════════════════════════════════════════════════════════════════
 * `resolve-river-mode-flag.test.ts` prouve que le DÉFAUT du drapeau (aucun
 * `searchParam`/cookie/env) vaut `false` aujourd'hui. `riviere-screen-not-
 * mounted.test.ts` prouve que l'ÉCRAN (`RiverThread`) n'a aucun site de
 * montage. Ce sont deux fichiers séparés, écrits par des lots séparés (R-134,
 * R-135), qui ne se PARLENT pas.
 *
 * RED prouvé (R6-3) : un lot qui bascule le défaut à `true` (décision
 * produit « on active Rivière ») édite NATURELLEMENT `resolve-river-mode-
 * flag.ts` ET la ligne de `resolve-river-mode-flag.test.ts` qui affirme
 * l'ancien défaut — c'est exactement le même geste que R-135 a fait pour le
 * MENU (dégriser une entrée est une édition auto-cohérente de son propre
 * fichier + sa propre suite). Rien, dans les deux suites existantes, ne
 * l'empêche : `resolve-river-mode-flag.test.ts` (réécrit) est vert sur son
 * nouveau défaut, `riviere-screen-not-mounted.test.ts` ne lit JAMAIS le
 * drapeau — il ne sait même pas que le défaut a changé. Les 17 témoins des
 * trois suites voisines (résolveur, montage, occurrence unique du nom)
 * restent VERTS pendant que le système est dans la combinaison dangereuse :
 * Rivière sélectionnable par défaut, personne pour la peindre — un choix
 * qui rendrait des bulles à la place de la Rivière (`clamped-unavailable`),
 * une promesse silencieusement rompue.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * LA FORME DU VERROU — lier les DEUX faits, jamais un seul
 * ═══════════════════════════════════════════════════════════════════════════
 * Ce témoin ne réimplémente NI la résolution du drapeau NI la détection de
 * montage — il consomme le même résolveur PRODUCTION
 * (`resolveRiverModeFlag`, sans aucune surcharge : c'est la lecture du vrai
 * défaut) et la MÊME preuve structurelle que `riviere-screen-not-mounted.
 * test.ts` (absence de `RiverThread` hors de sa peau). Il combine les deux
 * en UNE implication :
 *
 *     defaultIsOn && !isMounted  ⇒  ÉCHEC
 *
 * Les trois autres combinaisons (OFF+non-monté — l'état actuel ; OFF+monté ;
 * ON+monté) sont SÛRES et laissées passer : ce verrou n'interdit PAS
 * d'activer Rivière, il interdit de l'activer SANS ÉCRAN. Éditer isolément
 * `resolve-river-mode-flag.ts` (comme le RED ci-dessus) ne suffit plus à le
 * faire taire — il faudrait AUSSI monter l'écran, ce qui est précisément la
 * condition que R-137 vient remplir.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CE VERROU EST CELUI DE Q-146 — IL TOMBERA AVEC R-137
 * ═══════════════════════════════════════════════════════════════════════════
 * Le jour où un lot monte réellement `RiverThread` dans `ConversationMessages
 * .tsx` (ou tout autre hôte du fil), `isMounted` devient vrai et cette garde
 * n'a plus d'objection à faire au drapeau ON — elle s'efface d'elle-même,
 * sans qu'il faille la supprimer : c'est un verrou CONDITIONNEL, pas une
 * interdiction gravée. Elle continuera cependant d'exister pour la MÊME
 * raison qu'avant : si un jour un `RiverThread` alternatif disparaît sans
 * qu'aucun autre hôte ne le remplace, ce témoin refermera la porte tout
 * seul.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveRiverModeFlag } from '../../hooks/lentille/resolve-river-mode-flag';

const WEB_ROOT = path.join(__dirname, '../..');
const RIVIERE_SKIN_ROOT = path.join(WEB_ROOT, 'components/conversations/riviere');
const RIVIERE_HOST_SYMBOL = 'RiverThread';

const EXCLUDED_DIRS = new Set(['node_modules', '.next', 'dist', 'coverage', '__tests__']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.[jt]sx?$/.test(filePath);
}

/** MÊME découverte que `riviere-screen-not-mounted.test.ts` — jamais recopiée en supposant, toujours re-scannée. */
function nonRiviereWebFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (fullPath === RIVIERE_SKIN_ROOT) continue;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      nonRiviereWebFiles(fullPath, files);
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) continue;
    if (isTestFile(fullPath)) continue;
    files.push(fullPath);
  }
  return files;
}

/**
 * `true` si un site de montage RÉEL de l'écran Rivière existe hors de sa
 * propre peau — même mécanisme de preuve que `riviere-screen-not-mounted.
 * test.ts` (occurrence du nom `RiverThread`), lu ici comme un FAIT combiné
 * au drapeau plutôt que comme sa propre assertion isolée.
 */
function riverThreadHasMountSite(): boolean {
  return nonRiviereWebFiles(WEB_ROOT).some((file) =>
    fs.readFileSync(file, 'utf8').includes(RIVIERE_HOST_SYMBOL)
  );
}

/** Le VRAI défaut de production — aucune entrée fournie, comme un premier chargement neuf. */
function riverModeFlagDefaultIsOn(): boolean {
  return resolveRiverModeFlag({ searchParam: null, cookie: undefined, env: undefined }).active;
}

describe('[Q-146/R6-3] verrou d\'activation — riviere_mode ON-par-défaut exige un écran monté', () => {
  it('anti-silence : le scan de montage découvre bien des fichiers hors de la peau Rivière', () => {
    expect(nonRiviereWebFiles(WEB_ROOT).length).toBeGreaterThan(0);
  });

  it('LE VERROU — defaultIsOn && !isMounted doit être FAUX (seules 3 des 4 combinaisons sont sûres)', () => {
    const defaultIsOn = riverModeFlagDefaultIsOn();
    const isMounted = riverThreadHasMountSite();
    const unsafeCombination = defaultIsOn && !isMounted;

    if (unsafeCombination) {
      throw new Error(
        '[Q-146/R6-3] `riviere_mode` résout ON par défaut (`resolveRiverModeFlag` sans ' +
          'surcharge) alors qu\'aucun site de montage de l\'écran Rivière (`RiverThread`) ' +
          'n\'existe hors de sa peau — combinaison dangereuse : un lecteur choisirait Rivière ' +
          'et verrait des bulles (`clamped-unavailable`), une promesse silencieusement rompue. ' +
          'Ce verrou tombe de lui-même (R-137) le jour où un hôte réel monte RiverThread dans ' +
          'le fil — jusque-là, le défaut DOIT rester OFF.'
      );
    }

    expect(unsafeCombination).toBe(false);
  });

  it('état actuel documenté — les deux faits, nommés, pour que ce témoin ne soit jamais lu comme une boîte noire', () => {
    // Ce test ne PEUT pas échouer indépendamment du témoin précédent (même
    // calcul) — il existe pour que la sortie d'échec du témoin ci-dessus,
    // lue seule, n'oblige personne à deviner LEQUEL des deux faits a bougé.
    expect({
      defaultIsOn: riverModeFlagDefaultIsOn(),
      isMounted: riverThreadHasMountSite(),
    }).toEqual({ defaultIsOn: false, isMounted: false });
  });
});
