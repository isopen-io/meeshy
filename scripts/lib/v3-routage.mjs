// LES INVARIANTS DE ROUTAGE DE LA ZONE v3 — extraits de `scripts/check-v3-pipeline.mjs`, qui
// les DÉROULE une fois par déploiement (cf. `DEPLOIEMENTS` là-bas). Le garde de la chaîne
// dépassait son budget de taille ; ce qui en sort est la famille qui a sa propre question —
// « ce que la règle Traefik réclame, le worker legacy, ce que la zone sert et ce qu'elle lit
// de son environnement » — et rien de ce qui touche à ci.yml ou docker.yml.
//
// Les fonctions sont TEXTUELLEMENT celles du garde : les constantes qu'elles nomment leur
// sont remises une fois (`constantes`), avec les deux lecteurs de YAML (`blockOf`, `listValues`)
// qui vivent toujours à côté de ceux qui lisent les workflows. Les sondes du self-test
// (`--self-test`) restent dans le garde : c'est lui qui prouve que chacun de ces invariants
// rougit encore sur la mutation qui lui est destinée.

import {
  capture,
  cheminsReclames,
  REECRITURES_DE_ZONE,
  regleDuRouteur,
  routeDeReecriture,
} from '../../apps/web-v3/scripts/lib/perimetre-de-zone.mjs';

