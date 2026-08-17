/**
 * `FocalIdentityHeader` — pastille 22 + `Pseudo · HH:mm` (WF-110, WS-4).
 *
 * Cotes par les tokens `thread.*` (`apps/web/styles/lentille-tokens.css`),
 * jamais en dur (garde R15). « Toi » en indigo (§WS-4 : `MeeshyColors.indigo500`
 * `#6366F1` — repris ici en littéral CSS, cette teinte n'étant PAS un token
 * `--lentille-*` généré ; c'est la même valeur que documente le contrat).
 *
 * N'est rendu QUE par `FocalRow` quand `isFirstInGroup` (densité `focal`) ou
 * TOUJOURS (densité `script`, « densité uniforme ») — la décision appartient
 * à `FocalRow`, ce composant reste une feuille pure.
 *
 * Dot de présence (F01..F15, matrice F03 : « la règle 1/3/5 et "offline = pas
 * de dot" sont inchangées ») — `ParticipantPresenceIndicator` RÉUTILISÉ
 * VERBATIM (WL-102 l'utilise déjà pour la Lentille, MÊME composant, MÊME
 * abonnement `useLiveUserStatus` par userId) : rend `null` hors ligne, donc
 * jamais un dot fabriqué.
 */
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getUserDisplayName } from '@/utils/user-display-name';
import { getMessageInitials } from '@/lib/avatar-utils';
import type { Participant } from '@meeshy/shared/types/participant';
import { ParticipantPresenceIndicator } from '../conversation-item/ParticipantPresenceIndicator';

/** Teinte "Toi" — MeeshyColors.indigo500, §WS-4. */
const YOU_INDIGO_HEX = '#6366F1';

export interface FocalIdentityHeaderProps {
  readonly sender: Participant | undefined;
  readonly isMe: boolean;
  readonly time: string;
  readonly youLabel: string;
}

export function FocalIdentityHeader({ sender, isMe, time, youLabel }: FocalIdentityHeaderProps) {
  const displayName = isMe ? youLabel : getUserDisplayName(sender, youLabel);

  return (
    <div
      className="flex items-center gap-2"
      data-testid="focal-identity-header"
      style={{ paddingBottom: '2px' }}
    >
      <div
        className="relative flex-shrink-0"
        style={{ width: 'var(--lentille-thread-avatar-size)', height: 'var(--lentille-thread-avatar-size)' }}
      >
        <Avatar className="h-full w-full">
          <AvatarImage src={sender?.avatar} />
          <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">
            {getMessageInitials({ sender })}
          </AvatarFallback>
        </Avatar>
        {!isMe && (
          <ParticipantPresenceIndicator
            userId={sender?.userId ?? sender?.id}
            fallbackUser={{ isOnline: sender?.isOnline, lastActiveAt: sender?.lastActiveAt }}
            size="sm"
            className="absolute -bottom-0.5 -right-0.5"
          />
        )}
      </div>

      <span
        className="truncate"
        data-testid="focal-identity-name"
        style={{
          fontSize: 'var(--lentille-thread-name-size)',
          fontWeight: 'var(--lentille-thread-name-weight)',
          color: isMe ? YOU_INDIGO_HEX : undefined,
        }}
      >
        {displayName}
      </span>

      <span
        className="text-muted-foreground flex-shrink-0"
        data-testid="focal-identity-time"
        style={{
          fontSize: 'var(--lentille-thread-time-size)',
          fontWeight: 'var(--lentille-thread-time-weight)',
        }}
      >
        {time}
      </span>
    </div>
  );
}

export default FocalIdentityHeader;
