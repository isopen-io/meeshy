#!/usr/bin/env node
// Garde des variables d'hôte substituées par les compositions Docker [#4537]
//
// LE DÉFAUT QU'IL FERME
//
// `docker-compose.prod.yml` posait `CORS_ORIGINS=${CORS_ORIGINS}`. Une variable
// absente sur l'hôte n'arrête PAS Docker Compose : elle est substituée par la
// chaîne VIDE, avec un simple `level=warning` sur la sortie d'erreur. Mesuré :
// `docker compose --env-file /dev/null -f docker-compose.prod.yml config -q`
// rendait 0 en avertissant sur onze variables.
//
// La passerelle reçoit alors une liste d'origines DÉCLARÉE mais vide — ce qui,
// depuis #4480, n'est pas la même chose qu'une liste absente : le repli sur les
// défauts ne joue que sur une variable réellement ABSENTE, et une liste vide
// refuse TOUTE origine. Décision juste (`services/gateway/src/config/cors-origins.ts`),
// et c'est justement pour cela qu'il n'y a rien à corriger dans la passerelle :
// le défaut est en AMONT, dans ce qui alimente la variable.
//
// Résultat vécu : les conteneurs montent, le healthcheck passe, Traefik route,
// puis chaque requête de navigateur échoue en CORS. Silencieux à sa naissance,
// bruyant très loin de sa cause.
//
// POURQUOI IL VIT ICI, ET PAS DANS LES TESTS D'UNE APP
//
// La surface de l'invariant est le DÉPÔT — quatre fichiers de composition et
// deux modèles d'environnement — pas une app. Et surtout : la matrice `test:`
// de `.github/workflows/ci.yml` ne porte que `shared`, `web`, `gateway`,
// `agent`. Un témoin écrit dans `apps/web-v3/__tests__/` ne tournerait dans
// AUCUN job : ce serait un contrôle INERTE, qui laisserait rouvrir au commit
// suivant la régression qu'il prétend fermer. C'est exactement le chemin
// qu'a déjà fait `check-makefile-workspaces.mjs`, dont l'en-tête le raconte.
//
// LA CLASSE QU'IL DÉFEND — « sans elle, le service MENT »
//
// Toutes les variables ne se valent pas. Trois tests, tous mesurables, font
// entrer une variable dans la classe BLOQUANTE :
//
//   (a) elle décide de la SÉCURITÉ ou de la JOIGNABILITÉ — qui a le droit de
//       nous parler, à qui nous faisons confiance, où nous envoyons les gens —
//       ou bien elle EST un identifiant ;
//   (b) la valeur vide produit un résultat qui a l'air VALIDE : un repli codé
//       en dur, ou une déclaration vide acceptée comme une décision ;
//   (c) rien, au démarrage, ne dit que c'est arrivé.
//
// Une variable dont l'absence provoque un REFUS EXPLICITE qui la nomme n'entre
// PAS dans la classe : elle ne ment pas, elle meurt — et c'est le bon modèle
// (`TURNCredentialService`, `AttachmentEncryptionService`). Une variable
// optionnelle par conception non plus : exiger `ANTHROPIC_API_KEY` interdirait
// un déploiement OpenAI, et serait une RÉGRESSION.
//
// POURQUOI LA TABLE NE PEUT PAS ÊTRE UNE SIMPLE LISTE DE NOMS BLOQUANTS
//
// C'est la leçon 261, et le dépôt la paie en boucle : un inventaire ferme la
// classe dans la langue où on l'a énoncée. Un garde qui demanderait « ce nom
// est-il dans ma liste de sept ? » serait AVEUGLE à la huitième variable, celle
// qu'on ajoutera demain sans y penser. La règle 1 retourne donc la question :
// toute substitution NUE doit être CLASSÉE, quelle qu'elle soit. Un nom inconnu
// rougit — non pas parce qu'il est dangereux, mais parce que personne n'a
// encore dit s'il l'était.
//
// Même retournement sur les FICHIERS : un fichier de composition dont le nom
// n'est pas explicitement rangé parmi ceux qui ne déploient pas est traité
// comme DÉPLOYANT. Un `docker-compose.preprod.yml` ajouté demain hérite de la
// règle stricte sans que personne n'ait à y penser.
//
// QUI LIT CETTE TABLE — ET POURQUOI ELLE EST ADRESSABLE [#4544]
//
// `scripts/deployment/deploy-validate-config.sh` tenait sa PROPRE liste de
// variables exigées. Mesuré : elle réclamait `MEESHY_BIGBOSS_PASSWORD`, un nom
// qu'AUCUN service ne lit, ignorait `ATABETH_PASSWORD` et ne vérifiait aucune
// liste d'origines. Il pouvait donc PASSER là où le vrai nom manquait et
// ÉCHOUER sur un hôte correctement provisionné — la troisième copie manuelle
// d'une même règle en une nuit (#4480, #4537, celle-ci).
//
// Le remède n'a pas été d'ajouter des noms à la troisième liste : ç'aurait été
// tenir un quatrième inventaire. La table ci-dessous est devenue ADRESSABLE —
// `--required-vars` en sert la dérivation, une ligne par variable — et le
// validateur shell n'a plus AUCUNE liste, ni de noms, ni de valeurs interdites.
// Il échoue fermé si la garde est introuvable ou si sa dérivation est vide.
//
// Trois conséquences pour qui touche à cette table :
//   - `secret` et `replis` ne sont pas décoratifs : le validateur mesure la
//     force des premiers et refuse les seconds. `uneBloquanteEstServableAuValidateur`
//     rougit sur une bloquante qui les tairait ;
//   - la classification voyage DANS le monde (`world.classification`), ce qui
//     la rend mutable par le `--self-test` — sans quoi les deux règles qui en
//     dépendent seraient aveugles ;
//   - le témoin de dérivation vit chez le consommateur
//     (`deploy-validate-config.sh --self-test`) : il injecte une entrée dans une
//     COPIE de cette table et vérifie que le shell l'exige, sans qu'une ligne
//     du shell ait été écrite.
//
// CE QU'ELLE NE VOYAIT PAS — LE FAIBLE, PAS SEULEMENT L'ABSENT [#4548]
//
// Toutes les règles ci-dessus mesurent une ABSENCE : une substitution nue, une
// bloquante sans refus, un refus sans message. Aucune ne mesurait ce qui est
// FAIBLE. Mesuré : `docker-compose.prod.yml:84` portait
// `${MONGODB_PASSWORD:-MeeshyPassword123}` — le mot de passe de la base, avec
// sa valeur par défaut PUBLIÉE dans ce dépôt (huit sites la portent) — et la
// garde restait VERTE, parce que cette variable ne manque jamais. Le repli est
// la forme où la classe se cache derrière la syntaxe.
//
// Le durcissement n'a pas été « tout repli est suspect » : mesuré, les quatre
// compositions en portent 193, dont l'immense majorité est honnête (des ports,
// des noms d'image, des tailles, des préférences de langue, `DOMAIN` 42 fois).
// Une règle large aurait fait rougir la CI entière et aurait été retirée. Le
// critère retenu est une DÉRIVATION à trois facteurs, tous déjà lisibles dans
// le monde lu — voir `unSecretNAJamaisDeRepliPublie`.
//
// CE QUE LE BALAYAGE VOIT — ET CE QU'IL NE VOIT PAS
//
// Il voit : tous les `docker-compose*.yml` de `infrastructure/docker/compose/`
// (découverts par LECTURE DU RÉPERTOIRE, jamais par une liste écrite à la
// main), les liens de la racine qui s'y résolvent (dédoublonnés par chemin
// réel), et les deux modèles d'environnement du dépôt.
//
// Il ne voit PAS : les compositions figées sous `docs/` (des instantanés
// datés, que personne ne lance), les `.env.example` des services (ils
// documentent un service, pas un déploiement), et les substitutions écrites
// dans une ligne de COMMENTAIRE (mesuré : aucune ligne active des quatre
// fichiers ne porte de commentaire en fin de ligne contenant `${`, donc sauter
// les commentaires PLEINE LIGNE suffit et n'aveugle rien).

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_DIR = join('infrastructure', 'docker', 'compose');

