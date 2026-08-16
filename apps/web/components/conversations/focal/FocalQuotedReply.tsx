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
 * FocalRow en dépend dès WF-110 (une rangée avec `replyTo` doit pouvoir se
 * rendre) — la garantie de contraste AA du texte (§WF-112/WF-113) arrive
 * dans un commit ultérieur sur ce même fichier.
 */
'use client';

import { cn } from '@/lib/utils';
import { getUserDisplayName } from '@/utils/user-display-name';
import type { Message } from '@meeshy/shared/types';
import { resolveFocalAuthorAccent, resolveFocalMessageText } from './focal-row-utils';

export interface FocalQuotedReplyProps {
  readonly quoted: Message;
  readonly preferredLanguages: readonly string[];
  readonly onJumpToMessage?: (messageId: string) => void;
}

export function FocalQuotedReply({ quoted, preferredLanguages, onJumpToMessage }: FocalQuotedReplyProps) {
  const authorName = getUserDisplayName(quoted.sender, '');
  const accent = resolveFocalAuthorAccent(authorName || quoted.senderId);
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
      <span className="font-medium mr-1" style={{ color: accent }}>
        {authorName}
      </span>
      {text}
    </button>
  );
}

export default FocalQuotedReply;
