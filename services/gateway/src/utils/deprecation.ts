import type { FastifyReply, FastifyRequest, onRequestHookHandler } from 'fastify';

/**
 * L'annonce qu'une adresse est en sursis — le SITE UNIQUE (#4274).
 *
 * ## Ce que le silence coûtait
 *
 * Le dépôt sert déjà une quinzaine d'alias : `POST /admin/reports` (#4155), les
 * neuf adresses historiques d'écriture de compte (#4154), les trois portes de
 * profil (#4161), les trois du blocage (#4164), `GET /check-availability`
 * (#4158). **Aucune ne disait rien.** Un client qui appelle l'une d'elles
 * aujourd'hui n'a aucun moyen d'apprendre qu'elle est en sursis, ni par quoi la
 * remplacer : la migration ne peut donc partir que d'une lecture du code du
 * serveur — ce que ni un binaire iOS déjà installé ni un intégrateur tiers ne
 * peuvent faire. Et huit issues ouvertes exigent cette annonce : sans elle,
 * elles sont bloquées PAR CONSTRUCTION, pas par manque de travail.
 *
 * ## Pourquoi UN site
 *
 * Huit lots qui écrivent chacun leurs en-têtes dans leur coin, ce sont huit
 * formulations d'une même règle — trois jumelles là où on prétendait fermer des
 * doublons. La règle vit ici ; les sites d'appel ne portent que LEURS deux
 * faits : depuis quand, et vers quoi.
 *
 * ## Pourquoi un hook `onRequest`, et pas une ligne dans le chemin de succès
 *
 * Une adresse dépréciée doit s'annoncer **quel que soit le verdict**. Un client
 * dont le jeton vient d'expirer, un appelant plafonné par le débit, un rôle
 * refusé : tous reçoivent une réponse, et tous doivent apprendre que l'adresse
 * est en sursis. Posée dans le handler, l'annonce ne partirait que sur les 200
 * — c'est-à-dire jamais pour l'appelant qui a le plus besoin de migrer.
 * `onRequest` court AVANT `preHandler`, donc avant `authenticate`, avant le
 * limiteur de débit et avant toute garde de rang.
 *
 * ## Les RFC, et la correction d'une erreur d'énoncé
 *
 * L'issue attribue `Deprecation` à la RFC 8594. La RFC 8594 ne définit que
 * `Sunset` ; `Deprecation` vient de la **RFC 9745**, qui en fait un champ
 * structuré de type Date — `Deprecation: @1787011200` — et non le `true` du
 * brouillon de 2019 que l'on croise encore. C'est la forme servie ici, parce
 * qu'elle porte une INFORMATION (depuis quand) là où `true` n'en porte aucune.
 * `Sunset` reste une date HTTP (IMF-fixdate, RFC 8594 §3), et le lien vers le
 * successeur une relation `successor-version` (RFC 5829).
 *
 * ## Pourquoi `Sunset` est OPTIONNEL
 *
 * La règle de retrait du dépôt est écrite dans les issues qu'elle gouverne
 * (#4155 c.5, #4161 c.9/c.10, #4164 c.7/c.8, #4275 c.4) : une adresse ne se
 * retire pas sur une revue de code client, mais sur un **compteur d'accès à
 * zéro sur deux versions publiées**, la queue des versions déjà installées
 * étant longue — un profil s'ouvre depuis un lien partagé. Ce compteur n'existe
 * pas encore (#4275). Une date posée « pour avoir quelque chose » serait pire
 * que son absence : un client la croirait. `Deprecation` et le successeur
 * partent toujours ; `Sunset` ne part que dérivé d'une règle écrite.
 *
 * ## La fenêtre de 180 jours, et pourquoi son ancre est FIXE
 *
 * `docs/product/api-simplification/identity.md` § « Ordre des étapes », point 5,
 * est le seul endroit du dépôt où la règle de retrait est CHIFFRÉE : « retrait
 * des alias, six mois après le montage double ». C'est la fenêtre par défaut
 * retenue ici, et {@link dateDeRetrait} la dérive.
 *
 * Elle se dérive de `depuis` — le jour où l'adresse EST devenue dépréciée —
 * **jamais de l'instant de la requête**. Une dérivation ancrée sur « maintenant »
 * repousse l'échéance d'un jour chaque jour : le client qui rappelle demain lit
 * une date plus lointaine qu'hier, et le retrait n'arrive jamais. Un `Sunset`
 * qui recule perpétuellement n'annonce rien — il ment avec l'autorité d'un
 * en-tête normalisé. Le retrait RÉEL reste gouverné par le compteur d'accès nul
 * (#4275) ; cette date INFORME le client, elle ne décide pas à sa place.
 *
 * ## Le successeur peut dépendre de la requête
 *
 * `Link: </api/v1/admin/users/:userId>` n'est pas suivable : le client ne sait
 * pas résoudre le gabarit. Le successeur accepte donc une FONCTION de la
 * requête, évaluée à chaque appel, qui rend le chemin avec ses paramètres
 * résolus. `request.params` est peuplé par le routeur AVANT la chaîne
 * `onRequest` — c'est ce qui permet au hook de le lire sans quitter sa place,
 * et donc de garder l'annonce sur les branches 401 / 403 / 429.
 */