/** Les modèles qui APPRENNENT à l'opérateur quelles variables poser. */
const ENV_TEMPLATES = Object.freeze([
  join('infrastructure', 'envs', '.env.example'),
  join(COMPOSE_DIR, '.env.staging.template'),
]);

/**
 * Les compositions qui ne DÉPLOIENT pas — les seules où un repli `:-` est
 * honnête, parce que son défaut (localhost, un secret de dév) est vrai.
 * Tout autre fichier déploie, y compris un fichier inconnu.
 */
const NON_DEPLOYING = Object.freeze([
  'docker-compose.dev.yml',
  'docker-compose.local.yml',
  'docker-compose.local-https.yml',
]);

const BLOQUANTE = 'bloquante';
const DEFAUT_ACCEPTABLE = 'defaut-acceptable';

/**
 * La classification, une fois, avec sa raison MESURÉE — le consommateur et ce
 * qu'il fait de la chaîne vide. Sans la raison, la table redeviendrait une
 * liste d'opinions qu'on n'oserait plus corriger.
 */
const SUBSTITUTIONS = Object.freeze({
  CORS_ORIGINS: {
    classe: BLOQUANTE,
    secret: false,
    replis: [],
    raison:
      "resolveAllowedOrigins() ne replie que sur une variable ABSENTE : '' est une liste DÉCLARÉE vide, " +
      'donc zéro origine servie et toute requête de navigateur refusée.',
  },
  ALLOWED_ORIGINS: {
    classe: BLOQUANTE,
    secret: false,
    replis: [],
    raison:
      'Même résolveur, même forme — et c\'est le repli qui aurait rattrapé CORS_ORIGINS : vide, il ne rattrape rien.',
  },
  JWT_SECRET: {
    classe: BLOQUANTE,
    secret: true,
    replis: ['default-jwt-secret', 'meeshy-secret-key-dev'],
    raison:
      "InitService.ts:35 replie sur 'default-jwt-secret', MagicLinkService.ts:339 et server.ts:89 sur " +
      "'meeshy-secret-key-dev' — des secrets PUBLIÉS dans ce dépôt signeraient les jetons de production.",
  },
  FRONTEND_URL: {
    classe: BLOQUANTE,
    secret: false,
    replis: ['http://localhost:3000'],
    raison:
      "PasswordResetService.ts:217 l'interpole SANS repli (le lien de réinitialisation devient relatif) et " +
      "routes/users/contact-change.ts:347 replie sur http://localhost:3000 — des e-mails partent avec de mauvais liens.",
  },
  ADMIN_PASSWORD: {
    classe: BLOQUANTE,
    secret: true,
    replis: ['admin123'],
    raison: "InitService.ts:219 replie sur 'admin123' : le compte ADMIN de production naît avec un mot de passe public.",
  },
  MEESHY_PASSWORD: {
    classe: BLOQUANTE,
    secret: true,
    replis: ['bigboss123'],
    raison: "InitService.ts:147 replie sur 'bigboss123' — et ce compte-là est BIGBOSS.",
  },
  ATABETH_PASSWORD: {
    classe: BLOQUANTE,
    secret: true,
    replis: ['admin123'],
    raison: "InitService.ts:423 replie sur 'admin123'.",
  },
  MONGODB_PASSWORD: {
    classe: BLOQUANTE,
    secret: true,
    replis: ['MeeshyPassword123'],
    raison:
      "docker-compose.prod.yml:84 replie sur 'MeeshyPassword123' — l'interface d'administration nosqlclient, " +
      'publiée sur mongo.<domaine> derrière un basicauth, se connectait alors à la base avec un mot de passe ' +
      'publié dans ce dépôt (huit sites le portent, dont init-postgresql.sql et les scripts qui initialisent ' +
      'la réplique de développement avec lui). Un identifiant, donc bloquante par le test (a).',
  },

  DATABASE_URL: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "Prisma refuse une URL vide par une erreur explicite : le conteneur ne devient jamais sain et aucune " +
      "requête n'aboutit. Ce défaut est BRUYANT — il ne ment pas, il meurt.",
  },
  TURN_SECRET: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "TURNCredentialService.ts:49 REFUSE de démarrer en production/staging quand le secret est absent, vide " +
      "ou égal au défaut public, en nommant la variable. C'est le modèle à imiter.",
  },
  ATTACHMENT_MASTER_KEY: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "getMasterKey() (AttachmentEncryptionService.ts:136) lève en nommant la variable ET la commande qui en " +
      'génère une. Refus explicite, jamais un repli.',
  },
  HF_TOKEN: {
    classe: DEFAUT_ACCEPTABLE,
    raison: "Optionnelle : seule la diarisation pyannote la lit ; les modèles publics n'en ont pas besoin.",
  },
  OPENAI_API_KEY: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "Mutuellement optionnelle avec ANTHROPIC_API_KEY : LLM_PROVIDER en élit UNE. La rendre obligatoire " +
      'interdirait un déploiement Anthropic — ici, `:?` serait la régression.',
  },
  ANTHROPIC_API_KEY: {
    classe: DEFAUT_ACCEPTABLE,
    raison: 'Symétrique de OPENAI_API_KEY — même raison, en sens inverse.',
  },
  TRAEFIK_USERS: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "Traefik ne lit pas cette variable d'environnement ; son consommateur réel est le label " +
      "`basicauth.users=${TRAEFIK_USERS:-''}`, qui échoue FERMÉ (aucun utilisateur ne correspond ⇒ 401).",
  },
  API_USERS: {
    classe: DEFAUT_ACCEPTABLE,
    raison: "Aucun consommateur mesuré : ni label Traefik, ni lecture de service. Déclarée, jamais lue.",
  },
  PRISMA_SCHEMA_PATH: {
    classe: DEFAUT_ACCEPTABLE,
    raison: "Aucun consommateur mesuré dans les sources ; l'image porte son propre chemin de schéma.",
  },
  JWT_EXPIRES_IN: {
    classe: DEFAUT_ACCEPTABLE,
    raison: 'Aucun consommateur mesuré dans les sources de la passerelle.',
  },
  NEXT_PUBLIC_FIREBASE_API_KEY: {
    classe: DEFAUT_ACCEPTABLE,
    raison:
      "Capacité de build du client web : absente, l'enregistrement push ne se fait pas et le client le dit. " +
      'Un déploiement sans push est dégradé, pas mensonger.',
  },
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { classe: DEFAUT_ACCEPTABLE, raison: 'Même famille que NEXT_PUBLIC_FIREBASE_API_KEY.' },
  NEXT_PUBLIC_FIREBASE_APP_ID: { classe: DEFAUT_ACCEPTABLE, raison: 'Même famille que NEXT_PUBLIC_FIREBASE_API_KEY.' },
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: { classe: DEFAUT_ACCEPTABLE, raison: 'Même famille que NEXT_PUBLIC_FIREBASE_API_KEY.' },
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: { classe: DEFAUT_ACCEPTABLE, raison: 'Même famille que NEXT_PUBLIC_FIREBASE_API_KEY.' },

  ADMIN_EMAIL: { classe: DEFAUT_ACCEPTABLE, raison: "InitService.ts:222 replie sur admin@meeshy.me — une identité de démarrage, pas un secret." },
  MEESHY_EMAIL: { classe: DEFAUT_ACCEPTABLE, raison: 'InitService.ts:150 replie sur meeshy@meeshy.me — même famille.' },
  ATABETH_EMAIL: { classe: DEFAUT_ACCEPTABLE, raison: 'Identité de démarrage, repli documenté dans InitService.' },
  ATABETH_USERNAME: { classe: DEFAUT_ACCEPTABLE, raison: "InitService.ts:422 replie sur 'atabeth'." },
  ATABETH_FIRST_NAME: { classe: DEFAUT_ACCEPTABLE, raison: 'Identité de démarrage, repli documenté dans InitService.' },
  ATABETH_LAST_NAME: { classe: DEFAUT_ACCEPTABLE, raison: 'Identité de démarrage, repli documenté dans InitService.' },
  ATABETH_ROLE: { classe: DEFAUT_ACCEPTABLE, raison: "InitService.ts:427 replie sur 'ADMIN' — un choix ÉCRIT, pas un accident." },
  ADMIN_SYSTEM_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: "InitService.ts:224 replie sur 'en' — préférence, pas garde." },
  ADMIN_REGIONAL_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  ADMIN_CUSTOM_DESTINATION_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  MEESHY_SYSTEM_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  MEESHY_REGIONAL_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  MEESHY_CUSTOM_DESTINATION_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  ATABETH_SYSTEM_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  ATABETH_REGIONAL_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  ATABETH_CUSTOM_DESTINATION_LANGUAGE: { classe: DEFAUT_ACCEPTABLE, raison: 'Préférence de langue du compte de démarrage.' },
  DOMAIN: {
    classe: DEFAUT_ACCEPTABLE,
    raison: "Toutes ses substitutions ACTIVES portent `:-meeshy.me` ; les occurrences nues sont des commentaires.",
  },
});

