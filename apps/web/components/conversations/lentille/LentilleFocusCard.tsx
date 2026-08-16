/**
 * `LentilleFocusCard` — WL-108 (LWS-8, §4.2/§4.3 ; parité I-071).
 *
 * La carte de focus de la conversation élue, et son ENCOCHE — jumeau web de
 * `apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift`.
 * C'est la SEULE carte de l'écran (LWS-7 : « aucune carte » sur le rang) :
 * tout le reste de la Lentille est plat.
 *
 * UN FOND PEINT PAR-DESSUS, JAMAIS UN CONTENEUR. Les deux éléments rendus ici
 * sont en `position: absolute` dans le wrapper de rang : ils ne participent à
 * aucun flux, ne changent aucune hauteur, ne déclenchent aucun relayout —
 * l'invariant « hauteur inchangée, zéro relayout » (§4.1/§4.2) est tenu par
 * CONSTRUCTION, pas par vigilance. Le fond porte `z-index: -1` : sans lui, un
 * élément positionné se peindrait AU-DESSUS du contenu en flux du rang
 * (avatar, nom, ligne 2) et le masquerait ; avec lui, il se peint derrière,
 * comme un fond.
 *
 * COTES PAR LES TOKENS, jamais en dur (garde R15) :
 * `--lentille-list-focus-card-{radius,ring-size}` et
 * `--lentille-list-mode-notch-{size,weight,top,right}`
 * (`apps/web/styles/lentille-tokens.css`, générés depuis
 * `packages/shared/design/lentille-tokens.json` §4.3). L'accent est
 * `--row-accent`, la variable que `LentilleRow` pose sur la racine du rang :
 * l'anneau de l'avatar et le ring de la carte tiennent donc leur teinte de
 * la MÊME conversation, par construction (« ring accent de CETTE
 * conversation », LWS-8).
 *
 * RING INTERNE — `boxShadow: inset` et non `border` : une bordure ajouterait
 * à la boîte (ou, avec `box-sizing`, rognerait le contenu) ; l'ombre interne
 * ne coûte rien au layout. C'est la transposition littérale du token
 * `focusCard.ringType = "internal"` (§4.3) et du `.strokeBorder` (INTÉRIEUR)
 * de la carte Swift, par opposition à `.stroke` (à cheval).
 *
 * REDUCE MOTION ⇒ FOND SEUL (critère d'acceptation LWS-8, mot pour mot) : le
 * ring disparaît, la carte reste — l'élection, elle, n'est pas affectée (elle
 * vit dans `useLentillePerspective`, qui continue d'élire).
 *
 * DÉCORATIF SAUF L'ENCOCHE. Le fond et le chip de type sont `aria-hidden` et
 * `pointer-events: none` : ils n'interceptent ni le tap du rang, ni son
 * appui long, ni le défilement, et n'ajoutent rien au fil VoiceOver (le
 * label du rang, L16, reste la seule annonce). L'encoche est un vrai
 * `<button>` — le SEUL élément hit-testable de la carte.
 *
 * behaviour-matrix:L08 — « le badge de type (groupe/canal/bot + memberCount)
 * est absorbé par la focus card (chip) et l'anneau accent » : `LentilleRow`
 * ne rend aucun badge de type (re-prouvé, WL-102), c'est cette carte qui en
 * devient le domicile, au coin bas-gauche (le seul encore libre — l'encoche
 * occupe le haut-droit).
 *
 * @see tasks/lentille-implementation-contract.md LWS-8, §4.2, §4.3
 * @see apps/ios/Meeshy/Features/Main/Lentille/Mode/LentilleFocusCard.swift
 */
'use client';

import { Globe, Megaphone, User, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Conversation, ConversationType } from '@meeshy/shared/types';
import type { ReadingModePreference } from '@meeshy/shared/types/reading-modes';
import type { OrchestratorDecision } from '@meeshy/shared/utils/reading-modes';
import { notchText } from './lentille-mode-labels';
import type { LentilleRowTranslate } from './LentilleRow';

export interface LentilleFocusCardProps {
  readonly conversation: Conversation;
  /** Préférence mémorisée pour CETTE conversation — `auto` tant que rien n'est mémorisé. */
  readonly preference: ReadingModePreference;
  /** Décision de `resolveOrchestratorDecision` sur les données de CETTE conversation. */
  readonly decision: OrchestratorDecision;
  readonly t: LentilleRowTranslate;
  /** Tap sur l'encoche — le montage y branche l'ouverture du menu de mode. */
  readonly onNotchTap: () => void;
  /** `prefers-reduced-motion` ⇒ fond SEUL (ring supprimé). Fourni par le montage. */
  readonly reducedMotion?: boolean;
}