/**
 * Fenêtre de retrait par défaut, en jours — la règle d'`identity.md` § 5.
 *
 * Une route dont la règle diffère (permanente, ou liée à une publication de
 * store précise) passe son propre `fenetreJours` — jamais une date en dur au
 * site d'appel.
 */
export const FENETRE_DE_RETRAIT_JOURS = 180;

const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

/**
 * Dérive le jour du retrait depuis le jour de dépréciation.
 *
 * L'ancre est `depuis`, jamais « maintenant » : c'est ce qui rend l'échéance
 * STABLE d'un appel à l'autre.
 */
export function dateDeRetrait(depuis: string, fenetreJours: number = FENETRE_DE_RETRAIT_JOURS): string {
  const ancre = instantDe('depuis', depuis);
  return new Date(ancre + fenetreJours * MS_PAR_JOUR).toISOString();
}

export type AdresseDepreciee = {
  /** Jour où l'adresse EST devenue dépréciée — ISO 8601, jamais « maintenant ». */
  readonly depuis: string;
  /**
   * Chemin absolu (ou URL) de l'adresse qui la remplace — ou une FONCTION de la
   * requête quand ce chemin porte des paramètres à résoudre.
   */
  readonly successeur: string | ((request: FastifyRequest) => string);
  /** Jour du retrait, quand — et seulement quand — un compteur l'a établi. */
  readonly retraitLe?: string;
};

