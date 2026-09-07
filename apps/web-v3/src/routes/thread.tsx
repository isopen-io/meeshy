import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { Avatar } from '@/components/avatar';
import { Bubble } from '@/components/bubble';
import { Composer } from '@/components/composer';
import { FocalRow } from '@/components/focal-row';
import { Glyph } from '@/components/glyph';
import { ReadingModeChip } from '@/components/reading-mode-chip';
import { CONVERSATIONS, PARTICIPANTS, VIEWER_ID, messagesOf } from '@/lib/api/fixtures';
import type { Message } from '@/lib/api/types';
import { accentOf, withAccent } from '@/lib/accent';
import { initialsOf, isGroup, peerOf, presenceOf, titleOf, unreadOf } from '@/lib/view/conversation';
import { useParams } from '@/lib/router';
import { dayLabel, place } from '@/lib/grouping';
import { Link } from '@/routes/route-table';
import { READER_LANGUAGES } from '@/lib/reader';
import { useOnline } from '@/lib/net/online';
import type { LocalDelivery } from '@/lib/view/message';
import { menuRows } from '@/lib/reading-mode/catalog';
import {
  resolveThreadMode,
  threadCapabilities,
  toStickyPreference,
  usesFlatRow,
} from '@/lib/reading-mode/decision';
import { readingModeStore } from '@/lib/reading-mode/store';
import { useThreadPerspective } from '@/lib/reading-mode/scene';

/**
 * LE SCOPE DU MAGASIN DE MODE DE LECTURE — `'local'` tant qu'aucune session
 * n'existe (#5555, D-13 : le scope prend un `userId` sans que ce fichier ni
 * `store.ts` ne bougent). C'est la même clé pour tout visiteur de CETTE
 * WebView tant que la session n'est pas branchée — acceptable ici (POC de
 * fixtures), à corriger par le lot `staging`.
 */
const READING_MODE_SCOPE = 'local';

/**
 * LE FIL.
 *
 * L'en-tete FLOTTE au-dessus des messages (il n'y a aucune barre de navigation
 * systeme dans l'app iOS) et se REPLIE : au repos il ne montre que le retour,
 * la grappe d'actions et l'avatar ; taper l'avatar DEPLIE le titre et les
 * etiquettes. La bande depliee ne porte AUCUNE action — c'est un arbitrage
 * iOS explicite, et il tient : deux etats, deux roles.
 *
 * Le bouton de retour porte le compte de non-lus des AUTRES conversations.
 */
