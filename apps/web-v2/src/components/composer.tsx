import { Suspense, lazy, useEffect, useRef, useState } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { Glyph } from './glyph';
import type { ComposerNotice } from './composer-tray';
import {
  acceptPendingFiles,
  addPendingAttachment,
  mayAttach,
  removePendingAttachment,
  type PendingAttachment,
} from '@/lib/send/attachments';
import { releasePreviewUrl } from '@/lib/send/attachment-preview-url';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { recordingSupported, useRecorder } from '@/lib/view/use-recorder';

/**
 * LE COMPOSEUR.
 *
 * Trois partis d'iOS qu'on ne devine pas :
 *
 * 1. Le MICRO est DANS le champ, a gauche, et DISPARAIT des que le champ prend
 *    le focus. Il ne prend donc aucune place au moment ou l'on ecrit, et reste
 *    a portee immediate quand on hesite.
 * 2. Le bouton d'envoi est INVISIBLE quand il n'y a rien a envoyer
 *    (`opacity: 0`), jamais grise — et sa place est occupee par DEUX emojis
 *    d'envoi rapide. L'emplacement passe donc de 44 a 96 px de large. Griser
 *    un bouton, c'est montrer une porte fermee ; iOS montre une autre porte.
 * 3. Le fond du composeur est TRANSPARENT (aucun materiau, decision #3920) :
 *    ce sont les bandeaux et le champ qui portent leur propre fond.
 *
 * #5668 — LES PIÈCES JOINTES, LE VOCAL ET LE TIROIR. Le panneau
 * (Photos/Fichier/Vocal), la bande d'aperçu, la barre d'enregistrement et la
 * bande de refus micro vivent dans `./composer-tray` — CHARGÉ À LA DEMANDE
 * (`lazy()`), jamais dans le chunk du fil (§ 7 de la spécification #5668).
 * Ce fichier possède l'ÉTAT (`pending`, `panelOpen`, `useRecorder()`) ;
 * `ComposerTray` ne fait que le RENDRE.
 */

const ComposerTray = lazy(() => import('./composer-tray'));

/**
 * LES DEUX EMOJIS D'ENVOI RAPIDE — la TÊTE de la liste que le dépôt tient
 * déjà (`QUICK_REACTIONS`, `lib/view/message-actions.ts`, miroir
 * `MessageOverlayMenu.swift:99-101`), jamais une seconde liste : elle était
 * écrite ici en dur et avait déjà DIVERGÉ (`['👍','❤️']` au lieu des
 * `['😂','❤️']` que `quickSendDefaultEmojis` sert en tête,
 * `UniversalComposerBar+Send.swift:198-202`).
 *
 * iOS classe ces deux-là par USAGE (`EmojiUsageTracker.topEmojis(count: 2,
 * defaults:)`) ; le dépôt a explicitement tranché « jamais un classement par
 * usage ce lot » pour le rail du menu (`message-actions.ts:77`), et ce lot-ci
 * s'y tient : ce sont les DEUX PREMIERS de la liste, c'est-à-dire le défaut
 * d'iOS avant toute mesure d'usage.
 */
const QUICK_EMOJIS = QUICK_REACTIONS.slice(0, 2);

