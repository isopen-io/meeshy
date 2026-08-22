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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Q-142/R5-7 — LE RANG N'EST PLUS UN `role="button"` ENGLOBANT
 * ═══════════════════════════════════════════════════════════════════════════
 * Jusqu'au 2026-08-17, la RACINE du rang portait `role="button" tabIndex={0}`
 * + `aria-label` + `onClick`/`onKeyDown`, et TROIS contrôles réels vivaient
 * DEDANS : l'affordance d'avatar (`<a>`/`<button>`, L12), l'encoche de la
 * focus card (`<button>`, WL-108) et le ⋮ de `LentillePeek` (`<button>`,
 * WL-106). axe-core tirait `nested-interactive` sur chaque rang, et deux
 * suites d'audit devaient le désactiver pour rester vertes (réserve REV-4ter
 * R5-7, **condition d'activation V6**).
 *
 * REMÈDE — le patron « card action » (lien de couverture). La racine redevient
 * un CONTENEUR muet (aucun rôle, aucun `tabIndex`, aucun `aria-label` — un
 * `aria-label` sur un `div` sans rôle serait à son tour une violation,
 * `aria-prohibited-attr`). L'ouverture de la conversation vit dans un vrai
 * `<button>` FRÈRE, `position: absolute`, qui couvre exactement la boîte du
 * rang (`lentille-row-open`) : il porte le label L16, l'`aria-current` de la
 * sélection et l'anneau de focus. Les trois contrôles ne sont plus DANS un
 * contrôle — ils sont ses frères, peints AU-DESSUS de lui (voir la note
 * d'empilement sur `ROW_OPEN_COVER_*` plus bas).
 *
 * CE QUI NE CHANGE PAS, et qui est prouvé témoin par témoin
 * (`LentilleRow.test.tsx`, `LentilleRow.cover-action.test.tsx`) :
 *   - clic n'importe où sur le rang ⇒ `onSelect(conversation)` ;
 *   - Entrée ET Espace ouvrent la conversation — désormais par le
 *     comportement NATIF du `<button>`, plus par un `onKeyDown` réécrit ;
 *   - quatre arrêts de tabulation DISTINCTS, dans le même ordre qu'avant :
 *     couverture → avatar → encoche → ⋮ ;
 *   - le `memo` (REV-4/R4-6) tient : la couverture ne referme sur rien de
 *     neuf, elle réutilise le `handleClick` déjà mémoïsé ;
 *   - le chemin drapeau ÉTEINT n'est pas concerné (ce composant n'y est pas
 *     monté).
 */
'use client';

