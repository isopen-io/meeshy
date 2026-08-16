/**
 * `FocalQuotedReply` — citation filet 2.5 (WF-110/WF-112, contrat Focal
 * §WS-3 / §3.11 `quote.borderSize`, lentille-implementation-contract §4.3 :
 * « filet 2.5 pt couleur de l'auteur cité »).
 *
 * NUE (pas de bulle, pas de fond de bulle) — juste une bordure gauche à la
 * couleur de l'auteur cité (`resolveFocalAuthorAccent`, `focal-row-utils.ts`)
 * et une ligne tronquée. Le retrait 29 lui-même est porté par la colonne de
 * contenu PARENTE (`FocalRow`, `paddingLeft: var(--lentille-thread-line2-
 * indent)`) — ce composant ne le RÉ-APPLIQUE PAS, sans quoi la citation
 * hériterait de deux retraits cumulés. Le texte cité passe par
 * `resolveFocalMessageText` — même Prisme que le reste du fil (F06 : « la
 * résolution Prisme reste inchangée »).
 *
 * Contraste AA (WF-112) : `resolveFocalAuthorAccent` (39 couleurs vibrantes
 * possibles, `conversation-colors.ts`) ne garantit RIEN seul — MÊME
 * diagnostic que l'en-tête de `lentille-contrast.ts` (WL-102) pour le pont
 * ✦. Le nom de l'auteur cité, du TEXTE, passe donc par
 * `resolveBridgeTintColor` (RÉUTILISÉ VERBATIM, pas réimplémenté) pour
 * garantir ≥ 4,5:1 contre le fond du thème. Le FILET (bordure gauche, non
 * textuel) garde l'accent BRUT — la couleur d'identité que le contrat
 * demande explicitement (« filet couleur de l'auteur cité »), un filet de
 * 2,5 px n'étant pas du texte au sens de WCAG 1.4.3.
 */
'use client';

import { cn } from '@/lib/utils';
import { getUserDisplayName } from '@/utils/user-display-name';
import type { Message } from '@meeshy/shared/types';
import { useResolvedTheme } from '@/hooks/use-resolved-theme';
import { resolveFocalAuthorAccent, resolveFocalMessageText } from './focal-row-utils';
import { resolveBridgeTintColor } from '../lentille/lentille-contrast';

export interface FocalQuotedReplyProps {
  readonly quoted: Message;
  readonly preferredLanguages: readonly string[];
  readonly onJumpToMessage?: (messageId: string) => void;
}

export function FocalQuotedReply({ quoted, preferredLanguages, onJumpToMessage }: FocalQuotedReplyProps) {
  const theme = useResolvedTheme();
  const authorName = getUserDisplayName(quoted.sender, '');
  const accent = resolveFocalAuthorAccent(authorName || quoted.senderId);
  const textColor = resolveBridgeTintColor(accent, theme);
  const text = resolveFocalMessageText(quoted, preferredLanguages) ?? quoted.content;

  return (
    <button
      type="button"
      data-testid="focal-quoted-reply"
      onClick={() => onJumpToMessage?.(quoted.id)}
      className={cn(
        'block w-full text-left truncate mb-1 pl-2 text-muted-foreground',
        'bg-transparent border-0 cursor-pointer'
      )}
      style={{
        borderLeft: `var(--lentille-thread-quote-border-size) solid ${accent}`,
      }}
    >
      <span className="font-medium mr-1" style={{ color: textColor }}>
        {authorName}
      </span>
      {text}
    </button>
  );
}

export default FocalQuotedReply;