export type EnTetesDeDepreciation = {
  readonly Deprecation: string;
  readonly Link: string;
  readonly Sunset?: string;
};

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}(?:[T ][0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/;

/**
 * Une date se lit ISO 8601 ou pas du tout.
 *
 * `Date.parse` est permissif — il accepte `08/29/2026` et le lit à l'américaine.
 * Un en-tête de dépréciation qui se trompe d'un mois est un mensonge silencieux ;
 * la forme est donc exigée AVANT l'analyse.
 */
function instantDe(champ: string, valeur: string): number {
  if (!JOUR_ISO.test(valeur)) {
    throw new Error(`[deprecation] ${champ} doit être une date ISO 8601 (reçu: ${valeur})`);
  }
  const ms = Date.parse(valeur);
  if (Number.isNaN(ms)) {
    throw new Error(`[deprecation] ${champ} n'est pas une date valide (reçu: ${valeur})`);
  }
  return ms;
}

/**
 * Le successeur voyage dans un en-tête : il ne peut porter ni espace, ni
 * chevron, ni guillemet, ni retour à la ligne — sans quoi une adresse mal
 * composée deviendrait une injection d'en-tête.
 */
function successeurDe(brut: string): string {
  if (!/^(?:\/|https?:\/\/)[^\s<>"]*$/.test(brut)) {
    throw new Error(
      `[deprecation] successeur doit être un chemin absolu ou une URL sans espace ni chevron (reçu: ${brut})`
    );
  }
  return brut;
}

/**
 * Compose les trois en-têtes. Pure, et VALIDANTE : appelée à l'enregistrement
 * de la route, une adresse mal écrite fait échouer le démarrage — bruyamment —
 * plutôt que de servir en silence une annonce fausse pendant des mois.
 */
export function enTetesDeDepreciation(
  adresse: AdresseDepreciee,
  request?: FastifyRequest
): EnTetesDeDepreciation {
  const depuis = instantDe('depuis', adresse.depuis);
  const successeur = successeurDe(resoudreSuccesseur(adresse.successeur, request));

  const enTetes: EnTetesDeDepreciation = {
    Deprecation: `@${Math.floor(depuis / 1000)}`,
    Link: `<${successeur}>; rel="successor-version"`,
  };

  if (adresse.retraitLe === undefined) return enTetes;

  const retrait = instantDe('retraitLe', adresse.retraitLe);
  if (retrait < depuis) {
    throw new Error(
      `[deprecation] retraitLe (${adresse.retraitLe}) précède depuis (${adresse.depuis})`
    );
  }
  return { ...enTetes, Sunset: new Date(retrait).toUTCString() };
}

/**
 * Pose les en-têtes sur une réponse.
 *
 * `Link` est CUMULATIF (RFC 8288 §3) : une route paginée pose déjà ses `next` /
 * `prev`, et les écraser ferait de l'annonce de dépréciation une régression de
 * pagination. L'annonce s'AJOUTE, elle ne remplace pas.
 */
export function annoncerDepreciation(
  reply: FastifyReply,
  adresse: AdresseDepreciee,
  request?: FastifyRequest
): void {
  poser(reply, enTetesDeDepreciation(adresse, request));
}

/**
 * Rend le chemin successeur.
 *
 * Une adresse dont le successeur est une FONCTION ne peut être composée sans
 * requête : la réclamer ici — plutôt que de servir un gabarit non suivable —
 * fait échouer bruyamment l'appelant qui s'est trompé de forme.
 */
function resoudreSuccesseur(
  successeur: AdresseDepreciee['successeur'],
  request?: FastifyRequest
): string {
  if (typeof successeur !== 'function') return successeur;
  if (request === undefined) {
    throw new Error('[deprecation] un successeur dérivé de la requête exige une requête');
  }
  return successeur(request);
}

function poser(reply: FastifyReply, enTetes: EnTetesDeDepreciation): void {
  reply.header('Deprecation', enTetes.Deprecation);
  if (enTetes.Sunset !== undefined) reply.header('Sunset', enTetes.Sunset);

  const existant = reply.getHeader('Link');
  const deja = Array.isArray(existant) ? existant.join(', ') : existant;
  const prefixe = typeof deja === 'string' && deja.length > 0 ? `${deja}, ` : '';
  reply.header('Link', `${prefixe}${enTetes.Link}`);
}

/**
 * Le hook à poser sur une route en sursis : `onRequest: depreciee(...)`.
 *
 * Un successeur STATIQUE est validé et composé UNE fois, à l'enregistrement :
 * une adresse mal écrite fait échouer le démarrage — bruyamment — plutôt que de
 * servir en silence une annonce fausse pendant des mois, et le chemin chaud
 * n'écrit alors que trois en-têtes déjà prêts.
 *
 * Un successeur DÉRIVÉ de la requête ne peut pas l'être : son chemin dépend de
 * paramètres qui n'existent qu'à l'appel. Ce qui EST validable à
 * l'enregistrement l'est quand même — les deux dates — pour que la forme d'une
 * annonce ne se découvre jamais en production.
 */
export function depreciee(adresse: AdresseDepreciee): onRequestHookHandler {
  if (typeof adresse.successeur !== 'function') {
    const enTetes = enTetesDeDepreciation(adresse);
    return function annonce(_request, reply, done) {
      poser(reply, enTetes);
      done();
    };
  }

  enTetesDeDepreciation({ ...adresse, successeur: '/' });
  return function annonceResolue(request, reply, done) {
    poser(reply, enTetesDeDepreciation(adresse, request));
    done();
  };
}