/** `${NOM}` · `${NOM:-defaut}` · `${NOM:?message}` · `${NOM:+autre}` — et leurs variantes sans `:`. */
const SUBSTITUTION = /\$\{([A-Za-z_][A-Za-z0-9_]*)(:?[-?+])?([^}]*)\}/g;

const NUE = 'nue';

const formOf = (operator) => (operator ? operator : NUE);

const isComment = (line) => line.trimStart().startsWith('#');

export const substitutionsOf = (source) =>
  source.split('\n').flatMap((line, index) =>
    isComment(line)
      ? []
      : [...line.matchAll(SUBSTITUTION)].map((match) => ({
          line: index + 1,
          name: match[1],
          form: formOf(match[2]),
          message: match[3] ?? '',
        })),
  );

export const deploys = (file) => !NON_DEPLOYING.includes(basename(file));

const composeFilesUnder = (root) => {
  const directory = join(root, COMPOSE_DIR);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => /^docker-compose.*\.ya?ml$/.test(entry))
    .map((entry) => join(COMPOSE_DIR, entry))
    .sort();
};

const rootLinks = (root) =>
  readdirSync(root)
    .filter((entry) => /^docker-compose.*\.ya?ml$/.test(entry))
    .sort()
    .map((entry) => ({ entry, resolved: existsSync(join(root, entry)) }));

