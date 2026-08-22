import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

import type { MessageTranslationJSON } from '../../../utils/translation-transformer';

/**
 * Cap (in Unicode code points) applied to the last-message preview in the GET
 * /conversations LIST response. The clients only ever render this field as a
 * 1–2 line row preview, yet it was shipped raw — a single long message
 * multiplied across every list refresh inflates payloads and forces the iOS
 * text engine to typeset the full string on every row measurement
 * (CoreText cost is O(total length), `lineLimit` does not bound it).
 * Truncation iterates code points, never splitting a surrogate pair.
 * The full content still flows through GET /conversations/:id/messages.
 *
 * Le plafond ne vaut pas que pour la LISTE REST : il gouverne toute surface
 * d'aperçu de ligne, temps réel compris. Les trois émetteurs de
 * `conversation:updated` (envoi WS, envoi REST/ZMQ, édition/suppression) le
 * respectent en passant par `resolveLastMessagePreviewPrism`
 * (`socketio/utils/lastMessagePreviewPrism.ts`), qui rend l'aperçu de base ET
 * sa carte de traductions plafonnés ensemble. Un nouvel émetteur qui composerait
 * `lastMessagePreview` à la main rouvrirait le défaut : le plafond redeviendrait
 * fonction de la langue du lecteur.
 */
export const LAST_MESSAGE_PREVIEW_MAX_LENGTH = 300;

export function truncateMessagePreview(content: string | null | undefined): string | null | undefined {
  if (content == null || content.length <= LAST_MESSAGE_PREVIEW_MAX_LENGTH) return content;
  let result = '';
  let count = 0;
  for (const char of content) {
    if (count >= LAST_MESSAGE_PREVIEW_MAX_LENGTH) break;
    result += char;
    count += 1;
  }
  return result;
}

/**
 * La carte `{ langue: aperçu traduit }` que la ligne de liste doit porter pour
 * que le Prisme Linguistique s'y applique.
 *
 * Le principe produit dit « le prisme s'applique à TOUT le contenu — messages
 * texte, transcriptions audio, métadonnées, **previews** ». La ligne de liste
 * était la seule surface où il ne s'appliquait pas, et pas faute de client : le
 * SDK iOS porte depuis longtemps `MeeshyConversation.resolvedLastMessagePreview`
 * (ordre de préférence, refus explicite de retomber sur une traduction
 * quelconque) et la facette `LastMessageFacet.translations`. Ces deux surfaces
 * ne recevaient JAMAIS de données : `GET /conversations` ne sélectionnait ni
 * `Message.translations` ni `Message.originalLanguage`. L'aperçu restait donc
 * dans la langue de l'expéditeur pour tout le monde, à chaque démarrage à froid.
 *
 * Quatre exclusions, chacune fermant un cas distinct :
 *
 * 1. **Hors prisme du lecteur** — on ne sert que les langues de
 *    `resolveUserLanguagesOrdered`. Envoyer les N traductions multiplierait le
 *    poids de la liste par le nombre de langues de la conversation pour un champ
 *    dont le client n'affiche qu'UNE valeur.
 * 2. **Langue d'origine** — elle EST déjà `lastMessage.content`. La renvoyer une
 *    seconde fois sous une clé de traduction double l'octet pour rien, et la
 *    règle #3 du Prisme (« si aucune traduction ne matche, afficher l'original »)
 *    la rend inutile au résolveur.
 * 3. **Traduction chiffrée** (`isEncrypted`) — son `text` est un cryptogramme.
 *    Le poser dans un aperçu afficherait du base64 dans la liste ; la clé de
 *    déchiffrement ne transite pas par ce chemin.
 * 4. **`text` non exploitable** — la colonne est un JSON libre côté Mongo ; une
 *    entrée sans texte, vide ou blanche ne décrit aucun aperçu.
 *
 * Rend `null` — jamais `{}` — quand il ne reste rien : le résolveur client doit
 * pouvoir distinguer « pas de traduction utile » et retomber sur l'original.
 */
export function buildLastMessagePreviewTranslations(params: {
  translations: unknown;
  originalLanguage: string | null | undefined;
  viewerLanguages: readonly string[];
}): Record<string, string> | null {
  const { translations, originalLanguage, viewerLanguages } = params;

  if (!translations || typeof translations !== 'object' || Array.isArray(translations)) return null;
  if (viewerLanguages.length === 0) return null;

  // Les trois sources de codes comparées ici — langue d'origine, langues du
  // lecteur, clés de la carte — sont canonicalisées par la même SSOT
  // (`normalizeLanguageForDedup` : casse repliée, région strippée ET réduction
  // 3-lettres/legacy), jamais un `.toLowerCase()` brut. `viewerLanguages` sort
  // déjà région-strippé de `resolveUserLanguagesOrdered`, mais `originalLanguage`
  // et les CLÉS de `Message.translations` arrivent brutes du fil : un message
  // écrit avant la canonicalisation au write-boundary porte encore `'en-US'` /
  // `'fr-FR'` / `'fra'`. Comparées en minuscules seules, ces clés région-taguées
  // ne matchaient jamais le rang normalisé du prisme — la traduction était
  // DROPPÉE ici, avant même le résolveur client (`resolveLastMessagePreview`),
  // et le lecteur retombait sur l'original : violation directe du Prisme (#3).
  // Canonicaliser au point de comparaison rend le pré-filtre robuste quelle que
  // soit la normalisation de l'appelant, et idempotent sur les codes déjà
  // canoniques (zéro régression). Jumeau exact du résolveur client.
  const original = originalLanguage ? normalizeLanguageForDedup(originalLanguage) : null;
  const entries = Object.entries(translations as Record<string, unknown>);

  const out: Record<string, string> = {};
  for (const wanted of viewerLanguages) {
    const target = normalizeLanguageForDedup(wanted);
    if (target === original) continue;

    const match = entries.find(([lang]) => normalizeLanguageForDedup(lang) === target);
    if (!match) continue;

    const data = match[1] as Partial<MessageTranslationJSON> | null | undefined;
    if (!data || typeof data !== 'object') continue;
    if (data.isEncrypted === true) continue;
    if (typeof data.text !== 'string' || data.text.trim() === '') continue;

    out[target] = truncateMessagePreview(data.text) as string;
  }

  return Object.keys(out).length > 0 ? out : null;
}
