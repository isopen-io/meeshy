/**
 * `LentilleRow` — le rang plat de la Lentille (WL-102, LWS-10).
 *
 * Cotes par les tokens CSS/vars (M-049, `apps/web/styles/lentille-tokens.css`,
 * importées depuis `app/globals.css` par ce même commit) — JAMAIS en dur
 * (garde R15 web).
 *
 * Ligne 2 — précédence typing > brouillon > pont > préview (contrat LWS-10,
 * inchangée depuis LWS-7 iOS) :
 *   1. typing (abonnement WL-101, `useLentilleListTyping`) — dot forcé vert.
 *   2. brouillon local (`draftMessages`, `conversation-ui-store.ts`).
 *   3. pont ✦ (`LentilleBridgeLine`) si non-lu et un pont existe.
 *   4. préview du dernier message — EXACTEMENT le chemin de `ConversationItem`
 *      (`formatLastMessage` → `resolveLastMessagePreview`), dont le test de
 *      câblage Prisme (`ConversationItem.prisme.test.tsx`) reste vert : ce
 *      fichier n'y touche pas, il réutilise la même fonction.
 *
 * Badge rouge `variant="destructive"` (`ConversationItem.tsx:321`) SUPPRIMÉ →
 * point accent 8 px (`--lentille-list-unread-dot-size`) + pont ✦.
 *
 * Dot de présence par `ParticipantPresenceIndicator` RÉUTILISÉ VERBATIM — un
 * indicateur par participant retenu par `resolveLentillePresenceEntries`
 * (1 en `direct`, N hors self ailleurs), superposés au même point d'ancrage :
 * chacun rend `null` hors ligne, donc le dot n'apparaît que « si quelqu'un
 * est actif », jamais un agrégat fabriqué. Le typing FORCE un dot vert
 * indépendant (l'écriture EST une preuve d'activité, contrat LWS-10).
 *
 * Aria-label (behaviour-matrix:L16, V4ter/B1) — « {nom}, {heure}, {n non
 * lus}, {pont ou préview} », la dernière part construite à partir de la
 * MÊME résolution que la ligne 2 VISIBLE (une seule fonction, deux
 * consommateurs — jamais deux chemins parallèles) : voir `lastMessagePreview`/
 * `lastMessagePreviewText`/`resolveLentilleBridgeAriaText` ci-dessous. Les
 * non-lus ne sont mentionnés QUE si `> 0` (précédent iOS,
 * `ThemedConversationRow.swift:290-291`).
 */
'use client';

