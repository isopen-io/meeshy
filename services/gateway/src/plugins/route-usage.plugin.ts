import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  getRouteUsageCounter,
  type RouteSurveillee,
  type RouteUsageCounter,
} from '../services/route-usage.service';

/**
 * Le point d'accrochage du compteur d'acces (#4275).
 *
 * ## Une fonction, pas un plugin encapsule
 *
 * `fastify.register(...)` cree un CONTEXTE : un hook pose dedans ne verrait
 * que les routes de ce contexte et de ses enfants — c'est-a-dire, ici,
 * AUCUNE, puisque les routes de production sont enregistrees en freres.
 * Le compteur aurait rendu un tapis de zeros parfaitement credible.
 * `registerClientMutationIdHook(this.server)` avait deja tranche de la meme
 * facon dans `server.ts` : un hook GLOBAL se pose sur l'instance racine, en
 * appel direct, sans `register`. `fastify-plugin` n'est pas une dependance du
 * gateway, donc `fp()` n'etait pas une option.
 *
 * ## Ce que le hook lit, et ce qu'il refuse de lire
 *
 * Quatre valeurs, toutes deja en memoire sur la requete : la methode, le motif
 * de route MONTE, et deux en-tetes de version/plateforme. Rien d'autre —
 * ni `request.ip`, ni `request.user`, ni le jeton, ni le `User-Agent` conserve
 * tel quel. **C'est un compteur, pas un journal** (critere 1).
 *
 * `request.routeOptions.url` est le MOTIF (`/api/v1/users/:id`), pas l'URL
 * appelee. La distinction est ce qui borne la cardinalite : `request.url`
 * porte les identifiants et la chaine de requete, donc une cle par appelant et
 * une croissance memoire sans plafond.
 *
 * ## Pourquoi `onResponse` et non `onRequest`
 *
 * A `onRequest`, `routeOptions.url` n'est pas encore resolu sur tous les
 * chemins, et une requete interrompue avant le routage serait comptee comme un
 * appel a une adresse qu'elle n'a jamais atteinte. A `onResponse`, le motif est
 * connu et la reponse est partie : le comptage ne peut plus retarder personne.
 *
 * Les refus sont comptes AUSSI — un 401, un 403, un 429 sur une adresse
 * depreciee restent la preuve qu'un binaire installe l'appelle encore. La
 * question du lot est « qui appelle ? », jamais « qui reussit ? ».
 */

/** Ce que le hook coute par requete : deux lectures d'en-tete et une entree de Map. */
function versionDe(request: FastifyRequest): string | undefined {
  const h = request.headers;
  // `X-Meeshy-Version` est la telemetrie, `X-App-Version` la porte de version :
  // deux CONTRATS distincts que le SDK iOS pose tous les deux
  // (ClientInfoProvider.swift). Lire les deux evite qu'un renommage d'un cote
  // eteigne le compteur en silence.
  const meeshy = h['x-meeshy-version'];
  if (typeof meeshy === 'string') return meeshy;
  const app = h['x-app-version'];
  return typeof app === 'string' ? app : undefined;
}

function plateformeDe(request: FastifyRequest): string | undefined {
  const h = request.headers;
  const meeshy = h['x-meeshy-platform'];
  if (typeof meeshy === 'string') return meeshy;
  const app = h['x-app-platform'];
  return typeof app === 'string' ? app : undefined;
}

function agentDe(request: FastifyRequest): string | undefined {
  const ua = request.headers['user-agent'];
  return typeof ua === 'string' ? ua : undefined;
}

/**
 * Pose le hook global et la reconciliation de la liste surveillee.
 *
 * A appeler sur l'instance RACINE, apres l'authentification et avant
 * l'enregistrement des routes — l'ordre n'importe que pour la lisibilite des
 * journaux : un hook `onResponse` pose a la racine s'applique aux routes
 * enregistrees APRES lui comme a celles enregistrees avant.
 */
export function registerRouteUsageHook(
  fastify: FastifyInstance,
  compteur: RouteUsageCounter = getRouteUsageCounter()
): void {
  compteur.markInstrumented();

  fastify.addHook('onResponse', (request: FastifyRequest, _reply: FastifyReply, done: () => void) => {
    compteur.record({
      method: request.method,
      routePattern: request.routeOptions?.url,
      versionHeader: versionDe(request),
      platformHeader: plateformeDe(request),
      userAgent: agentDe(request),
    });
    done();
  });

  // La reconciliation attend `onReady` : avant, la table de routage est
  // incomplete et TOUTE adresse surveillee ressortirait `matched: false` —
  // une alarme fabriquee par le moment de la lecture, pas par l'etat du code.
  fastify.addHook('onReady', (done: () => void) => {
    compteur.reconcile((route: RouteSurveillee) => estMontee(fastify, route));
    done();
  });
}

/**
 * `hasRoute` leve sur une methode qu'il ne connait pas et rend `false` sur un
 * motif absent. Les deux cas se lisent pareil ici — « cette adresse n'est pas
 * montee » — parce que la charge doit distinguer un zero d'un motif mort, pas
 * diagnostiquer POURQUOI le motif est mort.
 */
function estMontee(fastify: FastifyInstance, route: RouteSurveillee): boolean {
  try {
    return fastify.hasRoute({ method: route.method as 'GET', url: route.route });
  } catch {
    return false;
  }
}