export const readWorld = (root) => {
  const seen = new Set();
  const files = [];
  for (const relative of composeFilesUnder(root)) {
    const real = realpathSync(join(root, relative));
    if (seen.has(real)) continue;
    seen.add(real);
    files.push({
      path: relative,
      deploys: deploys(relative),
      substitutions: substitutionsOf(readFileSync(join(root, relative), 'utf8')),
    });
  }
  const templates = ENV_TEMPLATES.filter((relative) => existsSync(join(root, relative))).map((relative) => ({
    path: relative,
    keys: readFileSync(join(root, relative), 'utf8')
      .split('\n')
      .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1])
      .filter(Boolean),
  }));
  return { files, templates, links: rootLinks(root), classification: SUBSTITUTIONS };
};

/**
 * La classification voyage DANS le monde, jamais lue en direct depuis le module.
 * Deux raisons, et la seconde est la plus chère :
 *  - le `--self-test` peut alors muter la TABLE elle-même (un repli qui
 *    disparaît, un secret qui cesse de se déclarer) et prouver que les règles
 *    qui en dépendent ne sont pas aveugles ;
 *  - `scripts/deployment/deploy-validate-config.sh` la lit par `--required-vars`.
 *    Tant qu'elle est un paramètre du monde, il n'existe qu'UNE déclaration ;
 *    dès qu'un second site la recopierait, la divergence de #4544 renaîtrait.
 */
const classOf = (world, name) => world.classification[name]?.classe;

/**
 * Les noms qu'un déploiement DOIT porter : BLOQUANTE, et réellement substitué
 * par un fichier qui déploie. Ni un inventaire, ni une opinion — une DÉRIVATION
 * de la table et des compositions.
 */
const bloquantesExigees = (world) =>
  [
    ...new Set(
      world.files
        .filter((file) => file.deploys)
        .flatMap((file) => file.substitutions)
        .filter((substitution) => classOf(world, substitution.name) === BLOQUANTE)
        .map((substitution) => substitution.name),
    ),
  ].sort();

/**
 * La projection SERVIE — à `uneBloquanteEstDocumentee` ici, et à
 * `scripts/deployment/deploy-validate-config.sh` par `--required-vars`.
 * `secret` dit s'il faut mesurer une force ; `replis` porte les valeurs que le
 * CODE sert quand la variable manque — les seules qu'un hôte ne doit jamais
 * poser à la main, et que le validateur n'a donc pas à réinventer.
 */
export const variablesExigees = (world) =>
  bloquantesExigees(world).map((name) => {
    const entree = world.classification[name];
    return {
      name,
      secret: entree.secret === true,
      replis: Array.isArray(entree.replis) ? entree.replis : [],
    };
  });

/**
 * Une bloquante SERVIE à un consommateur externe doit être complètement
 * déclarée. Sans cette règle, `variablesExigees` normaliserait le silence :
 * un `replis` oublié rendrait `[]`, et le validateur cesserait de refuser le
 * mot de passe public SANS que rien ne rougisse — la forme fail-open que
 * #4537 combat, déplacée d'un cran.
 */
const FORME_SECRET = /_(PASSWORD|SECRET|KEY|TOKEN)$/;

const uneBloquanteEstServableAuValidateur = (world) =>
  bloquantesExigees(world).flatMap((name) => {
    const entree = world.classification[name];
    const manques = [];
    if (!Array.isArray(entree.replis)) {
      manques.push(
        `${name} est BLOQUANTE et ne déclare pas « replis ».\n` +
          `  Le validateur de déploiement lit ce champ pour refuser la valeur que le CODE sert par défaut.\n` +
          `  Poser replis: [] si le code n'a AUCUN repli, la liste des valeurs mesurées sinon.`,
      );
    }
    if (FORME_SECRET.test(name) && entree.secret !== true) {
      manques.push(
        `${name} porte un nom de secret et ne déclare pas « secret: true ».\n` +
          `  Sans lui, la validation de déploiement cesse silencieusement d'en mesurer la force.`,
      );
    }
    return manques;
  });

const uneSubstitutionNueEstClassee = (world) =>
  world.files.flatMap((file) =>
    file.substitutions
      .filter((substitution) => substitution.form === NUE && classOf(world, substitution.name) === undefined)
      .map(
        (substitution) =>
          `${file.path}:${substitution.line} : \${${substitution.name}} est substituée NUE et n'est classée nulle part.\n` +
          `  Une variable absente devient la chaîne VIDE sans que rien ne le dise. Ranger ${substitution.name} dans\n` +
          `  SUBSTITUTIONS de scripts/check-compose-required-vars.mjs : « ${BLOQUANTE} » (⇒ poser \${${substitution.name}:?message})\n` +
          `  si le service DÉMARRE et MENT sans elle, « ${DEFAUT_ACCEPTABLE} » avec la raison mesurée sinon.`,
      ),
  );