import { memo, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';
import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { conversationAccentPalette } from '@meeshy/shared/utils/conversation-colors';
import { ParticipantPresenceIndicator } from '../conversation-item/ParticipantPresenceIndicator';
import {
  getConversationAvatar,
  getConversationAvatarUrl,
  getConversationCreatedDate,
  getConversationIcon,
  getConversationNameOnly,
  getMessageSenderName,
} from '../conversation-item/conversation-utils';
import { formatLastMessage } from '../conversation-item/message-formatting';
import { formatConversationDate } from '@/utils/date-format';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import { resolveLentillePresenceEntries, resolveOtherDirectParticipantUser } from './lentille-row-utils';
import { LentilleBridgeLine, resolveLentilleBridgeAriaText } from './LentilleBridgeLine';
import type { BridgeTranslate } from '@meeshy/shared/utils/conversation-bridge';
import { LentillePeek } from './LentillePeek';
import { useConversationPreference } from '@/stores/conversation-preferences-store';
import type { LentilleTypingUser } from '@/hooks/lentille/use-lentille-list-typing';
import { useIsFocusedRow, type LentilleFocusElection } from '@/hooks/lentille/lentille-focus-election';

export interface LentilleRowDraft {
  readonly content: string;
}

export type LentilleRowTranslate = (key: string, paramsOrFallback?: Record<string, unknown> | string) => string;

export interface LentilleRowProps {
  readonly conversation: Conversation;
  readonly currentUser: User;
  readonly isSelected: boolean;
  /**
   * REV-4/R4-6 — rappel STABLE + donnée, jamais une fermeture littérale.
   *
   * Le parent passait `onClick={() => onSelectConversation(conversation)}` :
   * une fonction neuve à chaque rendu, donc une prop toujours différente, donc
   * un `memo` qui ne refusait jamais rien — vingt rangs re-rendus à chaque
   * frappe typing d'un seul. Le rang reçoit désormais le MÊME rappel que tous
   * ses voisins (mémoïsé une fois chez `ConversationList`) et referme lui-même
   * sur SA conversation. C'est le patron déjà en place pour les autres rangées
   * mémoïsées du dépôt (`ConversationGroup` : `onToggleSection` + `sectionId`).
   */
  readonly onSelect: (conversation: Conversation) => void;
  readonly typingUsers?: readonly LentilleTypingUser[];
  readonly draft?: LentilleRowDraft;
  readonly bridge?: ConversationBridge | null;
  readonly t: LentilleRowTranslate;
  /**
   * Ref-setter du WRAPPER interne (WL-104, `useLentillePerspective`) — reçoit
   * `opacity`/`transform` à chaque frame de la passe de perspective, JAMAIS
   * la racine `role="button"` (qui porte la géométrie du rang : hauteur,
   * marges, padding — invariant « ne touche pas le layout »). Optionnel :
   * une `LentilleRow` rendue hors de la liste (test, aperçu) reste stable
   * sans perspective.
   */
  readonly perspectiveRef?: (el: HTMLDivElement | null) => void;
  /**
   * Magasin de l'élu (WL-108, `useLentillePerspective`). Le rang s'y abonne
   * pour SON booléen — pas pour l'identifiant élu : c'est ce qui évite de
   * re-rendre vingt rangs à chaque rang franchi (voir la docstring de
   * `lentille-focus-election.ts`). Optionnel : un rang rendu hors de la liste
   * (test, aperçu) n'a pas d'élection et ne porte donc pas de carte.
   */
  readonly election?: LentilleFocusElection;
  /**
   * REV-4/B3 — « réglages », l'une des six actions historiques du ⋮, remontée
   * à l'appelant comme le fait `ConversationItem`. Transmise telle quelle à
   * `LentillePeek`, qui monte la section d'actions du rang historique.
   */
  readonly onShowDetails?: (conversation: Conversation) => void;
}

/** Sélection déterministe du typeur affiché (L01) : ordre alphabétique du nom, pas l'ordre d'arrivée socket. */
function pickDeterministicTypingUser(
  typingUsers: readonly LentilleTypingUser[]
): LentilleTypingUser | null {
  if (typingUsers.length === 0) return null;
  return [...typingUsers].sort((a, b) => a.displayName.localeCompare(b.displayName))[0];
}

/**
 * V4ter/B1 — behaviour-matrix:L16, mensonge #1 du verdict REV-4bis.
 *
 * L'ancien aria-label émettait le nombre nu (`${unreadCount}`), MÊME à 0 —
 * iOS (`ThemedConversationRow.swift:290-291`) n'annonce les non-lus que si
 * `> 0`, via une clé localisée pluralisée (`accessibility.unread_count`).
 * Même règle ici : `null` (aucune mention) à 0, sinon une clé `One`/`Other`
 * — patron déjà en place pour `lentille.bridge.messagesOne/Other`
 * (`conversation-bridge.ts`).
 */
const UNREAD_ARIA_ONE_KEY = 'lentille.a11y.unreadOne';
const UNREAD_ARIA_OTHER_KEY = 'lentille.a11y.unreadOther';

function resolveUnreadAriaSegment(unreadCount: number, t: LentilleRowTranslate): string | null {
  if (unreadCount <= 0) return null;
  const key = unreadCount === 1 ? UNREAD_ARIA_ONE_KEY : UNREAD_ARIA_OTHER_KEY;
  return t(key, { count: unreadCount });
}

export const LentilleRow = memo(function LentilleRow({
  conversation,
  currentUser,
  isSelected,
  onSelect,
  typingUsers = [],
  draft,
  bridge,
  t,
  perspectiveRef,
  election,
  onShowDetails,
}: LentilleRowProps) {
  // behaviour-matrix:L11 — « la sélection … devient le style de la focus card
  // persistant sur le rang sélectionné » : la carte suit l'ÉLECTION pendant
  // le défilement ET reste sur le rang ouvert. Deux sources, un seul style.
  const isElected = useIsFocusedRow(election, conversation.id);

  /**
   * V4bis/R4-1 — behaviour-matrix:L07 (part VISUELLE, trou REV-4/R4-1 comblé).
   *
   * REV-4 avait laissé la part actions du L07 couverte (B3, six actions du
   * ⋮) mais sa part visuelle absente : « l'épingle ajoute un glyphe 📌 avant
   * le nom … et la sourdine passe enfin visible (rang à 0.55 + 🔕) ».
   * MÊME magasin que `LentillePeek`/`useConversationItemActions`
   * (`useConversationPreference`, `conversation-preferences-store.ts`) —
   * aucune seconde source de vérité pour pin/mute, pas de prop à faire
   * traverser `LentilleConversationListMount` (celui-ci ne connaît déjà pas
   * ces booléens, voir `LentillePeek.tsx:174` : même repli qu'ici, `false`
   * quand le magasin n'a pas encore la ligne).
   */
  const rowPreference = useConversationPreference(conversation.id);
  const isPinned = rowPreference?.isPinned ?? false;
  const isMuted = rowPreference?.isMuted ?? false;
  const handleClick = useCallback(() => onSelect(conversation), [onSelect, conversation]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onSelect(conversation);
      }
    },
    [onSelect, conversation]
  );
  const showsFocusCard = isElected || isSelected;
  const preferredLanguages = useMemo(
    () => getUserLanguagePreferences(currentUser),
    [
      currentUser?.systemLanguage,
      currentUser?.regionalLanguage,
      currentUser?.customDestinationLanguage,
      (currentUser as { deviceLocale?: string } | undefined)?.deviceLocale,
    ]
  );

  const otherParticipantUser = useMemo(
    () => resolveOtherDirectParticipantUser(conversation, currentUser?.id),
    [conversation, currentUser?.id]
  );

  const conversationName = getConversationNameOnly(conversation, () => otherParticipantUser);
  const avatarUrl = getConversationAvatarUrl(conversation, () => otherParticipantUser);
  const createdDate = getConversationCreatedDate(conversation, t as (key: string) => string);
  const initials = getConversationAvatar(conversationName, createdDate);
  const icon = getConversationIcon(conversation);

  // E3 (LWS-2) — anneau `--row-accent` : `language`/`theme` par défaut
  // (aucun des deux n'est un champ de `Conversation` côté web — re-prouvé,
  // voir `conversation-colors.ts`), exactement le repli que le miroir Swift
  // applique quand le payload ne les porte pas non plus.
  const accent = useMemo(
    () => conversationAccentPalette({ name: conversationName, type: conversation.type }).accent,
    [conversationName, conversation.type]
  );

  const presenceEntries = useMemo(
    () => resolveLentillePresenceEntries(conversation, currentUser?.id),
    [conversation, currentUser?.id]
  );

  const unreadCount = conversation.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  const typingUser = pickDeterministicTypingUser(typingUsers);
  const isTyping = typingUser !== null;
  const hasDraft = !isTyping && !!draft && draft.content.trim() !== '';
  const hasBridge = !isTyping && !hasDraft && hasUnread && !!bridge;

  const getSenderName = (message: unknown): string | null => {
    if (!message) return null;
    return getMessageSenderName(message) ?? null;
  };

  /**
   * V4ter/B1 — behaviour-matrix:L16, mensonge #2 du verdict REV-4bis.
   *
   * Calculée UNE fois (`formatLastMessage`, le MÊME appel — mêmes options
   * Prisme — que la ligne 2 visible) puis RÉUTILISÉE par les deux
   * consommateurs ci-dessous, plutôt que recalculée séparément derrière un
   * `typeof previewNode === 'string'` qui portait sur le FRAGMENT JSX
   * enveloppant (`<>{senderName}{lastMessagePreview}</>`) — toujours un
   * objet React, donc toujours faux, donc l'aria retombait TOUJOURS sur
   * `conversation.lastMessage?.content` (l'original, jamais la traduction
   * Prisme). Précédent iOS : `ThemedConversationRow.conversationAccessibilityLabel`
   * lit `resolvedLastMessagePreview`, la MÊME résolution que le visuel
   * (`ThemedConversationRow.swift:260-267`).
   */
  const lastMessagePreview = conversation.lastMessage
    ? formatLastMessage(conversation.lastMessage, {
        translations: conversation.lastMessageTranslations,
        originalLanguage: conversation.lastMessageOriginalLanguage,
        preferredLanguages,
      })
    : null;

  const senderNamePrefix = conversation.lastMessage ? getSenderName(conversation.lastMessage) : null;

  const previewNode = conversation.lastMessage ? (
    <>
      {senderNamePrefix && <span className="font-medium">{senderNamePrefix}: </span>}
      {lastMessagePreview}
    </>
  ) : null;

  // Forme TEXTE de la MÊME résolution ci-dessus. `formatLastMessage` ne
  // rend du JSX QUE pour la branche pièce jointe sans texte
  // (`message-formatting.tsx:198-232` — le Prisme ne s'y applique jamais,
  // donc rien n'y est à traduire) ; dans la branche TEXTE (l'immense
  // majorité), c'est déjà `resolveLastMessagePreview(...)` — une chaîne.
  const lastMessagePreviewText =
    (senderNamePrefix ? `${senderNamePrefix}: ` : '') + (typeof lastMessagePreview === 'string' ? lastMessagePreview : '');

  // Texte à plat pour l'aria-label — MÊMES précédences ET MÊME résolution
  // que le rendu visuel (typing → brouillon → pont → préview) :
  //   - typing/brouillon : déjà du texte, un seul appel `t(...)` (aucun
  //     second chemin possible).
  //   - pont : `resolveLentilleBridgeAriaText` (`LentilleBridgeLine.tsx`,
  //     EXPORTÉE par ce lot) — la MÊME fonction que le composant utilise
  //     pour calculer sa phrase + son suffixe de partialité (mensonge #3 :
  //     avant ce lot, l'aria rendait `lastMessage.content` alors que la
  //     ligne 2 visible rendait `LentilleBridgeLine`).
  //   - préview : `lastMessagePreviewText`, ci-dessus.
  const line2AriaText = isTyping
    ? t('lentille.typing.one', { name: typingUser!.displayName })
    : hasDraft
      ? `${t('lentille.draft')} ${draft!.content}`
      : hasBridge && bridge
        ? resolveLentilleBridgeAriaText(bridge, t as BridgeTranslate, preferredLanguages)
        : lastMessagePreviewText;

  const time = conversation.lastMessage ? formatConversationDate(conversation.lastMessage.createdAt, { t: t as (key: string) => string }) : '';

  // V4ter/B1 — mensonge #1 : le nombre nu, émis même à 0. Mention SEULEMENT
  // si `unreadCount > 0`, localisée et pluralisée (`resolveUnreadAriaSegment`
  // ci-dessus) — précédent iOS `ThemedConversationRow.swift:290-291`.
  const ariaLabel = [conversationName, time, resolveUnreadAriaSegment(unreadCount, t), line2AriaText]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(', ');

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-current={isSelected ? 'true' : undefined}
      data-testid="lentille-row"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-muted={isMuted ? 'true' : undefined}
      className={cn(
        'group cursor-pointer outline-none',
        'hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        isSelected && 'bg-primary/10 hover:bg-primary/20',
        // behaviour-matrix:L07 — « la sourdine passe … visible (rang à
        // 0.55 … ) » : opacité du RANG ENTIER, jamais un littéral (garde
        // R15) — classe Tailwind arbitraire portant la variable
        // `--lentille-list-muted-opacity` (`list.muted.opacity`,
        // `lentille-tokens.json`), déjà consommée côté iOS
        // (`LentilleMetrics.Muted`, `lentille-tokens-consumption-gate`) et
        // jusqu'ici morte côté web. Une classe (résolue en RÈGLE CSS à la
        // compilation), pas un style inline : `opacity` en style inline
        // n'accepte pas `var()` de façon fiable sous jsdom pour les tests.
        isMuted && 'opacity-[var(--lentille-list-muted-opacity)]'
      )}
      style={{
        height: 'var(--lentille-list-row-height)',
        padding: 'var(--lentille-list-row-padding-vertical) var(--lentille-list-row-padding-horizontal)',
        marginLeft: 'var(--lentille-list-row-margin-horizontal)',
        marginRight: 'var(--lentille-list-row-margin-horizontal)',
        borderRadius: 'var(--lentille-list-row-radius)',
        // @ts-expect-error -- propriété personnalisée, consommée par la teinte de l'anneau ci-dessous
        '--row-accent': accent,
      }}
    >
      {/* Wrapper interne de perspective (WL-104) — SEUL destinataire de
          `opacity`/`transform` écrits par `useLentillePerspective`. La
          racine ci-dessus (hauteur/marges/padding/radius) n'est JAMAIS
          touchée par la passe de perspective (invariant §4.1). Ce wrapper
          EST désormais `LentillePeek` (WL-106, LWS-11) : `wrapperRef` reçoit
          exactement le même ref-setter que l'ancien `<div ref={perspectiveRef}>`
          — le portillon opacity/transform est inchangé, `LentillePeek` ajoute
          les gestionnaires de geste (clic droit, appui long, ⋮ au survol)
          SANS toucher à la géométrie ni au ciblage de la perspective. */}
      <LentillePeek
        conversation={conversation}
        t={t}
        wrapperRef={perspectiveRef}
        isFocused={showsFocusCard}
        onShowDetails={onShowDetails}
        data-testid="lentille-row-perspective-wrapper"
        className="flex items-center gap-3 h-full w-full"
        style={{
          transformOrigin: 'var(--lentille-list-row-transform-origin-x) var(--lentille-list-row-transform-origin-y)',
        }}
      >
        {/* Avatar 44 + anneau accent */}
        <div className="relative flex-shrink-0" style={{ width: 'var(--lentille-list-avatar-size)', height: 'var(--lentille-list-avatar-size)' }}>
          <Avatar
            className="h-full w-full"
            style={{
              boxShadow: `0 0 0 var(--lentille-list-avatar-ring-size) color-mix(in srgb, var(--row-accent) calc(var(--lentille-list-avatar-ring-opacity) * 100%), transparent)`,
            }}
          >
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {icon || initials}
            </AvatarFallback>
          </Avatar>

          {/* Dots de présence — un ParticipantPresenceIndicator par entrée retenue,
              superposés : chacun se masque seul s'il est hors ligne. */}
          {!isTyping &&
            presenceEntries.map((entry) => (
              <ParticipantPresenceIndicator
                key={entry.userId}
                userId={entry.userId}
                fallbackUser={entry.source}
                size="sm"
                className="absolute -bottom-0.5 -right-0.5"
              />
            ))}

          {/* Typing = preuve d'activité : dot FORCÉ vert, indépendant du store de présence. */}
          {isTyping && (
            <span
              data-testid="lentille-row-typing-dot"
              className="absolute -bottom-0.5 -right-0.5 rounded-full bg-emerald-400 animate-pulse ring-2 ring-background"
              style={{
                width: 'var(--lentille-list-presence-dot-size)',
                height: 'var(--lentille-list-presence-dot-size)',
                borderWidth: 'var(--lentille-list-presence-dot-border-size)',
              }}
            />
          )}
        </div>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3
              className="truncate"
              style={{ fontSize: 'var(--lentille-list-name-size)', fontWeight: 'var(--lentille-list-name-weight)' }}
            >
              {/* behaviour-matrix:L07 — « l'épingle ajoute un glyphe 📌 avant le nom ». */}
              {isPinned && (
                <span aria-hidden="true" data-testid="lentille-row-pin-glyph">
                  📌{' '}
                </span>
              )}
              {conversationName}
              {/* behaviour-matrix:L07 — « la sourdine passe … visible (… + 🔕) ». */}
              {isMuted && (
                <span aria-hidden="true" data-testid="lentille-row-mute-glyph" className="ml-1">
                  🔕
                </span>
              )}
            </h3>
            {conversation.lastMessage && (
              <span
                className="text-muted-foreground flex-shrink-0"
                style={{ fontSize: 'var(--lentille-list-time-size)', fontWeight: 'var(--lentille-list-time-weight)' }}
              >
                {time}
              </span>
            )}
          </div>

          <div
            className="truncate mt-0.5 text-muted-foreground"
            style={{ fontSize: 'var(--lentille-list-line2-size)' }}
          >
            {isTyping ? (
              <span style={{ color: 'var(--row-accent)' }} data-testid="lentille-row-typing-line">
                {t('lentille.typing.one', { name: typingUser!.displayName })}
              </span>
            ) : hasDraft ? (
              <span className="text-destructive" data-testid="lentille-row-draft-line">
                {t('lentille.draft')} {draft!.content}
              </span>
            ) : hasBridge && bridge ? (
              <LentilleBridgeLine bridge={bridge} accentHex={accent} preferredLanguages={preferredLanguages} />
            ) : (
              previewNode
            )}
          </div>
        </div>

        {/* Point de non-lu accent, 8px — remplace le badge chiffré supprimé (L06). */}
        {hasUnread && (
          <span
            data-testid="lentille-row-unread-dot"
            aria-hidden="true"
            className="flex-shrink-0 rounded-full"
            style={{
              width: 'var(--lentille-list-unread-dot-size)',
              height: 'var(--lentille-list-unread-dot-size)',
              backgroundColor: 'var(--row-accent)',
            }}
          />
        )}
      </LentillePeek>
    </div>
  );
});

export default LentilleRow;