/**
 * Icône du chip de type — mêmes familles que le badge historique iOS
 * (`person.2`/`megaphone`/`globe`), en lucide.
 *
 * RE-PREUVE (§0) : le `ConversationType` du WEB
 * (`packages/shared/types/conversation.ts`) compte CINQ cas — `direct |
 * group | public | global | broadcast` — là où le SDK iOS en porte huit
 * (`community`, `channel`, `bot` en plus). Cette table couvre donc
 * exhaustivement le catalogue web, sans inventer d'entrées pour des types
 * que ce modèle ne connaît pas. `direct` n'affiche aucun chip (voir le
 * rendu) : sa nature est déjà dite par l'avatar unique — l'icône n'est là
 * que pour rester exhaustif sur l'union.
 */
const TYPE_ICON: Readonly<Record<ConversationType, typeof Users>> = {
  direct: User,
  group: Users,
  public: Globe,
  global: Globe,
  broadcast: Megaphone,
};

export function LentilleFocusCard({
  conversation,
  preference,
  decision,
  t,
  onNotchTap,
  reducedMotion = false,
}: LentilleFocusCardProps) {
  const TypeIcon = TYPE_ICON[conversation.type] ?? Users;
  const showTypeChip = conversation.type !== 'direct';
  const label = notchText(decision, preference, t);

  return (
    <>
      {/* Fond + ring interne — décoratif, DERRIÈRE le contenu du rang. */}
      <div
        data-testid="lentille-focus-card"
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none bg-secondary"
        style={{
          zIndex: -1,
          borderRadius: 'var(--lentille-list-focus-card-radius)',
          boxShadow: reducedMotion
            ? undefined
            : 'inset 0 0 0 var(--lentille-list-focus-card-ring-size) var(--row-accent)',
        }}
      />

      {/* Chip de type + memberCount (behaviour-matrix:L08) — décoratif. */}
      {showTypeChip && (
        <span
          data-testid="lentille-focus-card-type-chip"
          aria-hidden="true"
          className="absolute bottom-1 left-2 pointer-events-none flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
          style={{
            color: 'var(--row-accent)',
            backgroundColor: 'color-mix(in srgb, var(--row-accent) 15%, transparent)',
          }}
        >
          <TypeIcon className="h-3 w-3" />
          {conversation.memberCount > 1 && (
            <span data-testid="lentille-focus-card-member-count">{conversation.memberCount}</span>
          )}
        </span>
      )}

      {/* Encoche — le SEUL élément actionnable de la carte. */}
      <button
        type="button"
        data-testid="lentille-focus-card-notch"
        aria-label={label}
        onClick={(event) => {
          // Le rang entier est un `role="button"` qui navigue : sans cet
          // arrêt, ouvrir le menu de mode ouvrirait AUSSI la conversation.
          event.stopPropagation();
          onNotchTap();
        }}
        className={cn(
          // PAS de `uppercase` : le token `modeNotch` de §4.3 ne porte AUCUN
          // `textTransform` (contrairement à `sticker`, qui l'a). La casse
          // est celle de la traduction — « AUTO · Focal », pas « AUTO · FOCAL ».
          'absolute rounded-full px-2 py-0.5',
          'bg-secondary hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary'
        )}
        style={{
          top: 'var(--lentille-list-mode-notch-top)',
          right: 'var(--lentille-list-mode-notch-right)',
          fontSize: 'var(--lentille-list-mode-notch-size)',
          fontWeight: 'var(--lentille-list-mode-notch-weight)',
          color: 'var(--row-accent)',
          // Même opacité d'accent que l'anneau de l'avatar — par le TOKEN,
          // jamais un `55 %` recopié (garde R15). C'est ce que fait la
          // capsule de l'encoche Swift : `accent.opacity(LentilleMetrics
          // .Avatar.ringOpacity)`.
          boxShadow:
            '0 0 0 1px color-mix(in srgb, var(--row-accent) calc(var(--lentille-list-avatar-ring-opacity) * 100%), transparent)',
        }}
      >
        {label}
      </button>
    </>
  );
}

export default LentilleFocusCard;
