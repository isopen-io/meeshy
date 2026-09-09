import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { ReadingModeChip } from './reading-mode-chip';
import type { Conversation } from '@/lib/api/types';
import type { MenuRow } from '@/lib/reading-mode/catalog';
import { apiConfig } from '@/lib/api/config';
import { initialsOf, peerOf, presenceOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * L'EN-TÊTE DU FIL — extrait de `routes/thread.tsx` (revue #5814, défaut
 * majeur 2) : au-delà de 1000 lignes le budget du dépôt (CLAUDE.md § Code
 * Style) demande un découpage « sans se discuter », et le lot #5814
 * (menu du message) a fait franchir ce seuil (964 → 1092) sans le faire —
 * l'étape 0 de sa propre spécification prévoyait pourtant cette extraction.
 * AUCUNE règle nouvelle ici : chaque prop est la valeur déjà calculée par
 * l'écran (retour + non-lus ailleurs, puce de mode de lecture, appel,
 * recherche, avatar, bandeau hors ligne) — cette coquille ne fait que
 * PORTER le JSX, motif `Sheet`/`FocusStrip` (composant SANS état propre).
 */
export function ThreadHeader({
  title,
  accent,
  conversation,
  viewerId,
  group,
  otherUnread,
  expanded,
  onToggleExpanded,
  online,
  currentRowTitle,
  isAuto,
  readingMenuRows,
  onSelectReadingMode,
  onResetReadingModeToAuto,
}: {
  readonly title: string;
  readonly accent: string;
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly group: boolean;
  readonly otherUnread: number;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly online: boolean;
  readonly currentRowTitle: string;
  readonly isAuto: boolean;
  readonly readingMenuRows: readonly MenuRow[];
  readonly onSelectReadingMode: (mode: ConversationReadingMode) => void;
  readonly onResetReadingModeToAuto: () => void;
}) {
  return (
    <header
      className="z-10 shrink-0 backdrop-blur-xl"
      style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <Link
          to="list"
          className="relative grid size-11 shrink-0 place-items-center rounded-chip"
          style={{ color: 'var(--accent)' }}
          aria-label={otherUnread > 0 ? `Retour — ${otherUnread} messages non lus ailleurs` : 'Retour'}
        >
          <Glyph name="caretLeft" size={22} />
          {otherUnread > 0 ? (
            <span
              className="absolute top-0 right-0 grid min-h-4 min-w-4 place-items-center rounded-chip px-1 text-[9px] font-semibold text-white"
              style={{ backgroundColor: 'var(--color-error)' }}
              aria-hidden
            >
              {otherUnread}
            </span>
          ) : null}
        </Link>

        {expanded ? (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
              {title}
            </h1>
            <p className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
              <Glyph name="lock" size={9} style={{ color: 'var(--color-ok)' }} />
              {group ? `${conversation.memberCount} participants` : 'Chiffré de bout en bout'}
            </p>
          </div>
        ) : (
          <>
            <span className="flex-1" />
            {/* LE CHIP DE MODE — SOUS DRAPEAU UNIQUEMENT (D-20, miroir
                `ConversationView.swift:2391-2430`) : `apiConfig.readingModesEnabled`
                est un paramètre de CONSTRUCTION, figé au déploiement — quand il
                est faux, `readingDecision.mode` vaut toujours `bubbles`
                (`resolveThreadMode`), donc ce chip n'aurait jamais rien d'autre
                à proposer que le mode déjà affiché. Clic ouvre le menu
                (§1.7 : écart assumé vs iOS, voir `reading-mode-chip.tsx`).
                Dans la grappe d'action, comme prescrit par la spécification
                #5566. */}
            {apiConfig.readingModesEnabled ? (
              <ReadingModeChip
                label={currentRowTitle}
                isAuto={isAuto}
                rows={readingMenuRows}
                onSelect={onSelectReadingMode}
                onAuto={onResetReadingModeToAuto}
              />
            ) : null}
            <button
              type="button"
              /* `shrink-0` : ces deux cibles ne cèdent JAMAIS. Sur un écran
                 étroit, c'est le chip qui tronque (voir `reading-mode-chip`). */
              className="grid size-11 shrink-0 place-items-center"
              style={{ color: 'var(--accent)' }}
              aria-label="Appeler"
            >
              <span
                className="grid size-7 place-items-center rounded-chip"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
              >
                <Glyph name="phone" size={13} />
              </span>
            </button>
            <button
              type="button"
              /* `shrink-0` : ces deux cibles ne cèdent JAMAIS. Sur un écran
                 étroit, c'est le chip qui tronque (voir `reading-mode-chip`). */
              className="grid size-11 shrink-0 place-items-center"
              style={{ color: 'var(--accent)' }}
              aria-label="Rechercher dans la conversation"
            >
              <span
                className="grid size-7 place-items-center rounded-chip"
                style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
              >
                <Glyph name="magnifyingGlass" size={13} />
              </span>
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={expanded ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
          className="shrink-0"
        >
          <Avatar
            initials={initialsOf(title)}
            color={accent}
            size={44}
            {...(group ? {} : { presence: presenceOf(peerOf(conversation, viewerId)) })}
          />
        </button>
      </div>
      {/*
        LE BANDEAU DE COUPURE. Discret et NON bloquant : l'application lit
        parfaitement hors ligne (précache), donc annoncer la coupure par un
        voile ou une modale punirait l'utilisateur pour un état où tout ce
        qu'il veut lire est déjà là. Ce qu'il doit savoir tient en une
        phrase : ce qu'il ÉCRIT ne partira pas maintenant.
      */}
      {online ? null : (
        <p
          role="status"
          className="flex items-center justify-center gap-1.5 px-4 py-1 text-check font-semibold"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-warn) 22%, transparent)',
            color: 'var(--color-ios-ink)',
          }}
        >
          <Glyph name="warningCircle" size={11} />
          Hors ligne — vos messages ne partiront pas maintenant
        </p>
      )}
    </header>
  );
}
