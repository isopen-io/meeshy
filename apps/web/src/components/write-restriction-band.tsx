import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { WriteRestriction } from '@/lib/write-restriction';

/**
 * **LE BANDEAU QUI REMPLACE LE COMPOSEUR** (#9928, #11216) — Meeshy Global
 * fermée en écriture aux 13-17 ans, ou conversation chiffrée de bout en bout
 * que le web ne sait pas encore chiffrer : aucun champ de saisie, une phrase
 * sobre qui dit pourquoi. Pas d'alerte : c'est l'état du fil, pas un incident
 * (`role="note"`), lu à son tour par un lecteur d'écran. La coque Android
 * EST l'app Meeshy : elle renvoie vers un des appareils chiffrés, comme son
 * écran « Mes appareils chiffrés », jamais vers elle-même (#13066).
 */
const KEY = {
  'minor-global': 'composer.writeRestriction.minorGlobal',
  'end-to-end-encrypted': 'composer.writeRestriction.endToEnd',
} as const satisfies Record<WriteRestriction, string>;

const SHELL_KEY = {
  ...KEY,
  'end-to-end-encrypted': 'composer.writeRestriction.endToEnd.shell',
} as const satisfies Record<WriteRestriction, string>;

export function WriteRestrictionBand({
  restriction,
  language,
  shell = __SHELL__,
}: {
  readonly restriction: WriteRestriction;
  readonly language: InterfaceLanguage;
  readonly shell?: boolean;
}) {
  return (
    <p
      role="note"
      data-write-restriction={restriction}
      className="text-meta m-0 px-4 py-3 text-center"
      style={{ color: 'var(--color-ios-ink-2)', minHeight: 44 }}
    >
      {translate(language, (shell ? SHELL_KEY : KEY)[restriction])}
    </p>
  );
}
