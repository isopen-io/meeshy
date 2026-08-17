/**
 * `LentilleBridgeLine` — le pont ✦, deux étages (WL-102, LWS-10 / §3.2).
 *
 * Étage `fallback` (déterministe) : `bridge.data` est composé par l'i18n du
 * CLIENT (`formatBridge`, LWS-1) — jamais traduit côté serveur, donc jamais
 * figé dans une langue (E7). Les clés utilisées (`lentille.bridge.*`) sont
 * RE-PROUVÉES au chemin `apps/web/locales/{locale}/conversations.json` →
 * `conversations.lentille.bridge.*` (déjà posées, S-005).
 *
 * Étage `agent` : une vraie phrase, résolue par `resolveLastMessagePreview`
 * — la MÊME loi que le préview du dernier message — sur `bridge.text` +
 * `bridge.translations` + `bridge.originalLanguage`. Aucune seconde loi de
 * langue (E7, conséquence 2).
 *
 * `bridge.isComplete === false` (fenêtre partielle, ex. `LocalBridgeProvider`
 * borné au cache) ⇒ mention de partialité, jamais un chiffre extrapolé.
 *
 * Contraste : couleur résolue par `resolveBridgeTintColor` (`lentille-
 * contrast.ts`) — garantit ≥ 4,5:1 dans les deux thèmes (critère LWS-10),
 * là où `color-mix(accent 80 %, texte)` seul ne le garantit pas pour toute
 * la palette (voir l'en-tête de `lentille-contrast.ts`).
 */
'use client';

import { useMemo } from 'react';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { formatBridge, type BridgeTranslate } from '@meeshy/shared/utils/conversation-bridge';
import { resolveLastMessagePreview } from '@meeshy/shared/utils/conversation-helpers';
import { useI18n } from '@/hooks/use-i18n';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { resolveBridgeTintColor } from './lentille-contrast';

export interface LentilleBridgeLineProps {
  bridge: ConversationBridge;
  /** Accent de la conversation (`conversation-colors.ts`, LWS-2), hex `#RRGGBB`. */
  accentHex: string;
  preferredLanguages: readonly string[];
  /**
   * Le pont porte-t-il sa teinte d'accent ? Maquette §1, table « État du
   * rang » : « **Sourdine** — Rang à 55 % d'opacité, **pont grisé** » — et son
   * rendu, qui n'entoure le texte de `<span class="pont">` (la teinte) que
   * `!c.muted`, contre un `✦ ${pont}` NU en sourdine. `false` ⇒ aucune couleur
   * n'est écrite : le pont HÉRITE de la ligne 2 (texte primaire d'un rang non
   * lu), donc il ne perd pas en lisibilité — c'est le contraste de la ligne 2,
   * déjà conforme, qui s'applique. Défaut `true` : un appelant qui ne sait
   * rien de la sourdine garde le pont teinté.
   */
  tinted?: boolean;
}

/** Marqueur visuel du pont — reprend le glyphe du contrat (§3.2, §5.2). */
const BRIDGE_GLYPH = '✦';

/**
 * V4ter/B1 — EXPORTÉE (elle ne l'était pas) : `LentilleRow` la réutilise
 * TELLE QUELLE pour composer le libellé aria du pont (mensonge #3 du verdict
 * REV-4bis — l'aria-label rendait `lastMessage.content` alors que la ligne 2
 * visible rendait `LentilleBridgeLine`). Une seule résolution, deux
 * consommateurs (le rendu ci-dessous, l'aria de `LentilleRow`) — jamais deux
 * chemins parallèles.
 */
export function resolveBridgePhrase(
  bridge: ConversationBridge,
  t: BridgeTranslate,
  preferredLanguages: readonly string[]
): string {
  if (bridge.kind === 'fallback' && bridge.data) {
    return formatBridge(bridge.data, t);
  }

  if (bridge.kind === 'agent' && bridge.text) {
    return (
      resolveLastMessagePreview({
        preview: bridge.text,
        translations: bridge.translations,
        originalLanguage: bridge.originalLanguage,
        preferredLanguages,
      }) ?? bridge.text
    );
  }

  return '';
}

/**
 * V4ter/B1 — extraite de l'ancien calcul inline du composant (même règle :
 * mention de partialité seulement si `isComplete === false`), EXPORTÉE pour
 * que `LentilleRow` compose le MÊME suffixe dans son aria-label.
 */
export function resolveBridgePartialSuffix(bridge: ConversationBridge, t: BridgeTranslate): string | null {
  if (bridge.isComplete !== false) return null;
  const count = bridge.data?.messageCount ?? bridge.unreadCount;
  return t('lentille.bridge.partial', { count });
}

/**
 * V4ter/B1 — forme TEXTE complète de ce que `LentilleBridgeLine` affiche
 * (phrase + suffixe de partialité), glyphe ✦ excepté : celui-ci est déjà
 * `aria-hidden` dans le rendu visuel, donc absent de toute lecture d'écran —
 * l'omettre ici n'est pas un raccourci, c'est la fidélité au VRAI rendu.
 * Consommée par `LentilleRow` pour l'aria-label du rang (mensonge #3, verdict
 * REV-4bis : « quand `hasBridge`, la ligne 2 rend `LentilleBridgeLine` mais
 * l'aria-label rend `lastMessage.content` »).
 */
export function resolveLentilleBridgeAriaText(
  bridge: ConversationBridge,
  t: BridgeTranslate,
  preferredLanguages: readonly string[]
): string {
  const phrase = resolveBridgePhrase(bridge, t, preferredLanguages);
  if (!phrase) return '';
  const partial = resolveBridgePartialSuffix(bridge, t);
  return partial ? `${phrase} · ${partial}` : phrase;
}

export function LentilleBridgeLine({
  bridge,
  accentHex,
  preferredLanguages,
  tinted = true,
}: LentilleBridgeLineProps) {
  const { t } = useI18n('conversations');
  const theme = useResolvedTheme();

  const color = useMemo(
    () => (tinted ? resolveBridgeTintColor(accentHex, theme) : undefined),
    [accentHex, theme, tinted]
  );

  const phrase = useMemo(
    () => resolveBridgePhrase(bridge, t as BridgeTranslate, preferredLanguages),
    [bridge, t, preferredLanguages]
  );

  const partialSuffix = useMemo(
    () => resolveBridgePartialSuffix(bridge, t as BridgeTranslate),
    [bridge, t]
  );

  if (!phrase) return null;

  return (
    <span data-testid="lentille-bridge-line" style={{ color }} className="truncate">
      <span aria-hidden="true">{BRIDGE_GLYPH} </span>
      {phrase}
      {partialSuffix ? <span className="opacity-70"> · {partialSuffix}</span> : null}
    </span>
  );
}

export default LentilleBridgeLine;
