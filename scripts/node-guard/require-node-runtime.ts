/**
 * La version de Node qu'exigent les générateurs qui ASSEMBLENT le serveur.
 *
 * ## Pourquoi une garde d'EXÉCUTION, alors que `engines` existe déjà
 *
 * `engines` est vérifié à l'INSTALLATION, et par le gestionnaire de paquets
 * seulement. Or l'échec que cette garde intercepte se produit à l'EXÉCUTION,
 * sur un arbre DÉJÀ installé : `npx tsx scripts/generate-route-manifest.ts`
 * sous un Node trop ancien rend
 *
 *     TypeError: webidl.util.markAsUncloneable is not a function
 *
 * — une pile qui pointe l'intérieur d'`undici` et ne nomme ni la cause ni le
 * remède. Aucune valeur d'`engines` ne change cet instant-là. Ce dépôt installe
 * de plus avec bun par défaut, et bun IGNORE `engines` : la déclaration y est
 * documentaire, jamais opposable.
 *
 * ## Et pourquoi elle refuse aussi bun
 *
 * Ces générateurs assemblent le vrai serveur Fastify, qui ouvre un socket ZMQ.
 * bun 1.3 y panique (`unsupported uv function: uv_async_init`) — un défaut de
 * runtime, pas de version, qu'aucun réglage de Node ne referme. Le dire ici
 * évite de relire un panic de bun comme un dépôt cassé.
 */

/**
 * Seuil MESURÉ, et non déclaré — la distinction décide du comportement.
 *
 * `undici@8.10.0` déclare `engines: { node: '>=22.19.0' }`, et c'est ce chiffre
 * qui appartient au champ `engines` de nos `package.json` : là, il exprime
 * l'exigence de la dépendance, et il n'empêche personne de travailler.
 *
 * Une garde d'EXÉCUTION ne peut pas se permettre le même chiffre. Ce qui manque
 * réellement à un Node trop ancien est `worker_threads.markAsUncloneable`,
 * arrivé en **22.12.0** — mesuré : `undefined` en 22.9.0, `function` en 22.12.0,
 * et les deux générateurs passent dès 22.12. Poser 22.19 ici REFUSERAIT un
 * runtime qui fonctionne (22.13, 22.16…), c'est-à-dire bloquerait le travail au
 * nom d'une prudence que rien n'a observée. Un faux positif dans une garde
 * d'outillage coûte plus cher que l'avertissement qu'il prétend donner.
 *
 * Si un jour un AUTRE symptôme surgit sous un Node entre 22.12 et 22.19, c'est
 * la première piste — et alors le seuil montera sur une mesure, comme celui-ci.
 */
const NODE_MINIMUM = [22, 12, 0] as const;

function estAnterieure(version: string, minimum: readonly number[]): boolean {
  const parties = version.split('.').map((n) => Number.parseInt(n, 10));
  for (const [rang, exigee] of minimum.entries()) {
    const presente = parties[rang] ?? 0;
    if (presente !== exigee) return presente < exigee;
  }
  return false;
}

export function exigerNodeRecent(script: string): void {
  const minimum = NODE_MINIMUM.join('.');

  if (typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined') {
    console.error(
      `[${script}] Ce generateur assemble le serveur Fastify, qui ouvre un socket ZMQ :\n` +
        `bun 1.3 y panique (unsupported uv function: uv_async_init). Relancer sous Node :\n\n` +
        `    npx tsx ${script}\n`
    );
    process.exit(1);
  }

  const presente = process.versions.node;
  if (!estAnterieure(presente, NODE_MINIMUM)) return;

  console.error(
    `[${script}] Node ${presente} est trop ancien : il lui manque\n` +
      `worker_threads.markAsUncloneable, arrive en Node ${minimum} et utilise par undici@8\n` +
      `(qui declare de son cote >= 22.19.0). Sans lui, ce script echoue sur\n` +
      `« webidl.util.markAsUncloneable is not a function » — une pile qui pointe\n` +
      `l'interieur d'undici et ne nomme ni la cause ni le remede. Relancer sous :\n\n` +
      `    PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH" npx tsx ${script}\n\n` +
      `(nvm ls  pour voir les versions installees ; nvm install 22  pour en poser une)\n`
  );
  process.exit(1);
}
