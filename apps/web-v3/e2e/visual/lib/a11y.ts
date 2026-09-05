// LA LOI DU GATE AXE DE LA V3 — § 8.5 de docs/product/MeeshyWebV3Design/conception-web-v3.md :
// « 0 erreur axe serious/critical sur toute route (public) ».
//
// Elle vit dans un MODULE, pas dans le spec, pour la raison que le § 9.2 donne déjà à la mesure
// de poids réseau : ce qui est écrit dans un `.spec.ts` n'est vérifiable que par Playwright, donc
// jamais par le harnais unitaire — et un gate dont le verdict n'est gagé par rien est un gate
// qu'on croit sur parole. `v3-a11y.spec.ts` n'est que la main qui l'applique au navigateur.
//
// Ce que le gate balaie n'est PAS ce que le disque porte, c'est ce que `next build` a ÉMIS :
// `apps/web-v3/app/not-found.tsx` existe depuis L-0.5 et n'est servi par personne (Next n'émet la
// limite `/_not-found` qu'à partir d'une première page d'App Router — constat déjà tenu par
// `scripts/check-app-router-built.mjs`). Un balayage du disque gaterait donc une page que le
// visiteur ne reçoit pas, et laisserait le 404 du routeur Pages — celui qu'il reçoit VRAIMENT —
// hors de portée. Et ce qui fait qu'une route est `(public)` n'est pas son répertoire : c'est le
// groupe que `budgets.json` lui reconnaît, par la loi de motif de `scripts/lib/motifs.mjs`. Une
// seule déclaration de zone pour le budget et pour l'accessibilité.

import { join } from 'node:path';

import {
  groupeDe,
  natureDeRoute,
  normaliseRoute,
} from '../../../scripts/lib/routes-emises.mjs';
import type {
  EntreeDeManifeste,
  PorteurDeGroupe,
} from '../../../scripts/lib/routes-emises.mjs';

// Le verdict et les colonnes de thème vivent sans `.mjs` dans `verdict-axe.ts` (voir son en-tête) ;
// ré-exportés ici pour que la loi reste UNE, vue d'un seul module par ses lecteurs historiques.
export {
  COLONNES_DE_THEME,
  IMPACTS_BLOQUANTS,
  estBloquante,
  rapporteViolations,
  violationsBloquantes,
} from './verdict-axe';
export type { ColonneDeTheme, NoeudEnViolation, ViolationAxe } from './verdict-axe';

// Le STATUT attendu fait partie de l'identité d'une route balayée. Un `goto` qui rend une réponse
// non nulle ne prouve pas que la page demandée a été servie : une route que `next build` a bien
// ÉMISE mais qui échoue à l'exécution — 404 sur un identifiant absent, 500 sur une lecture qui
// tombe, limite `error.tsx` — sert une page d'erreur qui hérite du `<html lang>` du layout racine
// et passe axe sans broncher. Le gate sortirait VERT sur un écran que le visiteur ne peut PAS
// lire, c'est-à-dire sur le rôle premier, dont tout le contenu vient d'une ressource qui peut
// manquer.
export type RoutePublique = {
  readonly id: string;
  readonly chemin: string;
  readonly statut: number;
};

// La seule route dont la PANNE est le contrat : `/_not-found` est la limite 404 d'App Router, elle
// répond 404 quand elle fonctionne. Toute autre page `(public)` doit servir 200 — et le jour où un
// écran a un autre contrat, il s'écrit ICI, jamais dans le spec.
const STATUT_ATTENDU: Readonly<Record<string, number>> = { '/_not-found': 404 };

export const statutAttendu = (url: string): number => STATUT_ATTENDU[url] ?? 200;

export const GROUPE_PUBLIC = '(public)';

const RACINE_V3 = join(__dirname, '..', '..', '..');

export const MANIFESTE_V3 = join(RACINE_V3, '.next', 'app-build-manifest.json');

export const BUDGETS_V3 = join(RACINE_V3, 'budgets.json');

export const lisGroupes = (source: string): readonly PorteurDeGroupe[] => {
  const budgets: unknown = JSON.parse(source);
  const groupes =
    typeof budgets === 'object' && budgets !== null && 'groupes' in budgets
      ? budgets.groupes
      : undefined;
  if (!Array.isArray(groupes)) {
    throw new Error(`${BUDGETS_V3} ne déclare aucun groupe de routes : le gate axe ne sait pas ce qui est (public).`);
  }
  return groupes.flatMap((groupe: unknown) =>
    typeof groupe === 'object' &&
    groupe !== null &&
    'id' in groupe &&
    typeof groupe.id === 'string' &&
    'motifs' in groupe &&
    Array.isArray(groupe.motifs)
      ? [{ id: groupe.id, motifs: groupe.motifs.filter((m: unknown) => typeof m === 'string') }]
      : [],
  );
};

