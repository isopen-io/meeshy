/**
 * L'OpenAPI publié écrit ses chemins comme le reste du dépôt : SANS barre finale.
 *
 * ## Le défaut que ce module ferme
 *
 * `@fastify/swagger` émet le chemin tel qu'il est DÉCLARÉ. Un module monté au
 * préfixe `/api/v1/me` qui déclare sa route racine en `'/'` produit donc
 * `/api/v1/me/`, barre comprise. Quinze chemins publiés étaient dans ce cas —
 * `/api/v1/me/`, `/api/v1/me/preferences/` et ses sept catégories,
 * `/api/v1/reports/`, `/api/v1/voice/profile/`, trois adresses d'administration.
 *
 * Les deux AUTRES descriptions de la même API n'en portent aucune : le
 * manifeste de routes (430 chemins, `route-manifest.json`) et le catalogue
 * client partagé (416 chemins, `packages/shared/api/endpoints.ts`, généré
 * DEPUIS ce manifeste). Deux sources sur trois écrivent `/api/v1/me` ; c'est
 * l'OpenAPI qui déviait.
 *
 * ## Pourquoi ce n'est pas cosmétique
 *
 * Le serveur sert les deux formes (`ignoreTrailingSlash`), donc aucun appel ne
 * casse. Le coût est ailleurs : toute comparaison entre l'OpenAPI et l'une des
 * deux autres sources rendait quinze FAUX NÉGATIFS, et un lecteur en concluait
 * que des routes vivantes manquaient au contrat. C'est arrivé — au point de
 * produire une issue, fermée comme non-défaut, avant que la vraie divergence ne
 * soit vue. Un contrat publié est lu par des humains ET par des générateurs ;
 * qu'il écrive une même route autrement que le reste du dépôt est un piège.
 *
 * ## Pourquoi ici, et pas dans les huit modules concernés
 *
 * Déclarer `''` au lieu de `'/'` dans chaque module marcherait, mais laisserait
 * le neuvième arriver. La normalisation vit donc au SEUL endroit par lequel la
 * spec atteint un consommateur — `transformSpecification` de `swagger-ui`,
 * vérifié comme unique lecteur (`fastify.swagger()` n'est appelée nulle part
 * ailleurs).
 */

/** Une spec OpenAPI, réduite à ce que ce module lit. */
type SpecOpenApi = {
  paths?: Record<string, Record<string, unknown>>;
  [autre: string]: unknown;
};

/** La forme canonique d'un chemin : sans barre finale, sauf la racine. */
function canoniser(chemin: string): string {
  if (chemin === '/' || !chemin.endsWith('/')) return chemin;
  return chemin.replace(/\/+$/, '') || '/';
}

/**
 * Les chemins qui portent encore une barre finale — la racine exclue, puisque
 * la dépouiller donnerait la chaîne vide, qui n'est pas un chemin.
 *
 * Exporté pour servir de GARDE : une assertion sur cette liste rougit dès qu'un
 * module neuf réintroduit la forme, ce qu'un simple `expect(spec)` ne dirait pas.
 */
export function cheminsAvecBarreFinale(spec: SpecOpenApi): string[] {
  return Object.keys(spec.paths ?? {}).filter((c) => c !== '/' && c.endsWith('/'));
}

/**
 * Rend une spec dont les chemins sont canoniques, et la liste des collisions.
 *
 * **Une collision n'est jamais résolue en silence.** Si `/x` et `/x/` déclarent
 * le même verbe, fusionner écraserait l'une des deux opérations : perdre une
 * opération en normalisant serait pire que la barre qu'on corrige. La forme
 * canonique l'emporte, les verbes DISJOINTS de la forme barrée sont repris, et
 * le conflit est RENDU pour que l'appelant le journalise.
 *
 * La spec reçue n'est pas modifiée — `swagger-ui` passe déjà un clone
 * (`transformSpecificationClone: true`), et un module pur ne doit pas dépendre
 * de ce réglage.
 */
export function canonicaliserCheminsOpenApi(spec: SpecOpenApi): {
  spec: SpecOpenApi;
  collisions: string[];
} {
  if (!spec.paths) return { spec, collisions: [] };

  const chemins: Record<string, Record<string, unknown>> = {};
  const collisions: string[] = [];

  // Les formes DÉJÀ canoniques d'abord : elles gagnent sur la forme barrée en
  // cas de conflit, et l'ordre de `Object.keys` ne doit pas décider du verdict.
  const entrees = Object.entries(spec.paths);
  const dejaCanoniques = entrees.filter(([c]) => canoniser(c) === c);
  const aCanoniser = entrees.filter(([c]) => canoniser(c) !== c);

  for (const [chemin, operations] of dejaCanoniques) {
    chemins[chemin] = { ...operations };
  }

  for (const [chemin, operations] of aCanoniser) {
    const cible = canoniser(chemin);
    const existant = chemins[cible];

    if (!existant) {
      chemins[cible] = { ...operations };
      continue;
    }

    for (const [verbe, operation] of Object.entries(operations)) {
      if (verbe in existant) {
        collisions.push(`${verbe.toUpperCase()} ${cible}`);
        continue;
      }
      existant[verbe] = operation;
    }
  }

  return { spec: { ...spec, paths: chemins }, collisions };
}