export function Composer({
  onSend,
  onTextChange,
  replyTo,
  onCancelReply,
  rights,
}: {
  onSend: (payload: { text: string; attachments: readonly PendingAttachment[] }) => void;
  /**
   * LA SORTIE DE FRAPPE (#5793) — appelée à CHAQUE changement du champ
   * (texte courant, ou `''` juste après un envoi) : `thread.tsx` la branche
   * sur `useTypingEmitter`, qui décide seul du débounce et du keepalive
   * (`typing:start`/`stop`, miroir `ConversationSocketHandler.swift:284-292`).
   * Ce composant n'a AUCUNE règle de frappe — il se contente de RAPPORTER
   * le texte, motif `onSend` : la RÈGLE vit chez l'appelant.
   */
  onTextChange?: (text: string) => void;
  /**
   * LA CITATION PRÉ-ADRESSÉE — `language` est la LANGUE DANS LAQUELLE
   * `excerpt` EST SERVI (`served().language`, jamais la langue d'origine du
   * message). Sans elle, un extrait résolu par le Prisme se prononcerait avec
   * la voix du DOCUMENT : le défaut du cycle 122 du `CLAUDE.md` — un résolveur
   * qui élit le bon texte n'a corrigé personne tant que ce qu'il élit n'est
   * pas ANNONCÉ à qui l'affiche. `bubble.tsx:180` et `focal-row.tsx:263`
   * posent déjà `lang={rendered.language}` pour la même raison.
   */
  replyTo?: { author: string; excerpt: string; language?: string };
  onCancelReply?: () => void;
  /** #5668 — les droits d'envoi du LECTEUR (`Participant.permissions`) : une
   * tuile du tiroir ne se rend que si son geste a un effet (loi 4). Absent ⇒
   * tout est autorisé (aucun participant chargé encore). */
  rights?: ParticipantPermissions;
}) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [pending, setPending] = useState<readonly PendingAttachment[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  /** LA DERNIÈRE CAUSE DE REFUS D'UN FICHIER (droit, taille, nombre) —
   * `null` quand il n'y en a pas. Le refus du MICRO, lui, vit dans l'état du
   * hook : les deux se rendent au MÊME endroit (`ComposerNotice`). */
  const [fileRefusal, setFileRefusal] = useState<string | null>(null);
  const recorder = useRecorder();
  const field = useRef<HTMLTextAreaElement>(null);
  const sendTarget = text.trim().length > 0 || pending.length > 0;
  const hasReply = replyTo !== undefined;
  const isRecording = recorder.state.status === 'recording';

  /**
   * LOI 4 SUR LE MICRO DE LA RANGÉE (revue-correction #5668) — il n'était
   * gardé par RIEN, alors que la tuile « Vocal » du tiroir l'était déjà :
   * un participant ANONYME, dont les droits par défaut posent
   * `canSendAudios: false` (`@meeshy/shared/types/participant.ts § DEFAULT_ANONYMOUS_PERMISSIONS`),
   * voyait donc une porte que la passerelle allait refuser en 403
   * (`MessagingService.ts:284-298`) — après avoir téléversé l'audio. Et sans
   * `MediaRecorder`/`getUserMedia` (contexte non sécurisé, navigateur
   * ancien), la porte ne mène nulle part : la spécification #5668 § 0 dit
   * « le micro n'est PAS rendu ». Les deux gardes sont la MÊME question.
   */
  const canRecord = recordingSupported() && mayAttach(rights, 'audio/*');
  const canAttachAnything =
    canRecord || mayAttach(rights, 'image/*') || mayAttach(rights, 'application/octet-stream');

  const notice: ComposerNotice | null =
    fileRefusal !== null
      ? { message: fileRefusal, onDismiss: () => setFileRefusal(null) }
      : recorder.state.status === 'refused'
        ? {
            /* « dans les réglages », sans dire LESQUELS (revue-correction,
               mesuré sur la coque Android : la permission y est celle de
               l'APPLICATION, pas du navigateur — la copie « réglages du
               navigateur » envoyait le lecteur au mauvais endroit sur deux
               des trois plateformes). */
            message: 'Micro refusé — autorisez-le dans les réglages',
            onRetry: () => recorder.start(),
            onDismiss: recorder.reset,
          }
        : recorder.state.status === 'unsupported'
          ? { message: 'Micro indisponible sur ce navigateur', onDismiss: recorder.reset }
          : null;

  const showAbove = pending.length > 0 || notice !== null;

  /**
   * « COMPOSER » MET LE CURSEUR DANS LE CHAMP (revue #5814, défaut majeur
   * 8) — `useMessageMenu.onMenuAction('compose')` pose `focusTakenRef.current
   * = true` sur la PROMESSE que quelqu'un prend le focus ; mesuré,
   * `document.activeElement` valait BODY après ce geste, contrairement à
   * iOS (`ConversationView+LongPressMenu.swift`,
   * `restoreStateAfterLongPressIfNeeded`). La citation est ARMÉE (`replyTo`
   * devient défini) exactement quand ce geste a eu lieu : c'est donc la
   * TRANSITION indéfini → défini qui focalise, jamais chaque rendu où
   * `replyTo` reste défini (l'objet est reconstruit à chaque rendu de
   * l'hôte, `thread.tsx` — une dépendance sur SA RÉFÉRENCE volerait le
   * focus en boucle).
   */
  useEffect(() => {
    if (hasReply) field.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement la TRANSITION, pas l'identité de `replyTo` (voir le doc-comment).
  }, [hasReply]);

  const resetAfterSend = (opts?: { readonly keepFocus: boolean }) => {
    setText('');
    onTextChange?.('');
    setPending([]);
    setPanelOpen(false);
    if (field.current) {
      field.current.style.height = 'auto';
      /* LE CHAMP GARDE LE FOCUS APRÈS UN ENVOI AU DOIGT — MAIS SEULEMENT
         S'IL L'AVAIT DÉJÀ (revue-correction #5813 défaut majeur 8, puis
         défaut 9 de la revue #5668) — le geste NOMINAL sur téléphone, texte
         tapé puis envoyé. Sans ce rappel, le `<button>` d'envoi prenait le
         focus (la touche Entrée, elle, ne le perd jamais : le champ reste
         la cible de l'événement), le clavier se refermait, le micro se
         remontait et le champ RÉTRÉCISSAIT sous le doigt.
         Ce rappel était INCONDITIONNEL (#5668, défaut 9) : sur le chemin
         VOCAL (`sendRecordingNow`) ou un envoi de photo SANS avoir touché
         le champ, l'utilisateur n'avait JAMAIS eu le focus dessus — le
         reprendre ouvrait le clavier et faisait DISPARAÎTRE le micro de la
         rangée (`canRecord && !focused`), pour un geste qu'il n'avait pas
         demandé. iOS ne pose JAMAIS `isTyping = true` à l'envoi
         (`ConversationView.swift:314`, aucun site de `sendMessageWithAttachments`
         ne le repose) : le focus y reste ce qu'il ÉTAIT. `keepFocus` est
         l'état du champ CAPTURÉ par `send()` avant l'envoi, jamais deviné
         ici. */
      if (opts?.keepFocus) field.current.focus();
    }
  };

  const send = (value: string, attachments: readonly PendingAttachment[] = pending) => {
    const own = value.trim();
    if (!own && attachments.length === 0) return;
    const keepFocus = document.activeElement === field.current;
    onSend({ text: own, attachments });
    resetAfterSend({ keepFocus });
  };

  /** LA TUILE « PHOTOS »/« FICHIER » (`<input type="file">`, `composer-tray.tsx`)
   * AJOUTE À LA SÉLECTION, ne la remplace jamais — un second tap ajoute une
   * seconde pièce, jamais un remplacement silencieux. Ce qui est ÉCARTÉ (droit,
   * taille, nombre) est DIT (`acceptPendingFiles`, `send/attachments.ts`) :
   * un fichier qui disparaît sans un mot est le pire des deux mondes. */
  const addFiles = (files: FileList | null) => {
    if (files === null || files.length === 0) return;
    const outcome = acceptPendingFiles({
      current: pending,
      files: Array.from(files),
      ...(rights === undefined ? {} : { rights }),
    });
    setFileRefusal(outcome.refusal ?? null);
    setPending(outcome.list);
    setPanelOpen(false);
  };

  /**
   * RETIRER UNE PIÈCE AVANT L'ENVOI EST LE SEUL GESTE QUI SAIT QUE SON URL
   * NE SERT PLUS JAMAIS (défaut 7, revue #5668) — cette pièce ne deviendra
   * JAMAIS l'attachement d'une bulle optimiste, donc rien d'autre ne
   * référencera `previewUrlFor(localId, …)` : la révoquer ICI, et nulle
   * part ailleurs, est sans risque.
   */
  const removeAttachment = (localId: string) => {
    releasePreviewUrl(localId);
    setPending((prev) => removePendingAttachment(prev, localId));
  };

  /** ARRÊTER → JOINDRE — place le vocal dans le tiroir, la composition
   * continue (miroir `stopRecordingToAttachment`, `+AttachmentHandlers.swift:107-114`). */
  const stopRecordingToTray = () => {
    void recorder.stop().then((attachment) => {
      if (attachment !== null) setPending((prev) => addPendingAttachment(prev, attachment));
    });
  };

  /** ENVOYER (barre d'enregistrement) — termine l'enregistrement puis envoie
   * TOUT ce que le composeur porte (texte + tiroir + ce vocal), un seul
   * geste, comme `sendRecording` (`+AttachmentHandlers.swift:123-143`). */
  const sendRecordingNow = () => {
    void recorder.stop().then((attachment) => {
      const attachments = attachment === null ? pending : addPendingAttachment(pending, attachment);
      send(text, attachments);
    });
  };

  return (
    /* `data-composer` — l'ANCRE du gate (`check-thread-states.mjs § 7`, « 0
       contrôle sans gestionnaire »), même convention que `data-row` et
       `data-message` : sans elle, le script doit deviner la racine du
       composeur en remontant le DOM, et il attrape le lien « Retour » de
       l'en-tête. Une ancre nommée est moins chère qu'un sélecteur fragile. */
    <div data-composer className="flex flex-col pb-safe">
      {replyTo ? (
        <div
          data-composer-reply
          className="mx-3 mb-1 flex items-center gap-2 rounded-quote px-2.5 py-2"
          style={{ backgroundColor: 'var(--color-ios-card)' }}
        >
          <span className="w-1 self-stretch rounded-full" style={{ backgroundColor: 'var(--accent)' }} aria-hidden />
          <span className="min-w-0 flex-1 text-title">
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>
              {replyTo.author}{' '}
            </span>
            <span
              className="truncate"
              style={{ color: 'var(--color-ios-ink-2)' }}
              {...(replyTo.language ? { lang: replyTo.language } : {})}
            >
              {replyTo.excerpt}
            </span>
          </span>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid size-11 shrink-0 place-items-center"
            aria-label="Annuler la réponse"
          >
            <Glyph name="x" size={14} style={{ color: 'var(--color-ios-ink-2)' }} />
          </button>
        </div>
      ) : null}

      {/* AU-DESSUS DE LA RANGÉE, sous la citation — la place qu'iOS donne à
          `customAttachmentsPreview` (`+Layout.swift:165-171`) : ce qui DÉCRIT
          le message à partir se lit avant le champ, jamais coincé entre le
          champ et le bord de l'écran. */}
      {showAbove ? (
        <Suspense fallback={null}>
          <ComposerTray variant="above" pending={pending} onRemove={removeAttachment} notice={notice} />
        </Suspense>
      ) : null}

      {isRecording ? (
        <Suspense fallback={<div style={{ minHeight: 56 }} aria-hidden />}>
          <ComposerTray
            variant="recording-bar"
            recorderState={recorder.state}
            onCancelRecording={recorder.cancel}
            onStopToTray={stopRecordingToTray}
            onSendRecording={sendRecordingNow}
          />
        </Suspense>
      ) : (
        <div className="flex items-end gap-3 px-3 py-2.5">
          {/* AUCUNE TUILE PERMISE ⇒ AUCUN « + » (loi 4) — un panneau vide est
              une porte qui s'ouvre sur un mur. `resolvedShowAttachment` fait
              la même chose côté iOS (`+Layout.swift:216`). */}
          {canAttachAnything ? (
            <button
              type="button"
              onClick={() => setPanelOpen((v) => !v)}
              className="grid size-11 shrink-0 place-items-center rounded-chip transition-transform"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                color: 'var(--accent)',
              }}
              aria-label={panelOpen ? 'Fermer le menu des pièces jointes' : 'Ouvrir le menu des pièces jointes'}
            >
              <Glyph name={panelOpen ? 'x' : 'plus'} size={20} />
            </button>
          ) : null}

          <div
            className="flex min-w-0 flex-1 items-end transition-all"
            style={{
              minHeight: 44,
              borderRadius: 22,
              backgroundColor: 'color-mix(in srgb, var(--accent) 6%, transparent)',
              border: focused
                ? '1.5px solid color-mix(in srgb, var(--color-i400) 50%, transparent)'
                : '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
              boxShadow: focused ? '0 0 8px color-mix(in srgb, var(--color-i400) 20%, transparent)' : 'none',
            }}
          >
            {canRecord && !focused && !sendTarget ? (
              <button
                type="button"
                onClick={() => recorder.start()}
                aria-busy={recorder.state.status === 'requesting'}
                className="grid size-9 shrink-0 place-items-center self-end"
                style={{ marginBottom: 4, marginLeft: 4, color: 'var(--color-ios-ink-2)' }}
                aria-label="Enregistrer un message vocal"
              >
                <Glyph
                  name="microphone"
                  size={18}
                  {...(recorder.state.status === 'requesting' ? { className: 'animate-pulse' } : {})}
                />
              </button>
            ) : null}
            <textarea
              ref={field}
              rows={1}
              value={text}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onInput={(e) => {
                const el = e.currentTarget;
                setText(el.value);
                onTextChange?.(el.value);
                // Croissance jusqu'a cinq lignes, comme iOS (`lineLimit(1...5)`).
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
              }}
              onKeyDown={(e) => {
                // La touche Entree ENVOIE (`.submitLabel(.send)`) ; Maj+Entree
                // insere une ligne.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              placeholder="Message…"
              aria-label="Écrire un message"
              className="min-w-0 flex-1 resize-none bg-transparent py-3 text-input leading-[22px] outline-none placeholder:text-ios-ink-3"
              style={{ paddingInlineStart: canRecord && !focused && !sendTarget ? 2 : 16, paddingInlineEnd: 16 }}
            />
          </div>

          <div
            className="flex shrink-0 items-center justify-end gap-2 transition-all"
            style={{ width: sendTarget ? 44 : 96, height: 44 }}
          >
            {sendTarget ? (
              <button
                type="button"
                /* `preventDefault` sur l'appui EMPÊCHE le bouton de voler le
                   focus au moment même du tap (revue-correction #5813, défaut
                   majeur 8) — sans lui, le champ perdait le focus une image
                   avant que `send()` ne le lui rende, et cette image suffit à
                   voir le micro remonter et le champ rétrécir. */
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => send(text)}
                className="grid size-11 place-items-center rounded-chip"
                style={{
                  background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, white))',
                }}
                aria-label="Envoyer"
              >
                <Glyph name="arrowUp" size={20} className="text-white" />
              </button>
            ) : (
              QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => send(emoji)}
                  className="grid size-11 place-items-center rounded-chip text-[22px]"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
                  aria-label={`Envoyer ${emoji}`}
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* SOUS la rangée, à la place du clavier — `attachmentCarouselPanel`
          (`+Layout.swift:254-258`). */}
      {!isRecording && panelOpen ? (
        <Suspense fallback={null}>
          <ComposerTray
            variant="panel"
            onPickPhotos={addFiles}
            onPickFile={addFiles}
            onStartVoice={() => {
              setPanelOpen(false);
              recorder.start();
            }}
            canRecord={canRecord}
            {...(rights === undefined ? {} : { rights })}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