export const pagesEmises = (
  entrees: readonly EntreeDeManifeste[],
): readonly EntreeDeManifeste[] =>
  entrees.filter((entree) => natureDeRoute(entree.route) === 'page');

const urlDe = (route: string): string => normaliseRoute(route).replace(/\/page$/, '') || '/';

const estDynamique = (segment: string): boolean => segment.startsWith('[');

const echantillonne = (
  gabarit: string,
  echantillons: Readonly<Record<string, string>>,
): RoutePublique => {
  const statut = statutAttendu(gabarit);
  if (!gabarit.split('/').some(estDynamique)) return { id: gabarit, chemin: gabarit, statut };

  const echantillon = echantillons[gabarit];
  if (echantillon === undefined) {
    throw new Error(
      `La route (public) ${gabarit} porte un segment dynamique et aucun échantillon ne la sert. ` +
        `Déclarer « '${gabarit}': '/…' » dans les échantillons du gate axe — ` +
        "aucun écran n'entre dans le balayage sans valeur d'exemple.",
    );
  }
  return { id: gabarit, chemin: echantillon, statut };
};

// `groupeDe` rend un verdict à DEUX champs, et `plusPrecis` pose délibérément `choix: null` dans
// DEUX cas distincts : aucun motif ne touche la page, ou deux groupes la réclament à précision
// égale. Son commentaire le dit — « ils rendent une ambiguïté que l'appelant doit SIGNALER plutôt
// qu'arbitrer ». `check-bundle-budget.mjs` l'honore en rc=2 ; ce gate-ci ne lisait que `.groupe`
// et jetait `ambigu`, ce qui rangeait une page SANS budget déclaré au même endroit qu'une page
// que `(connected)` réclame légitimement : sautée, en silence. La garde de non-vacuité ne
// rattrapait rien — elle ne tire que si la liste est TOTALEMENT vide.
const exigeUnGroupe = (
  route: string,
  verdict: { readonly groupe: string | null; readonly ambigu: readonly string[] },
): string | null => {
  if (verdict.groupe !== null) return verdict.groupe;
  throw new Error(
    verdict.ambigu.length > 0
      ? `La page émise ${route} est réclamée par ${verdict.ambigu.join(' et ')} avec la même ` +
        "précision : le gate axe ne tranche pas à la place de budgets.json. Préciser l'un des motifs."
      : `La page émise ${route} n'est réclamée par aucun motif de budgets.json : le gate axe ne ` +
        "peut ni la balayer ni l'écarter, et la sauter en silence sortirait vert sur un écran " +
        'que personne n\'a regardé. Déclarer son motif dans budgets.json → groupes.',
  );
};

export const routesPubliques = ({
  entrees,
  groupes,
  echantillons = {},
}: {
  readonly entrees: readonly EntreeDeManifeste[];
  readonly groupes: readonly PorteurDeGroupe[];
  readonly echantillons?: Readonly<Record<string, string>>;
}): readonly RoutePublique[] =>
  pagesEmises(entrees)
    .filter((entree) => exigeUnGroupe(entree.route, groupeDe(entree.route, groupes)) === GROUPE_PUBLIC)
    .map((entree) => echantillonne(urlDe(entree.route), echantillons))
    .sort((gauche, droite) => gauche.chemin.localeCompare(droite.chemin));

// LE TÉMOIN DE CONTRÔLE du balayage (leçon 345). Un gate d'accessibilité qui ne trouve rien ne
// prouve rien : il faut d'abord qu'il prouve qu'il VOIT. Le manifeste porte au moins le
// gestionnaire `/healthz/route` depuis L-0.5 ; s'il est vide, c'est l'instrument qui est en
// cause — build absent ou manifeste périmé — jamais l'absence de violation.
export const exigeUnManifesteLu = (
  entrees: readonly EntreeDeManifeste[],
): readonly EntreeDeManifeste[] => {
  if (entrees.length > 0) return entrees;
  throw new Error(
    `${MANIFESTE_V3} n'émet AUCUNE route : le gate axe n'a rien balayé et ne peut pas sortir vert. ` +
      'Lancer `bun run build` dans apps/web-v3 avant de mesurer une accessibilité.',
  );
};