import { memo, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
import { getTagColor } from '@/utils/tag-colors';
import { getUserLanguagePreferences } from '@/utils/user-language-preferences';
import {
  resolveLentilleAvatarTarget,
  resolveLentillePresenceEntries,
  resolveOtherDirectParticipantUser,
  type LentilleAvatarTarget,
} from './lentille-row-utils';
import { LentilleBridgeLine, resolveLentilleBridgeAriaText } from './LentilleBridgeLine';
import type { BridgeTranslate } from '@meeshy/shared/utils/conversation-bridge';
import { LentillePeek } from './LentillePeek';
import { useConversationPreference } from '@/stores/conversation-preferences-store';
import type { LentilleTypingUser } from '@/hooks/lentille/use-lentille-list-typing';
import { useIsFocusedRow, type LentilleFocusElection } from '@/hooks/lentille/lentille-focus-election';
import { useLentilleLiveTick } from '@/hooks/lentille/use-lentille-live-tick';
import { isPlainLeftClick } from '@/lib/profile-link-click';

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
  /**
   * Directive produit 2026-08-17 — ouvre `UserProfileModal` pour l'avatar
   * d'un DM. Rappel STABLE reçu de `LentilleConversationListMount` (même
   * invariant que `onSelect` : une fermeture littérale ici rendrait le
   * `memo` de ce rang décoratif). Non fourni ⇒ l'avatar garde son
   * comportement de navigation directe vers `/u/{username}`.
   */
  readonly onOpenProfile?: (username: string) => void;
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

/**
 * Miroir de `packages/shared/design/lentille-tokens.json` → `list.tags.maxCount`
 * (= `--lentille-list-tags-max-count`, M-049) — un NOMBRE, nécessaire au
 * `.slice()`, donc impossible à ne garder qu'en CSS. Gardé contre la dérive
 * par `__tests__/lentille-tags-max-count.parity.test.ts`, même discipline que
 * `LENTILLE_LIST_RAIL_MAX_ENTRIES` (`LivesRail.tsx`).
 */
export const LENTILLE_LIST_TAGS_MAX_COUNT = 3;

function resolveUnreadAriaSegment(unreadCount: number, t: LentilleRowTranslate): string | null {
  if (unreadCount <= 0) return null;
  const key = unreadCount === 1 ? UNREAD_ARIA_ONE_KEY : UNREAD_ARIA_OTHER_KEY;
  return t(key, { count: unreadCount });
}

/**
 * behaviour-matrix:L12 — l'avatar du rang porte SON geste, et la « zone
 * d'exclusion avatar » qui va avec.
 *
 * TROIS invariants, chacun éprouvé par un témoin dédié
 * (`__tests__/LentilleRow.avatar-affordance.test.tsx`) :
 *
 *  1. **Le clic n'ouvre jamais la conversation.** La racine du rang est un
 *     `role="button"` avec `onClick`/`onKeyDown` ; sans `stopPropagation` sur
 *     les DEUX (le clavier autant que la souris — `Enter` sur un lien remonte
 *     jusqu'au `onKeyDown` du rang), ouvrir un profil ouvrirait AUSSI le fil.
 *  2. **Atteignable au clavier avec un nom accessible.** `<Link>` rend un
 *     `<a href>` et le bouton de groupe un `<button>` : tous deux
 *     naturellement tabulables, chacun nommé par `aria-label` — jamais un
 *     `div` cliquable.
 *  3. **Exempté de l'appui long.** `data-lentille-press-exempt` : `LentillePeek`
 *     n'arme ni son minuteur de 420 ms ni son aperçu quand la pression
 *     commence ici. C'est la transposition web de l'« exclusion avatar 70 pt »
 *     d'iOS (une géométrie de zone tactile n'aurait aucun sens ici : le
 *     marqueur suit l'élément, quelle que soit son habillage).
 *
 * `target === null` ⇒ rien à ouvrir ⇒ le conteneur reste un simple `div`,
 * la rangée redevient une cible unique. Aucun contrôle inerte n'est rendu.
 *
 * DIRECTIVE PRODUIT 2026-08-17 — « le profil s'ouvre en modale » : la
 * branche `profile` reste un VRAI `<Link href="/u/{username}">` (nom
 * accessible, clic droit "nouvel onglet" natif, atteignable au clavier),
 * mais son clic GAUCHE SIMPLE est intercepté (`isPlainLeftClick`, loi
 * PARTAGÉE avec `FocalIdentityHeader`) pour ouvrir `UserProfileModal` via
 * `onOpenProfile` plutôt que de naviguer. `onOpenProfile` non fourni ⇒ repli
 * sur la navigation directe (comportement inchangé).
 */
const AVATAR_BOX_STYLE: React.CSSProperties = {
  width: 'var(--lentille-list-avatar-size)',
  height: 'var(--lentille-list-avatar-size)',
};

/**
 * Q-142/R5-7 — EMPILEMENT DU PATRON « CARD ACTION », en une seule note.
 *
 * Les quatre éléments hit-testables du rang vivent dans le MÊME contexte
 * d'empilement : celui que `LentillePeek` crée par `isolation: isolate`
 * (voir sa docstring). Deux crans suffisent, et ils sont ici :
 *
 *   `z-index: -1` → le fond de la focus card (`LentilleFocusCard`) ;
 *   flux normal   → tout ce qui est INERTE (nom, ligne 2, point de non-lu,
 *                   chip de type — ce dernier déjà `pointer-events: none`) ;
 *   `ROW_OPEN_COVER_Z` (10) → la couverture d'ouverture ;
 *   `ROW_CONTROL_Z` (20) → les TROIS contrôles propres (avatar, encoche, ⋮).
 *
 * La couverture est TRANSPARENTE : se peindre au-dessus du contenu inerte ne
 * masque rien à l'œil, cela ne déplace que le HIT-TEST — un clic sur le nom
 * ou la ligne 2 atteint la couverture, donc ouvre la conversation, exactement
 * comme le `onClick` de racine le faisait. Les trois contrôles, eux, passent
 * au-dessus d'elle et gardent leur geste.
 */
const ROW_OPEN_COVER_Z = 'z-10';
const ROW_CONTROL_Z = 'z-20';

const AVATAR_BOX_CLASS = `relative ${ROW_CONTROL_Z} flex-shrink-0 block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary`;

function AvatarAffordance({
  target,
  t,
  onOpenConversationInfo,
  onOpenProfile,
  children,
}: {
  readonly target: LentilleAvatarTarget | null;
  readonly t: LentilleRowTranslate;
  readonly onOpenConversationInfo: () => void;
  /** Directive produit 2026-08-17 — voir docstring de fichier au-dessus de ce composant. */
  readonly onOpenProfile?: (username: string) => void;
  readonly children: React.ReactNode;
}) {
  const stopKeyboardPropagation = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') event.stopPropagation();
  }, []);

  if (target === null) {
    // Aucune cible ⇒ rien à ouvrir ⇒ AUCUN cran d'empilement propre : la
    // boîte reste sous la couverture, et le clic dessus ouvre la
    // conversation — « la rangée redevient une cible unique ».
    return (
      <div className="relative flex-shrink-0" style={AVATAR_BOX_STYLE}>
        {children}
      </div>
    );
  }

  if (target.kind === 'profile') {
    return (
      <Link
        href={target.href}
        data-testid="lentille-row-avatar-affordance"
        data-lentille-press-exempt="true"
        aria-label={t('lentille.a11y.openProfile', { name: target.name })}
        className={AVATAR_BOX_CLASS}
        style={AVATAR_BOX_STYLE}
        onClick={(event) => {
          event.stopPropagation();
          if (onOpenProfile && isPlainLeftClick(event)) {
            event.preventDefault();
            onOpenProfile(target.username);
          }
        }}
        onKeyDown={stopKeyboardPropagation}
      >
        {children}
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid="lentille-row-avatar-affordance"
      data-lentille-press-exempt="true"
      aria-label={t('lentille.a11y.openConversationInfo', { name: target.name })}
      className={AVATAR_BOX_CLASS}
      style={AVATAR_BOX_STYLE}
      onClick={(event) => {
        event.stopPropagation();
        onOpenConversationInfo();
      }}
      onKeyDown={stopKeyboardPropagation}
    >
      {children}
    </button>
  );
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
  onOpenProfile,
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
  // Maquette §3 — « tags et émoji favori vivent après le nom ». MÊME magasin
  // que pin/sourdine (`useConversationPreference`), donc aucune prop neuve à
  // faire traverser le montage et aucune seconde source de vérité.
  const favoriteReaction = rowPreference?.reaction ?? null;
  const tagDots = useMemo(
    () => (rowPreference?.tags ?? []).slice(0, LENTILLE_LIST_TAGS_MAX_COUNT),
    [rowPreference?.tags]
  );
  // Q-142/R5-7 — l'UNIQUE rappel d'ouverture, porté par la couverture. Le
  // `handleKeyDown` d'accompagnement a disparu avec le `role="button"` de la
  // racine : un `<button>` natif traite Entrée et Espace lui-même, et une
  // réécriture serait désormais un second chemin d'activation.
  const handleClick = useCallback(() => onSelect(conversation), [onSelect, conversation]);
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

  // behaviour-matrix:L12 — la cible du geste d'avatar (profil pour un DM,
  // infos de conversation sinon), résolue par la MÊME loi que le nom/avatar
  // du rang (`resolveOtherDirectParticipantUser`), jamais un second chemin.
  const avatarTarget = useMemo(
    () =>
      resolveLentilleAvatarTarget({
        conversation,
        currentUserId: currentUser?.id,
        conversationName,
        hasConversationInfo: !!onShowDetails,
      }),
    [conversation, currentUser?.id, conversationName, onShowDetails]
  );

  const handleOpenConversationInfo = useCallback(
    () => onShowDetails?.(conversation),
    [onShowDetails, conversation]
  );

  const unreadCount = conversation.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  const typingUser = pickDeterministicTypingUser(typingUsers);
  const isTyping = typingUser !== null;
  const hasDraft = !isTyping && !!draft && draft.content.trim() !== '';
  const hasBridge = !isTyping && !hasDraft && hasUnread && !!bridge;
  // Maquette (`rowHtml`) : la classe `unread` — celle qui renforce la
  // ligne 2 — n'est posée que si `c.unread && !c.typing`.
  const showsUnreadLine2 = hasUnread && !isTyping;

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

  // D-12 soldée (L14) — tick mutualisé 60s : UN SEUL `setInterval` de module
  // (`useLentilleLiveTick`), jamais un minuteur posé ici. La valeur retournée
  // n'est pas lue ; s'abonner suffit à forcer le re-rendu périodique de ce
  // rang, qui relit alors `formatConversationDate` (donc l'horloge) à chaque
  // tick — précédent iOS : `TimelineView(.periodic(by: 60))`.
  useLentilleLiveTick();
  const time = conversation.lastMessage ? formatConversationDate(conversation.lastMessage.createdAt, { t: t as (key: string) => string }) : '';

  // V4ter/B1 — mensonge #1 : le nombre nu, émis même à 0. Mention SEULEMENT
  // si `unreadCount > 0`, localisée et pluralisée (`resolveUnreadAriaSegment`
  // ci-dessus) — précédent iOS `ThemedConversationRow.swift:290-291`.
  const ariaLabel = [conversationName, time, resolveUnreadAriaSegment(unreadCount, t), line2AriaText]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(', ');

  return (
    <div
      data-testid="lentille-row"
      data-muted={isMuted ? 'true' : undefined}
      className={cn(
        // Q-142/R5-7 — CONTENEUR MUET : plus de `role`, plus de `tabIndex`,
        // plus d'`aria-label` (prohibé sur un `div` sans rôle), plus de
        // `onClick`/`onKeyDown`. Tout cela vit maintenant sur la couverture.
        'group cursor-pointer',
        'hover:bg-accent/50',
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
        {/* Q-142/R5-7 — LA COUVERTURE D'OUVERTURE (patron « card action »).
            PREMIER enfant : l'ordre du DOM est l'ordre de tabulation, et cet
            arrêt-ci doit rester le premier du rang (il l'était quand la
            racine portait `tabIndex={0}`). Un vrai `<button>` : Entrée et
            Espace l'activent NATIVEMENT — le `onKeyDown` réécrit de l'ancienne
            racine disparaît avec elle.

            Les insets NÉGATIFS rendent la boîte du RANG ENTIER, padding
            compris : ce wrapper vit à l'intérieur du padding de la racine, et
            sans eux la zone cliquable aurait rétréci d'exactement ce padding.
            Par les tokens, jamais un littéral (garde R15). */}
        <button
          type="button"
          data-testid="lentille-row-open"
          aria-label={ariaLabel}
          aria-current={isSelected ? 'true' : undefined}
          onClick={handleClick}
          className={cn(
            'absolute cursor-pointer outline-none',
            ROW_OPEN_COVER_Z,
            'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
          )}
          style={{
            top: 'calc(-1 * var(--lentille-list-row-padding-vertical))',
            bottom: 'calc(-1 * var(--lentille-list-row-padding-vertical))',
            left: 'calc(-1 * var(--lentille-list-row-padding-horizontal))',
            right: 'calc(-1 * var(--lentille-list-row-padding-horizontal))',
            borderRadius: 'var(--lentille-list-row-radius)',
          }}
        />

        {/* Avatar 44 + anneau accent — enveloppé dans SON PROPRE geste
            (behaviour-matrix:L12) quand une cible existe : profil pour un DM,
            infos de conversation sinon. `AvatarAffordance` ci-dessous porte
            l'arrêt de propagation (clic ET clavier) et le marqueur
            d'exclusion d'appui long lu par `LentillePeek`. */}
        <AvatarAffordance
          target={avatarTarget}
          t={t}
          onOpenConversationInfo={handleOpenConversationInfo}
          onOpenProfile={onOpenProfile}
        >
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
        </AvatarAffordance>

        {/* Contenu */}
        <div className="flex-1 min-w-0">
          {/* Ligne 1 — grammaire « Nom · heure » de la maquette (§3, figure
              cotée : « nom 15 extrabold · point médian · heure 12 » ; rendu
              `.l1{display:flex; align-items:baseline}` avec `.mid` entre
              `.nm` et `.tm`). L'heure est ACCOLÉE au nom : pas de
              `justify-between`, qui la renverrait au bord droit — c'est la
              grammaire du rang historique, celle que la Lentille remplace.
              Ordre de la maquette (`rowHtml`) : 📌 · nom · favori · tags ·
              🔕 · point médian · heure. */}
          <div data-testid="lentille-row-line1" className="flex items-baseline gap-1.5">
            {/* behaviour-matrix:L07 — « l'épingle ajoute un glyphe 📌 avant le nom ». */}
            {isPinned && (
              <span
                aria-hidden="true"
                data-testid="lentille-row-pin-glyph"
                className="shrink-0"
                style={{ fontSize: 'var(--lentille-list-tags-emoji-size)' }}
              >
                📌
              </span>
            )}

            <h3
              data-testid="lentille-row-name"
              className="truncate min-w-0"
              style={{ fontSize: 'var(--lentille-list-name-size)', fontWeight: 'var(--lentille-list-name-weight)' }}
            >
              {conversationName}
            </h3>

            {/* Émoji favori — maquette §3 (« tags et émoji favori vivent
                après le nom », rendu `.fav`) et parité iOS
                (`LentilleConversationRow.swift`, `userState.reaction` à la
                taille `LentilleMetrics.Tags.emojiSize`). MÊME magasin que
                pin/sourdine : aucune seconde source. */}
            {favoriteReaction && (
              <span
                aria-hidden="true"
                data-testid="lentille-row-favorite"
                className="shrink-0"
                style={{ fontSize: 'var(--lentille-list-tags-emoji-size)' }}
              >
                {favoriteReaction}
              </span>
            )}

            {/* behaviour-matrix:L08 (part tags, réserve REV-4/R4-2) — « les
                tags utilisateur deviennent au plus 3 pastilles de 6 px après
                le nom ». Teinte par `getTagColor`, le MÊME hachage que le
                rang historique (`ConversationItem`) : une seule loi de
                couleur de tag dans le dépôt, jamais une seconde. La classe
                porte la teinte (`text-…`), la pastille la peint
                (`currentColor`) — les nuances 700/300 de la palette sont
                lisibles sur 6 px dans les deux thèmes, là où les fonds
                `bg-…-100` de la capsule historique disparaîtraient. */}
            {tagDots.length > 0 && (
              <span
                aria-hidden="true"
                data-testid="lentille-row-tag-dots"
                className="flex shrink-0 items-center gap-[3px]"
              >
                {tagDots.map((tag) => (
                  <i
                    key={tag}
                    data-testid="lentille-row-tag-dot"
                    className={cn('inline-block rounded-full', getTagColor(tag).text)}
                    style={{
                      width: 'var(--lentille-list-tags-size)',
                      height: 'var(--lentille-list-tags-size)',
                      backgroundColor: 'currentColor',
                    }}
                  />
                ))}
              </span>
            )}

            {/* behaviour-matrix:L07 — « la sourdine passe … visible (… + 🔕) ». */}
            {isMuted && (
              <span
                aria-hidden="true"
                data-testid="lentille-row-mute-glyph"
                className="shrink-0"
                style={{ fontSize: 'var(--lentille-list-tags-emoji-size)' }}
              >
                🔕
              </span>
            )}

            {/* La date a QUITTÉ cette ligne le 2026-08-22 (parité iOS) : elle
                vit seule, en bas à droite — « juste l'auteur : message, et
                puis en bas sur une nouvelle ligne à droite la date ». Le nom
                possède donc toute la ligne. */}
          </div>

          {/* Ligne 2 — la maquette la veut TERTIAIRE au repos
              (`.crow .l2{color:var(--ink3)}`) et PRIMAIRE, plus grasse, sur un
              rang non lu (`.crow.unread .l2{color:var(--m-text);
              font-weight:600}`). La classe `unread` du rendu de la maquette
              n'est posée que si `c.unread && !c.typing` : quelqu'un qui écrit
              maintenant l'emporte sur le compte de non-lus. */}
          <div
            data-testid="lentille-row-line2"
            className={cn(
              'truncate mt-0.5',
              showsUnreadLine2 ? 'text-foreground font-semibold' : 'text-muted-foreground'
            )}
            style={{ fontSize: 'var(--lentille-list-line2-size)' }}
          >
            {isTyping ? (
              <span style={{ color: 'var(--row-accent)' }} data-testid="lentille-row-typing-line">
                {t('lentille.typing.one', { name: typingUser!.displayName })}
              </span>
            ) : hasDraft ? (
              // V4ter/R4-3 — behaviour-matrix:L02. L'ancien span unique
              // `text-destructive` couvrait le label ET `draft.content` ; la
              // matrice veut le label seul en couleur d'erreur, le texte du
              // brouillon en tertiaire (hérité de `text-muted-foreground` du
              // conteneur ligne 2, ligne 362 — jamais `text-destructive`).
              <span data-testid="lentille-row-draft-line">
                <span className="text-destructive" data-testid="lentille-row-draft-label">
                  {t('lentille.draft')}
                </span>{' '}
                <span data-testid="lentille-row-draft-content">{draft!.content}</span>
              </span>
            ) : hasBridge && bridge ? (
              <LentilleBridgeLine
                bridge={bridge}
                accentHex={accent}
                preferredLanguages={preferredLanguages}
                // Maquette §1, table « État du rang » : « Sourdine — Rang à
                // 55 % d'opacité, PONT GRISÉ ». Le rendu de la maquette le
                // dit deux fois : hors sourdine `<span class="pont">`
                // (teinté accent), en sourdine `✦ ${pont}` NU. Le texte du
                // pont reste lu ; c'est sa teinte qui s'efface.
                tinted={!isMuted}
              />
            ) : (
              previewNode
            )}
          </div>

          {/* Ligne 3 — la date SEULE, poussée à droite (2026-08-22, parité
              iOS `LentilleConversationRow.dateLine`). La hauteur de rangée du
              jeton partagé (`list.row.height`) est passée de 64 à 78 pour
              elle : trois lignes ne tiennent pas dans deux. */}
          {conversation.lastMessage && (
            <div className="flex justify-end" data-testid="lentille-row-date-line">
              <span
                data-testid="lentille-row-time"
                className="text-muted-foreground shrink-0"
                style={{ fontSize: 'var(--lentille-list-time-size)', fontWeight: 'var(--lentille-list-time-weight)' }}
              >
                {time}
              </span>
            </div>
          )}
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