export default function ThreadScreen() {
  const { conversation: id } = useParams<'/c/$conversation'>();
  const conversation = CONVERSATIONS.find((c) => c.id === id) ?? CONVERSATIONS[0]!;
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>(() => messagesOf(id));
  const [typing] = useState(true);
  const online = useOnline();

  /**
   * L'ÉTAT LOCAL D'UN ENVOI — à CÔTÉ du domaine, jamais dedans.
   *
   * « en attente » et « échoué » ne sont pas des champs de `Message` : le
   * serveur ne les sert pas, il ne les connaît même pas. Ce sont des états de
   * CE client, pour CE message, jusqu'à ce que le transport tranche. Les
   * graver dans la charge en ferait des données, et une charge remise à un
   * autre lecteur porterait un « échec » qui n'est pas le sien.
   */
  const [localDelivery, setLocalDelivery] = useState<ReadonlyMap<string, LocalDelivery>>(new Map());
  const setDelivery = (messageId: string, state: LocalDelivery) =>
    setLocalDelivery((previous) => new Map(previous).set(messageId, state));

  const otherUnread = CONVERSATIONS.filter((c) => c.id !== conversation.id).reduce(
    (total, c) => total + unreadOf(c),
    0,
  );
  const placed = place(messages);
  const group = isGroup(conversation);

  /**
   * LE MODE DE LECTURE (#5566) — la LOI vit dans `@meeshy/shared`
   * (`decision.ts` ne fait que la consommer avec le catalogue de cet écran,
   * D-14) ; le CHOIX COLLANT vit dans `readingModeStore`, scopé
   * `(lecteur, conversation)`.
   *
   * `stickyMode` est un ÉTAT REACT qui MIROITE le magasin (comme
   * `@Published mode` du contrôleur iOS) : le magasin est la source de
   * vérité PERSISTANTE, l'état ne sert qu'à faire re-rendre l'écran quand la
   * sélection change.
   */
  const [stickyMode, setStickyMode] = useState<ConversationReadingMode | null>(() =>
    readingModeStore.getPreference(READING_MODE_SCOPE, conversation.id),
  );
  /**
   * Figés à l'OUVERTURE (comme l'`init` du contrôleur iOS) : la branche
   * d'absence de la loi lit l'INSTANT de l'ouverture, pas un instant qui
   * recule à chaque rendu tant que l'écran reste monté.
   *
   * INITIALISEURS PARESSEUX, et ce n'est pas un détail de style : le
   * virtualiseur re-rend CET écran à chaque image de défilement. Écrits
   * `useRef(new Date())` / `useRef(store.lastOpenedAt(…))`, l'argument est
   * évalué à CHAQUE rendu — une `Date` allouée et une lecture de magasin par
   * image, pour une valeur que `useRef` jette aussitôt.
   */
  const [openedAt] = useState(() => new Date());
  const [lastOpenedAt] = useState(() => readingModeStore.lastOpenedAt(READING_MODE_SCOPE, conversation.id));
  useEffect(() => {
    readingModeStore.noteOpened(READING_MODE_SCOPE, conversation.id, openedAt);
    // Volontairement sur la seule CONVERSATION : ouvrir une fois par visite
    // de cet écran, jamais à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  /**
   * MÉMORISÉS, parce que le virtualiseur re-rend cet écran à chaque image de
   * défilement : sans `useMemo`, la loi, les capacités et les CINQ lignes du
   * menu (objets neufs, libellés interpolés) étaient reconstruites soixante
   * fois par seconde pour un menu fermé. C'est aussi le motif que copieront
   * les surfaces à venir — il doit être juste maintenant.
   */
  const readingDecision = useMemo(
    () =>
      resolveThreadMode({
        unreadCount: unreadOf(conversation),
        lastOpenedAt,
        now: openedAt,
        sticky: toStickyPreference(stickyMode),
        // La v3.1 n'a pas encore de session (#5555) : tout lecteur est traité
        // en INSCRIT. Sans effet observable ici — `summary`, le seul mode que
        // la loi retire à un invité, est déjà hors du catalogue de rendu du
        // web — mais c'est ce paramètre que le lot `staging` devra brancher.
        isAnonymous: false,
        conversationType: conversation.type,
      }),
    [conversation, lastOpenedAt, openedAt, stickyMode],
  );
  const readingCapabilities = useMemo(
    () => threadCapabilities({ isAnonymous: false, conversationType: conversation.type }),
    [conversation.type],
  );
  const readingMenuRows = useMemo(
    () =>
      menuRows({
        availableModes: readingCapabilities.availableModes,
        riverEligibilityReason: readingCapabilities.riverEligibilityReason,
        currentMode: readingDecision.mode,
      }),
    [readingCapabilities, readingDecision.mode],
  );
  const currentRow = readingMenuRows.find((row) => row.mode === readingDecision.mode);
  const selectReadingMode = (mode: ConversationReadingMode) => {
    readingModeStore.setPreference(READING_MODE_SCOPE, conversation.id, mode);
    setStickyMode(mode);
  };
  const resetReadingModeToAuto = () => {
    readingModeStore.setPreference(READING_MODE_SCOPE, conversation.id, null);
    setStickyMode(null);
  };

  /**
   * LA VIRTUALISATION DU FIL — la seule chose qui tienne un fil de cinq cents
   * messages sur une WebView Android d'entrée de gamme (#5446).
   *
   * Sans elle, cinq cents bulles sont cinq cents sous-arbres montés, mesurés et
   * repeints à chaque défilement. Le symptôme n'est pas une erreur : c'est un
   * fil qui met deux secondes à s'ouvrir puis saccade — exactement la lenteur
   * que la charte du dépôt classe comme un BUG, pas comme une dette.
   *
   * `measureElement` plutôt qu'une hauteur fixe : les bulles n'ont PAS de
   * hauteur commune (un mot contre un paragraphe, une image, un vocal, un
   * séparateur de jour porté par la cellule). Une estimation fixe ferait sauter
   * la barre de défilement à chaque mesure réelle — le défaut le plus visible
   * d'une virtualisation naïve, et celui qu'un banc de bulles identiques ne
   * révèle jamais.
   *
   * Le positionnement est un `translateY`, jamais un `top` : la même discipline
   * que la Lentille — seuls `transform` et `opacity` bougent.
   */
  const scroller = useRef<HTMLElement | null>(null);
  const virtualizer = useVirtualizer({
    count: placed.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 88,
    overscan: 6,
    getItemKey: (index) => placed[index]?.message.id ?? index,
  });

  /**
   * LA PERSPECTIVE DU MODE FOCAL (#5566, correction de revue, défauts 1/5) —
   * réservée au mode `focal` (jamais `script`, « densité uniforme, zéro
   * perspective » côté iOS) : une passe d'AFFICHAGE hors React
   * (`reading-mode/scene.ts`), sur les rangées `[data-row]` actuellement
   * montées par le virtualiseur.
   */
  useThreadPerspective(scroller, readingDecision.mode === 'focal');

  /**
   * LE SAUT DE CITATION (#5566, défaut 10) — le bouton de citation promettait
   * une navigation par son nom accessible et ne faisait rien. `scrollToIndex`
   * amène le message cité dans la fenêtre virtualisée ; la mise en évidence
   * s'efface d'elle-même, jamais un état qui s'accumule sans fin.
   */
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpToMessage = (messageId: string) => {
    const index = placed.findIndex((p) => p.message.id === messageId);
    if (index === -1) return;
    virtualizer.scrollToIndex(index, { align: 'center' });
    setHighlightedId(messageId);
    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
  };
  useEffect(() => () => {
    if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
  }, []);

  /**
   * UN FIL S'OUVRE EN BAS. Sur le dernier message, pas sur le premier — et
   * `align: 'end'` plutôt qu'un `scrollTop = scrollHeight`, qui serait faux
   * tant que les hauteurs réelles ne sont pas mesurées.
   */
  const count = placed.length;
  useEffect(() => {
    const el = scroller.current;
    if (el === null || count === 0) return;

    /**
     * UN SEUL `scrollToIndex` NE SUFFIT PAS, et c'est mesuré : il vise le bas
     * d'une hauteur ESTIMÉE, puis les cellules réellement montées se mesurent
     * et la hauteur totale change sous lui. Le témoin voyait alors un fil
     * « en bas » où le dernier message n'était pas rendu.
     *
     * On se RÉ-ANCRE donc sur quelques images, le temps que les mesures
     * convergent — et on abandonne à la PREMIÈRE intention de l'utilisateur.
     * Sans ce désarmement, remonter son historique dans la demi-seconde qui
     * suit l'ouverture serait impossible : le fil reviendrait en bas sous le
     * doigt, ce qui est pire que de s'ouvrir au mauvais endroit.
     */
    let armed = true;
    let frames = 0;
    let raf = 0;
    const release = () => {
      armed = false;
    };
    const pin = () => {
      if (!armed) return;
      el.scrollTop = el.scrollHeight;
      if (++frames < 20) raf = requestAnimationFrame(pin);
    };
    raf = requestAnimationFrame(pin);
    for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
      el.addEventListener(event, release, { passive: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
        el.removeEventListener(event, release);
      }
    };
    // Volontairement sur le seul COMPTE : se ré-ancrer à chaque rendu
    // empêcherait l'utilisateur de remonter son historique.
  }, [count]);
  const title = titleOf(conversation, VIEWER_ID);
  const accent = accentOf(conversation);
  const viewer = PARTICIPANTS.find((p) => p.userId === VIEWER_ID);

  const send = (text: string) => {
    /**
     * OPTIMISTIC UPDATE : le message apparait AVANT le reseau, en etat
     * « en-attente ». C'est non negociable sur la 3G visee — attendre l'accuse
     * du serveur avant de peindre ferait un composeur qui semble ne rien faire
     * pendant deux secondes.
     */
    const now = new Date();
    const localId = `local-${now.getTime()}`;
    /**
     * `navigator.onLine === false` est FIABLE : le système sait qu'aucune
     * interface n'est disponible. On marque donc l'échec TOUT DE SUITE plutôt
     * que de laisser une horloge tourner sur un envoi qui ne partira pas —
     * c'est la différence entre une application qui dit la vérité et une qui
     * fait semblant, et sur le réseau visé c'est le cas nominal.
     *
     * En ligne, l'état reste « en attente » : sans transport (#5493), aucune
     * confirmation n'existe, et peindre « remis » serait un mensonge. Le
     * manque se VOIT plutôt que de se cacher.
     */
    setDelivery(localId, online ? 'pending' : 'failed');
    setMessages((previous) => [
      ...previous,
      {
        id: localId,
        conversationId: conversation.id,
        senderId: VIEWER_ID,
        ...(viewer === undefined ? {} : { sender: viewer }),
        content: text,
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        // Rien n'est encore parti : `deliveredCount` à 0 est ce que
        // `deliveryOf` lit comme « en attente », sans champ inventé.
        deliveredCount: 0,
        readCount: 0,
        reactionCount: 0,
        isEncrypted: false,
        translations: [],
        createdAt: now,
        timestamp: now,
      },
    ]);
  };

  /**
   * LA REPRISE. Elle ne PROMET rien : elle remet le message en attente si le
   * réseau est revenu, et le laisse en échec sinon. Un bouton « Réessayer »
   * qui repasse en « en attente » alors que l'appareil est toujours coupé
   * ferait tourner une horloge pour rien — l'utilisateur croirait que ça part.
   */
  const retry = (messageId: string) => setDelivery(messageId, online ? 'pending' : 'failed');

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu. */
    <div className="flex h-dvh flex-col overflow-hidden" style={withAccent(accent)}>
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
              {/* LE CHIP DE MODE — clic ouvre le menu (§1.7 : écart assumé vs
                  iOS, voir `reading-mode-chip.tsx`). Dans la grappe d'action,
                  comme prescrit par la spécification #5566. */}
              <ReadingModeChip
                label={currentRow?.title ?? ''}
                isAuto={readingDecision.reason !== 'sticky'}
                rows={readingMenuRows}
                onSelect={selectReadingMode}
                onAuto={resetReadingModeToAuto}
              />
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
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
            className="shrink-0"
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              {...(group ? {} : { presence: presenceOf(peerOf(conversation, VIEWER_ID)) })}
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
            Hors ligne — vos messages partiront à la reconnexion
          </p>
        )}
      </header>

      <main
        id="contenu"
        ref={scroller}
        /*
          PAS de `justify-end` ici, et c'est mesuré : avec
          `justify-content: flex-end`, un enfant plus haut que le conteneur
          déborde par le HAUT — et ce débordement-là n'est PAS atteignable au
          défilement. Relevé : un `<ol>` de 46 175 px dans un `<main>` dont
          `scrollHeight` valait 708, exactement sa hauteur visible. Le fil
          entier était injoignable, sans la moindre erreur.
          L'ancrage en bas se fait donc par `margin-block-start: auto` sur la
          liste : même effet quand le contenu est court, et un débordement
          normal quand il est long.
        */
        className="flex flex-1 flex-col overflow-y-auto px-3.5 pt-2 pb-2"
      >
        {/*
          `flexShrink: 0` n'est PAS une précaution : `<main>` est un conteneur
          flex, et un enfant de hauteur explicite y est COMPRIMÉ dès que la
          somme dépasse la place. Mesuré sans lui : 2 137 px de contenu pour
          cinq cents messages — la liste tenait dans un écran, le fil ne
          pouvait plus s'ancrer en bas, et rien n'avait l'air cassé puisque les
          cellules se rendaient. C'est le MÊME défaut que la Lentille avait
          payé sur ses rangées ; il est venu deux fois parce qu'il ne se voit
          ni au type-check ni à l'œil, seulement à la mesure.
        */}
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
                    {dayLabel(p.message.createdAt)}
                  </span>
                </div>
              ) : null}
              {/* LE MODE DE LECTURE (#5566) : `focal`/`script` rendent la
                  rangée plate, `bubbles` reste la bulle historique — D-7,
                  D-8. `data-row` est la cible de `useThreadPerspective` —
                  posé sur CHAQUE rangée, il est inerte hors du mode focal
                  (l'effet n'est jamais activé). */}
              <div data-row={p.message.id}>
                {usesFlatRow(readingDecision.mode) ? (
                  <FocalRow
                    mode={readingDecision.mode}
                    place={p}
                    languages={READER_LANGUAGES}
                    viewerId={VIEWER_ID}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    {...(localDelivery.has(p.message.id)
                      ? {
                          localDelivery: localDelivery.get(p.message.id) as LocalDelivery,
                          onRetry: () => retry(p.message.id),
                        }
                      : {})}
                  />
                ) : (
                  <Bubble
                    place={p}
                    languages={READER_LANGUAGES}
                    isGrouped={group}
                    viewerId={VIEWER_ID}
                    onJumpToMessage={jumpToMessage}
                    highlighted={highlightedId === p.message.id}
                    {...(localDelivery.has(p.message.id)
                      ? {
                          localDelivery: localDelivery.get(p.message.id) as LocalDelivery,
                          onRetry: () => retry(p.message.id),
                        }
                      : {})}
                  />
                )}
              </div>
            </li>
            );
          })}
        </ol>

        {typing ? (
          /* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
             pas un overlay : il pousse le fil comme le ferait un message, donc
             l'arrivee du vrai message ne fait sauter aucune ligne. */
          <div className="flex items-end gap-1.5 py-1">
            <Avatar initials="AD" color={accent} size={18} />
            <span
              className="flex items-center gap-1.5 rounded-chip px-3 py-2"
              style={{ backgroundColor: 'var(--color-ios-card)' }}
            >
              <span className="text-time" style={{ color: 'var(--color-ios-ink-2)' }}>
                Amina écrit
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
      </main>

      <div className="shrink-0">
        <Composer onSend={send} />
      </div>
    </div>
  );
}