const uneBloquanteNEstJamaisNue = (world) =>
  world.files.flatMap((file) =>
    file.substitutions
      .filter((substitution) => substitution.form === NUE && classOf(world, substitution.name) === BLOQUANTE)
      .map(
        (substitution) =>
          `${file.path}:${substitution.line} : \${${substitution.name}} est BLOQUANTE et substituée NUE.\n` +
          `  ${world.classification[substitution.name].raison}\n` +
          `  Écrire \${${substitution.name}:?message} — la seule forme qui fasse échouer \`docker compose up\`.`,
      ),
  );

const uneBloquanteQuiDeploiePorteLeRefus = (world) =>
  world.files
    .filter((file) => file.deploys)
    .flatMap((file) =>
      file.substitutions
        .filter(
          (substitution) =>
            classOf(world, substitution.name) === BLOQUANTE &&
            substitution.form !== NUE &&
            !substitution.form.endsWith('?'),
        )
        .map(
          (substitution) =>
            `${file.path}:${substitution.line} : \${${substitution.name}${substitution.form}…} porte un REPLI dans un fichier qui déploie.\n` +
            `  ${world.classification[substitution.name].raison}\n` +
            `  Un repli servirait une valeur que personne n'a demandée. Seul \${${substitution.name}:?message} convient ici.`,
        ),
    );

/**
 * LE FAIBLE, ET NON PLUS SEULEMENT L'ABSENT [#4548]
 *
 * Un repli PUBLIÉ est un secret par défaut. Trois facteurs le disent, tous
 * mesurés dans le monde déjà lu — jamais une intuition, jamais une liste :
 *
 *   - le fichier DÉPLOIE. `NON_DEPLOYING` dit déjà où un repli est honnête :
 *     dans docker-compose.dev.yml, `${JWT_SECRET:-dev-jwt-secret…}` est VRAI,
 *     c'est le secret de développement et il n'y a rien à cacher ;
 *   - le repli porte une VALEUR. `${VAR:-}` ne publie rien : il déclare une
 *     option absente, ce que SEPT substitutions de prod et de staging font à
 *     dessein, sur six noms (BREVO_API_KEY, SENDGRID_API_KEY, MAILGUN_API_KEY,
 *     ENCRYPTION_MASTER_KEY deux fois, ATTACHMENT_MASTER_KEY, HF_TOKEN). Les
 *     faire rougir serait la règle trop large ;
 *   - la variable EST un secret.
 *
 * « EST un secret » se lit d'abord dans la TABLE, où `secret` est déjà déclaré
 * et déjà servi au validateur de déploiement — puis, à défaut de déclaration,
 * dans la FORME du nom. C'est le retournement de la règle 1 porté aux secrets :
 * un nom en _PASSWORD / _SECRET / _KEY / _TOKEN que personne n'a dédouané est
 * traité comme un secret, non parce qu'il est dangereux, mais parce que
 * personne n'a encore dit qu'il ne l'était pas. Une valeur PUBLIQUE par
 * conception — une clé Firebase, qui voyage déjà dans le bundle du navigateur —
 * se déclare `secret: false` avec sa raison, dans la table. Aucune seconde
 * liste n'est née ici : c'est le champ qui existait, lu par une règle de plus.
 *
 * Elle laisse volontairement la classe BLOQUANTE à `uneBloquanteQuiDeploiePorteLeRefus`,
 * qui la couvre PLUS largement (tout repli, même vide). Doubler la voix ne
 * dirait pas seulement deux fois la même chose : le message ci-dessous propose
 * « secret: false » comme issue, et cette issue est INTERDITE sur une bloquante
 * de forme secret — `uneBloquanteEstServableAuValidateur` la refuse. Une règle
 * qui offre une sortie que sa voisine ferme envoie le lecteur dans un mur. Les
 * deux règles se partagent donc le terrain par ce que la table a DÉCLARÉ :
 * celle-ci attrape le secret que la classification n'a pas encore nommé.
 */
const estUnSecret = (world, name) => world.classification[name]?.secret ?? FORME_SECRET.test(name);

const porteUnRepli = (substitution) => substitution.form.endsWith('-');

const unSecretNAJamaisDeRepliPublie = (world) =>
  world.files
    .filter((file) => file.deploys)
    .flatMap((file) =>
      file.substitutions
        .filter(
          (substitution) =>
            porteUnRepli(substitution) &&
            substitution.message.trim().length > 0 &&
            classOf(world, substitution.name) !== BLOQUANTE &&
            estUnSecret(world, substitution.name),
        )
        .map(
          (substitution) =>
            `${file.path}:${substitution.line} : ${substitution.name} porte un repli PUBLIÉ dans un fichier qui déploie —\n` +
            `  \${${substitution.name}${substitution.form}…} est un SECRET PAR DÉFAUT.\n` +
            `  ${world.classification[substitution.name]?.raison ?? "Aucune raison n'est encore écrite pour cette variable."}\n` +
            `  Le repli n'est pas vide, donc sa valeur est PUBLIÉE ici, et l'hôte qui oublie la variable déploie\n` +
            `  avec elle sans que rien ne le dise. Une garde qui n'attrape que l'ABSENT laisse passer le FAIBLE.\n` +
            `  Trois issues : \${${substitution.name}:?message} si l'hôte doit la poser ;\n` +
            `  \${${substitution.name}:-} si elle est réellement optionnelle (un repli VIDE ne publie rien) ;\n` +
            `  ou « secret: false » avec sa raison mesurée dans SUBSTITUTIONS si cette valeur est publique par conception.`,
        ),
    );