export const invariantsDeRoutage = ({ constantes, blockOf, listValues }) => {
  const {
    V3_PATH_PREFIX,
    V3_ASSET_ZONE,
    V3_DIRECTORY,
    V3_APP_DIRECTORY,
    V3_PUBLIC_DIRECTORY,
    V3_PORT,
    V3_IMAGE,
    WORKER_LEGACY,
    LEGACY_APP_DIRECTORY,
  } = constantes;

  const labelsOf = (compose, service) => {
    const block = blockOf(compose, `  ${service}:`);
    return block === null ? null : listValues(block, '    labels:');
  };

  const v3RuleOf = (world, dep) => regleDuRouteur(dep.source(world), dep.v3);

  // SENS (a) — rien de ce que la zone sert à la RACINE n'échappe à la règle.
  const noRootServedAssetEscapesTheZone = (dep) => (world) => {
    const rule = v3RuleOf(world, dep);
    if (rule === null) return [];
    const claimed = cheminsReclames(rule);
    const remedy =
      `l'ajouter nommément à la règle du routeur ${dep.v3} (il est alors VOLÉ au legacy), ` +
      `ou le faire passer par le pipeline webpack pour qu'il atterrisse sous ${V3_ASSET_ZONE}/static/media/`;
    return [
      ...world.zone.publicFiles.map((url) => [
        url,
        `${V3_PUBLIC_DIRECTORY}${url} est servi à la RACINE`,
      ]),
      ...world.zone.metadataUrls.map((url) => [
        url,
        `${url} est un fichier de métadonnées servi à la RACINE`,
      ]),
    ]
      .filter(([url]) => !claimed.some((claim) => capture(claim, url)))
      .map(
        ([url, constat]) =>
          `${constat} de l'URL — assetPrefix ne préfixe que ${V3_ASSET_ZONE} — donc derrière Traefik ` +
          `c'est le LEGACY qui répond à ${url}. Remède : ${remedy}.`,
      );
  };

  // SENS (b) — la règle ne réclame au legacy que des chemins que la zone SERT.
  // LA RÉCIPROQUE, ET C'EST ELLE QUI MANQUAIT — mais elle se pose sur le
  // SERVICE WORKER, pas sur le routeur, et la nuance est tout le sujet.
  //
  // `theRouterClaimsNothingTheZoneDoesNotServe` garde un sens : la règle ne
  // réclame rien que la zone ne serve. L'autre sens n'était gardé par personne
  // — la zone pouvait servir un écran que la règle NE RÉCLAME PAS, et cet
  // écran restait rendu par le legacy, invisible, sans qu'aucun gate ne
  // rougisse.
  //
  // Mesuré le 2026-09-03 : `/stories/:id`, `/post/:id`, `/search`, `/links`,
  // `/contacts` et `/notifications` étaient tous servis par `app/` et ABSENTS
  // de la règle de staging. Six écrans livrés, testés, mesurés — et
  // injoignables. Le porteur en a conclu que le travail n'était pas fait, ce
  // qui était la seule conclusion que la preuve à sa disposition autorisait.
  //
  // POURQUOI PAS LE ROUTEUR : la bascule d'un écran se fait en DEUX temps, et
  // `leWorkerLegacySEfface` garde déjà le second. Le worker legacy est
  // enregistré sur `scope:'/'` et intercepte la navigation de tout visiteur
  // REVENANT ; réclamer un chemin au routeur avant que le worker déployé sache
  // s'en effacer sert la v3 aux navigateurs neufs seulement. L'ordre est donc :
  // déclarer le préfixe dans `V3_ZONE_PREFIXES`, DÉPLOYER, puis réclamer.
  //
  // Cet invariant garde la PREMIÈRE marche — la seule que le dépôt puisse
  // tenir seul. Un écran servi par `app/` et inconnu du worker n'est pas
  // « pas encore basculé » : il est hors du chemin de bascule, et personne ne
  // le remarquera. Les deux invariants ensemble tracent la route complète :
  // servi ⇒ connu du worker (ici) ⇒ réclamé par le routeur
  // (`leWorkerLegacySEfface`, dans l'autre sens).
  const leWorkerConnaitToutCeQueLaZoneSert = (world) => {
    const zone = zoneDuWorker(world.worker);
    if (zone === null) return [];

    // DEUX ROUTES NE SONT PAS DES ÉCRANS, et les déclarer serait une faute.
    //
    //   • `/healthz` est interrogée par le conteneur SUR LUI-MÊME
    //     (`wget http://0.0.0.0:3300/healthz` dans le healthcheck) : elle ne
    //     passe jamais par Traefik ni par un navigateur ;
    //   • la CIBLE d'une réécriture (`/rt/:nom`) se sert par sa SOURCE
    //     (`/__v3/rt/:nom`), déjà couverte par le préfixe de zone.
    const ciblesDeReecriture = new Set(REECRITURES_DE_ZONE.map(({ destination }) => routeDeReecriture(destination)));
    const horsSurface = (url) => url === '/healthz' || ciblesDeReecriture.has(url);

    // Un segment dynamique se teste sur un REPRÉSENTANT : le worker compare des
    // chemins concrets, comme le navigateur les lui donne.
    const concret = (url) => url.replace(/\[\.{3}[^\]]+\]/g, 'x/y').replace(/\[[^\]]+\]/g, 'x');

    return world.zone.routeUrls
      .filter((url) => !url.startsWith(V3_PATH_PREFIX))
      .filter((url) => !horsSurface(url))
      // Le prédicat du worker est EXÉCUTÉ, jamais réécrit : une seconde
      // implémentation prétendrait garder la divergence qu'elle créerait.
      .filter((url) => !zone.couvre(concret(url)))
      .map(
        (url) =>
          `${V3_DIRECTORY}/app sert ${url}, que V3_ZONE_PREFIXES du worker legacy ne couvre pas : ` +
          `l'écran existe et il est testé, mais il n'est sur AUCUN chemin de bascule — ` +
          `le worker legacy continuera de l'intercepter chez tout visiteur revenant, ` +
          `et le routeur ne pourra pas le réclamer sans le servir aux seuls navigateurs neufs`,
      );
  };

  const theRouterClaimsNothingTheZoneDoesNotServe = (dep) => (world) => {
    const rule = v3RuleOf(world, dep);
    if (rule === null) return [];
    const served = [
      ...world.zone.routeUrls,
      ...world.zone.rewrittenUrls,
      ...world.zone.metadataUrls,
      ...world.zone.publicFiles,
    ];
    // Le préfixe de zone NU se refuse toujours, même depuis que la zone y sert
    // autre chose que ses bundles : `/__v3` se réclame par SOUS-ZONE
    // (`/__v3/_next`, `/__v3/rt/`), jamais en bloc — tout ce qui n'est ni l'une
    // ni l'autre y répond le 404 anglais du routeur Pages.
    const sousZones = [V3_ASSET_ZONE, ...REECRITURES_DE_ZONE.map(({ source }) => source.replace(/:[^/]+$/, ''))];
    const estLaZoneNue = (claim) => claim.valeur === V3_PATH_PREFIX || claim.valeur === `${V3_PATH_PREFIX}/`;
    return cheminsReclames(rule)
      .filter((claim) => !claim.valeur.startsWith(V3_ASSET_ZONE))
      .filter((claim) => estLaZoneNue(claim) || !served.some((url) => capture(claim, url)))
      .map((claim) =>
        estLaZoneNue(claim)
          ? `la règle réclame ${V3_PATH_PREFIX} nu alors que la zone n'y sert que ${sousZones.join(' et ')} : ` +
            `tout autre chemin sous ${V3_PATH_PREFIX} répondrait le 404 anglais du routeur Pages ` +
            `(sans <html lang>, sans le script anti-flash de thème)`
          : `la règle réclame ${claim.valeur}, que rien dans ${V3_DIRECTORY}/app ne sert : ` +
            `ce chemin est pris au legacy pour y répondre 404`,
      );
  };

  /**
   * CHAQUE RÉÉCRITURE DE ZONE PART DE LA ZONE ET ATTERRIT SUR UNE ROUTE SERVIE.
   *
   * `app/__v3/rt/[nom]/route.ts` a existé : témoins verts (ils appelaient `GET`
   * directement), type-check vert, et une route que Next n'aurait JAMAIS servie —
   * tout segment de `app/` qui commence par `_` est un dossier privé, hors du
   * routage. L'inventaire de la zone le savait (`isRoutable`), et c'est lui qui
   * l'a dit : « la règle réclame /__v3/rt/, que rien ne sert ». La réécriture
   * qui porte ces actifs dans la zone est déclarée une fois
   * (`perimetre-de-zone.mjs`) ; ce contrôle garde ses deux bouts.
   */
  const everyZoneRewriteLandsOnAServedRoute = (world) =>
    REECRITURES_DE_ZONE.flatMap(({ source, destination }) => [
      ...(source.startsWith(`${V3_PATH_PREFIX}/`)
        ? []
        : [`la réécriture ${source} → ${destination} ne part pas de la zone ${V3_PATH_PREFIX}`]),
      ...(world.zone.routeUrls.includes(routeDeReecriture(destination))
        ? []
        : [
            `la réécriture ${source} vise ${destination}, que rien dans ${V3_APP_DIRECTORY} ne sert : ` +
              `le chemin de zone qu'elle porte répondrait 404`,
          ]),
    ]);

  // Le COPY du runner et l'existence de public/ vont ENSEMBLE, dans les deux sens.
  /**
   * LE WORKER LEGACY S'EFFACE DEVANT TOUT CE QUE LE ROUTEUR RÉCLAME (§ 4.4 bis).
   *
   * Traefik n'est pas le seul aiguilleur de l'origine : `apps/web/public/sw.js`
   * est enregistré sur `scope: '/'` et sa branche « App Shell » répond
   * `cachedResponse || fetchPromise` à toute NAVIGATION. Un chemin basculé côté
   * routeur mais absent de `V3_ZONE_PREFIXES` est donc servi par la v3 aux
   * navigateurs NEUFS et par le cache du legacy aux REVENANTS — et le retour
   * arrière du § 4.3 y est inerte.
   *
   * CE QUE CE GARDE AJOUTE À CELUI QUI EXISTAIT. `apps/web/__tests__/public/
   * sw.v3-zone.test.ts` posait déjà la question, avec deux angles morts que la
   * bascule de staging a traversés tous les deux :
   *
   *   1. il ne lit que `docker-compose.prod.yml` et le routeur `frontend-v3`,
   *      alors que la bascule se joue sur `frontend-v3-staging` ;
   *   2. son extraction ne connaît que `PathPrefix(…)` et jette `Path(…)` sans
   *      un mot — or `Path(`/`)` est précisément la forme de l'étape « la
   *      vitrine ».
   *
   * Résultat mesuré : `/` a été réclamé par le routeur de staging sans jamais
   * entrer dans `V3_ZONE_PREFIXES`, et aucun témoin n'a rougi. C'est le défaut
   * de #4630 rejoué sur un autre axe — un garde paramétré par le DÉPLOIEMENT ne
   * suffit pas si le second lecteur de la même donnée, lui, ne l'est pas.
   *
   * LE PRÉDICAT N'EST PAS RECOPIÉ : il est EXÉCUTÉ. `belongsToV3Zone` et sa
   * liste sont extraits de la source de production et évalués tels quels — une
   * réécriture ici serait la quatrième lecture de cette donnée, et la plus
   * dangereuse, puisqu'elle prétendrait garder la divergence.
   */
  const zoneDuWorker = (source) => {
    const bloc = source.match(
      /const V3_ZONE_PREFIXES = \[[^\]]*\];[\s\S]*?function belongsToV3Zone\(pathname\) \{[\s\S]*?\n\}/,
    );
    if (bloc === null) return null;
    return new Function(
      `${bloc[0]}\nreturn { prefixes: V3_ZONE_PREFIXES, couvre: belongsToV3Zone };`,
    )();
  };

  const leWorkerLegacySEfface = (dep) => (world) => {
    const rule = v3RuleOf(world, dep);
    if (rule === null) return [];

    const zone = zoneDuWorker(world.worker);
    if (zone === null) {
      return [
        `${WORKER_LEGACY} : ni V3_ZONE_PREFIXES ni belongsToV3Zone ne s'y lisent sous la forme ` +
          `attendue — la frontière de zone du worker ne peut plus être opposée à la règle du ` +
          `routeur ${dep.v3}, et son absence de verdict ressemblerait à un verdict favorable`,
      ];
    }

    return cheminsReclames(rule)
      .filter(({ valeur }) => !zone.couvre(valeur))
      .map(
        ({ matcher, valeur }) =>
          `${dep.fichier} : le routeur ${dep.v3} réclame ${matcher}(\`${valeur}\`) que ` +
          `V3_ZONE_PREFIXES de ${WORKER_LEGACY} ne couvre pas (${zone.prefixes.join(', ')}). ` +
          `Le worker legacy, enregistré sur scope:'/', continue d'intercepter cette navigation ` +
          `chez tout visiteur revenant : la v3 est servie aux navigateurs NEUFS seulement, et le ` +
          `retour arrière du § 4.3 y est inerte. Remède (§ 4.4 bis, ordre dans UN sens) : ajouter ` +
          `le préfixe à V3_ZONE_PREFIXES dans un commit ANTÉRIEUR, le DÉPLOYER, puis seulement ` +
          `l'ajouter au routeur`,
      );
  };

  /**
   * AUCUN `PathPrefix` NE VOLE UNE ROUTE VOISINE DU LEGACY.
   *
   * `PathPrefix` de Traefik est un préfixe de CHAÎNE, pas de SEGMENTS : la règle
   * qui réclame `PathPrefix(`/l`)` pour l'écran d'un lien réclame aussi `/login`,
   * `/links` et `/lien`. Mesuré sur staging le 2026-09-01 — les trois étaient
   * servis par la zone, donc par le 404 du routeur Pages de la v3, alors que le
   * legacy les sert. `/login` est l'appel à l'action de la vitrine : il était mort
   * depuis la bascule de l'étape 2, et la production n'y échappait que parce que
   * sa règle n'a pas encore franchi l'étape 1.
   *
   * POURQUOI RIEN NE L'AVAIT VU. Les trois lecteurs de cette règle modélisaient
   * `PathPrefix` comme un préfixe SEGMENTÉ — un modèle plus prudent que la
   * réalité, donc un modèle qui DÉCLARE une frontière que l'aiguilleur ne trace
   * pas. L'invariant « la règle ne réclame que des chemins servis » regardait les
   * VALEURS réclamées (`/l` est bien servi) ; celui-ci regarde ce que ces valeurs
   * EMPORTENT. C'est la question du § 4.4 bis posée dans l'autre sens : non pas
   * « ce que je bascule est-il servi ? » mais « qu'est-ce qui bascule AVEC ? ».
   *
   * Le remède est dans l'écriture de la règle : un `PathPrefix` destiné à un
   * sous-chemin porte sa barre finale (`/l/`), qui rend le préfixe de chaîne et le
   * préfixe de segments équivalents.
   */
  const aucunPrefixeNeVoleUneRouteVoisine = (dep) => (world) => {
    const rule = v3RuleOf(world, dep);
    if (rule === null) return [];

    const servies = new Set(world.zone.routeUrls);

    return cheminsReclames(rule)
      .filter(({ matcher }) => matcher === 'PathPrefix')
      .flatMap(({ valeur }) =>
        world.legacyRoutes
          .filter((route) => route !== valeur && route.startsWith(valeur) && !servies.has(route))
          .map(
            (route) =>
              `${dep.fichier} : le routeur ${dep.v3} réclame PathPrefix(\`${valeur}\`), et ` +
              `PathPrefix de Traefik est un préfixe de CHAÎNE — il emporte donc ${route}, que ` +
              `${LEGACY_APP_DIRECTORY} sert et que la zone NE sert pas. Le visiteur y reçoit le 404 ` +
              `du routeur Pages de la v3. Remède : écrire le préfixe avec sa barre finale ` +
              `(PathPrefix(\`${valeur}/\`)), ou servir ${route} depuis la zone`,
          ),
      );
  };

  /**
   * LES PAQUETS COPIÉS SOUS LA RACINE SORTENT DU TYPE-CHECK DE LA V3.
   *
   * Le Dockerfile copie les paquets du monorepo SOUS la racine de l'application
   * (`/app/packages/…`) — c'est ce qui crée le lien de workspace dans l'image.
   * Or le `tsconfig.json` de la v3 inclut tous les `.ts` depuis cette même racine :
   * dans l'image, et dans l'image SEULEMENT, les sources des paquets deviennent
   * les siennes.
   *
   * Mesuré : l'ajout de `@meeshy/shared` a fait type-checker
   * `packages/shared/prisma/migrations/migrate-user-roles.ts` par `next build`,
   * qui a échoué sur `Cannot find module '../client'` — le client Prisma que la
   * v3 ne génère pas et n'a aucune raison de générer. Dix minutes de
   * construction pour l'apprendre, et RIEN en local ne pouvait le dire : le
   * défaut est créé par la GÉOGRAPHIE de l'image. `@meeshy/design-tokens` et
   * `@meeshy/icons` ne l'avaient jamais révélé — ils ne portent aucun `.ts`.
   *
   * Exclure n'empêche pas d'importer : TypeScript suit toujours les `.d.ts` par
   * la résolution de modules. Cela l'empêche seulement de compiler les sources du
   * paquet comme si elles étaient les nôtres.
   */

  const leDeploiementRouteLaV3 = (dep) => (world) => {
    const labels = labelsOf(dep.source(world), dep.v3);
    if (labels === null) {
      return [`${dep.fichier} ne déclare aucun service ${dep.v3}`];
    }
    const rule = labels.find((label) =>
      label.startsWith(`traefik.http.routers.${dep.v3}.rule=`),
    );
    const failures = [];
    if (rule === undefined || !rule.includes(`PathPrefix(\`${V3_ASSET_ZONE}\`)`)) {
      failures.push(`le routeur ${dep.v3} ne porte pas PathPrefix(\`${V3_ASSET_ZONE}\`)`);
    }
    if (!labels.includes(`traefik.http.routers.${dep.v3}.priority=100`)) {
      failures.push(`le routeur ${dep.v3} ne prend pas le pas sur le plancher legacy`);
    }
    if (
      !labels.includes(
        `traefik.http.services.${dep.v3}.loadbalancer.server.port=${V3_PORT}`,
      )
    ) {
      failures.push(`le service ${dep.v3} n'est pas servi sur le port ${V3_PORT}`);
    }
    if (!labels.includes(`traefik.http.routers.${dep.v3}.entrypoints=websecure`)) {
      failures.push(`le routeur ${dep.v3} n'entre pas par websecure`);
    }
    return failures;
  };

  const theLegacyRouterKeepsItsFloor = (dep) => (world) => {
    const labels = labelsOf(dep.source(world), dep.legacy);
    if (labels === null) {
      return [`${dep.fichier} ne déclare plus le service ${dep.legacy}`];
    }
    const rule = labels.find((label) =>
      label.startsWith(`traefik.http.routers.${dep.legacy}.rule=`),
    );
    const failures = [];
    if (!labels.includes(`traefik.http.routers.${dep.legacy}.priority=1`)) {
      failures.push(`le routeur ${dep.legacy} a perdu sa priorité de plancher (1)`);
    }
    if (rule !== undefined && rule.includes('PathPrefix')) {
      failures.push(`le routeur ${dep.legacy} restreint ses chemins — il doit rester attrape-tout`);
    }
    return failures;
  };

  /**
   * Les variables dont l'ABSENCE du service est SÛRE — nommées ici, une par une,
   * avec leur raison. Une exemption qui se tait ne se relit pas.
   */
  const ENV_REPLI_SUR = new Map([
    ['NODE_ENV', "posée par le Dockerfile (ENV NODE_ENV=production) et par Next lui-même"],
    // Ni l'une ni l'autre n'est INCONDITIONNELLEMENT nécessaire — leur absence
    // est SÛRE tant que le déploiement ne route rien au-delà des actifs de
    // zone (`/__v3/_next`, `/__v3/rt/`, `/__v3/sw`), ce que la règle GÉNÉRALE
    // ci-dessous ne sait pas exprimer (elle exige la déclaration, point). La
    // question conditionnelle est posée par l'invariant DÉDIÉ,
    // `unDeploiementQuiRouteAuDelaDesActifsDeclareLaNavigationDeZone`, plus
    // bas dans ce fichier — c'est lui qui rougit le jour où un déploiement
    // franchit le préfixe de zone sans les poser.
    ['V3_NAVIGABLE', "gouvernée par l'invariant dédié « actifs seulement » ci-dessous, pas par cette règle générale"],
    ['V3_SW_PORTEES', "même exemption que V3_NAVIGABLE, même invariant dédié, même raison"],
  ]);

  const environmentOf = (compose, service) => {
    const block = blockOf(compose, `  ${service}:`);
    return block === null ? null : listValues(block, '    environment:').map((entry) => entry.split('=')[0]);
  };

  // Le CONTRAT D'ENVIRONNEMENT de la zone, gardé comme le sont ses chemins servis.
  //
  // Le défaut qui l'appelle : `/l/:token` est le premier code v3 qui lit
  // l'environnement à l'exécution, et le service n'en déclarait aucune variable.
  // `baseDeLaPasserelle()` retombait donc sur `http://localhost:3000` — dans le
  // conteneur, le conteneur LUI-MÊME —, et la route rendait 503 pour tout le
  // monde. Le manque de `PathPrefix('/l')` le MASQUAIT : le jour où la règle du
  // routeur réclame ce chemin, la route devient joignable et échoue partout, sans
  // qu'aucun autre invariant ne dise pourquoi.
  //
  // La question n'est donc pas « la variable est-elle lue ? » mais « le repli qui
  // s'applique quand elle manque est-il celui du DÉPLOIEMENT ? ». Un repli codé en
  // dur dans une source est, par construction, celui du poste de développement :
  // il ne peut pas répondre pour l'image. D'où la règle — chaque chaîne de replis
  // lue par `app/` ou `lib/` a au moins une variable déclarée sur le service —, et
  // une exemption qui se NOMME plutôt qu'un silence.
  const theV3ServiceDeclaresWhatItsCodeReads = (dep) => (world) => {
    const declared = environmentOf(dep.source(world), dep.v3);
    if (declared === null) return [];
    return world.envChains
      .filter(
        ({ variables }) =>
          !variables.some((name) => declared.includes(name) || ENV_REPLI_SUR.has(name)),
      )
      .map(
        ({ file, variables }) =>
          `${file} lit ${variables.join(' ?? ')} et aucune de ces variables n'est déclarée sur le ` +
          `service ${dep.v3} de ${dep.fichier} : dans le conteneur c'est le repli codé ` +
          `en dur de la source qui s'applique, c'est-à-dire celui du poste de développement`,
      );
  };

  // «ACTIFS SEULEMENT» N'A RIEN À DÉCLARER ; TOUT LE RESTE DOIT DÉCLARER LA
  // NAVIGATION DE ZONE.
  //
  // `V3_NAVIGABLE` (`blocDuNavigateur`, #5106) et `V3_SW_PORTEES`
  // (`SCRIPT_DU_TRAVAILLEUR`, #4472/#4473) sont servies par TOUT document
  // PLEIN ÉCRAN (`documentPleinEcran`, `/l/` compris) ET par les écrans
  // connectés que compose `documentDuSite` — pas seulement par un sous-
  // ensemble nommé « écrans connectés » au sens étroit. Un déploiement dont
  // la règle Traefik ne réclame RIEN au-delà du préfixe de zone
  // (`/__v3/_next`, `/__v3/rt/`, `/__v3/sw`) est en ACTIFS SEULEMENT : aucun
  // humain n'atteint encore ce code, et l'absence des deux variables est
  // SÛRE — c'est le régime de `docker-compose.prod.yml` aujourd'hui (§ 4.9,
  // aucun `PathPrefix`/`Path` humain n'y est encore posé). Dès qu'UNE seule
  // route franchit le préfixe de zone (le cas de `docker-compose.staging.yml`,
  // qui sert déjà `/l/`, `/chats`, `/chat/`…), le code qui lit ces deux
  // variables devient joignable, et leur absence redevient un défaut.
  //
  // C'est un invariant DISTINCT de `theV3ServiceDeclaresWhatItsCodeReads` (la
  // règle générale, inconditionnelle) : les deux variables en sont exemptées
  // (`ENV_REPLI_SUR`) précisément parce que leur nécessité DÉPEND du routage
  // — une condition que la règle générale ne sait pas exprimer.
  const NAVIGATION_DE_ZONE = ['V3_NAVIGABLE', 'V3_SW_PORTEES'];

  const theV3ServiceDeclaresZoneNavigationWhenItRoutesBeyondAssets = (dep) => (world) => {
    const rule = v3RuleOf(world, dep);
    if (rule === null) return [];
    const cheminsHumains = cheminsReclames(rule).filter(
      ({ valeur }) => !valeur.startsWith(V3_PATH_PREFIX),
    );
    if (cheminsHumains.length === 0) return [];
    const declared = environmentOf(dep.source(world), dep.v3);
    if (declared === null) return [];
    return NAVIGATION_DE_ZONE.filter((name) => !declared.includes(name)).map(
      (name) =>
        `le service ${dep.v3} de ${dep.fichier} route ${cheminsHumains[0].valeur} au-delà des actifs de ` +
        `zone mais ne déclare pas ${name} : le code qui la lit (blocDuNavigateur / SCRIPT_DU_TRAVAILLEUR) ` +
        `est déjà joignable, et sa chaîne de replis retombe sur le poste de développement`,
    );
  };

  const environmentEntriesOf = (compose, service) => {
    const block = blockOf(compose, `  ${service}:`);
    if (block === null) return null;
    return new Map(
      listValues(block, '    environment:').map((entry) => {
        const separateur = entry.indexOf('=');
        return separateur === -1 ? [entry, ''] : [entry.slice(0, separateur), entry.slice(separateur + 1)];
      }),
    );
  };

  // L'ORIGINE PUBLIQUE DE LA PASSERELLE EST JOIGNABLE PAR UN NAVIGATEUR.
  //
  // Le défaut qui l'appelle (staging, 2026-09-05) : le conteneur de la v3
  // tournait sans `NEXT_PUBLIC_API_URL`, et chaque document remettait au
  // navigateur `http://gateway-staging:3000` — l'adresse INTERNE des
  // conteneurs, bloquée en contenu mixte sous une page HTTPS. L'invariant
  // voisin (« le service déclare ce que son code lit ») était VERT : il vérifie
  // qu'une variable de la chaîne est déclarée, pas que la valeur déclarée est
  // une origine qu'un navigateur atteint. Deux questions, deux gardes :
  // celui-ci lit la VALEUR — https, et distincte de l'adresse interne.
  const lOriginePubliqueEstJoignableParUnNavigateur = (dep) => (world) => {
    const env = environmentEntriesOf(dep.source(world), dep.v3);
    if (env === null) return [];
    const publique = env.get('NEXT_PUBLIC_API_URL');
    const interne = env.get('MEESHY_GATEWAY_URL');
    if (publique === undefined) {
      return [
        `le service ${dep.v3} de ${dep.fichier} ne déclare pas NEXT_PUBLIC_API_URL : le document n'aurait ` +
          `plus que MEESHY_GATEWAY_URL, l'adresse INTERNE des conteneurs qu'un navigateur ne résout pas — ` +
          `il refuserait de la servir et /healthz répondrait 503`,
      ];
    }
    const failures = [];
    if (!/^https:\/\//.test(publique)) {
      failures.push(
        `le service ${dep.v3} de ${dep.fichier} déclare NEXT_PUBLIC_API_URL=${publique}, qui n'est pas une ` +
          `origine https : remise dans un document HTTPS, elle est bloquée en contenu mixte`,
      );
    }
    if (interne !== undefined && publique === interne) {
      failures.push(
        `le service ${dep.v3} de ${dep.fichier} déclare NEXT_PUBLIC_API_URL à l'adresse INTERNE ` +
          `(${interne}) : le navigateur ne la résout pas`,
      );
    }
    return failures;
  };

  const theV3ContainerIsDisjointFromTheLegacy = (dep) => (world) => {
    const block = blockOf(dep.source(world), `  ${dep.v3}:`);
    if (block === null) return [];
    const failures = [];
    if (!new RegExp(`^\\s*image:.*${V3_IMAGE}`, 'm').test(block)) {
      failures.push(`le service ${dep.v3} ne tire pas l'image ${V3_IMAGE}`);
    }
    if (!new RegExp(`^\\s*container_name:\\s*meeshy-${dep.v3}\\s*$`, 'm').test(block)) {
      failures.push(`le service ${dep.v3} ne porte pas son propre nom de conteneur`);
    }
    return failures;
  };

  return {
    noRootServedAssetEscapesTheZone,
    theRouterClaimsNothingTheZoneDoesNotServe,
    leWorkerConnaitToutCeQueLaZoneSert,
    everyZoneRewriteLandsOnAServedRoute,
    leWorkerLegacySEfface,
    aucunPrefixeNeVoleUneRouteVoisine,
    leDeploiementRouteLaV3,
    theLegacyRouterKeepsItsFloor,
    theV3ServiceDeclaresWhatItsCodeReads,
    theV3ServiceDeclaresZoneNavigationWhenItRoutesBeyondAssets,
    lOriginePubliqueEstJoignableParUnNavigateur,
    theV3ContainerIsDisjointFromTheLegacy,
  };
};
