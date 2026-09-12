/**
 * LE CATALOGUE DE TRADUCTION D'INTERFACE (#6206) — première pierre du socle :
 * `web-v2` ne portait jusqu'ici AUCUN fichier de clés par langue, et chaque
 * chaîne utilisateur nouvelle creusait la dette (dimension 9, sept langues).
 *
 * Un seul export, `translate(language, key)` : jamais de traduction composée
 * par concaténation libre au site d'appel — le motif que `typing-roster.ts`
 * (#6171) évite déjà pour la même raison, en attendant ce catalogue.
 *
 * `fr` et `en` sont catalogués aujourd'hui ; les cinq langues restantes de la
 * cible CLAUDE.md restent une dette EXPLICITE (voir l'issue) plutôt qu'une
 * dette silencieuse — `translate()` ne peut pas résoudre vers une langue non
 * cataloguée : `currentInterfaceLanguage()` s'arrête à `SUPPORTED_INTERFACE_LANGUAGES`.
 */
import type { InterfaceLanguage } from './interface-language';

export type InterfaceCatalogKey =
  | 'announce.messageSent'
  | 'announce.messageCopied'
  | 'announce.messagesCopied';

type Catalog = Readonly<Record<InterfaceCatalogKey, string>>;

const fr: Catalog = {
  'announce.messageSent': 'Message envoyé',
  'announce.messageCopied': 'Message copié',
  'announce.messagesCopied': 'Messages copiés',
};

const en: Catalog = {
  'announce.messageSent': 'Message sent',
  'announce.messageCopied': 'Message copied',
  'announce.messagesCopied': 'Messages copied',
};

const CATALOGS: Readonly<Record<InterfaceLanguage, Catalog>> = { fr, en };

/** Résout une clé du catalogue dans la langue donnée — jamais de repli
 * silencieux vers `fr` : `language` vient de {@link currentInterfaceLanguage}
 * (`interface-language.ts`), qui garantit déjà une langue cataloguée. */
export function translate(language: InterfaceLanguage, key: InterfaceCatalogKey): string {
  return CATALOGS[language][key];
}