const leRefusNommeCeQuIlFaudraitPoser = (world) =>
  world.files.flatMap((file) =>
    file.substitutions
      .filter((substitution) => substitution.form.endsWith('?') && substitution.message.trim().length === 0)
      .map(
        (substitution) =>
          `${file.path}:${substitution.line} : \${${substitution.name}${substitution.form}} refuse SANS message.\n` +
          `  Le refus doit dire à l'opérateur où poser la variable, pas seulement qu'elle manque.`,
      ),
  );

/**
 * Un message de refus voyage DANS le YAML — mesuré en l'écrivant : un `:` suivi
 * d'une espace fait lire `- VAR=${VAR:?un message : explicatif}` comme une MAP,
 * et `docker compose config` rend « unexpected type map[string]interface {} ».
 * Le fichier refuse alors de se charger pour une raison qui ne dit RIEN de la
 * variable manquante — un défaut PIRE que celui qu'on corrigeait, parce qu'il a
 * l'air d'une erreur de syntaxe plutôt que d'une variable oubliée.
 */
const leMessageNeCassePasLeYaml = (world) =>
  world.files.flatMap((file) =>
    file.substitutions
      .filter((substitution) => substitution.form.endsWith('?') && /:|#/.test(substitution.message))
      .map(
        (substitution) =>
          `${file.path}:${substitution.line} : le message de refus de \${${substitution.name}} porte « : » ou « # ».\n` +
          `  Le YAML lirait la ligne comme une MAP et le fichier deviendrait illisible, sans jamais nommer la variable.\n` +
          `  Réécrire le message en phrases séparées par des points.`,
      ),
  );

const uneBloquanteEstDocumentee = (world) => {
  const documented = new Set(world.templates.flatMap((template) => template.keys));
  return variablesExigees(world)
    .map(({ name }) => name)
    .filter((name) => !documented.has(name))
    .map(
      (name) =>
        `${name} est BLOQUANTE pour un déploiement et n'apparaît dans AUCUN modèle d'environnement.\n` +
        `  Modèles balayés : ${world.templates.map((template) => template.path).join(', ') || '(aucun)'}\n` +
        `  Un refus au démarrage rend le défaut BRUYANT ; sans la ligne du modèle, l'opérateur n'apprend nulle part\n` +
        `  quelle variable poser ni sous quelle forme. Le refus et sa cure vont ensemble.`,
    );
};

/**
 * La borne de non-vacuité — un balayage qui ne trouve rien passerait au vert
 * pour la pire des raisons. Elle exige que le monde soit PEUPLÉ avant que les
 * autres règles aient le droit de se taire.
 */
const MINIMUM_COMPOSE_FILES = 4;

const leBalayageNEstPasVide = (world) => {
  const failures = [];
  if (world.files.length < MINIMUM_COMPOSE_FILES) {
    failures.push(
      `le balayage n'a trouvé que ${world.files.length} fichier(s) de composition sous ${COMPOSE_DIR} ` +
        `(minimum ${MINIMUM_COMPOSE_FILES}). Un garde qui ne voit rien ne garde rien.`,
    );
  }
  const muets = world.files.filter((file) => file.substitutions.length === 0);
  muets.forEach((file) =>
    failures.push(`${file.path} : aucune substitution lue — le fichier a changé de forme, ou la lecture est cassée.`),
  );
  if (world.templates.length === 0) {
    failures.push("aucun modèle d'environnement lu : la règle de documentation ne pourrait rien exiger.");
  }
  const bloquantes = new Set(
    world.files
      .flatMap((file) => file.substitutions)
      .filter((substitution) => classOf(world, substitution.name) === BLOQUANTE)
      .map((substitution) => substitution.name),
  );
  if (bloquantes.size === 0) {
    failures.push(
      "aucune variable BLOQUANTE trouvée dans les compositions : soit la classification s'est vidée, soit " +
        'la lecture ne voit plus les lignes de service.',
    );
  }
  return failures;
};

const CHECKS = Object.freeze([
  leBalayageNEstPasVide,
  uneBloquanteEstServableAuValidateur,
  uneSubstitutionNueEstClassee,
  uneBloquanteNEstJamaisNue,
  uneBloquanteQuiDeploiePorteLeRefus,
  unSecretNAJamaisDeRepliPublie,
  leRefusNommeCeQuIlFaudraitPoser,
  leMessageNeCassePasLeYaml,
  uneBloquanteEstDocumentee,
]);

const inspect = (world) => CHECKS.flatMap((check) => check(world));

const mutate = (world, apply) => apply(structuredClone(world));

const fileNamed = (world, name) => world.files.find((file) => basename(file.path) === name);

/**
 * Les noms que le témoin injecte naissent à l'EXÉCUTION [#4548] — repris du
 * témoin de dérivation de `scripts/deployment/deploy-validate-config.sh`, pour
 * la même raison : un nom écrit en dur pourrait être reconnu par une liste
 * écrite en dur, et le témoin prouverait alors la coïncidence de deux copies
 * plutôt que la DÉRIVATION. Un nom qui n'existe qu'à l'instant du test ne peut
 * être connu d'aucune table — s'il rougit, c'est que la règle l'a DÉRIVÉ.
 *
 * L'un porte la forme d'un secret, l'autre celle d'un réglage d'exploitation :
 * c'est exactement la frontière que la règle doit tenir.
 */
const TEMOIN_RACINE = `MEESHY_TEMOIN_${process.pid}_${Math.floor(Math.random() * 1e9)}`;
const TEMOIN_SECRET = `${TEMOIN_RACINE}_PASSWORD`;
const TEMOIN_LIBRE = `${TEMOIN_RACINE}_MEM_LIMIT`;

const MUTATIONS = Object.freeze([
  [
    'CORS_ORIGINS redevient nue dans la composition de production',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = target.substitutions.map((s) =>
        s.name === 'CORS_ORIGINS' ? { ...s, form: NUE, message: '' } : s,
      );
      return world;
    },
    'CORS_ORIGINS} est BLOQUANTE et substituée NUE',
  ],
  [
    'une variable inconnue est substituée nue',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = [...target.substitutions, { line: 1, name: 'SIGNING_KEY_V2', form: NUE, message: '' }];
      return world;
    },
    "SIGNING_KEY_V2} est substituée NUE et n'est classée nulle part",
  ],
  [
    'une bloquante reçoit un repli silencieux dans un fichier qui déploie',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = target.substitutions.map((s) =>
        s.name === 'JWT_SECRET' ? { ...s, form: ':-', message: 'meeshy-secret-key-dev' } : s,
      );
      return world;
    },
    'porte un REPLI dans un fichier qui déploie',
  ],
  [
    'un refus est posé sans message',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = target.substitutions.map((s) =>
        s.name === 'ALLOWED_ORIGINS' ? { ...s, form: ':?', message: '   ' } : s,
      );
      return world;
    },
    'refuse SANS message',
  ],
  [
    'un message de refus porte un deux-points et casserait le YAML',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = target.substitutions.map((s) =>
        s.name === 'CORS_ORIGINS' ? { ...s, message: 'poser la liste : voir le runbook' } : s,
      );
      return world;
    },
    'porte « : » ou « # »',
  ],
  [
    "une bloquante disparaît des modèles d'environnement",
    (world) => {
      world.templates = world.templates.map((template) => ({
        ...template,
        keys: template.keys.filter((key) => key !== 'JWT_SECRET'),
      }));
      return world;
    },
    "JWT_SECRET est BLOQUANTE pour un déploiement et n'apparaît dans AUCUN modèle",
  ],
  [
    'le balayage ne trouve plus aucun fichier de composition',
    (world) => {
      world.files = [];
      return world;
    },
    "n'a trouvé que 0 fichier(s) de composition",
  ],
  [
    'un fichier de composition cesse de rendre ses substitutions',
    (world) => {
      fileNamed(world, 'docker-compose.prod.yml').substitutions = [];
      return world;
    },
    'aucune substitution lue',
  ],
  [
    "les modèles d'environnement deviennent illisibles",
    (world) => {
      world.templates = [];
      return world;
    },
    "aucun modèle d'environnement lu",
  ],
  [
    "une bloquante perd la liste de ses replis mesurés",
    (world) => {
      world.classification = {
        ...world.classification,
        JWT_SECRET: { ...world.classification.JWT_SECRET, replis: undefined },
      };
      return world;
    },
    'JWT_SECRET est BLOQUANTE et ne déclare pas « replis »',
  ],
  [
    'un secret bloquant cesse de se déclarer secret',
    (world) => {
      world.classification = {
        ...world.classification,
        MEESHY_PASSWORD: { ...world.classification.MEESHY_PASSWORD, secret: false },
      };
      return world;
    },
    'MEESHY_PASSWORD porte un nom de secret et ne déclare pas « secret: true »',
  ],
  [
    'un mot de passe INCONNU arrive avec un repli publié dans un fichier qui déploie',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = [
        ...target.substitutions,
        { line: 1, name: TEMOIN_SECRET, form: ':-', message: 'MotDePassePublieDansLeDepot' },
      ];
      return world;
    },
    `${TEMOIN_SECRET} porte un repli PUBLIÉ`,
  ],
  [
    "une defaut-acceptable de forme secret n'est pas protégée par sa classe",
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = target.substitutions.map((s) =>
        s.name === 'ATTACHMENT_MASTER_KEY' ? { ...s, form: ':-', message: 'ZGV2LWF0dGFjaG1lbnQta2V5' } : s,
      );
      return world;
    },
    'ATTACHMENT_MASTER_KEY porte un repli PUBLIÉ',
  ],
  [
    'un compose INCONNU arrive avec une substitution nue et hérite de la règle stricte',
    (world) => {
      world.files = [
        ...world.files,
        {
          path: join(COMPOSE_DIR, 'docker-compose.preprod.yml'),
          deploys: deploys('docker-compose.preprod.yml'),
          substitutions: [{ line: 12, name: 'CORS_ORIGINS', form: NUE, message: '' }],
        },
      ];
      return world;
    },
    'docker-compose.preprod.yml:12',
  ],
]);

