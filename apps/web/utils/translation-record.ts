/**
 * Dépouille la carte des traductions d'un message en `Record<langue → texte>`,
 * la forme qu'attend `resolvePrismTranslation`.
 *
 * L'IMPLÉMENTATION A DÉMÉNAGÉ dans `@meeshy/shared/utils/conversation-helpers`,
 * à côté du résolveur qu'elle sert. Ce fichier n'est plus qu'une ADRESSE : ses
 * deux consommateurs (`messages-display.tsx`, `use-message-display.ts`) gardent
 * la leur, et `apps/web-v3` — la seconde application qui lit des messages —
 * appelle la même fonction plutôt que d'en recopier une.
 *
 * La mention d'origine disait « SSOT UNIQUE de cet adaptateur CÔTÉ WEB ». Elle
 * était juste tant qu'une seule application lisait des messages ; elle a cessé
 * de l'être le jour où la v3 a servi un fil.
 */
export { buildTranslationRecord } from '@meeshy/shared/utils/conversation-helpers';
