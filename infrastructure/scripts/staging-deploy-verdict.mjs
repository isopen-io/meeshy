#!/usr/bin/env node
// Verdict d'un déploiement de staging : chaque service recréé tourne-t-il le
// tag FLOTTANT `:staging` que la CI vient de pousser ? [#9825, #10048]
//
// LE DÉFAUT QU'IL FERME
//
// Le compose de staging lit `${GATEWAY_IMAGE:-isopen/meeshy-gateway:staging}`.
// Sur l'hôte, `/opt/meeshy/staging/.env` posait `GATEWAY_IMAGE=…:sha-5377f1d`
// et `TRANSLATOR_IMAGE=…:sha-aaa55c4`, épinglés à la main pour un retour
// arrière ou une livraison ponctuelle. Le script de l'hôte fait alors `pull` +
// `up -d` sur le tag FIGÉ : le `pull` réussit, `up -d` répond `Running`, l'état
// dit `healthy`, et l'image construite par la CI n'est jamais servie. Le run
// 38105794544 l'a montré mot pour mot :
//
//   Image isopen/meeshy-gateway:sha-5377f1d Pulled
//   Container meeshy-gateway-staging Running
//
// Rien ne rougissait avant la sonde de fumée, qui lisait l'effet (trois routes
// en 404) sans en nommer la cause. Ce verdict lit l'état que l'hôte IMPRIME
// (`docker compose ps`, après la section `== etat` ou, à défaut, depuis l'en-tête
// NAME … IMAGE … SERVICE du tableau — le script du dépôt n'imprime pas de section,
// run 38340043348) et refuse tout service demandé qui
// tourne autre chose que `:staging` — en nommant le tag et la variable à
// retirer du `.env`.
//
// Un pin reste possible pour un retour arrière ; il n'est simplement plus
// silencieux : staging ne sert pas `dev`, le déploiement le dit.
//
// USAGE
//   printf '%s\n' "$SORTIE" | node infrastructure/scripts/staging-deploy-verdict.mjs --services "gateway-staging translator-staging"
//   node infrastructure/scripts/staging-deploy-verdict.mjs --self-test

import { readFileSync } from 'node:fs';

const TAG_FLOTTANT = 'staging';

const VARIABLE_DU_SERVICE = {
  'gateway-staging': 'GATEWAY_IMAGE',
  'translator-staging': 'TRANSLATOR_IMAGE',
  'frontend-staging': 'FRONTEND_IMAGE',
  'agent-staging': 'AGENT_IMAGE',
};

const estEnTeteDeCompose = (ligne) => {
  const jetons = ligne.trim().split(/\s+/);
  return jetons[0] === 'NAME' && jetons.includes('IMAGE') && jetons.includes('SERVICE');
};

const debutDeLEtat = (lignes) => {
  const section = lignes.findIndex((ligne) => ligne.trim().startsWith('== etat'));
  if (section !== -1) return section + 1;
  return lignes.findIndex(estEnTeteDeCompose);
};

const lignesDeLEtat = (sortie) => {
  const lignes = sortie.split('\n');
  const debut = debutDeLEtat(lignes);
  return debut === -1 ? [] : lignes.slice(debut).filter((ligne) => ligne.trim() !== '');
};

const tagDe = (image) => {
  if (image.includes('@')) return null;
  const nom = image.slice(image.lastIndexOf('/') + 1);
  const deuxPoints = nom.lastIndexOf(':');
  return deuxPoints === -1 ? 'latest' : nom.slice(deuxPoints + 1);
};

export const verdict = ({ sortie, services }) => {
  const etat = lignesDeLEtat(sortie).map((ligne) => ligne.trim().split(/\s+/));
  return services.flatMap((service) => {
    const rangee = etat.find((jetons) => jetons.slice(2).includes(service));
    if (!rangee) {
      return [{ service, image: null, probleme: 'absent' }];
    }
    const image = rangee[1];
    return tagDe(image) === TAG_FLOTTANT ? [] : [{ service, image, probleme: 'epingle' }];
  });
};