/**
 * LES MUTATIONS QUI DOIVENT RESTER MUETTES [#4548]
 *
 * Une garde ne se prouve pas seulement par ce qu'elle attrape. La règle des
 * replis publiés a un versant exactement aussi coûteux : les 193 replis des
 * quatre compositions sont, à UN près, légitimes. Une règle « tout repli est
 * suspect » aurait fait rougir des ports, des noms d'image, des tailles, des
 * préférences de langue et `DOMAIN` quarante-deux fois — elle aurait été
 * retirée dans la semaine, et le défaut serait revenu avec elle.
 *
 * Ces mutations injectent donc des replis LÉGITIMES et exigent le SILENCE, une
 * par famille mesurée dans l'arbre : un réglage d'exploitation, un secret
 * déclaré ABSENT par un repli vide, un secret de développement dans un fichier
 * qui ne déploie pas, une valeur publique par conception dédouanée dans la
 * table.
 *
 * Chacune vérifie d'abord que son injection a bien ATTERRI : un témoin muet
 * dont la mutation ne s'applique pas serait vert pour la pire des raisons, et
 * ce dépôt a déjà payé le prix d'un cliquet qui ment.
 */
const MUTATIONS_MUETTES = Object.freeze([
  [
    "un réglage d'exploitation garde son repli en déploiement",
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = [...target.substitutions, { line: 1, name: TEMOIN_LIBRE, form: ':-', message: '8g' }];
      return world;
    },
    TEMOIN_LIBRE,
  ],
  [
    'un repli VIDE sur un nom de secret ne publie rien',
    (world) => {
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = [...target.substitutions, { line: 1, name: TEMOIN_SECRET, form: ':-', message: '' }];
      return world;
    },
    TEMOIN_SECRET,
  ],
  [
    "un secret de développement garde son repli dans un fichier qui NE déploie PAS",
    (world) => {
      const target = fileNamed(world, 'docker-compose.dev.yml');
      target.substitutions = [
        ...target.substitutions,
        { line: 1, name: TEMOIN_SECRET, form: ':-', message: 'dev-secret-vrai-et-assume' },
      ];
      return world;
    },
    TEMOIN_SECRET,
  ],
  [
    'une valeur publique par conception se dédouane par « secret: false »',
    (world) => {
      world.classification = {
        ...world.classification,
        [TEMOIN_SECRET]: {
          classe: DEFAUT_ACCEPTABLE,
          secret: false,
          raison: 'Valeur publique par conception, injectée par le self-test.',
        },
      };
      const target = fileNamed(world, 'docker-compose.prod.yml');
      target.substitutions = [
        ...target.substitutions,
        { line: 1, name: TEMOIN_SECRET, form: ':-', message: 'AIzaSyValeurPubliqueParConception' },
      ];
      return world;
    },
    TEMOIN_SECRET,
  ],
]);

