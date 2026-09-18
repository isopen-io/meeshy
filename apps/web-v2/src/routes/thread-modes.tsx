import { Suspense, lazy, type Ref } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Bubble } from '@/components/bubble';
import { FocalRow } from '@/components/focal-row';
import { SummarySkeleton } from '@/components/summary/summary-skeleton';
import { TypingRosterCell } from '@/components/typing-roster-cell';
import type { ListPaginationState } from '@/lib/lens/pagination';
import type { Conversation, Message } from '@/lib/api/types';
import type { TypingEntry } from '@/lib/api/typing-store';
import type { Viewer } from '@/lib/api/viewer';
import { dayLabel, type PlacedMessage } from '@/lib/grouping';
import type { ConversationEpisode, FaceRampEntry } from '@/lib/summary/types';
import type { useLongPress } from '@/lib/view/long-press';
import { checkStatusOf, isMineOf } from '@/lib/view/message';
import type { LocalDelivery } from '@/lib/view/message';
import { composeMessageLabel } from '@/lib/view/message-a11y-label';
import { isSystemMessage } from '@/lib/view/message-badges';
import { served } from '@/lib/api/prism';
import type { SelectionState } from '@/lib/view/selection';
import { usesFlatRow } from '@/lib/reading-mode/decision';
import { protectionOf } from '@/lib/reading-mode/protection';
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
/**
 * **LA TÊTE DU FIL — LA PAGINATION VERS LE PASSÉ** (#6972).
 *
 * Elle vit AU-DESSUS de la liste virtualisée et HORS d'elle : les `<li>` du
 * `<ol>` sont tous en `position: absolute` et la hauteur du `<ol>` est celle
 * que le virtualiseur calcule — y glisser une rangée de flux fausserait sa
 * géométrie. En frère AVANT le `<ol>` (dont le `margin-block-start: auto`
 * pousse la liste en bas quand le fil est court), elle est exactement au
 * sommet du contenu défilable, là où la sentinelle doit être.
 *
 * ## ELLE FAIT UN PIXEL DANS TOUS LES ÉTATS, ET C'EST LA MOITIÉ DU TRAVAIL
 *
 * La première écriture de ce composant rendait les quatre cas du pied de la
 * Lentille — trois points à `py-4` pendant le chargement, caption +
 * « Réessayer » sur échec. Mais cette bande est AU-DESSUS de ce qu'on lit :
 * grandir de 1 px à 40 px pousse tout le fil de 39 px vers le bas À L'INSTANT
 * où la page part, puis le ramène quand elle arrive. Le lecteur voit son
 * historique sauter DEUX fois pour une page qui s'est chargée correctement —
 * et l'ancrage, qui tient la distance au BAS du contenu, ne peut rien y faire :
 * ce n'est pas l'insertion qui bouge, c'est l'indicateur.
 *
 * Le RETOUR VISIBLE (points de chargement, refus + « Réessayer ») FLOTTE donc
 * au-dessus du défileur, posé par `routes/thread.tsx` en frère absolu de
 * `<main>` — la même doctrine que la pilule de jour et le bouton « revenir en
 * bas » (« un enfant `position: absolute` d'un conteneur qui défile DÉFILE
 * AVEC LUI »). Ici ne reste que la PRISE : un pixel, jamais plus, jamais
 * moins.
 *
 * Le marqueur est posé dans les QUATRE états — y compris `exhausted`, qui ne
 * montre rien. Sans lui, « la sentinelle est désarmée parce que l'historique
 * est épuisé » et « la sentinelle n'a jamais été câblée » rendraient le même
 * DOM, donc le même verdict : un gate vert des deux côtés de la mutation
 * qu'il existe pour mesurer. `data-thread-older` est du même genre que
 * `data-pagination-footer` (`components/lens-pagination-footer.tsx`).
 *
 * `ref` n'est attaché QU'EN `idle` : un observateur posé pendant qu'une page
 * est en vol, ou après un échec, redemanderait la même page en boucle.
 */
function OlderHead({
  state,
  sentinelRef,
}: {
  readonly state: ListPaginationState;
  readonly sentinelRef: Ref<HTMLDivElement>;
}) {
  return (
    <div
      data-thread-older={state}
      aria-hidden
      className="shrink-0"
      style={{ height: 1 }}
      {...(state === 'idle' ? { ref: sentinelRef } : {})}
    />
  );
}

export type ThreadSummaryCapability = {
  readonly conversation: Conversation;
  readonly messages: readonly Message[];
  readonly windowCoversUnread: boolean;
  readonly lang?: string;
  readonly onReplyToPerson: (entry: FaceRampEntry) => void;
  readonly onOpenEpisode: (episode: ConversationEpisode) => void;
  readonly onResumeThread: () => void;
};

