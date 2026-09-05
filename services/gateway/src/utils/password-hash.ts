/**
 * Le hachage des mots de passe — **SITE UNIQUE** du gateway (#5216, suite de
 * #3629).
 *
 * ## Le coût, une seule fois
 *
 * `BCRYPT_COST` valait 12 dans trois fichiers et **10** dans un quatrième
 * (`services/admin/user-management.service.ts`) : un compte créé par un
 * administrateur repartait avec un hash quatre fois moins cher à casser que
 * celui d'un compte inscrit par la porte publique, sans que rien ne le signale.
 * Un facteur de travail qui se retape à chaque site FINIT par diverger — et la
 * divergence n'a aucun symptôme jusqu'au jour où la base fuit.
 *
 * ## Pourquoi deux implémentations, et pourquoi c'est sans risque
 *
 * `bcrypt` (natif, `node-gyp`) est un ordre de grandeur plus rapide que
 * `bcryptjs` (JavaScript pur) — ce qui compte ici, parce que le hachage est
 * SYNCHRONE du point de vue de la requête : à coût 12 il tient la réponse
 * d'inscription pendant des centaines de millisecondes.
 *
 * Mais un binaire natif ne se charge pas partout (image sans chaîne de
 * compilation, architecture inattendue, installation `--ignore-scripts`), et un
 * `require` qui lève au chargement du module abattrait TOUTE la passerelle pour
 * une dépendance de confort. D'où le repli : on tente le natif une fois, et on
 * retombe sur l'implémentation JavaScript, qui est déjà une dépendance de
 * production.
 *
 * **Les deux produisent le MÊME format `$2b$`** et se vérifient mutuellement —
 * mesuré, pas supposé : un hash écrit par l'un est accepté par l'autre. Un
 * compte créé pendant que le natif était indisponible se connecte donc
 * normalement quand il revient, et réciproquement. Sans cette propriété, le
 * repli serait une bombe à retardement plutôt qu'une sécurité.
 *
 * ## Ce que ce module n'expose PAS
 *
 * Aucun `hashSync` / `compareSync`. Les variantes synchrones bloquent la boucle
 * d'événements pendant toute la durée du calcul — à coût 12, c'est la passerelle
 * entière qui s'arrête, pas seulement la requête qui hache.
 *
 * @module utils/password-hash
 */

import bcryptjs from 'bcryptjs';

import { enhancedLogger } from './logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'PasswordHash' });

/**
 * Le facteur de travail bcrypt. **Une seule valeur, pour toutes les portes** —
 * inscription publique, réinitialisation, changement de mot de passe, création
 * par un administrateur.
 *
 * Le monter est une décision de sécurité qui se prend ICI, et elle se paie en
 * latence sur CHAQUE porte à la fois : c'est exactement pour cela qu'elle ne
 * doit pas se prendre au site.
 */
export const BCRYPT_COST = 12;

/** Ce que le module attend d'une implémentation bcrypt — les deux la satisfont. */
type MoteurBcrypt = {
  hash(data: string, saltOrRounds: string | number): Promise<string>;
  compare(data: string, encrypted: string): Promise<boolean>;
};

/**
 * Le moteur natif, résolu UNE fois et PARESSEUSEMENT.
 *
 * Paresseusement, parce qu'un `import` statique d'un binaire natif fait de son
 * absence une erreur de CHARGEMENT DE MODULE — donc une passerelle qui ne
 * démarre pas, pour une dépendance dont on sait se passer. Une fois, parce que
 * retenter à chaque hachage paierait la résolution de module sur le chemin
 * chaud.
 */
let moteurNatif: MoteurBcrypt | null | undefined;

function bcryptNatif(): MoteurBcrypt | null {
  if (moteurNatif !== undefined) return moteurNatif;

  try {
    const charge = require('bcrypt') as Partial<MoteurBcrypt>;
    moteurNatif = typeof charge?.hash === 'function' && typeof charge?.compare === 'function'
      ? (charge as MoteurBcrypt)
      : null;
  } catch (error) {
    logger.warn('bcrypt natif indisponible — repli sur bcryptjs', {
      error: error instanceof Error ? error.message : String(error),
    });
    moteurNatif = null;
  }

  return moteurNatif;
}

const moteur = (): MoteurBcrypt => bcryptNatif() ?? (bcryptjs as unknown as MoteurBcrypt);

/** Hache un mot de passe au coût unique du dépôt. */
export async function hashPassword(password: string): Promise<string> {
  return moteur().hash(password, BCRYPT_COST);
}

/**
 * Vérifie un mot de passe contre son hash.
 *
 * Ne lève JAMAIS : un hash absent, tronqué ou écrit par un algorithme inconnu
 * rend `false`, pas une exception. Un `throw` ici remonterait en 500 sur une
 * porte de connexion — c'est-à-dire qu'un enregistrement corrompu deviendrait
 * une panne au lieu d'un refus.
 */
export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!password || !hash) return false;

  try {
    return await moteur().compare(password, hash);
  } catch (error) {
    logger.warn('comparaison de mot de passe impossible', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