const message = ({ service, image, probleme }) => {
  if (probleme === 'absent') {
    return `${service} n'apparaît pas dans l'état imprimé par l'hôte après déploiement`;
  }
  const variable = VARIABLE_DU_SERVICE[service] ?? '<SERVICE>_IMAGE';
  return (
    `${service} tourne ${image}, pas le tag :${TAG_FLOTTANT} que la CI vient de pousser — ` +
    `${variable} est épinglé dans /opt/meeshy/staging/.env (#9825). ` +
    `Retirer la ligne ${variable}=… (après sauvegarde du .env), puis relancer le déploiement.`
  );
};

const FIXTURE_RUN_38105794544 = `== pull frontend-staging gateway-staging agent-staging translator-staging
 Image isopen/meeshy-gateway:sha-5377f1d Pulled
== up -d --no-deps frontend-staging gateway-staging agent-staging translator-staging
 Container meeshy-gateway-staging Running
== etat
NAME                        IMAGE                                  COMMAND                  SERVICE              CREATED          STATUS                    PORTS
meeshy-agent-staging        isopen/meeshy-agent:staging            "/usr/bin/tini -- no…"   agent-staging        21 seconds ago   Up 20 seconds (healthy)   3200/tcp
meeshy-frontend-staging     isopen/meeshy-webapp:staging           "/sbin/tini -- nginx…"   frontend-staging     21 seconds ago   Up 20 seconds (healthy)   80/tcp, 3400/tcp
meeshy-gateway-staging      isopen/meeshy-gateway:sha-5377f1d      "/usr/bin/tini -- /a…"   gateway-staging      3 hours ago      Up 3 hours (healthy)      3000/tcp
meeshy-translator-staging   isopen/meeshy-translator:sha-aaa55c4   "/usr/bin/tini -s --…"   translator-staging   25 hours ago     Up 25 hours (healthy)     5555/tcp, 5558/tcp, 8000/tcp, 50051/tcp
`;

const FIXTURE_SAINE = `== etat
NAME                        IMAGE                                  COMMAND                  SERVICE              CREATED          STATUS                    PORTS
meeshy-gateway-staging      docker.io/isopen/meeshy-gateway:staging "/usr/bin/tini -- /a…"   gateway-staging      9 seconds ago    Up 8 seconds (healthy)    3000/tcp
meeshy-translator-staging   isopen/meeshy-translator:staging       "/usr/bin/tini -s --…"   translator-staging   9 seconds ago    Up 8 seconds (healthy)    8000/tcp
`;

const FIXTURE_DIGEST_ET_SANS_TAG = `== etat
NAME                        IMAGE                                  COMMAND                  SERVICE              CREATED          STATUS                    PORTS
meeshy-gateway-staging      isopen/meeshy-gateway@sha256:0123abcd  "/usr/bin/tini -- /a…"   gateway-staging      9 seconds ago    Up 8 seconds (healthy)    3000/tcp
meeshy-agent-staging        isopen/meeshy-agent                    "/usr/bin/tini -- no…"   agent-staging        9 seconds ago    Up 8 seconds (healthy)    3200/tcp
`;

