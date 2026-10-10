import { appelNatifMethode, coqueCourante, type CoqueNative } from './native-shell';

/**
 * LA LANGUE CHOISIE DANS MEESHY GAGNE AUSSI LES TEXTES NATIFS DE LA COQUE
 * ANDROID (#9749) — « Appel en cours », la lecture, l'enregistrement et les
 * canaux de notification, qu'Android écrit dans la langue de l'application.
 * Un tag vide (« Automatique ») la rend au téléphone. Un navigateur, ou une
 * coque construite avant `MeeshyLocale.setLocales`, ne reçoit rien ; un refus
 * natif ne défait jamais le changement de langue de la page.
 */
export function syncShellLocale(
  tag: string,
  options: { readonly ifUnset?: boolean; readonly coque?: CoqueNative | undefined } = {},
): Promise<void> {
  const appel = appelNatifMethode('coque' in options ? options.coque : coqueCourante(), 'MeeshyLocale', 'setLocales');
  if (appel === null) return Promise.resolve();
  return appel({ tag, ifUnset: options.ifUnset === true }).then(
    () => undefined,
    () => undefined,
  );
}

/**
 * Au démarrage : un choix fait avant #9749, ou perdu par un Android antérieur
 * au 13, rejoint la coque — mais seulement si elle n'a encore aucune langue,
 * pour ne jamais écraser celle posée depuis « Langue de l'app » (#9748).
 * « Automatique » n'envoie rien.
 */
export function syncShellLocaleAtStart(choice: string | null, coque: CoqueNative | undefined = coqueCourante()): Promise<void> {
  return choice === null ? Promise.resolve() : syncShellLocale(choice, { ifUnset: true, coque });
}
