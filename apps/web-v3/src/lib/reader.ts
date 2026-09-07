import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';

/**
 * LE PRISME DU LECTEUR — sa DESCENTE vient de `@meeshy/shared`.
 *
 * Ce fichier écrivait `[...new Set(['fr', localeDuNavigateur])]`. Ça avait
 * l'air d'un raccourci de POC ; c'en était un faux. L'ordre réel a QUATRE
 * rangs — `systemLanguage`, `regionalLanguage`, `customDestinationLanguage`,
 * puis la locale de l'appareil — et il normalise chaque code (`'EN'` → `'en'`,
 * `'pt-BR'` → `'pt'`) avant de dédupliquer. Un prisme reconstruit à la main
 * rate exactement cette normalisation, et le symptôme n'est pas une erreur :
 * c'est l'ORIGINAL servi à la place d'une traduction qui existe, ce qui
 * ressemble à une traduction manquante.
 *
 * LA LOCALE N'EST PAS UN REPLI : elle concourt à son RANG (4e) et ne supplante
 * jamais une préférence configurée dans l'application. Tant que la v3.1 n'a
 * pas de session, les trois premiers rangs sont vides et seule la locale
 * parle — mais la FORME est déjà la bonne, donc brancher la session
 * (#5493, #5555) ne demandera que de remplir le premier argument.
 *
 * `'fr'` reste en queue comme repli produit : `resolveUserLanguagesOrdered`
 * n'en pose aucun délibérément (« si tout est vide, le caller décide »), et un
 * prisme VIDE ferait servir l'original à tout le monde.
 */
const deviceLocale = typeof navigator === 'undefined' ? undefined : navigator.language;

/**
 * LE LECTEUR PROVISOIRE — trois rangs vides et un défaut produit au rang 1.
 *
 * `systemLanguage: 'fr'` TIENT LA PLACE de la préférence que la session
 * servira (#5555). Ce n'est pas un repli déguisé : c'est le rang 1 du Prisme,
 * occupé par le défaut produit tant que personne ne s'est connecté, et il se
 * remplacera par la vraie valeur sans qu'aucune autre ligne bouge.
 *
 * Le laisser VIDE aurait l'air plus honnête et serait pire : seule la locale
 * de l'appareil parlerait alors, donc un navigateur anglais servirait l'anglais
 * — ce qui est juste par la loi, mais ne descend qu'UN rang. Or un prisme d'un
 * seul échelon rend vert n'importe quel résolveur, juste ou faux : c'est
 * exactement la leçon 261 du dépôt (« un témoin de rang s'écrit sur un rang
 * autre que le premier »). Deux rangs sont le minimum pour que la descente
 * soit observable — dans les captures comme dans les témoins.
 */
const reader = {
  systemLanguage: 'fr',
  regionalLanguage: null,
  customDestinationLanguage: null,
};

export const READER_LANGUAGES: readonly string[] =
  deviceLocale === undefined
    ? resolveUserLanguagesOrdered(reader)
    : resolveUserLanguagesOrdered(reader, { deviceLocale });