export function ThreadModes({
  mode,
  viewer,
  readerLocale,
  summary,
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
  contentWithheld,
  selection,
  onRowTap,
  longPress,
  onPickLanguage,
  onReact,
  typists,
  accent = 'var(--color-ios-brand)',
  older,
}: {
  readonly mode: ConversationReadingMode;
  readonly viewer: Viewer;
  readonly readerLocale: string;
  /**
   * LE RÉSUMÉ VIVANT (#5695), en UNE capacité — ses sept valeurs n'ont aucun
   * sens séparément, et les déclarer une à une obligeait tout hôte à en
   * fournir sept même sans jamais monter ce mode. `undefined` ⇒ la surface
   * n'a pas de résumé à montrer, et le mode `summary` RETOMBE sur le fil (la
   * chose même que le résumé résume) plutôt que de rendre un écran muet.
   */
  readonly summary?: ThreadSummaryCapability;
  // Rangée plate/bulle virtualisée
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
  readonly scene: ThreadScene;
  readonly readerLanguages: readonly string[];
  readonly group: boolean;
  readonly highlightedId: string | null;
  readonly expiredIds: ReadonlySet<string>;
  readonly jumpToMessage: (messageId: string) => void;
  /**
   * ## LES CAPACITÉS SONT OPTIONNELLES, ET UNE CAPACITÉ ABSENTE EST ABSENTE
   *
   * Ce composant est le SEUL du chantier qui rende une liste de messages, et
   * il n'a longtemps eu qu'un hôte : le fil, où tout est interactif. La
   * lecture souveraine de l'administration (#6862) en est un second, en
   * LECTURE PURE — on n'y répond pas, on n'y réagit pas, on n'y consomme
   * surtout pas la vue unique de quelqu'un d'autre.
   *
   * Les fonctions ci-dessous sont donc facultatives AU TYPE plutôt que
   * bouchonnées chez l'appelant. Un bouchon silencieux (`() => {}`) rendrait
   * un contrôle qui a l'air d'exister et ne fait rien — le défaut exact que la
   * loi 4 interdit. Absentes, elles font DISPARAÎTRE le geste de l'arbre
   * rendu : pas de `tabIndex` sans appui long, pas de `onClick` sans
   * sélection, pas de bande de reprise sans accusé local.
   */
  readonly consume?: (messageId: string) => Promise<boolean>;
  readonly onEphemeralExpired?: (messageId: string) => void;
  readonly deliveryOf?: (messageId: string) => LocalDelivery | undefined;
  readonly startedAtOf?: (messageId: string) => number | undefined;
  readonly reasonOf?: (messageId: string) => string | undefined;
  readonly permanentOf?: (messageId: string) => boolean;
  readonly retry?: (messageId: string) => void;
  readonly displayLanguageOf?: (messageId: string) => string | undefined;
  readonly myReactionsOf?: (messageId: string) => readonly string[] | undefined;
  /**
   * LE CONTENU RETENU AU SERVEUR (#6862) — `true` ⇒ la charge ne porte PAS le
   * texte de ce message, et la peau rend sa mention au lieu d'offrir un voile
   * qui ne découvre rien (`ProtectedContent.revealable`). Le verdict vient de
   * la passerelle (`isProtected`) et ne se recalcule pas ici : `protectionOf`
   * ignore le chiffrement, que `messageContentIsProtected` compte.
   */
  readonly contentWithheld?: (messageId: string) => boolean;
  readonly selection?: SelectionState | null;
  readonly onRowTap?: (messageId: string) => void;
  readonly longPress?: ReturnType<typeof useLongPress>;
  readonly onPickLanguage?: (messageId: string, code: string) => void;
  /** Retire une réaction MIENNE en tapant sa capsule (#5865) — même geste
   * que `onPickLanguage`, une seule loi vers `useMessageMenu.onMenuReact`. */
  readonly onReact?: (messageId: string, emoji: string) => void;
  /** LE ROSTER ENTIER (#6171, G1) — `[]` ⇒ aucun frappeur connu ⇒ aucune
   * cellule (`useThreadTyping`, `lib/view/use-thread-typing.ts`). Jamais
   * tronqué à un seul frappeur : `typingAnnouncement`/`typingLead`
   * (`lib/view/typing-roster.ts`) composent le libellé et élisent le meneur
   * ICI, pour que la loi reste PARTAGÉE avec les autres surfaces (bouton
   * « revenir en bas », Rivière). */
  readonly typists: readonly TypingEntry[];
  /** La teinte de la conversation — `--color-ios-brand` à défaut. SEULE la
   * cellule de frappe la lit, et elle ne monte pas sans frappeur : une surface
   * sans temps réel (`typists: []`) n'a donc rien à en dire. */
  readonly accent?: string;
  /**
   * LA PAGINATION VERS LE PASSÉ (#6972) — une CAPACITÉ, comme `summary` : ses
   * trois valeurs n'ont aucun sens séparément, et `undefined` ⇒ la surface ne
   * pagine pas, donc AUCUNE tête n'est montée (la lecture souveraine de
   * l'administration, `routes/admin-conversation-reading.tsx`, sert une page et
   * une seule — lui poser une sentinelle promettrait un historique qu'elle ne
   * sait pas charger : loi 4).
   */
  readonly older?: {
    readonly state: ListPaginationState;
    readonly sentinelRef: Ref<HTMLDivElement>;
  };
}) {
  const viewerId = viewer.id ?? '';

  if (mode === 'summary' && summary !== undefined) {
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
          conversationId={summary.conversation.id}
          messages={summary.messages}
          participants={summary.conversation.participants}
          viewer={viewer}
          windowCoversUnread={summary.windowCoversUnread}
          locale={readerLocale}
          {...(summary.lang !== undefined ? { lang: summary.lang } : {})}
          onReplyToPerson={summary.onReplyToPerson}
          onOpenEpisode={summary.onOpenEpisode}
          onResumeThread={summary.onResumeThread}
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

      {/* LA TÊTE DU FIL (#6972) — AVANT le `<ol>`, donc au sommet du contenu
          défilable : voir le doc-comment d'`OlderHead`. Jamais montée sur un
          fil VIDE : une sentinelle qui intersecte immédiatement sur un écran
          sans rangée déclencherait une rafale de requêtes pour un écran qui
          restera vide (revue-correction #6195, le même défaut sur la
          Lentille). */}
      {older === undefined || placed.length === 0 ? null : (
        <OlderHead state={older.state} sentinelRef={older.sentinelRef} />
      )}

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
          const rowDelivery = deliveryOf?.(p.message.id);
          const rowStartedAt = startedAtOf?.(p.message.id);
          const rowReason = reasonOf?.(p.message.id);
          /* UN REFUS PERMANENT N'OFFRE PAS DE REJEU (revue-correction
             #5813, défaut majeur 2) — 403/401 ne peuvent jamais aboutir en
             rejouant le MÊME appel ; `onRetry` disparaît, la cause reste.
             Hors ligne (`rowReason === undefined`, D-16) n'est jamais
             permanent : `permanentOf` lit `lastError`, absent tant qu'aucun
             appel n'est parti. */
          const rowPermanent = rowDelivery === 'failed' && (permanentOf?.(p.message.id) ?? true);
          const sendProps =
            rowDelivery === undefined
              ? {}
              : {
                  localDelivery: rowDelivery,
                  /* PAS DE REPRISE SANS CAPACITÉ DE REPRISE (#6862) : `retry`
                     absent ⇒ aucun `onRetry`, exactement comme un refus
                     permanent. Le bouton disparaît ; la cause reste affichée.
                     `permanentOf` absent retombe sur « permanent » pour la même
                     raison — fail-closed sur l'affordance, jamais un bouton qui
                     promet un rejeu que l'hôte ne sait pas jouer. */
                  ...(rowPermanent || retry === undefined ? {} : { onRetry: () => retry(p.message.id) }),
                  ...(rowStartedAt === undefined ? {} : { sendStartedAt: rowStartedAt }),
                  ...(rowReason === undefined ? {} : { sendFailureReason: rowReason }),
                };
          /* LE MENU DU MESSAGE (#5814) — trois lectures par rangée, motif
             `rowDelivery` ci-dessus : Traduire (langue explorée pour CE
             message), « la mienne » (réactions), et l'état de sélection. */
          const rowDisplayLanguage = displayLanguageOf?.(p.message.id);
          const rowMyReactions = myReactionsOf?.(p.message.id);
          const rowSelected =
            selection === null || selection === undefined ? undefined : selection.ids.includes(p.message.id);
          /* Le verdict SERVI, jamais recalculé (voir la prop). */
          const rowWithheld = contentWithheld?.(p.message.id) ?? false;
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
          /* LA PROTECTION GOUVERNE LE LIBELLÉ (revue #5774) — la MÊME loi et
             le MÊME `expiredIds` que les deux peaux consomment plus bas
             (`FocalRow`/`Bubble`, `expired={expiredIds.has(...)}`) : sans
             elle, `aria-label` annonçait EN CLAIR le texte que la rangée
             floute ou remplace par un tombstone. */
          const rowProtection = expiredIds.has(p.message.id) ? 'expired' : protectionOf(p.message, Date.now());
          const rowLabel = composeMessageLabel({
            message: p.message,
            isMine: isMineOf(p.message, viewerId),
            servedText: rowServed.text,
            delivery: checkStatusOf(p.message, rowDelivery),
            protection: rowProtection,
            contentWithheld: rowWithheld,
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
                    className="glass glass-card rounded-chip px-3 py-1 text-time font-semibold"
                    style={{
                      color: 'var(--color-day-ink)',
                      border: '0.5px solid var(--color-day-hairline)',
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
              {/* UN MESSAGE SYSTÈME NE PORTE NI `data-row`, NI `tabIndex`, NI
                  LES GESTIONNAIRES D'APPUI LONG (revue-correction #5936,
                  défaut BLOQUANT 4) — `data-row` est l'ANCRE que
                  `useMessageMenu.openMenuFor` lit (`anchor.element.dataset
                  .row`) et le CANDIDAT d'élection de la scène (§ doc-comment
                  ci-dessus) : sans lui, aucun des deux n'atteint une rangée
                  système, exactement comme iOS délègue les rangées système à
                  `FocalSystemRows.view(…)`, jamais au menu de message
                  (`FocalRow.swift:131-141`). Un appui long y ouvrait le MÊME
                  menu « 😂 ❤️ 👍 😮 😢 🔥 ＋ · Sélectionner · Copier ·
                  Composer · Plus… » qu'une prise de parole — dont AUCUN
                  bouton n'avait d'effet (loi 4 prise en défaut : « un
                  contrôle existe s'il a un EFFET »). Le geste propre à un
                  résumé d'appel (détail d'appel, iOS) reste HORS tranche —
                  ce lot fait seulement SORTIR les rangées système de la
                  surface de gestes du message. `isSystemMessage` est le
                  SITE UNIQUE de cette loi (`lib/view/message-badges.ts`),
                  déjà consommé par `systemRowOf`/`composeMessageLabel`. */}
              {/* `tabIndex` ET les gestionnaires d'appui long vont ENSEMBLE
                  (#6862) : un `tabIndex={0}` sans geste est une halte de
                  tabulation qui n'ouvre rien — le clavier s'arrêterait sur
                  chaque rangée pour ne rien pouvoir faire. `data-row` reste
                  posé sans eux : c'est aussi le CANDIDAT d'élection de la
                  scène, qui n'a besoin d'aucun geste. */}
              <div
                {...(isSystemMessage(p.message) ? {} : { 'data-row': p.message.id })}
                {...(isSystemMessage(p.message) || longPress === undefined ? {} : { tabIndex: 0, ...longPress })}
                role="article"
                aria-label={rowLabel}
                {...(rowServed.language === '' ? {} : { lang: rowServed.language })}
                {...(rowSelected === undefined || onRowTap === undefined
                  ? {}
                  : { onClick: () => onRowTap(p.message.id) })}
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
                    revealable={!rowWithheld}
                    {...(consume === undefined ? {} : { onConsumeViewOnce: consume })}
                    {...(onEphemeralExpired === undefined ? {} : { onEphemeralExpired })}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    {...(onPickLanguage === undefined
                      ? {}
                      : { onPickLanguage: (code: string) => onPickLanguage(p.message.id, code) })}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    {...(onReact === undefined ? {} : { onReact: (emoji: string) => onReact(p.message.id, emoji) })}
                    {...(rowSelected === undefined || onRowTap === undefined
                      ? {}
                      : { selected: rowSelected, onToggleSelect: onRowTap })}
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
                    revealable={!rowWithheld}
                    {...(consume === undefined ? {} : { onConsumeViewOnce: consume })}
                    {...(onEphemeralExpired === undefined ? {} : { onEphemeralExpired })}
                    {...(rowDisplayLanguage === undefined ? {} : { displayLanguage: rowDisplayLanguage })}
                    {...(onPickLanguage === undefined
                      ? {}
                      : { onPickLanguage: (code: string) => onPickLanguage(p.message.id, code) })}
                    {...(rowMyReactions === undefined ? {} : { myReactions: rowMyReactions })}
                    {...(onReact === undefined ? {} : { onReact: (emoji: string) => onReact(p.message.id, emoji) })}
                    {...(rowSelected === undefined || onRowTap === undefined
                      ? {}
                      : { selected: rowSelected, onToggleSelect: onRowTap })}
                    {...sendProps}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
          pas un overlay : il pousse le fil comme le ferait un message, donc
          l'arrivee du vrai message ne fait sauter aucune ligne. Extraite dans
          `components/typing-roster-cell.tsx` (#6171, G1) — le ROSTER ENTIER,
          jamais le seul premier frappeur ; doc-comment complet là-bas.
          `flat` (revue-correction #6171, défaut 4) — SEUL site de montage :
          Focal/Script (le mode PAR DÉFAUT, D-7) rendent la pastille + les
          trois points SANS capsule ni libellé visible, miroir
          `TypingIndicatorBubble(isFlat: readingMode != .bubbles)`. */}
      <TypingRosterCell typists={typists} accent={accent} flat={usesFlatRow(mode)} />
    </>
  );
}
