// LES SONDES DU SELF-TEST de `scripts/check-v3-pipeline.mjs` — chaque entrée est un monde MUTÉ
// (un fichier de la chaîne altéré d'une seule façon) et l'échec que le garde DOIT alors produire.
// Un garde qui ne rougit pas sur sa sonde est AVEUGLE, et c'est `--self-test` qui le dit.
//
// Elles vivent ici parce que le garde dépassait son budget de taille : ce fichier est de la
// DONNÉE, pas de la loi — il nomme les fichiers (`prod`, `staging`, `worker`, `ci`…), les
// constantes de la zone lui sont remises une fois, et `replaceIn` est celui du garde.

export const sondesDuGarde = ({ constantes, replaceIn }) => {
  const { V3_WORKSPACE, V3_DIRECTORY, V3_IMAGE, V3_PORT, V3_ROUTER, V3_PATH_PREFIX, V3_ASSET_ZONE, V3_PUBLIC_DIRECTORY, LEGACY_ROUTER } = constantes;

  return [
    [
      'le tsconfig de la v3 cesse d\'exclure les paquets copiés dans l\'image',
      (world) => replaceIn(world, 'v3TsConfig', /,\s*"packages"/, ''),
      'balaie ses fichiers comme si ils étaient ceux de la v3',
    ],
    [
      // LA VICTIME EST SYNTHÉTIQUE, ET C'EST LE CORRECTIF — pas un raccourci.
      //
      // Cette sonde a changé de victime DEUX FOIS pour la même raison : elle
      // nommait une route que le legacy servait SEUL, et la zone a fini par la
      // servir. `/login` d'abord, `/links` ensuite (l'écran des liens, #4933) —
      // et le commentaire qui accompagnait le second changement décrivait déjà
      // le mécanisme sans en tirer la conséquence : « c'est la victime qui
      // SUBSISTE ». Une victime qui subsiste est une victime en sursis.
      //
      // Aujourd'hui il n'en reste AUCUNE sous `/l` : `/l`, `/links` et `/login`
      // sont les trois routes du legacy qui commencent par `/l`, et la zone
      // sert les trois. La sonde ne peut donc plus tirer sa victime du dépôt —
      // et il ne faut pas lui en chercher une quatrième, qui mourrait à son
      // tour.
      //
      // Elle FABRIQUE donc la sienne. Ce que la sonde éprouve est la LOI du
      // garde — « un PathPrefix sans barre finale emporte ses voisins de
      // chaîne » — et cette loi ne dépend pas de quelles routes existent
      // aujourd'hui. Un monde muté est fait pour ça : lui donner un voisin que
      // la zone ne sert pas est aussi légitime que lui donner un compose
      // altéré. La sonde reste vraie quel que soit le nombre d'écrans que la
      // v3 finira par servir.
      //
      // > **Une sonde dont le matériau vient de la PRODUCTION s'éteint quand la
      // > production grandit.** Le fait qu'elle rougisse encore aujourd'hui ne
      // > dit rien de demain : c'est la troisième fois que ce fusible se
      // > déclenche par CROISSANCE et non par régression.
      'la barre finale retirée du PathPrefix de /l/ sur staging',
      (world) => {
        replaceIn(world, 'staging', 'PathPrefix(`/l/`)', 'PathPrefix(`/l`)');
        world.legacyRoutes = [...world.legacyRoutes, '/l-voisine-du-legacy'];
      },
      'il emporte donc /l-voisine-du-legacy',
    ],
    [
      'un préfixe retiré de V3_ZONE_PREFIXES sans être retiré du routeur',
      (world) => replaceIn(world, 'worker', /'\/l'/, "'/rien'"),
      "réclame PathPrefix(`/l/`) que V3_ZONE_PREFIXES",
    ],
    [
      // LA SONDE FABRIQUE SA PROPRE VICTIME (leçon 477). Retirer un préfixe
      // EXISTANT marcherait aujourd'hui et mourrait le jour où cet écran est
      // réclamé par le routeur — l'autre invariant tomberait d'abord, et
      // celui-ci semblerait tenir sans avoir rien vu.
      'un écran servi par la zone et absent de V3_ZONE_PREFIXES',
      (world) => {
        world.zone = {
          ...world.zone,
          routeUrls: [...world.zone.routeUrls, '/orpheline-hors-bascule'],
        };
      },
      'sert /orpheline-hors-bascule, que V3_ZONE_PREFIXES du worker legacy ne couvre pas',
    ],
    [
      'le type-check de la v3 retiré de ci.yml',
      (world) =>
        replaceIn(world, 'ci', /^\s*run:.*type-check.*$/m, (line) =>
          line.replace(` --filter=${V3_WORKSPACE}`, ''),
        ),
      `aucune étape de ci.yml ne lance le type-check de ${V3_WORKSPACE}`,
    ],
    [
      'le type-check de la v3 amnistié',
      (world) =>
        replaceIn(
          world,
          'ci',
          /( +)- name: (Type-check[^\n]*blocking[^\n]*)\n/,
          '$1- name: $2\n$1  continue-on-error: true\n',
        ),
      'type-checke la v3 avec continue-on-error: true',
    ],
    [
      'le lint de la v3 rendu à l\'amnistie du legacy',
      (world) =>
        replaceIn(world, 'ci', /^ +- name: Lint \(apps\/web-v3[^\n]*\n +run:[^\n]*\n/m, ''),
      `aucune étape de ci.yml ne lint ${V3_WORKSPACE}`,
    ],
    [
      'la v3 glissée dans le ratchet de dette',
      (world) =>
        replaceIn(
          world,
          'ci',
          'bash scripts/check-type-debt.sh --self-test',
          `bash scripts/check-type-debt.sh --self-test ${V3_DIRECTORY}`,
        ),
      'fait entrer la v3 dans le ratchet de dette',
    ],
    [
      'la v3 retirée de la matrice de tests',
      (world) => replaceIn(world, 'ci', `filter: '${V3_WORKSPACE}'`, "filter: '@meeshy/zz'"),
      `aucune entrée de la matrice de tests ne porte filter: '${V3_WORKSPACE}'`,
    ],
    [
      'le glob de la v3 retiré des paths de docker.yml',
      (world) => replaceIn(world, 'docker', "      - 'apps/web-v3/**'\n", ''),
      'le filtre paths de docker.yml ne couvre pas la v3',
    ],
    [
      'la table de jetons ré-importée par chemin relatif hors du paquet',
      (world) =>
        world.escapes.push({
          file: `${V3_DIRECTORY}/app/globals.css`,
          request: '../../../packages/design-tokens/tokens.css',
          target: 'packages/design-tokens/tokens.css',
        }),
      'par le chemin relatif',
    ],
    [
      'le paquet déclaré retiré du Dockerfile',
      (world) => replaceIn(world, 'dockerfile', /^COPY packages\/[^\n]*\n/m, ''),
      "n'entre jamais dans l'image",
    ],
    [
      'le paquet déclaré retiré des paths de docker.yml',
      (world) => replaceIn(world, 'docker', /^ +- 'packages\/design-tokens\/\*\*'\n/m, ''),
      'le filtre paths de docker.yml ne couvre pas packages/design-tokens/**',
    ],
    [
      'le détecteur de push aveugle au paquet déclaré',
      (world) => replaceIn(world, 'docker', /\*"packages\/design-tokens\/"\*/g, '*"packages/zz/"*'),
      'un push ne touchant que packages/design-tokens/',
    ],
    [
      'le détecteur de push aveugle à la v3',
      (world) => replaceIn(world, 'docker', /\*"apps\/web-v3\/"\*/g, '*"apps/zz-absent/"*'),
      'un push ne touchant que apps/web-v3/',
    ],
    [
      'la sélection du dispatch revenue à la sous-chaîne',
      (world) => replaceIn(world, 'docker', /\*",web,"\*/g, '*"web"*'),
      'un dispatch « web-v3 »',
    ],
    [
      "l'entrée d'image de la v3 retirée de la matrice",
      (world) => replaceIn(world, 'docker', new RegExp(`"image":"${V3_IMAGE}"`, 'g'), '"image":"zz"'),
      `la matrice d'images de docker.yml ne produit aucune entrée ${V3_IMAGE}`,
    ],
    [
      'la v3 construite depuis un Dockerfile absent',
      (world) =>
        replaceIn(
          world,
          'docker',
          `./${V3_DIRECTORY}/Dockerfile`,
          `./${V3_DIRECTORY}/Dockerfile.absent`,
        ),
      "qui n'existe pas",
    ],
    [
      'le PathPrefix de la v3 retiré du routeur de production',
      (world) => replaceIn(world, 'prod', `(PathPrefix(\`${V3_ASSET_ZONE}\`) || `, '('),
      `le routeur ${V3_ROUTER} ne porte pas PathPrefix`,
    ],
    [
      "un actif déposé dans public/ sans être réclamé par la règle",
      (world) => world.zone.publicFiles.push('/sprite.svg'),
      `${V3_PUBLIC_DIRECTORY}/sprite.svg est servi à la RACINE`,
    ],
    [
      "un actif déposé dans public/ sans entrer dans l'image",
      (world) => world.zone.publicFiles.push('/sprite.svg'),
      "n'entrent pas dans l'image",
    ],
    [
      "un fichier de métadonnées de l'App Router ajouté hors de la règle",
      (world) => world.zone.metadataUrls.push('/robots.txt'),
      '/robots.txt est un fichier de métadonnées servi à la RACINE',
    ],
    [
      'la règle élargie au /__v3 nu, que rien ne sert',
      (world) =>
        replaceIn(
          world,
          'prod',
          `PathPrefix(\`${V3_ASSET_ZONE}\`)`,
          `PathPrefix(\`${V3_PATH_PREFIX}\`)`,
        ),
      `la règle réclame ${V3_PATH_PREFIX} nu`,
    ],
    [
      // CETTE SONDE S'EST ÉTEINTE DEUX FOIS, ET POUR LA MÊME RAISON.
      //
      // Elle portait `/l`, puis `/stories` : à chaque fois un chemin que la zone
      // ne servait PAS ENCORE, et à chaque fois le lot qui l'a publié l'a rendue
      // MUETTE — la garde continuait de passer, la mutation ne mordait plus, et
      // rien ne le disait avant le prochain `--self-test`.
      //
      // Un fusible dont le calibre est une DATE de la feuille de route s'éteint
      // le jour où la feuille de route y arrive. Il porte donc désormais un
      // chemin que RIEN ne peut publier : ce qu'on éprouve ici n'est pas
      // `/stories` ni `/l`, c'est la capacité de la garde à voir un chemin
      // RÉCLAMÉ par la règle et SERVI par personne. N'importe quel chemin absent
      // de `app/` l'éprouve à l'identique — autant en prendre un qu'aucun écran
      // ne viendra réclamer.
      'un chemin humain réclamé avant que la zone ne le serve',
      (world) =>
        replaceIn(
          world,
          'prod',
          `(PathPrefix(\`${V3_ASSET_ZONE}\`) || `,
          `(PathPrefix(\`${V3_ASSET_ZONE}\`) || PathPrefix(\`/aucun-ecran-ne-sert-ceci\`) || `,
        ),
      'la règle réclame /aucun-ecran-ne-sert-ceci, que rien dans',
    ],
    [
      // La réécriture est ce qui rend `/__v3/rt/` servi : sans elle, la règle
      // réclame un chemin de zone que rien ne sert — le défaut exact de la route
      // née sous `app/__v3/`, que Next ignorait.
      'la réécriture de zone retirée sans que la règle cesse de réclamer /__v3/rt/',
      (world) => {
        world.zone.rewrittenUrls = [];
      },
      'la règle réclame /__v3/rt/, que rien dans',
    ],
    [
      'la route que la réécriture de zone vise retirée de app/',
      (world) => {
        world.zone.routeUrls = world.zone.routeUrls.filter((url) => url !== '/rt/[nom]');
      },
      'la réécriture /__v3/rt/:nom vise /rt/:nom, que rien dans',
    ],
    [
      "une déclaration de types de la v3 emportée par un ignore de la racine",
      (world) =>
        world.zone.gitIgnoredSources.push({
          path: `${V3_DIRECTORY}/scripts/check-app-router-built.d.mts`,
          source: '.gitignore',
          pattern: '**/*/*.d.*',
        }),
      'il manque au clone, et c\'est le type-check BLOQUANT',
    ],
    [
      'le COPY du public ajouté alors que la v3 n\'a pas de public/',
      (world) =>
        replaceIn(
          world,
          'dockerfile',
          'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static',
          'COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static\n' +
            'COPY --from=builder --chown=nextjs:nodejs /app/public ./public',
        ),
      'le docker build échouera sur ce COPY',
    ],
    [
      'la v3 rendue à la priorité du plancher',
      (world) =>
        replaceIn(
          world,
          'prod',
          `traefik.http.routers.${V3_ROUTER}.priority=100`,
          `traefik.http.routers.${V3_ROUTER}.priority=1`,
        ),
      `le routeur ${V3_ROUTER} ne prend pas le pas sur le plancher legacy`,
    ],
    [
      'le routeur legacy restreint à un préfixe',
      (world) =>
        replaceIn(
          world,
          'prod',
          `traefik.http.routers.${LEGACY_ROUTER}.rule=Host(\`\${DOMAIN:-localhost}\`)`,
          `traefik.http.routers.${LEGACY_ROUTER}.rule=PathPrefix(\`/legacy\`) && Host(\`\${DOMAIN:-localhost}\`)`,
        ),
      'il doit rester attrape-tout',
    ],
    [
      "une variable d'environnement lue par la v3 et déclarée nulle part",
      (world) =>
        world.envChains.push({
          file: `${V3_DIRECTORY}/lib/api/zz.ts`,
          variables: ['MEESHY_ZZ_URL'],
        }),
      "aucune de ces variables n'est déclarée sur le service",
    ],
    [
      // Les DEUX adresses de la passerelle partent ensemble : la chaîne de replis
      // de `lib/api/links.ts` en lit une ou l'autre, et retirer la seule adresse
      // interne laisserait l'adresse publique répondre pour elle.
      'les deux adresses de la passerelle retirées du service de production',
      (world) =>
        replaceIn(world, 'prod', /^ +- MEESHY_GATEWAY_URL=[^\n]*\n +- NEXT_PUBLIC_API_URL=[^\n]*\n/m, ''),
      'MEESHY_GATEWAY_URL',
    ],
    [
      "l'origine publique retirée du service de production",
      // Le legacy déclare la MÊME variable, plus haut dans le fichier : une
      // substitution non globale n'aurait retiré que la sienne, et la sonde
      // serait passée en croyant avoir désarmé la v3.
      (world) => replaceIn(world, 'prod', /^ +- NEXT_PUBLIC_FRONTEND_URL=[^\n]*\n/gm, ''),
      'NEXT_PUBLIC_FRONTEND_URL',
    ],
    [
      'le service v3 servi sur le port du legacy',
      (world) =>
        replaceIn(
          world,
          'prod',
          `traefik.http.services.${V3_ROUTER}.loadbalancer.server.port=${V3_PORT}`,
          `traefik.http.services.${V3_ROUTER}.loadbalancer.server.port=3100`,
        ),
      `n'est pas servi sur le port ${V3_PORT}`,
    ],
  ];
};