const mondeNomme = (world, name) =>
  world.files.some((file) => file.substitutions.some((substitution) => substitution.name === name));

const selfTest = (world) => {
  const blind = MUTATIONS.filter(
    ([, apply, expected]) => !inspect(mutate(world, apply)).some((failure) => failure.includes(expected)),
  );
  blind.forEach(([title, , expected]) =>
    console.error(`AVEUGLE : « ${title} » n'a produit aucun échec contenant « ${expected} »`),
  );
  const bavardes = MUTATIONS_MUETTES.map(([titre, apply, nom]) => {
    const mute = mutate(world, apply);
    if (!mondeNomme(mute, nom)) {
      return [titre, nom, [`la mutation n'a rien injecté — ce témoin serait vert sans rien prouver.`]];
    }
    return [titre, nom, inspect(mute).filter((failure) => failure.includes(nom))];
  }).filter(([, , echecs]) => echecs.length > 0);

  bavardes.forEach(([titre, nom, echecs]) =>
    console.error(`TROP LARGE : « ${titre} » a rougi sur ${nom}\n${echecs.join('\n')}`),
  );

  if (blind.length + bavardes.length > 0) {
    if (blind.length > 0) console.error(`\n${blind.length}/${MUTATIONS.length} mutations passent sous le garde.`);
    if (bavardes.length > 0)
      console.error(`\n${bavardes.length}/${MUTATIONS_MUETTES.length} replis légitimes ont rougi — la règle est TROP LARGE.`);
    return 1;
  }
  console.log(
    `self-test : ${MUTATIONS.length}/${MUTATIONS.length} mutations détectées, ` +
      `${MUTATIONS_MUETTES.length}/${MUTATIONS_MUETTES.length} replis légitimes restés muets.`,
  );
  return 0;
};

const summarize = (world) => {
  const substitutions = world.files.reduce((total, file) => total + file.substitutions.length, 0);
  const bloquantes = new Set(
    world.files
      .flatMap((file) => file.substitutions)
      .filter((substitution) => classOf(world, substitution.name) === BLOQUANTE)
      .map((substitution) => substitution.name),
  );
  const broken = world.links.filter((link) => !link.resolved).map((link) => link.entry);
  console.log(
    `compositions : ${CHECKS.length} invariants tenus sur ${world.files.length} fichier(s) ` +
      `(${world.files.filter((f) => f.deploys).length} qui déploient), ${substitutions} substitution(s) lues, ` +
      `${bloquantes.size} variable(s) bloquante(s) exigées, ` +
      `${world.templates.length} modèle(s) d'environnement.`,
  );
  console.log(`  vus : ${world.files.map((file) => file.path).join(', ')}`);
  if (broken.length > 0) {
    console.log(
      `  NON vus (liens de racine qui ne se résolvent pas, donc rien à balayer) : ${broken.join(', ')}`,
    );
  }
};

/**
 * La déclaration SERVIE en texte, une ligne par variable, champs séparés par
 * une TABULATION : NOM, « secret » ou « libre », puis les replis mesurés.
 *
 * C'est le seul chemin par lequel `scripts/deployment/deploy-validate-config.sh`
 * apprend ce qu'un hôte doit porter. Il ne tient AUCUNE liste : #4544 a mesuré
 * ce que coûte une troisième copie — un validateur qui exigeait
 * MEESHY_BIGBOSS_PASSWORD, un nom qu'aucun service ne lit, tout en ignorant
 * ATABETH_PASSWORD et les deux listes d'origines.
 *
 * Une dérivation VIDE est un échec, jamais un silence : sans cela, une garde
 * cassée rendrait zéro ligne et le validateur conclurait « rien à exiger ».
 */
const requiredVars = (world) => {
  const exigees = variablesExigees(world);
  if (exigees.length === 0) {
    console.error(
      "aucune variable BLOQUANTE n'a pu être dérivée des compositions qui déploient.\n" +
        '  Un consommateur recevrait « rien à exiger » — refus plutôt que silence.',
    );
    return 1;
  }
  exigees.forEach(({ name, secret, replis }) =>
    console.log([name, secret ? 'secret' : 'libre', ...replis].join('\t')),
  );
  return 0;
};

const main = () => {
  const world = readWorld(REPO_ROOT);
  if (process.argv.includes('--self-test')) return selfTest(world);
  if (process.argv.includes('--required-vars')) return requiredVars(world);
  const failures = inspect(world);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(failure));
    console.error(`\n${failures.length} défaut(s) dans les variables d'hôte des compositions Docker.`);
    console.error(
      "Rejouer : node scripts/check-compose-required-vars.mjs — puis vérifier que `docker compose --env-file /dev/null -f <fichier> config -q` ÉCHOUE bien sur les variables bloquantes.",
    );
    return 1;
  }
  summarize(world);
  return 0;
};

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  process.exit(main());
}
