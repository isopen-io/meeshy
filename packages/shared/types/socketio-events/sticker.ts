/**
 * Le domaine STICKER : « Mes stickers » (#7938), la bibliothèque de stickers
 * d'un COMPTE — pas d'un appareil.
 *
 * `UserSticker` est par utilisateur, et son écrivain unique
 * (`services/gateway/src/services/stickers/StickerLibrary.ts`) a quatre
 * chemins d'écriture. Aucun ne diffusait jusqu'à #16515 : un sticker créé,
 * remonté ou retiré sur un appareil ne changeait rien sur les autres, qui
 * tiennent la liste en cache (le web avec une péremption de cinq minutes).
 *
 * C'est le pendant exact de `pack:installation-updated` et de
 * `profile:decor-updated` (`./pack.js`), qui portent déjà cette obligation
 * pour l'étagère de packs et le décor de profil — deux préférences de compte
 * voisines de celle-ci.
 *
 * @see ../socketio-events.ts — la façade qui garde l'adresse historique.
 */
import type { StickerDefinition } from '../sticker-definition.js';

/**
 * `sticker:library-updated`, émis sur `user:<id>` après CHAQUE écriture de la
 * bibliothèque : les autres appareils du compte mettent leur grille à jour
 * sans relire. Événement NEUF — les anciens clients ne l'écoutent pas, et
 * rien ne change pour eux.
 *
 * **Union DISCRIMINÉE, jamais un objet plat à champs optionnels.** La charge
 * NOMME ce que le serveur a ÉCRIT, et chaque membre ne porte que ce que son
 * écriture produit : un retrait n'a pas de définition à servir (la ligne
 * n'existe plus), une remontée en a forcément une (c'est elle qui porte le
 * `lastUsedAt` neuf dont dépend l'ORDRE de la grille).
 *
 * `added` et `promoted` se distinguent parce que le serveur SAIT lequel des
 * deux il a fait — re-créer une image déjà connue remonte l'existante au lieu
 * d'en ajouter une seconde. Les deux se posent sur un cache par la MÊME
 * opération (« ce sticker passe en tête, en remplaçant toute entrée de même
 * id ») ; les séparer sert le diagnostic et un éventuel retour visuel, pas la
 * réconciliation.
 */
export type StickerLibraryUpdatedEventData =
  | {
      readonly userId: string;
      readonly change: 'added' | 'promoted';
      readonly sticker: StickerDefinition;
      /** L'instant de l'écriture, ISO 8601. */
      readonly at: string;
    }
  | {
      readonly userId: string;
      readonly change: 'removed';
      readonly stickerId: string;
      /** L'instant de l'écriture, ISO 8601. */
      readonly at: string;
    };
