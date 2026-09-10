import { Suspense, lazy } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from '@/components/avatar';
import { Bubble } from '@/components/bubble';
import { FocalRow } from '@/components/focal-row';
import { SummarySkeleton } from '@/components/summary/summary-skeleton';
import type { Conversation, Message, Participant } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import { dayLabel, type PlacedMessage } from '@/lib/grouping';
import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';
import { initialsOf } from '@/lib/view/conversation';
import type { useLongPress } from '@/lib/view/long-press';
import { checkStatusOf, isMineOf } from '@/lib/view/message';
import type { LocalDelivery } from '@/lib/view/message';
import { composeMessageLabel } from '@/lib/view/message-a11y-label';
import { served } from '@/lib/api/prism';
import type { SelectionState } from '@/lib/view/selection';
import { usesFlatRow } from '@/lib/reading-mode/decision';
import type { ThreadScene } from '@/lib/reading-mode/scene';

/**
 * LE RÉSUMÉ VIVANT (#5695) — module À LA DEMANDE, déplacé ICI avec le
 * montage qui le charge (voir le doc-comment du fichier) : `ThreadModes`
 * n'entre elle-même dans le CHUNK DU FIL qu'au premier rendu de
 * `routes/thread.tsx` (import statique d'une route déjà scindée par route),
 * donc ce `lazy()` continue de différer `summary-host` jusqu'au premier
 * rendu en mode Résumé, exactement comme avant l'extraction.
 */
const SummaryHost = lazy(() => import('@/components/summary/summary-host'));

/**
 * LE MONTAGE DES MODES — extrait de `routes/thread.tsx` (#5878) : au-delà de
 * 1000 lignes le budget du dépôt (CLAUDE.md § Code Style) demande un
 * découpage « sans se discuter », et le fichier l'avait de nouveau atteint
 * (1042 lignes, D-29/D-30) après une première extraction
 * (`thread-header.tsx`, #5814). AUCUNE règle nouvelle ici : chaque prop est
 * la valeur déjà calculée par l'écran — motif `Sheet`/`FocusStrip`
 * (composant SANS état propre, comme `ThreadHeader`).
 *
 * Rend soit le Résumé Vivant (`mode === 'summary'`), soit la rangée
 * plate/bulle virtualisée — jamais les deux (`thread.tsx`, doc-comment de
 * `ThreadScreen`). La prochaine surface à monter ICI est la Rivière (D-21) :
 * c'est précisément pour qu'elle ait un fichier sous le budget où s'ajouter
 * que ce découpage précède son lot, plutôt que de le suivre.
 */
