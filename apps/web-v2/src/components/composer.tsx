import { Suspense, lazy, memo, useEffect, useMemo, useRef, useState } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { ComposerTopRow } from './composer-top-row';
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
import { composerAccentOf, decorativeEffectCountOf, type ComposeProtection } from '@/lib/send/compose-protection';
import { composerChromeAccentStyle } from '@/lib/send/composer-accent';
import type { ComposerDraft } from '@/lib/send/draft-store';
import type { ComposerDraftReport } from '@/lib/view/use-draft';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useSentiment } from '@/lib/view/use-sentiment';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { recordingSupported, useRecorder } from '@/lib/view/use-recorder';

/**
 * LA FEUILLE D'EFFETS, CHARGÉE À LA DEMANDE (#6175) — même discipline que
 * `LanguageSheet` ci-dessous : elle ne pèse sur le chunk du fil que si un
 * lecteur touche la capsule « effets ».
 */
const EffectsSheet = lazy(() => import('./effects-sheet').then((m) => ({ default: m.EffectsSheet })));

/**
 * LA FEUILLE DE LANGUE, CHARGÉE À LA DEMANDE (#5828) — même discipline que
 * `ComposerTray` ci-dessous : elle ne pèse sur le chunk du fil que si un
 * lecteur touche la pastille.
 */
const LanguageSheet = lazy(() => import('./language-sheet').then((m) => ({ default: m.LanguageSheet })));

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

/** IDENTITÉ STABLE pour l'appelant qui omet `preferred` (les témoins, surtout)
 * — un `[]` littéral en valeur par défaut serait reconstruit à CHAQUE rendu
 * et invaliderait le `useMemo` de `useComposeLanguage` en boucle (CLAUDE.md §
 * Prisme, cycle 123 : « son IDENTITÉ change à chaque rendu chez tout hôte qui
 * le construit en ligne »). */
const NO_PREFERRED_LANGUAGES: readonly string[] = [];

/**
 * `memo` (revue-correction #6175, défaut majeur 3) — `thread.tsx` re-rend à
 * CHAQUE image de défilement d'une liste virtualisée (son propre
 * doc-comment le dit) ; sans `memo`, `Composer` — la partie la plus dense de
 * l'arbre du composeur, rangée haute comprise — repassait par un rendu
 * complet à chaque frame de scroll, alors qu'AUCUNE de ses props n'avait
 * changé. Effectif seulement parce que `thread.tsx` stabilise désormais
 * `onSend`/`onCancelReply` (`useCallback`) et `replyTo` (`useMemo`) : un
 * `memo` posé sur des props reconstruites en ligne ne sert à rien — c'est le
 * motif que les 40+ écrans à venir copieront, il doit être juste ICI.
 */
