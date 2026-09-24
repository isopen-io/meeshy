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

/**
 * LA FACE CADRAGE DU PRISME (CLAUDE.md § Prisme, cycle 125) — dans quelle
 * LANGUE on ADRESSE le lecteur (titre d'épisode, libellé relatif de jour),
 * distincte de la face CONTENU (`READER_LANGUAGES`, quelle traduction
 * servir). Rang 1 du prisme — jamais `navigator.language` seul, qui
 * concourrait à son RANG 4 (règle 2 du Prisme) et ne doit jamais LE
 * supplanter. `'fr'` en repli : `READER_LANGUAGES` ne rend jamais un
 * tableau vide (`reader` du dépôt) mais un futur appelant qui composerait
 * son propre prisme vide ne doit pas produire de libellé cadré par
 * `undefined`.
 */
export const READER_LOCALE: string = READER_LANGUAGES[0] ?? 'fr';

/**
 * `resolveReaderLanguages` (#5650, F6) — le Prisme du lecteur RÉEL, une fois
 * une session vivante. `fixtures` garde le lecteur PROVISOIRE ci-dessus
 * (les captures et les témoins existants le lisent) ; `gateway` DESCEND
 * `resolveUserLanguagesOrdered` sur la session AUTHENTIFIÉE — jamais un
 * tableau vide (repli sur le lecteur provisoire si les trois rangs
 * applicatifs sont tous vides, ce qui ne laisse parler QUE la locale, un
 * prisme à un seul échelon — leçon 261 du dépôt).
 *
 * `deviceLocale` INJECTÉ (jamais relu ici) : le rang 4 reste la
 * responsabilité de l'appelant, comme `currentDeviceLocale()`
 * (`api/client.ts`).
 */
export function resolveReaderLanguages(params: {
  readonly source: 'fixtures' | 'gateway';
  readonly session: { readonly status: string; readonly user?: Record<string, unknown> };
  readonly deviceLocale?: string | null;
}): readonly string[] {
  if (params.source === 'fixtures') return READER_LANGUAGES;
  if (params.session.status !== 'authenticated' || params.session.user === undefined) return READER_LANGUAGES;

  const user = params.session.user as {
    readonly systemLanguage?: string | null;
    readonly regionalLanguage?: string | null;
    readonly customDestinationLanguage?: string | null;
  };
  const resolved =
    params.deviceLocale === null || params.deviceLocale === undefined
      ? resolveUserLanguagesOrdered(user)
      : resolveUserLanguagesOrdered(user, { deviceLocale: params.deviceLocale });

  return resolved.length > 0 ? resolved : READER_LANGUAGES;
}
