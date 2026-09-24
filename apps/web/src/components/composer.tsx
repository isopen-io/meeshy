import { Suspense, lazy, memo, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { ParticipantPermissions } from '@meeshy/shared/types/participant';

import { ComposerTopRow } from './composer-top-row';
import { Glyph } from './glyph';
import { MentionSuggestions, mentionOptionId } from './mention-suggestions';
import type { ComposerNotice } from './composer-tray';
import {
  acceptPendingFiles,
  addPendingAttachment,
  mayAttach,
  removePendingAttachment,
  type PendingAttachment,
} from '@/lib/send/attachments';
import { releasePreviewUrl } from '@/lib/send/attachment-preview-url';
import {
  composerAccentOf,
  decorativeEffectCountOf,
  toggledVeil,
  type ComposeProtection,
  type VeilState,
} from '@/lib/send/compose-protection';
import { composerChromeAccentStyle } from '@/lib/send/composer-accent';
import type { ComposerDraft } from '@/lib/send/draft-store';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { ComposerDraftReport } from '@/lib/view/use-draft';
import { useComposeLanguage } from '@/lib/view/use-compose-language';
import { useSentiment } from '@/lib/view/use-sentiment';
import type { SharedPlace } from '@/lib/send/shared-place';
import { QUICK_REACTIONS } from '@/lib/view/message-actions';
import { locationSupported, useLocationRequest } from '@/lib/view/use-location-request';
import { recordingSupported, useRecorder } from '@/lib/view/use-recorder';
import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import { insertMention } from '@/lib/view/mention-query';
import { useMentionSuggestions } from '@/lib/view/use-mention-suggestions';

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
 * LA PALETTE D'EMOJIS, CHARGÉE À LA DEMANDE (#7280) — même discipline que
 * `LanguageSheet` et `EffectsSheet` : la grille des vingt (`EmojiGrid`,
 * SEULE liste du dépôt) et la feuille qui la porte n'entrent dans aucun
 * chunk tant qu'on n'a pas touché la tuile « Emoji ».
 */
const ComposerEmojiSheet = lazy(() =>
  import('./composer-emoji-sheet').then((m) => ({ default: m.ComposerEmojiSheet })),
);

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
    /** LE LIEU PARTAGÉ (#7280) — ce que la tuile « Position » a obtenu du
     * navigateur, `null` quand aucun n'est attaché. Il part dans un champ
     * `location` DÉDIÉ du corps (`perform-send.ts § bodyOf`), jamais fusionné
     * dans un `metadata` brut. */
    place: SharedPlace | null;
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
  /** LA POSITION (#7280) — le hook possède l'état de la DEMANDE (refus,
   * recherche, panne) ET le lieu obtenu, exactement comme `useRecorder`
   * possède l'état du micro et le vocal qu'il rend. */
  const locator = useLocationRequest();
  const [emojiSheetOpen, setEmojiSheetOpen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  /** LE CURSEUR (#7826) — la mention se lit À SA POSITION, pas en fin de
   * texte. Relu à chaque frappe, clic et flèche : un état, parce que la liste
   * doit se rouvrir ou se fermer quand il bouge sans que le texte change. */
  const [caret, setCaret] = useState(() => draft?.text.length ?? 0);
  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length);
  const mentions = useMentionSuggestions({ text, caret, enabled: focused });
  const mentionListId = useId();
  const mentionListOpen = mentions.open && mentions.items.length > 0;
  /* UN LIEU SEUL SUFFIT À ENVOYER — comme une pièce jointe seule. Sans lui
     dans cette somme, partager sa position aurait demandé d'écrire un mot,
     et le bouton d'envoi serait resté invisible sur un composeur qui porte
     pourtant quelque chose (loi 4, vue depuis l'autre bout). */
  const sendTarget = text.trim().length > 0 || pending.length > 0 || locator.place !== null;
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
   * LA PROTECTION (#6175) — les quatre bascules de la rangée haute, seedées
   * depuis le brouillon restauré.
   *
   * `viewOnce` (#7597) — vaut pour TOUT ce qui part (texte, image, audio,
   * vidéo, document, sticker, #7498), armée d'un tap comme sur iOS (#7472).
   * La gate « image en attente » de #7354 la rendait invisible dans l'état
   * par défaut du composeur : c'est le défaut que #7597 corrige.
   */
  const [ephemeralSeconds, setEphemeralSeconds] = useState<number | undefined>(draft?.protection.ephemeralSeconds);
  const [ephemeralPickerOpen, setEphemeralPickerOpen] = useState(false);
  // Un brouillon d'avant #7667 peut porter flou ET vue unique : la vue
  // unique, plus forte, l'emporte dès la restauration.
  const [blurred, setBlurred] = useState(draft?.protection.blurred === true && draft?.protection.viewOnce !== true);
  const [viewOnce, setViewOnce] = useState(draft?.protection.viewOnce === true);
  const [effectFlags, setEffectFlags] = useState(draft?.protection.effectFlags ?? 0);
  /** Flou et vue unique sont EXCLUSIFS (#7667) — la loi pure décide, la
   * rangée haute ne fait que poser ses deux valeurs. */
  const applyVeil = (next: VeilState) => {
    setBlurred(next.blurred);
    setViewOnce(next.viewOnce);
  };
  const [effectsSheetOpen, setEffectsSheetOpen] = useState(false);
  const protection: ComposeProtection = useMemo(
    () => ({
      ...(ephemeralSeconds === undefined ? {} : { ephemeralSeconds }),
      ...(blurred ? { blurred: true } : {}),
      ...(viewOnce ? { viewOnce: true } : {}),
      ...(effectFlags === 0 ? {} : { effectFlags }),
    }),
    [ephemeralSeconds, blurred, viewOnce, effectFlags],
  );

  /** LA TONALITÉ — INDICATEUR PASSIF, débounce 300 ms (`use-sentiment.ts`,
   * miroir `TextAnalyzer`). */
  const sentiment = useSentiment(text);

  /**
   * L'ACCENT SUBSTITUÉ (#6175, puis #7667) — éphémère > vue unique > flou >
   * effets > `undefined` (l'accent de la conversation, hérité du parent). Voir `composer-accent.ts` pour ce que cette substitution
   * couvre et ce qu'elle diffère. Posé sur la RACINE du composeur : toute
   * surface qui lit déjà `var(--accent)` (le champ, le bouton d'envoi, la
   * pastille de langue…) en hérite sans qu'aucune n'ait à le savoir — le même
   * mécanisme que `withAccent` au niveau de l'écran (`thread.tsx`).
   */
  const accentState = composerAccentOf(protection);
  const chromeAccentStyle = composerChromeAccentStyle(accentState);
  /** La couleur ne se voit pas au lecteur d'écran : le champ DIT la
   * protection dominante (#7667, miroir `accessibilityHint` iOS). */
  const protectionAnnouncement =
    accentState === 'ephemeral'
      ? translate(currentInterfaceLanguage(), 'composer.protection.ephemeral.state')
      : accentState === 'viewOnce'
        ? translate(currentInterfaceLanguage(), 'composer.viewOnce.active')
        : accentState === 'blur'
          ? translate(currentInterfaceLanguage(), 'composer.protection.blur.state')
          : undefined;

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
  /* LA MÊME QUESTION POSÉE À LA POSITION — un navigateur sans
     `navigator.geolocation` (contexte non sécurisé, moteur ancien) n'a
     AUCUNE porte à montrer. Le panneau, lui, existe toujours : la tuile
     « Emoji » n'a besoin d'aucun droit ni d'aucun moteur. */
  const canLocate = locationSupported();

  /** La langue d'INTERFACE, lue UNE fois par rendu — les libellés de ce
   * composant la partagent tous (`interface-language.ts`), et la relire à
   * chaque appel toucherait `document.documentElement` autant de fois. */
  const uiLanguage = currentInterfaceLanguage();

  /* CE QUE LA POSITION A REFUSÉ, DIT À LA MÊME PLACE QUE LE RESTE (#7280) —
     un second bandeau propre à la position se serait empilé sur celui du
     micro ; `ComposerNotice` est l'emplacement UNIQUE, et il porte déjà le
     couple « cause + moyen de rejouer ». `unsupported` n'offre PAS de
     « Réessayer » : un navigateur sans géolocalisation ne l'acquiert pas
     entre deux taps, et promettre un rejeu impossible est la forme que
     `NoticeBanner` interdit explicitement (loi 4). `locating` n'a pas de
     sortie non plus — elle DIT l'attente, et elle se résout seule. */
  const locationNotice: ComposerNotice | null =
    locator.state.status === 'locating'
      ? { message: translate(uiLanguage, 'composer.location.locating'), onDismiss: locator.dismiss }
      : locator.state.status === 'denied'
        ? { message: translate(uiLanguage, 'composer.location.denied'), onRetry: locator.request, onDismiss: locator.dismiss }
        : locator.state.status === 'failed'
          ? { message: translate(uiLanguage, 'composer.location.failed'), onRetry: locator.request, onDismiss: locator.dismiss }
          : locator.state.status === 'unsupported'
            ? { message: translate(uiLanguage, 'composer.location.unavailable'), onDismiss: locator.dismiss }
            : null;

  const notice: ComposerNotice | null =
    locationNotice ??
    (fileRefusal !== null
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
          : null);

  const showAbove = pending.length > 0 || notice !== null || locator.place !== null;

  /**
   * « RÉPONDRE » MET LE CURSEUR DANS LE CHAMP (revue #5814, défaut majeur
   * 8 ; l'action s'appelait `compose` jusqu'à #7555) —
   * `useMessageMenu.onMenuAction('reply')` pose `focusTakenRef.current
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
    setCaret(0);
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
    setViewOnce(false);
    setEffectFlags(0);
    /* LE LIEU NE SURVIT PAS AU MESSAGE QUI VIENT DE PARTIR (#7280) — même
       règle que la protection, et pour la même raison : il DÉCRIT ce
       message-là. Le garder attacherait la position d'il y a dix minutes au
       message suivant, sans que rien ne le dise. */
    locator.clear();
  };

  const send = (value: string, attachments: readonly PendingAttachment[] = pending) => {
    const own = value.trim();
    if (!own && attachments.length === 0 && locator.place === null) return;
    const keepFocus = document.activeElement === field.current;
    // LA VALEUR AFFICHÉE EST CELLE QUI PART (#5828, Q2) — capturée AVANT
    // `resetAfterSend`, qui vide le texte et donc changerait ce que
    // `compose.language` rendrait si on le relisait après.
    const language = compose.language;
    onSend({ text: own, attachments, language, protection, place: locator.place });
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
   * INSÉRER UN EMOJI AU CURSEUR (#7280) — la tuile « Emoji » d'iOS
   * (`composer.attach.emoji`) n'ATTACHE rien : elle écrit dans le TEXTE en
   * cours (`onRequestTextEmoji` → `injectedEmoji`,
   * `ConversationView+Composer.swift:185-189`). C'est ce qui la distingue de
   * « Sticker », qui compose un MESSAGE à elle seule.
   *
   * AU CURSEUR, jamais en fin de champ : quelqu'un qui revient corriger un
   * mot au milieu de sa phrase et touche un emoji s'attend à le voir là où
   * il regarde. `selectionStart`/`selectionEnd` absents (champ jamais
   * focalisé) ⇒ fin du texte, le cas nominal.
   */
  const writeAt = (next: string, nextCaret: number) => {
    setText(next);
    onTextChange?.(next);
    compose.setText(next);
    setCaret(nextCaret);
    /* LE CURSEUR SUIT CE QUI A ÉTÉ INSÉRÉ — sans ce rappel, il retombait au
       DÉBUT du champ (React réécrit `value`, le navigateur remet la sélection
       à 0) et le mot suivant s'écrivait avant la phrase. Différé d'un tour :
       la valeur n'est posée sur le nœud qu'après le rendu. */
    queueMicrotask(() => {
      const after = field.current;
      if (after === null) return;
      after.focus();
      after.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = field.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setEmojiSheetOpen(false);
    writeAt(`${text.slice(0, start)}${emoji}${text.slice(end)}`, start + emoji.length);
  };

  /**
   * CHOISIR UNE PERSONNE (#7826) — `@username ` remplace le mot `@…` sous le
   * curseur (`insertMention`, miroir `replacingTrailingHandle` iOS) ; la
   * liste se referme d'elle-même, le curseur sortant de la requête.
   */
  const pickMention = (candidate: MentionCandidate) => {
    if (mentions.query === null) return;
    const inserted = insertMention(text, mentions.query, candidate.username);
    writeAt(inserted.text, inserted.caret);
  };

  /** LE CLAVIER DE LA LISTE — ↑/↓ déplacent la rangée active, Entrée et Tab
   * insèrent, Échap ferme. Liste ouverte, Entrée N'ENVOIE PAS : on choisit
   * une personne, on ne part pas au milieu d'un nom. Rend `true` quand la
   * touche a été consommée. Une composition IME en cours garde ses touches. */
  const handleMentionKey = (e: KeyboardEvent): boolean => {
    if (!mentions.open || e.isComposing) return false;
    if (e.key === 'Escape') {
      mentions.dismiss();
      return true;
    }
    const active = mentions.items[mentions.activeIndex];
    if (active === undefined) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      mentions.move(e.key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      pickMention(active);
      return true;
    }
    return false;
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
    <div data-composer className="relative flex flex-col pb-safe" style={chromeAccentStyle}>
      {mentions.open ? (
        <MentionSuggestions
          listId={mentionListId}
          items={mentions.items}
          activeIndex={mentions.activeIndex}
          language={uiLanguage}
          onPick={pickMention}
          onHighlight={mentions.highlight}
        />
      ) : null}

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
          <ComposerTray
            variant="above"
            pending={pending}
            onRemove={removeAttachment}
            notice={notice}
            place={locator.place}
            onRemovePlace={locator.clear}
          />
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
          onToggleBlur={() => applyVeil(toggledVeil('blurred', { blurred, viewOnce }))}
          viewOnce={viewOnce}
          onToggleViewOnce={() => applyVeil(toggledVeil('viewOnce', { blurred, viewOnce }))}
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
            title={translate(currentInterfaceLanguage(), 'languageSheet.title.write')}
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

      {emojiSheetOpen ? (
        <Suspense fallback={null}>
          <ComposerEmojiSheet onPick={insertEmoji} onClose={() => setEmojiSheetOpen(false)} />
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
          {/* LE PANNEAU N'EST PLUS JAMAIS VIDE, DONC LE « + » NE S'EFFACE PLUS
              (#7280) — la garde qui vivait ici (`canAttachAnything`)
              l'empêchait d'ouvrir un mur : sans droit d'image, de fichier ni
              d'audio, les trois tuiles disparaissaient et le panneau ne
              montrait rien. « Emoji » change cette arithmétique — elle
              n'attache RIEN, elle insère dans le texte, donc elle n'exige ni
              droit d'envoi ni moteur navigateur, et elle est toujours là.
              La garde est RETIRÉE, pas neutralisée en `true` : un prédicat
              qui ne peut plus être faux est un contrôle qui ment sur ce
              qu'il garde. Le jour où « Emoji » se garde à son tour (un
              droit, un réglage), c'est ce commentaire qu'il faut relire — et
              la garde qu'il faut rendre. */}
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
                syncCaret(el);
                onTextChange?.(el.value);
                compose.setText(el.value);
                // Croissance jusqu'a cinq lignes, comme iOS (`lineLimit(1...5)`).
                el.style.height = 'auto';
                el.style.height = `${Math.min(el.scrollHeight, 5 * 22)}px`;
              }}
              onClick={(e) => syncCaret(e.currentTarget)}
              onKeyUp={(e) => syncCaret(e.currentTarget)}
              /* LE MOTIF « CHAMP + LISTE À DESCENDANT ACTIF » (#7826) — le
                 champ reste un `textbox` multiligne (ARIA in HTML n'admet
                 aucun autre rôle sur `<textarea>`), et annonce sa liste par
                 `aria-autocomplete`/`aria-controls`/`aria-activedescendant`. */
              aria-autocomplete="list"
              {...(mentionListOpen
                ? {
                    'aria-controls': mentionListId,
                    'aria-activedescendant': mentionOptionId(mentionListId, mentions.activeIndex),
                  }
                : {})}
              onKeyDown={(e) => {
                if (handleMentionKey(e.nativeEvent)) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                // La touche Entree ENVOIE (`.submitLabel(.send)`) ; Maj+Entree
                // insere une ligne.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send(text);
                }
              }}
              placeholder="Message…"
              aria-label="Écrire un message"
              {...(protectionAnnouncement === undefined ? {} : { 'aria-description': protectionAnnouncement })}
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
            /* LA CAMÉRA REND DES FICHIERS, exactement comme la photothèque —
               `capture` ne change que la SOURCE, jamais ce qui revient : le
               même `addFiles` applique les mêmes droits, les mêmes bornes de
               taille et le même refus DIT (`acceptPendingFiles`). */
            onPickCamera={addFiles}
            onPickFile={addFiles}
            onRequestLocation={() => {
              setPanelOpen(false);
              locator.request();
            }}
            onRequestEmoji={() => {
              setPanelOpen(false);
              setEmojiSheetOpen(true);
            }}
            onStartVoice={() => {
              setPanelOpen(false);
              recorder.start();
            }}
            canRecord={canRecord}
            canLocate={canLocate}
            {...(rights === undefined ? {} : { rights })}
          />
        </Suspense>
      ) : null}
    </div>
  );
});