export function ThreadModes({
  mode,
  conversation,
  messages,
  viewer,
  windowCoversUnread,
  readerLocale,
  summaryLang,
  onReplyToPerson,
  onOpenEpisode,
  onResumeThread,
  placed,
  virtualizer,
  scene,
  readerLanguages,
  group,
  highlightedId,
  expiredIds,
  jumpToMessage,
  consume,
  onEphemeralExpired,
  deliveryOf,
  startedAtOf,
  reasonOf,
  permanentOf,
  retry,
  displayLanguageOf,
  myReactionsOf,
  selection,
  onRowTap,
  longPress,
  onPickLanguage,
  onReact,
  typing,
  typist,
  accent,
}: {
  readonly mode: ConversationReadingMode;
  // Résumé Vivant (#5695)
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly viewer: Viewer;
  readonly windowCoversUnread: boolean;
  readonly readerLocale: string;
  readonly summaryLang?: string;
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
  // Rangée plate/bulle virtualisée
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
  readonly scene: ThreadScene;
  readonly readerLanguages: readonly string[];
  readonly group: boolean;
  readonly highlightedId: string | null;
  readonly expiredIds: ReadonlySet<string>;
  readonly jumpToMessage: (messageId: string) => void;
  readonly consume: (messageId: string) => Promise<boolean>;
  readonly onEphemeralExpired: (messageId: string) => void;
  readonly deliveryOf: (messageId: string) => LocalDelivery | undefined;
  readonly startedAtOf: (messageId: string) => number | undefined;
  readonly reasonOf: (messageId: string) => string | undefined;
  readonly permanentOf: (messageId: string) => boolean;
  readonly retry: (messageId: string) => void;
  readonly displayLanguageOf: (messageId: string) => string | undefined;
  readonly myReactionsOf: (messageId: string) => readonly string[] | undefined;
  readonly selection: SelectionState | null;
  readonly onRowTap: (messageId: string) => void;
  readonly longPress: ReturnType<typeof useLongPress>;
  readonly onPickLanguage: (messageId: string, code: string) => void;
  /** Retire une réaction MIENNE en tapant sa capsule (#5865) — même geste
   * que `onPickLanguage`, une seule loi vers `useMessageMenu.onMenuReact`. */
  readonly onReact: (messageId: string, emoji: string) => void;
  // L'indicateur de frappe, en queue du fil
  readonly typing: boolean;
  readonly typist: Participant | undefined;
  readonly accent: string;
}) {
  const viewerId = viewer.id ?? '';

  if (mode === 'summary') {
    return (
      /*
        LE RÉSUMÉ VIVANT (#5695) — SOUS l'en-tête (le `<main>` du fil est
        déjà un FRÈRE de `<header>`, jamais en dessous en z-order) :
        correction du défaut #5682 de la cible iOS, pas sa recopie.
        La scène (`useThreadScene`) est INERTE sur ce mode
        (`reading-mode/scene.ts`) — le virtualiseur reste construit
        (`useVirtualizer` ne peut pas être conditionnel) mais rien ne
        monte de rangée `[data-row]` ici.
      */
      <Suspense fallback={<SummarySkeleton />}>
        <SummaryHost
          conversationId={conversation.id}
          messages={messages}
          participants={conversation.participants}
          viewer={viewer}
          windowCoversUnread={windowCoversUnread}
          locale={readerLocale}
          {...(summaryLang !== undefined ? { lang: summaryLang } : {})}
          onReplyToPerson={onReplyToPerson}
          onOpenEpisode={onOpenEpisode}
          onResumeThread={onResumeThread}
        />
      </Suspense>
    );
  }

  return (
    <>
      {placed.length === 0 ? (
        /*
          L'ÉTAT VIDE EST UN ÉTAT, pas une absence d'écran. Un fil sans
          historique qui rend du blanc laisse croire à un chargement qui ne
          finit pas — sur un réseau lent, c'est l'interprétation la plus
          naturelle et la plus fausse.
        */
        <div className="grid flex-1 place-items-center px-8 text-center">
          <div className="grid gap-2">
            <p className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Aucun message pour l’instant
            </p>
            <p className="text-body" style={{ color: 'var(--color-ios-ink-2)' }}>
              Écrivez le premier — il sera traduit dans la langue de chacun.
            </p>
          </div>
        </div>
      ) : null}

      <ol
        style={{
          position: 'relative',
          width: '100%',
          flexShrink: 0,
          marginBlockStart: 'auto',
          height: virtualizer.getTotalSize(),
        }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const p = placed[row.index];
          if (p === undefined) return null;
          const isElected = scene.elected === p.message.id;
          /* L'opinion de CE client sur l'envoi (#5813) — UNE lecture par
             rangée, réutilisée pour les deux peaux et pour l'horloge des
             200 ms (`sendStartedAt`, § 5 étape 9). */
          const rowDelivery = deliveryOf(p.message.id);
          const rowStartedAt = startedAtOf(p.message.id);
          const rowReason = reasonOf(p.message.id);
          /* UN REFUS PERMANENT N'OFFRE PAS DE REJEU (revue-correction
             #5813, défaut majeur 2) — 403/401 ne peuvent jamais aboutir en
             rejouant le MÊME appel ; `onRetry` disparaît, la cause reste.
             Hors ligne (`rowReason === undefined`, D-16) n'est jamais
             permanent : `permanentOf` lit `lastError`, absent tant qu'aucun
             appel n'est parti. */
          const rowPermanent = rowDelivery === 'failed' && permanentOf(p.message.id);
          const sendProps =
            rowDelivery === undefined
              ? {}
              : {
                  localDelivery: rowDelivery,
                  ...(rowPermanent ? {} : { onRetry: () => retry(p.message.id) }),
                  ...(rowStartedAt === undefined ? {} : { sendStartedAt: rowStartedAt }),
                  ...(rowReason === undefined ? {} : { sendFailureReason: rowReason }),
                };
          /* LE MENU DU MESSAGE (#5814) — trois lectures par rangée, motif
             `rowDelivery` ci-dessus : Traduire (langue explorée pour CE
             message), « la mienne » (réactions), et l'état de sélection. */
          const rowDisplayLanguage = displayLanguageOf(p.message.id);
          const rowMyReactions = myReactionsOf(p.message.id);
          const rowSelected = selection === null ? undefined : selection.ids.includes(p.message.id);
          /*
           * LE LIBELLÉ D'ACCESSIBILITÉ (#5774, travail 2/3) — UN SEUL site,
           * partagé par la rangée plate ET la bulle : `composeMessageLabel`
           * (`lib/view/message-a11y-label.ts`), nourri du MÊME texte SERVI
           * que celui que la rangée peint (`rowDisplayLanguage` inclus — un
           * témoin de RANG se lit sur un rang ≠ 1 du Prisme, CLAUDE.md
           * racine, leçon 261). Avant ce lot : `Message de ${sender}`, sans
           * texte, sans citation, sans média, sans accusé, sans badge.
           */
          const rowPreferredLanguages =
            rowDisplayLanguage === undefined ? readerLanguages : [rowDisplayLanguage, ...readerLanguages];
          const rowServed = served({
            preferredLanguages: rowPreferredLanguages,
            originalLanguage: p.message.originalLanguage,
            translations: p.message.translations,
            original: p.message.content,
          });
          const rowLabel = composeMessageLabel({
            message: p.message,
            isMine: isMineOf(p.message, viewerId),
            servedText: rowServed.text,
            delivery: checkStatusOf(p.message, rowDelivery),
          });
          return (
            <li
              key={p.message.id}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                insetInlineStart: 0,
                top: 0,
                width: '100%',
                transform: `translateY(${row.start}px)`,
                /* CHAQUE rangée est un CONTEXTE D'EMPILEMENT (`transform`), et
                   les rangées se peignent dans l'ordre du DOM : les
                   superpositions de l'élue qui DÉBORDENT vers le bas (bande de
                   focus, tampon) passaient donc SOUS la rangée suivante.
                   Mesuré : `elementFromPoint` au centre du drapeau de la bande
                   rendait la rangée d'APRÈS — le contrôle était INATTEIGNABLE
                   au doigt et à la souris, quoique présent et fonctionnel
                   (correction de revue #5648). Élever la SEULE rangée élue
                   suffit ; aucune autre ne porte de débord. */
                ...(isElected ? { zIndex: 1 } : {}),
              }}
            >
              {p.opensDay ? (
                <div className="flex justify-center py-1.5">
                  <span
                    className="rounded-chip px-3 py-1 text-time font-semibold backdrop-blur-md"
                    style={{
                      color: 'var(--color-day-ink)',
                      border: '0.5px solid var(--color-day-hairline)',
                      backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 70%, transparent)',
                    }}
                  >
                    {dayLabel(p.message.createdAt, { locale: readerLocale })}
                  </span>
                </div>
              ) : null}
              {/* LE MODE DE LECTURE (#5566) : `focal`/`script` rendent la
                  rangée plate, `bubbles` reste la bulle historique — D-7,
                  D-8. `data-row` est le CANDIDAT d'élection de
                  `reading-mode/scene.ts` (#5648) — posé sur CHAQUE rangée,
                  candidat SEULEMENT quand la scène est armée (mode focal) —
                  et l'ANCRE du menu du message (#5814) : `useLongPress` vit
                  UNE fois dans cet écran (`messageMenu.longPress`, motif
                  délégation) et lit `dataset.row` au geste, jamais une
                  instance par rangée virtualisée. En SÉLECTION (#5814,
                  question 5), un tap bascule la coche au lieu d'ouvrir le
                  menu (`onRowTap`, gardé côté hook). */}
              {/* `exactOptionalPropertyTypes` (CLAUDE.md racine) : les trois
                  props du menu ne se POSENT que quand elles ont une valeur —
                  un `displayLanguage={undefined}` explicite est refusé au
                  type-check, même discipline que `sendProps` deux blocs plus
                  haut. */}
              {/* PAS d'`aria-selected` (revue #5814) — l'attribut n'existe pas
                  sur `role="article"`, et il était posé DEUX fois (ici et sur
                  la racine de la rangée). L'état de sélection est porté par
                  la COCHE de la rangée : un `role="checkbox"` réel, seul
                  chemin CLAVIER vers la bascule. Le clic sur la rangée
                  ENTIÈRE reste une commodité de souris/doigt. */}
              <div
                data-row={p.message.id}
                tabIndex={0}
                role="article"
                aria-label={rowLabel}
                {...(rowServed.language === '' ? {} : { lang: rowServed.language })}
                {...(rowSelected === undefined ? {} : { onClick: () => onRowTap(p.message.id) })}
                {...longPress}
              >
                {usesFlatRow(mode) ? (
                  <FocalRow
                    mode={mode}
                    place={p}
                    languages={readerLanguages}
                    viewerId={viewerId}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    elected={isElected}
                    expired={expiredIds.has(p.message.id)}
                    onConsumeViewOnce={consume}
                    onEphemeralExpired={onEphemeralExpired}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    onPickLanguage={(code) => onPickLanguage(p.message.id, code)}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    onReact={(emoji) => onReact(p.message.id, emoji)}
                    {...(rowSelected === undefined ? {} : { selected: rowSelected, onToggleSelect: onRowTap })}
                    {...sendProps}
                  />
                ) : (
                  <Bubble
                    place={p}
                    languages={readerLanguages}
                    isGrouped={group}
                    viewerId={viewerId}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    expired={expiredIds.has(p.message.id)}
                    onConsumeViewOnce={consume}
                    onEphemeralExpired={onEphemeralExpired}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    onPickLanguage={(code) => onPickLanguage(p.message.id, code)}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    onReact={(emoji) => onReact(p.message.id, emoji)}
                    {...(rowSelected === undefined ? {} : { selected: rowSelected, onToggleSelect: onRowTap })}
                    {...sendProps}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {typing && typist !== undefined ? (
        /* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
           pas un overlay : il pousse le fil comme le ferait un message, donc
           l'arrivee du vrai message ne fait sauter aucune ligne. */
        <div className="flex items-end gap-1.5 py-1">
          <Avatar initials={initialsOf(typist.displayName)} color={accent} size={18} />
          <span
            className="flex items-center gap-1.5 rounded-chip px-3 py-2"
            style={{ backgroundColor: 'var(--color-ios-card)' }}
          >
            <span className="text-time" style={{ color: 'var(--color-ios-ink-2)' }}>
              {typist.displayName} écrit
            </span>
            <span className="flex gap-[3px]" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-[5px] rounded-full"
                  style={{
                    backgroundColor: 'var(--accent)',
                    animation: 'typingDot 1s ease-in-out infinite',
                    animationDelay: `${i * 0.18}s`,
                  }}
                />
              ))}
            </span>
          </span>
        </div>
      ) : null}
    </>
  );
}
