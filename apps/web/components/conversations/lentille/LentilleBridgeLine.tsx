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
}

/** Marqueur visuel du pont — reprend le glyphe du contrat (§3.2, §5.2). */
const BRIDGE_GLYPH = '✦';

function resolveBridgePhrase(
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

export function LentilleBridgeLine({ bridge, accentHex, preferredLanguages }: LentilleBridgeLineProps) {
  const { t } = useI18n('conversations');
  const theme = useResolvedTheme();

  const color = useMemo(() => resolveBridgeTintColor(accentHex, theme), [accentHex, theme]);

  const phrase = useMemo(
    () => resolveBridgePhrase(bridge, t as BridgeTranslate, preferredLanguages),
    [bridge, t, preferredLanguages]
  );

  const partialSuffix = useMemo(() => {
    if (bridge.isComplete !== false) return null;
    const count = bridge.data?.messageCount ?? bridge.unreadCount;
    return t('lentille.bridge.partial', { count });
  }, [bridge.isComplete, bridge.data?.messageCount, bridge.unreadCount, t]);

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