export const Composer = memo(function Composer({
  preferred = NO_PREFERRED_LANGUAGES,
  onSend,
  onTextChange,
  replyTo,
  onCancelReply,
  rights,
  draft,
  onDraftChange,
  maxLength,
}: {
  /** LE PRISME DU LECTEUR (#5828) — repli de la langue d'écriture quand
   * aucune détection ne tranche : `useComposeLanguage` lit `preferred[0]`,
   * jamais `preferred` en bloc. Un tableau MÉMOÏSÉ côté hôte
   * (`useReaderLanguages`, `thread.tsx`), jamais reconstruit en ligne
   * (CLAUDE.md § Prisme, cycle 123). */
  preferred?: readonly string[];
  onSend: (payload: {
    text: string;
    attachments: readonly PendingAttachment[];
    language: string;
    /** LA PROTECTION CHOISIE (#6175) — éphémère / flou / effets décoratifs,
     * composée par la rangée haute. `{}` quand rien n'est armé. */
    protection: ComposeProtection;
  }) => void;
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
  /**
   * LA GRAINE DU BROUILLON RESTAURÉ (#6175) — lue UNE fois au montage
   * (`useState` paresseux ci-dessous), jamais relue après : c'est l'hôte
   * (`thread.tsx`, `useComposerDraft`) qui possède la persistance, ce
   * composant ne fait que SEMER son état local avec cette valeur, exactement
   * comme `usePersistedReadingMode` sème `stickyMode`. `null`/`undefined` ⇒
   * aucun brouillon.
   */
  draft?: ComposerDraft | null;
  /** Appelée à CHAQUE changement (texte, langue, protection) — la politique
   * de débounce vit chez l'hôte (`useComposerDraft`), jamais ici. */
  onDraftChange?: (report: ComposerDraftReport) => void;
  /** Absent en conversation standard (§1.2 point 2, #6175) — aucun appelant
   * ne le fournit cette itération, faute de source honnête de la limite
   * serveur (issue gateway compagnon). Le compteur ne se rend QUE si fourni. */
  maxLength?: number;
}) {
  const [text, setText] = useState(() => draft?.text ?? '');
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
   * LA LANGUE D'ÉCRITURE (#5828) — décide ce qui PART, jamais le rang 1 du
   * Prisme du LECTEUR. `compose.language` est LA valeur envoyée ; la pastille
   * n'affiche jamais autre chose (loi 4 : elle ne ment pas).
   *
   * `initialLanguage: draft?.language` (#6175) — le brouillon restauré pose
   * la langue COURANTE au montage, jamais ÉPINGLÉE : une détection franche
   * la déplace encore (§ T7 de la spécification).
   */
  const compose = useComposeLanguage({ preferred, ...(draft?.language === undefined ? {} : { initialLanguage: draft.language }) });
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const languagePillRef = useRef<HTMLButtonElement>(null);

  /**
   * LA PROTECTION (#6175) — les trois bascules de la rangée haute, seedées
   * depuis le brouillon restauré. `viewOnce` n'a aucun contrôle ici (§ 1.2
   * point 1 : réservé au composeur de prévisualisation de notification) —
   * la loi le porte quand même (`ComposeProtection.viewOnce`), jamais armé
   * depuis cet écran.
   */
  const [ephemeralSeconds, setEphemeralSeconds] = useState<number | undefined>(draft?.protection.ephemeralSeconds);
  const [ephemeralPickerOpen, setEphemeralPickerOpen] = useState(false);
  const [blurred, setBlurred] = useState(draft?.protection.blurred === true);
  const [effectFlags, setEffectFlags] = useState(draft?.protection.effectFlags ?? 0);
  const [effectsSheetOpen, setEffectsSheetOpen] = useState(false);
  const protection: ComposeProtection = useMemo(
    () => ({
      ...(ephemeralSeconds === undefined ? {} : { ephemeralSeconds }),
      ...(blurred ? { blurred: true } : {}),
      ...(effectFlags === 0 ? {} : { effectFlags }),
    }),
    [ephemeralSeconds, blurred, effectFlags],
  );

  /** LA TONALITÉ — INDICATEUR PASSIF, débounce 300 ms (`use-sentiment.ts`,
   * miroir `TextAnalyzer`). */
  const sentiment = useSentiment(text);

  /**
   * L'ACCENT SUBSTITUÉ (#6175, revue-correction défaut majeur 2) — éphémère
   * armé > flou > effets > `undefined` (l'accent de la conversation, hérité
   * du parent). Voir `composer-accent.ts` pour ce que cette substitution
   * couvre et ce qu'elle diffère. Posé sur la RACINE du composeur : toute
   * surface qui lit déjà `var(--accent)` (le champ, le bouton d'envoi, la
   * pastille de langue…) en hérite sans qu'aucune n'ait à le savoir — le même
   * mécanisme que `withAccent` au niveau de l'écran (`thread.tsx`).
   */
  const chromeAccentStyle = composerChromeAccentStyle(composerAccentOf(protection));

  /**
   * LE RAPPORT DE BROUILLON (#6175) — à CHAQUE changement de texte, de
   * langue ou de protection, l'hôte est informé ; LUI seul décide QUAND
   * l'écriture atteint le magasin (`useComposerDraft`, fin de mot / 400 ms /
   * vidage immédiat). `replyToId` n'est PAS reporté par ce composant — il
   * n'a que la citation PRÉ-ADRESSÉE (`replyTo.author`/`excerpt`), jamais
   * l'identifiant ; c'est `thread.tsx`, qui possède `replyTarget`, qui le
   * composera dans une itération à venir (§1.2 point 6).
   */
  useEffect(() => {
    onDraftChange?.({ text, language: compose.language, protection });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `onDraftChange` est fourni par l'hôte, pas une dépendance de CE rapport (motif `onTextChange`/`onSend` du fichier).
  }, [text, compose.language, protection]);

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
    compose.setText(''); // Le vidage réinitialise la détection (miroir `TextAnalyzer` texte vidé).
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
    // LA PROTECTION EST REMISE À ZÉRO APRÈS L'ENVOI (#6175) — miroir
    // `ConversationViewModel+Send.swift:156-159` : éphémère, flou et effets
    // ne survivent PAS au message qui vient de partir, contrairement à la
    // LANGUE (qui reste COLLANTE, `compose.noteSent()`).
    setEphemeralSeconds(undefined);
    setEphemeralPickerOpen(false);
    setBlurred(false);
    setEffectFlags(0);
  };

  const send = (value: string, attachments: readonly PendingAttachment[] = pending) => {
    const own = value.trim();
    if (!own && attachments.length === 0) return;
    const keepFocus = document.activeElement === field.current;
    // LA VALEUR AFFICHÉE EST CELLE QUI PART (#5828, Q2) — capturée AVANT
    // `resetAfterSend`, qui vide le texte et donc changerait ce que
    // `compose.language` rendrait si on le relisait après.
    const language = compose.language;
    onSend({ text: own, attachments, language, protection });
    compose.noteSent(); // Le choix cesse d'être ÉPINGLÉ, mais reste COLLANT (Q3).
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
    <div data-composer className="flex flex-col pb-safe" style={chromeAccentStyle}>
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

      {/* LA RANGÉE HAUTE (#5828, #6175) — miroir `topToolbar`
          (`UniversalComposerBar+Toolbar.swift:25-81`) : posée AU-DESSUS du
          champ, jamais DANS lui, et DÉMONTÉE pendant un enregistrement
          (`+Layout.swift:200-206`, « aucun outil en main pendant le vocal »).

          ANCRÉE EN TÊTE DE RANGÉE, jamais à droite (revue-correction) — iOS
          range ses outils dans le groupe MENANT (`◎ 👁 ✦ 😐 [🇫🇷 FR ⌄]`, la
          pastille APRÈS quatre icônes, `topToolbar` finissant par `Spacer()`
          + le compteur de caractères conditionnel ; capture de référence
          `targets/thread.composer-top-row.{light,dark}.png`, 25 nœuds). */}
      {!isRecording ? (
        <ComposerTopRow
          {...(ephemeralSeconds === undefined ? {} : { ephemeralSeconds })}
          ephemeralPickerOpen={ephemeralPickerOpen}
          onToggleEphemeral={() => {
            if (ephemeralSeconds !== undefined) {
              // ARMÉ ⇒ tap DÉSARME (miroir `+Protections.swift:26-34`).
              setEphemeralSeconds(undefined);
              setEphemeralPickerOpen(false);
              return;
            }
            setEphemeralPickerOpen((v) => !v);
          }}
          onSelectEphemeral={(seconds) => {
            setEphemeralSeconds(seconds);
            setEphemeralPickerOpen(false);
          }}
          blurred={blurred}
          onToggleBlur={() => setBlurred((v) => !v)}
          effectCount={decorativeEffectCountOf(effectFlags)}
          onOpenEffects={() => setEffectsSheetOpen(true)}
          sentiment={sentiment}
          languageCode={compose.language}
          onOpenLanguage={() => setLanguageSheetOpen(true)}
          languagePillRef={languagePillRef}
          text={text}
          {...(maxLength === undefined ? {} : { maxLength })}
        />
      ) : null}

      {languageSheetOpen ? (
        <Suspense fallback={null}>
          <LanguageSheet
            title="Langue d’écriture"
            selected={compose.language}
            onSelect={(code) => {
              compose.choose(code);
              setLanguageSheetOpen(false);
              languagePillRef.current?.focus();
            }}
            onClose={() => {
              setLanguageSheetOpen(false);
              languagePillRef.current?.focus();
            }}
          />
        </Suspense>
      ) : null}

      {effectsSheetOpen ? (
        <Suspense fallback={null}>
          <EffectsSheet flags={effectFlags} onChange={setEffectFlags} onClose={() => setEffectsSheetOpen(false)} />
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
                compose.setText(el.value);
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
});
