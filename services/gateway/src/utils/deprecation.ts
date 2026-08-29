import type { FastifyReply, onRequestHookHandler } from 'fastify';

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
 * pas encore (#4275). Aucune date de retrait n'est donc DÉRIVABLE aujourd'hui,
 * et une date posée « pour avoir quelque chose » serait pire que son absence :
 * un client la croirait. `Deprecation` et le successeur partent toujours ;
 * `Sunset` ne part que le jour où le compteur l'aura fait naître.
 */
export type AdresseDepreciee = {
  /** Jour où l'adresse EST devenue dépréciée — ISO 8601, jamais « maintenant ». */
  readonly depuis: string;
  /** Chemin absolu (ou URL) de l'adresse qui la remplace. */
  readonly successeur: string;
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
export function enTetesDeDepreciation(adresse: AdresseDepreciee): EnTetesDeDepreciation {
  const depuis = instantDe('depuis', adresse.depuis);
  const successeur = successeurDe(adresse.successeur);

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
export function annoncerDepreciation(reply: FastifyReply, adresse: AdresseDepreciee): void {
  poser(reply, enTetesDeDepreciation(adresse));
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
 * La validation et la composition ont lieu UNE fois, à l'enregistrement ; le
 * chemin chaud n'écrit que trois en-têtes.
 */
export function depreciee(adresse: AdresseDepreciee): onRequestHookHandler {
  const enTetes = enTetesDeDepreciation(adresse);
  return function annonce(_request, reply, done) {
    poser(reply, enTetes);
    done();
  };
}