const FIXTURE_RUN_38340043348 = `[2026-10-13T03:15:23Z] pull: frontend-staging gateway-staging agent-staging translator-staging
 Image isopen/meeshy-gateway:staging Pulled
[2026-10-13T03:16:00Z] up: frontend-staging gateway-staging agent-staging translator-staging
 Container meeshy-gateway-staging Started
NAME                        IMAGE                              COMMAND                  SERVICE              CREATED          STATUS                             PORTS
meeshy-agent-staging        isopen/meeshy-agent:staging        "/usr/bin/tini -- no…"   agent-staging        19 seconds ago   Up 15 seconds (healthy)            3200/tcp
meeshy-frontend-staging     isopen/meeshy-webapp:staging       "/sbin/tini -- /usr/…"   frontend-staging     19 seconds ago   Up 15 seconds (healthy)            80/tcp, 3400/tcp
meeshy-gateway-staging      isopen/meeshy-gateway:sha-5377f1d  "/usr/bin/tini -- /a…"   gateway-staging      19 seconds ago   Up 15 seconds (health: starting)   3000/tcp
meeshy-translator-staging   isopen/meeshy-translator:staging   "/usr/bin/tini -s --…"   translator-staging   19 seconds ago   Up 15 seconds (health: starting)   5555/tcp, 5558/tcp, 8000/tcp, 50051/tcp
`;

const selfTest = () => {
  const cas = [
    {
      nom: 'run 38105794544 : gateway et translator épinglés sur sha-, frontend et agent sur :staging',
      sortie: FIXTURE_RUN_38105794544,
      services: ['frontend-staging', 'gateway-staging', 'agent-staging', 'translator-staging'],
      attendu: ['gateway-staging:epingle', 'translator-staging:epingle'],
    },
    {
      nom: 'tout sur :staging, préfixe de registre compris',
      sortie: FIXTURE_SAINE,
      services: ['gateway-staging', 'translator-staging'],
      attendu: [],
    },
    {
      nom: 'un digest et une image sans tag ne sont pas :staging',
      sortie: FIXTURE_DIGEST_ET_SANS_TAG,
      services: ['gateway-staging', 'agent-staging'],
      attendu: ['gateway-staging:epingle', 'agent-staging:epingle'],
    },
    {
      nom: 'un service demandé absent de l’état se voit',
      sortie: FIXTURE_SAINE,
      services: ['gateway-staging', 'agent-staging'],
      attendu: ['agent-staging:absent'],
    },
    {
      nom: 'run 38340043348 : le script du dépôt imprime le tableau de compose sans en-tête == etat',
      sortie: FIXTURE_RUN_38340043348,
      services: ['frontend-staging', 'gateway-staging', 'agent-staging', 'translator-staging'],
      attendu: ['gateway-staging:epingle'],
    },
    {
      nom: 'une sortie sans section == etat ne passe pas pour saine',
      sortie: '== pull gateway-staging\n',
      services: ['gateway-staging'],
      attendu: ['gateway-staging:absent'],
    },
  ];

  const echecs = cas.filter(({ nom, sortie, services, attendu }) => {
    const obtenu = verdict({ sortie, services }).map(({ service, probleme }) => `${service}:${probleme}`);
    const ok = JSON.stringify(obtenu) === JSON.stringify(attendu);
    if (!ok) console.error(`AVEUGLE: ${nom} — attendu ${JSON.stringify(attendu)}, obtenu ${JSON.stringify(obtenu)}`);
    return !ok;
  });

  if (echecs.length > 0) {
    console.error(`self-test: ${echecs.length}/${cas.length} cas en échec.`);
    return 1;
  }
  console.log(`self-test: ${cas.length}/${cas.length} cas passés.`);
  return 0;
};

const main = (argv) => {
  if (argv.includes('--self-test')) return selfTest();

  const index = argv.indexOf('--services');
  const services = index === -1 ? [] : (argv[index + 1] ?? '').split(/\s+/).filter(Boolean);
  if (services.length === 0) {
    console.error('::error::staging-deploy-verdict : --services "<services>" est requis');
    return 2;
  }

  const problemes = verdict({ sortie: readFileSync(0, 'utf8'), services });
  problemes.forEach((probleme) => console.log(`::error::${message(probleme)}`));
  if (problemes.length > 0) return 1;
  console.log(`staging sert :${TAG_FLOTTANT} pour ${services.join(', ')}`);
  return 0;
};

process.exitCode = main(process.argv.slice(2));
