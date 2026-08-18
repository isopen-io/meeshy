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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FIDÉLITÉ À LA MAQUETTE — 2026-08-17
 * `docs/design/2026-08-15-focal-spec-integration.html`
 * ═══════════════════════════════════════════════════════════════════════════
 * 1. L'AUTEUR EST CLIQUABLE. La maquette pose l'identité en tête de rangée
 *    (`.fident` : pastille + nom + point médian + heure) et la spec iOS
 *    correspondante fait de l'en-tête un `Button(.plain)` `onOpenProfile`
 *    (`FocalRow.swift` : « `FocalIdentityHeader` (profil) est un
 *    `Button(.plain)` »). Le fil web ne l'était PAS : ni la pastille ni le
 *    nom n'ouvraient quoi que ce soit.
 *
 *    DIRECTIVE PRODUIT DU 2026-08-17 (suite à ce lot) : « l'auteur d'un
 *    message doit être clickable pour afficher son profil EN MODALE ».
 *    `UserProfileModal` (`components/profile/UserProfileModal.tsx`) existe
 *    désormais — le lien `/u/{username}` ci-dessous reste un VRAI `<Link>`
 *    (href réel, atteignable au clavier, clic droit "ouvrir dans un nouvel
 *    onglet" natif), mais son clic GAUCHE SIMPLE est intercepté
 *    (`isPlainLeftClick`, `lib/profile-link-click.ts`) pour ouvrir la modale
 *    via `onOpenProfile` plutôt que de naviguer — l'accès à la page complète
 *    reste au bout du lien « Voir le profil complet » DANS la modale, jamais
 *    perdu. Un clic modifié (⌘/Ctrl/Maj/molette) traverse intact vers le
 *    navigateur. `onOpenProfile` non fourni (appelant qui ne monte pas la
 *    modale) ⇒ comportement de lien inchangé, navigation directe.
 *
 *    Sans `username` (participant anonyme, expéditeur non résolu), l'identité
 *    reste un simple texte : un lien vers `/u/undefined` serait un bouton
 *    menteur.
 *
 * 2. LES ACCUSÉS ✓/✓✓ VIVENT DANS L'IDENTITÉ. Maquette, ligne de rendu de la
 *    rangée : `<div class="fident">… ${me ? '<span class="chk">✓✓</span>' :
 *    ''}</div>`, et §5 de la spec : « Accusés ✓/✓✓/lu … Déplacés dans
 *    l'identité des messages "Toi" ». `DeliveryIndicator` (bubble-message)
 *    est RÉUTILISÉ tel quel — y compris sa règle de réciprocité
 *    `showReadReceipts`, jamais réécrite.
 */
'use client';

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Ghost } from 'lucide-react';
import { getUserDisplayName } from '@/utils/user-display-name';
import { getMessageInitials } from '@/lib/avatar-utils';
import type { Participant } from '@meeshy/shared/types/participant';
import { isAnonymousSender } from '@meeshy/shared/utils/sender-identity';
import { DeliveryIndicator } from '@/components/common/bubble-message/DeliveryIndicator';
import { ParticipantPresenceIndicator } from '../conversation-item/ParticipantPresenceIndicator';
import { isPlainLeftClick } from '@/lib/profile-link-click';

/** Teinte "Toi" — MeeshyColors.indigo500, §WS-4. */
const YOU_INDIGO_HEX = '#6366F1';

export interface FocalIdentityHeaderProps {
  readonly sender: Participant | undefined;
  readonly isMe: boolean;
  readonly time: string;
  readonly youLabel: string;
  /** Accusés dans l'identité (maquette `.fident .chk`) — servis seulement pour « Toi ». */
  readonly messageId?: string;
  readonly conversationId?: string;
  /**
   * Libellé accessible du lien de profil, déjà traduit par l'appelant
   * (« Voir le profil de {nom} ») — la feuille ne consulte aucun i18n.
   */
  readonly openProfileLabel?: string;
  /**
   * Ouvre `UserProfileModal` pour ce `username` — remonté par `FocalThread`
   * (l'état d'ouverture vit LÀ, un seul par fil, jamais une modale montée par
   * rangée). Non fourni ⇒ le lien garde son comportement de navigation
   * directe (repli honnête, jamais un clic mort).
   */
  readonly onOpenProfile?: (username: string) => void;
}

export function FocalIdentityHeader({
  sender,
  isMe,
  time,
  youLabel,
  messageId,
  conversationId,
  openProfileLabel,
  onOpenProfile,
}: FocalIdentityHeaderProps) {
  const displayName = isMe ? youLabel : getUserDisplayName(sender, youLabel);
  /**
   * Le handle qui fait l'URL de profil. `Participant` le porte SOUS `user`
   * (`ParticipantUserSchema.username`, `packages/shared/types/participant.ts`)
   * — la vue Bulles, elle, lit `sender.username` à plat parce que son type
   * `MessageSender` est plus lâche. Les deux formes circulent sur le fil
   * selon l'origine de la charge (REST vs socket) : on lit la forme TYPÉE
   * d'abord, la forme plate en repli, et l'absence des deux laisse
   * l'identité en simple texte plutôt qu'en lien vers `/u/undefined`.
   */
  const username =
    sender?.user?.username ?? (sender as { username?: string } | undefined)?.username;

  /**
   * Un auteur SANS COMPTE se marque d'un fantôme et n'a pas de page `/u/`.
   * La vue plate était la seule des trois surfaces d'identité à ne rien dire du
   * tout : Bulles et Citation portaient au moins la branche, éteinte par un
   * littéral. Le discriminant est `Participant.type` (`isAnonymousSender`),
   * jamais le pseudo — un COMPTE nommé `ano_bob` garde son lien et son absence
   * de fantôme.
   */
  const isAnonymous = isAnonymousSender(sender as Record<string, unknown> | null | undefined);
  // `profileUsername` porte le NARROWING : garder `username` dans le ternaire du
  // rendu laisserait `onOpenProfile(username)` sur un `string | undefined`.
  const profileUsername = !isAnonymous && username ? username : null;

  const avatarNode = (
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
  );

  const ghostNode = isAnonymous ? (
    <Ghost
      data-testid="focal-identity-ghost"
      className="h-3 w-3 flex-shrink-0 text-purple-600 dark:text-purple-400"
      aria-hidden="true"
    />
  ) : null;

  const nameNode = (
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
  );

  return (
    <div
      className="flex items-center gap-2"
      data-testid="focal-identity-header"
      style={{ paddingBottom: '2px' }}
    >
      {profileUsername ? (
        <Link
          href={`/u/${profileUsername}`}
          data-testid="focal-identity-profile-link"
          aria-label={openProfileLabel ?? displayName}
          // Le fil porte ses propres gestes de rangée (saut de citation,
          // futur menu contextuel) : le lien de profil ne doit pas les
          // déclencher au passage. MÊME `stopPropagation` que
          // `conversation-participants.tsx:198` et `MessageNameDate.tsx:47`.
          //
          // DIRECTIVE PRODUIT 2026-08-17 — clic gauche simple ⇒ modale
          // (`onOpenProfile`, `preventDefault` sur LA NAVIGATION seulement) ;
          // clic modifié (⌘/Ctrl/Maj/molette) ⇒ comportement natif du lien
          // intact (nouvel onglet). `isPlainLeftClick`, loi PARTAGÉE avec
          // `AvatarAffordance` (rang Lentille) — jamais deux implémentations.
          onClick={(event) => {
            event.stopPropagation();
            if (onOpenProfile && isPlainLeftClick(event)) {
              event.preventDefault();
              onOpenProfile(profileUsername);
            }
          }}
          className="flex min-w-0 items-center gap-2 hover:opacity-80 transition-opacity"
        >
          {avatarNode}
          {nameNode}
        </Link>
      ) : (
        <>
          {avatarNode}
          {ghostNode}
          {nameNode}
        </>
      )}

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

      {isMe && messageId && conversationId && (
        <span data-testid="focal-delivery" className="flex-shrink-0">
          <DeliveryIndicator
            isOwnMessage
            messageId={messageId}
            conversationId={conversationId}
          />
        </span>
      )}
    </div>
  );
}

export default FocalIdentityHeader;
