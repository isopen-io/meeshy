import { useSyncExternalStore } from 'react';
import { useStore } from 'zustand/react';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { ActiveMembersStack } from './active-members-stack';
import { Avatar } from './avatar';
import { AvatarMenuTrigger } from './avatar-menu';
import { PersonName } from './person-name';
import { ChromeActionDisc, CHROME_ACTION_HIT_CLASS } from './chrome-action';
import { Glyph } from './glyph';
import { ReadingModeChip } from './reading-mode-chip';
import { ThreadCallButton } from './thread-call-button';
import { ThreadShareButton } from './thread-share-button';
import { UnreadBadge } from './unread-badge';
import type { ListConversation } from '@/lib/api/list-preview';
import type { Conversation } from '@/lib/api/types';
import type { MenuRow } from '@/lib/reading-mode/catalog';
import { apiConfig } from '@/lib/api/config';
import { sessionStore } from '@/lib/api/session';
import { callsAvailable } from '@/lib/calls/calls-availability';
import { avatarOf, initialsOf, peerOf, presenceKeyOf } from '@/lib/view/conversation';
import { usePresences } from '@/lib/view/use-presence';
import { servedRingOf, useRingDesign } from '@/lib/profile-decor/author-ring';
import { avatarMenuEntries } from '@/lib/view/avatar-menu';
import type { ActiveMember } from '@/lib/view/top-active-members';
import type { StoryRingOf } from '@/lib/view/use-author-story-rings';
import { Link } from '@/routes/route-table';
import { useAuthorMood, useAuthorMoodPostId } from '@/lib/view/use-author-moods';
import { useIsHere, useIsHereActive, useIsHereFocused } from '@/lib/view/use-conversation-viewing';
import { useConversationEngagement } from '@/lib/view/use-conversation-engagement';
import { headerFlameShown } from '@/lib/view/header-memory';
import { isWide, subscribeWide } from '@/lib/view/split-query';
import { useGuestFocus, useSpeaksAsGuest } from '@/lib/view/guest-focus';
import { conversationAvatarDoor, threadCallOffer, threadHeaderSubtitle } from '@/lib/view/thread-header-offer';
import { translate } from '@/lib/i18n-catalog';
import { useServedGlobalRole } from '@/lib/view/use-admin-access';
import { translateNotificationRow } from '@/lib/i18n-notification-row-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { EngagementPill } from './engagement-pill';
import { GlyphSvg } from './glyph';
import { MEDIA_GLYPHS } from './glyphs-media';
import { HeaderFlame } from './header-flame';
import { ThreadSearchPanel } from './thread-search-panel';
import { apiDeps } from '@/lib/api/deps';
import { useThreadSearch } from '@/lib/view/use-thread-search';
import { searchLandingMode } from '@/lib/view/thread-search';
import { useThreadSearchDoor } from '@/lib/view/thread-search-door';
import { useOptionalRoute } from '@/lib/router';

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
  storyRingOf,
  activeMembers,
  otherUnread,
  expanded,
  onToggleExpanded,
  onOpenDetails,
  currentRowTitle,
  isAuto,
  readingMenuRows,
  onSelectReadingMode,
  onResetReadingModeToAuto,
  preview = false,
  flameDismissed = false,
  onDismissFlame,
  flameReplay = 0,
  onJumpToMessage,
}: {
  /**
   * LE SAUT AU MESSAGE TROUVÉ PAR LA RECHERCHE — `jump.requestJump` du fil
   * (`useThreadJump`), le même que celui des détails : le message est amené au
   * centre et surligné, fenêtre `?around=` comprise s'il n'est pas chargé.
   * Absent (un hôte qui ne sait pas sauter), toucher un résultat ferme
   * seulement la recherche.
   */
  readonly onJumpToMessage?: ((messageId: string) => void) | undefined;
  /**
   * L'EN-TÊTE DE L'APERÇU TIRÉ DEPUIS LA BANNIÈRE (#8821, directive porteur
   * 2026-09-30 : « afficher tout le header de la conversation dans son bloc de
   * verre Liquid Glass sans (<) ! »). Le MÊME en-tête, dans le même verre :
   * aucun chevron retour — l'aperçu n'a pas d'écran d'où revenir, il se ferme
   * —, l'identité (nom, sous-titre) ET les actions ensemble, sans attendre
   * qu'on déplie ; l'avatar y ouvre les détails.
   */
  readonly preview?: boolean;
  /**
   * LA FLAMME DU JOUR SOUS L'AVATAR REPLIÉ (#9031) — masquée par le lecteur
   * (`flameDismissed`, retenue par conversation), rejouée à chaque envoi
   * (`flameReplay` compte les messages partis). Sans `onDismissFlame`, l'hôte
   * ne la propose pas.
   */
  readonly flameDismissed?: boolean;
  readonly onDismissFlame?: (() => void) | undefined;
  readonly flameReplay?: number;
  readonly title: string;
  readonly accent: string;
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly group: boolean;
  /** L'anneau de story d'un auteur (#7528) — en direct, le titre déplié mène à la story du pair, sinon à son profil. */
  readonly storyRingOf?: StoryRingOf;
  /**
   * LES TROIS PARTICIPANTS LES PLUS ACTIFS D'UN GROUPE (#7830), calculés par
   * l'hôte sur les messages chargés (`topActiveMembers`). Peints dans l'en-tête
   * DÉPLIÉ, entre le titre et l'avatar : l'en-tête replié porte déjà, à 320 px,
   * le retour, le chip de mode, l'appel, la recherche et l'avatar (208 px fixes
   * plus le chip) — 74 px de plus y écraseraient le chip. Déplié, c'est l'état
   * d'IDENTITÉ de l'en-tête : le titre y garde une centaine de pixels et
   * tronque, son nom entier restant dans les détails qu'il ouvre.
   */
  readonly activeMembers?: readonly ActiveMember[];
  readonly otherUnread: number;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  /**
   * OUVRE LES DÉTAILS DE LA CONVERSATION (#7829). En groupe, le TITRE les
   * ouvre au toucher ; en direct le titre reste la porte vers le pair (#7528)
   * et les détails passent par son appui long, comme l'avatar de l'en-tête
   * dans les deux cas — le menu d'avatar (#7828). Absent, rien ne les promet.
   */
  readonly onOpenDetails?: (() => void) | undefined;
  readonly currentRowTitle: string;
  readonly isAuto: boolean;
  readonly readingMenuRows: readonly MenuRow[];
  readonly onSelectReadingMode: (mode: ConversationReadingMode) => void;
  readonly onResetReadingModeToAuto: () => void;
}) {
  /* DÉRIVÉ ICI, comme la présence du pair plus bas (#6975) : cette
     coquille ne porte aucune RÈGLE, mais elle descend déjà les deux lois de
     `view/conversation` qui dépendent du pair, et une prop de plus pour la
     photo aurait fait un troisième chemin pour la même donnée. */
  const photo = avatarOf(conversation, viewerId);
  /* LE PAIR D'UNE CONVERSATION DIRECTE (#7528) — en mode Bulles, le fil ne
     peint AUCUNE identité en direct (`bubble.tsx`, `showsIdentity`) : le
     titre déplié est alors la seule porte vers sa story ou son profil, dans
     les trois peaux. En groupe, `peer` est `undefined` et le titre reste du
     texte — il nomme la conversation, pas une personne. */
  const peer = peerOf(conversation, viewerId);
  const peerRing = peer === undefined ? undefined : storyRingOf?.(peer.userId ?? peer.user?.id);
  /* LE PAIR A LA CONVERSATION OUVERTE (#8892) — sa pastille passe à la couleur primaire. */
  const peerKey = peer?.userId ?? peer?.user?.id ?? undefined;
  /* SON CONTOUR ÉQUIPÉ (#10713, #10946) — servi avec le participant. */
  const peerContour = useRingDesign(servedRingOf(peer));
  const peerHere = useIsHere(conversation.id, peerKey);
  /* … et pulse tant qu'il y regarde, écoute ou agit (#9061). */
  const peerActive = useIsHereActive(conversation.id, peerKey);
  /* … et en plein écran, son point pulse et son mood se fige (#9065). */
  const peerFocused = useIsHereFocused(conversation.id, peerKey);
  /* … et son mood, cerné de sa présence (#9065). */
  const peerMood = useAuthorMood(peerKey);
  const peerMoodPostId = useAuthorMoodPostId(peerKey);
  /* « N (M) 🔥 » (#8906) — ce que cette conversation a rapporté au lecteur ;
     dans la grappe d'actions repliée, sous le titre déplié. */
  const engagement = useConversationEngagement(conversation);
  const showsFlame =
    onDismissFlame !== undefined &&
    headerFlameShown({ expanded, preview, dismissed: flameDismissed, hasEngagement: (engagement?.totalPoints ?? 0) > 0 });
  /* LA PRÉSENCE DES PLUS ACTIFS (#9031) — vert, orange ou gris comme partout,
     l'indigo « ici » primant (`ActiveMembersStack`). */
  const memberIds = (activeMembers ?? []).map((member) => member.id);
  /* VIVANTES (#10571) : le pair et les plus actifs suivent `user:status` et la
     loi 1/3/5, l'en-tête ne se repeignant que si l'une de LEURS pastilles change. */
  const [peerPresence = 'offline', ...memberPresences] = usePresences([
    peer,
    ...memberIds.map((memberId) => conversation.participants.find((p) => presenceKeyOf(p) === memberId)),
  ]);
  const memberPresence = (memberId: string) => memberPresences[memberIds.indexOf(memberId)] ?? 'offline';
  /* L'INVITÉ SANS COMPTE LIT SON FIL EN FOCUS (#10100) : aucun retour vers une
     liste qu'il n'a pas, et la place libérée dit où il est — le nom, comme
     l'aperçu et l'ordinateur. */
  const focus = useGuestFocus();
  /* NI DÉTAILS, NI EFFECTIF, NI PROFILS POUR UN VISITEUR SANS COMPTE (#10205,
     directive porteur du 2026-10-11) — décidé par son STATUT, jamais par
     l'absence d'un champ que la passerelle cesse de lui servir. Le partage de
     la conversation, à côté de l'avatar, prend la place du détail (#10206). */
  const sessionIsGuest = useSpeaksAsGuest();
  const details = sessionIsGuest ? undefined : onOpenDetails;
  const subtitle = threadHeaderSubtitle({ group, guest: sessionIsGuest, memberCount: conversation.memberCount, encryptionMode: conversation.encryptionMode });
  /* L'APPEL PAR LA LOI PARTAGÉE (#10207, #10114) — `canStartCall`, jamais une
     réimplémentation : aucun en `global`, en `public` seuls le créateur et les
     administrateurs le lancent (les autres membres gardent « Rejoindre »). */
  const sessionUserId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const platformRole = useServedGlobalRole();
  const callOffer = threadCallOffer({ conversation, viewerUserId: sessionUserId, viewerPlatformRole: platformRole, viewerIsGuest: sessionIsGuest });
  /* LE MENU D'APPUI LONG DE L'IDENTITÉ DE L'EN-TÊTE — celui d'un avatar
     d'auteur (#7828) : le pair (profil, story) en direct, et les détails de la
     conversation partout où l'hôte sait les ouvrir. Un visiteur sans compte
     n'y trouve aucune fiche (#10205). */
  const identityMenu = avatarMenuEntries({
    username: sessionIsGuest ? undefined : peer?.user?.username,
    storyRing: sessionIsGuest ? undefined : peerRing,
    details: details !== undefined,
  });
  /* SUR ORDINATEUR, L'EN-TÊTE N'A PLUS À CHOISIR (#10101). Le repli est une
     économie de TÉLÉPHONE : à 390 px, l'identité et les actions ne tiennent
     pas ensemble. Dès 1024 px (la règle du cadre côte à côte), la bande en
     laissait 900 vides et la conversation n'était nommée nulle part : le
     titre et son sous-titre restent, à côté des actions — la disposition que
     l'aperçu porte déjà (#8821). Déplier y ajoute ce qu'il ajoutait (la
     flamme du jour, les plus actifs), sans plus rien retirer. */
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const besideIdentity = preview || wide || focus;
  /* L'AVATAR OUVRE LA FICHE (#10300) : le profil du pair en direct, les
     détails partout ailleurs ; un visiteur sans compte garde la bascule. Quand
     l'avatar ouvre quelque chose, la bascule de l'en-tête passe à sa BANDE —
     l'espace libre replié, la colonne d'identité dépliée. */
  const avatarDoor = conversationAvatarDoor({
    group,
    guest: sessionIsGuest,
    peerUsername: peer?.user?.username,
    detailsAvailable: details !== undefined,
  });
  const bandToggles = avatarDoor.kind !== 'toggle' && !preview;
  const peerSignals = group
    ? {}
    : { presence: peerPresence, here: peerHere, hereActive: peerActive, hereFocused: peerFocused, ...(peerContour === null ? {} : { ring: peerContour }), ...(peerMood === undefined ? {} : { mood: peerMood, ...(peerMoodPostId === undefined ? {} : { moodPostId: peerMoodPostId }) }) };
  const interfaceLanguage = currentInterfaceLanguage();
  const toggleLabel = translate(interfaceLanguage, expanded ? 'thread.header.collapse' : 'thread.header.expand');
  /* LA RECHERCHE DANS LA CONVERSATION — la loupe était un bouton SANS
     gestionnaire depuis septembre : elle ouvre maintenant le panneau
     (`ThreadSearchPanel`), qui interroge `GET …/messages/search`. Son état
     vit ICI parce que la loupe et le panneau sont tous deux dans cette bande ;
     le fil n'en reçoit que le saut final. */
  const search = useThreadSearch({ conversationId: conversation.id, deps: apiDeps });
  const route = useOptionalRoute();
  useThreadSearchDoor({ search: route?.search, openSearch: search.openSearch });
  const pickSearchHit = (messageId: string) => {
    search.close();
    const landing = searchLandingMode(readingMenuRows.find((row) => row.isCurrent)?.mode);
    if (landing !== null) onSelectReadingMode(landing);
    onJumpToMessage?.(messageId);
  };

  return (
    /*
      LA BANDE FLOTTE, ELLE NE BORNE PLUS (#6213) — `absolute inset-x-0 top-0`
      au lieu d'un `shrink-0` de colonne flex. Elle était HABILLÉE en bande
      flottante (le verre régulier, `styles/glass.css`) mais POSÉE en frère de
      flux : rien ne passait jamais dessous, le flou n'avait rien à flouter,
      et son arête basse TRANCHAIT le contenu (capture porteur 2026-09-12).
      Miroir `floatingHeaderSection`, zIndex 100 au-dessus d'une liste qui
      court jusqu'au bord physique (`ConversationView.swift:1873, 1891`).

      `pt-safe` : la bande est le dernier bord fixe du HAUT, c'est donc elle
      qui porte l'encoche — la racine `h-dvh` ne le peut plus sans empêcher le
      contenu de transiter sous elle (voir `routes/thread.tsx`), et le
      défileur la porte de son côté en marge INTÉRIEURE (`--thread-pad-top`).
    */
    <header
      className="thread-header glass absolute inset-x-0 top-0 z-30 pt-safe"
    >
      <div className="thread-column flex items-center gap-2 px-4 py-2">
        {/*
          LE RETOUR ET SON COMPTE — SUR LA MÊME LIGNE (#6080, retour porteur).

          **Ce site n'a pas de référence iOS** : l'app native n'affiche aucun
          compte « non lus ailleurs » sur son retour, parce qu'elle n'a pas de
          barre de navigation système à décorer. C'est une invention du web, et
          l'alignement se décide donc par la CONVENTION de la plateforme —
          celle de la barre de navigation d'iOS : « ‹ 30 », le chevron et le
          compte sur une seule ligne de base.

          **Ce qu'elle était : la mauvaise POSE de l'atome.** `UnreadCornerBadge`
          l'empilait au coin haut-droit de la cible de 44 : la pastille montait
          au ras du bord supérieur de l'en-tête pendant que le chevron restait
          centré 20 px plus bas, si bien que le couple ne s'alignait ni avec
          lui-même, ni avec la ligne médiane où vivent le chip de mode, les deux
          disques d'action et l'avatar. Une pastille de COIN annote un objet qui
          a de l'air autour de lui ; ici la cible est collée au bord d'une barre
          dense, et c'est la pose de FLUX qu'il fallait — celle qui occupe sa
          propre place, à côté du chevron, sur le même centre.

          La cible tactile GRANDIT avec le contenu (`h-11` et non `size-11`) :
          le compte fait partie du bouton, pas de sa décoration, donc il est
          cliquable comme lui.

          **Et elle ne RÉTRÉCIT jamais sous 44** (`min-w-11`). Première écriture
          sans cette borne : sans compte à afficher — le cas NOMINAL — le
          bouton retombait à 26 × 44, sous le minimum tactile d'Apple.
          `check-reading-mode.mjs` l'a mesuré à 320 px de large et refusé ; il
          avait raison, et c'est la garde qui a rattrapé ce que la capture ne
          montrait pas (une cible trop petite se VOIT très bien, elle se
          manque seulement au doigt).

          `justify-start` implicite, jamais `place-items-center` : ainsi le
          chevron reste à la MÊME abscisse selon qu'il y a un compte ou non.
          Centré dans ses 44, il aurait sauté de 11 px d'une conversation à
          l'autre — un repère de navigation qui se déplace tout seul.
        */}
        {preview || focus ? null : (
          <Link
            to="list"
            data-thread-back=""
            className="flex h-11 min-w-11 shrink-0 items-center gap-1 rounded-chip pe-1"
            style={{ color: 'var(--accent)' }}
            aria-label={
              otherUnread > 0
                ? translate(interfaceLanguage, otherUnread === 1 ? 'thread.header.back.unread.one' : 'thread.header.back.unread.other', { count: String(otherUnread) })
                : translate(interfaceLanguage, 'common.back')
            }
          >
            <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
            <UnreadBadge count={otherUnread} />
          </Link>
        )}

        {besideIdentity || expanded ? (
          <div className="relative flex min-w-0 flex-1 flex-col gap-0.5">
            {bandToggles ? (
              <button
                type="button"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                aria-label={toggleLabel}
                data-thread-band-toggle
                className="absolute inset-0"
              />
            ) : null}
            <h1
              className={`${group && details !== undefined ? '' : 'truncate '}${bandToggles ? 'pointer-events-none relative ' : ''}text-title font-bold`}
              style={{ color: 'var(--color-ios-ink)' }}
            >
              {group && details !== undefined ? (
                /* LE TITRE D'UN GROUPE OUVRE SES DÉTAILS (#7829). La marge
                   négative rend au flux ce que le rembourrage ajoute : la cible
                   fait 44 px de haut sans que l'en-tête grandisse. C'est le
                   bouton qui tronque, pas le titre : un `overflow: hidden` sur
                   le titre rognerait la cible à sa hauteur de texte. */
                <button
                  type="button"
                  onClick={details}
                  aria-haspopup="dialog"
                  data-thread-title-details
                  className="pointer-events-auto block max-w-full truncate text-start"
                  style={{ paddingBlock: 11, marginBlock: -11 }}
                >
                  {title}
                </button>
              ) : (
                <span className="pointer-events-auto">
                  <AvatarMenuTrigger entries={identityMenu} name={title} onOpenDetails={details}>
                    {sessionIsGuest ? title : <PersonName name={title} username={peer?.user?.username} {...(peerRing === undefined ? {} : { storyRing: peerRing })} />}
                  </AvatarMenuTrigger>
                </span>
              )}
            </h1>
            {/* `--color-ios-ink` et non `-ink-2` (#6308) : l'encre secondaire, semi-
                transparente (`color-mix(in srgb, #4338ca 80%, transparent)` en clair),
                posée sur cette bande DE VERRE au pire cas (flou désactivé, #6124/D-51)
                mesure 3,58:1 — sous la barre AA. `--color-ios-ink` y tient (mesuré par
                `scripts/lib/glass-contrast.test.ts`), la hiérarchie reste lisible par la
                taille (`text-mini`) plutôt que par l'opacité. */}
            {/* LE CADENAS NE DIT QUE CE QUI EST VRAI (#10114) : une conversation
                chiffrée de bout en bout. L'effectif ne se lit qu'en membre (#10205). */}
            {subtitle.locked || subtitle.label !== null ? (
              <p className={`${bandToggles ? 'pointer-events-none relative ' : ''}flex items-center gap-1 text-mini`} style={{ color: 'var(--color-ios-ink)' }}>
                {subtitle.locked ? <Glyph name="lock" size={9} style={{ color: 'var(--color-ok)' }} /> : null}
                {subtitle.label}
              </p>
            ) : null}
          </div>
        ) : null}
        {expanded && !preview ? <EngagementPill snapshot={engagement} opensProgression /> : null}
        {besideIdentity || !expanded ? (
          /* GRAPPE D'ACTIONS (#5774, travail 3/3) — c'est ELLE seule qui
             s'efface en mode Bulles pendant le geste
             (`[data-chrome-header="actions"] .thread-header-actions`,
             `thread-scene.css`) ; en rangée plate, c'est l'EN-TÊTE ENTIER
             qui part (`> header`), cette classe n'y ajoute rien de plus.
             En APERÇU (#8821), elle suit l'identité au lieu de la remplacer :
             c'est le titre qui prend la place, pas un espaceur. */
          <div className={`thread-header-actions flex ${besideIdentity ? 'shrink-0' : 'flex-1'} items-center gap-2`}>
            {besideIdentity ? null : bandToggles ? (
              <button
                type="button"
                onClick={onToggleExpanded}
                aria-expanded={expanded}
                aria-label={toggleLabel}
                data-thread-band-toggle
                className="min-w-11 flex-1 self-stretch"
              />
            ) : (
              <span className="flex-1" />
            )}
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
            {/* `shrink-0` (porté par `CHROME_ACTION_HIT_CLASS`) : ces deux
                cibles ne cèdent JAMAIS. Sur un écran étroit, c'est le chip qui
                tronque (voir `reading-mode-chip`). Le disque de 28 vient du
                jeton GÉNÉRÉ depuis iOS (`--size-header-circle`) — il était
                écrit ici en `size-7`, juste par accident, et en `size-8` sur
                l'écran de liste, faux du même accident. */}
{/* L'APPEL (#6382) — vocal ou vidéo, offert par `threadCallOffer`
                (#10207) : « start » lance, « join-only » ne garde que les portes
                d'un appel déjà en cours, « none » ne montre rien. */}
            {callOffer === 'none' || !callsAvailable() ? null : (
              <ThreadCallButton conversationId={conversation.id} title={title} avatar={photo ?? null} group={group} peerKey={group ? null : (peerKey ?? null)} liveCallHint={(conversation as ListConversation).activeCall ?? null} mayStart={callOffer === 'start'} />
            )}
            {/* EN APERÇU, « AGRANDIR » PREND LA PLACE DE LA LOUPE (#9031) :
                l'aperçu ne cherche pas, il ouvre la conversation complète. */}
            {preview ? (
              <Link
                to="thread"
                params={{ conversation: conversation.id }}
                className={CHROME_ACTION_HIT_CLASS}
                style={{ color: 'var(--accent)' }}
                aria-label={translateNotificationRow(currentInterfaceLanguage(), 'notifications.preview.open')}
                data-preview-open-full
              >
                <ChromeActionDisc>
                  <GlyphSvg glyph={MEDIA_GLYPHS.arrowsOutSimple} size={13} />
                </ChromeActionDisc>
              </Link>
            ) : (
              <button
                type="button"
                onClick={search.open ? search.close : search.openSearch}
                aria-expanded={search.open}
                data-thread-search-toggle=""
                className={CHROME_ACTION_HIT_CLASS}
                style={{ color: 'var(--accent)' }}
                aria-label={translate(interfaceLanguage, 'thread.search.open')}
              >
                <ChromeActionDisc>
                  <Glyph name="magnifyingGlass" size={13} />
                </ChromeActionDisc>
              </button>
            )}
          </div>
        ) : null}

        {/* EN APERÇU AUSSI (#9031, demande porteur 2026-10-01) : la pile des
            plus actifs, chacun avec son point, puis l'avatar du groupe. Le
            titre tronque ; son nom entier reste dans les détails. */}
        {(expanded || preview) && group && !sessionIsGuest && activeMembers !== undefined ? (
          <ActiveMembersStack
            members={activeMembers}
            accent={accent}
            storyRingOf={storyRingOf}
            onOpenDetails={details}
            presenceOf={memberPresence}
          />
        ) : null}

        {/* PARTAGER LA CONVERSATION, À CÔTÉ DE L'AVATAR (#10206) — l'aperçu
            garde « Agrandir » comme seule action de sortie. */}
        {preview ? null : <ThreadShareButton conversation={conversation} title={title} />}
        <div className="relative shrink-0">
        <AvatarMenuTrigger entries={identityMenu} name={title} onOpenDetails={details}>
          {/* L'AVATAR OUVRE LA FICHE (#10300) — le profil du pair d'un direct
              (le lien de profil de l'avatar, `Avatar.profileUsername`), les
              détails de toute autre conversation. Sans fiche à ouvrir (un
              visiteur sans compte, #10205), il garde la bascule ; en APERÇU
              (#8821), l'en-tête n'a rien à déplier. */}
          {avatarDoor.kind === 'profile' ? (
            <span className="flex shrink-0" data-thread-avatar-door="profile">
              <Avatar
                initials={initialsOf(title)}
                color={accent}
                size={44}
                name={title}
                profileUsername={avatarDoor.username}
                {...(photo === undefined ? {} : { src: photo })}
                {...peerSignals}
                {...(peerKey === undefined ? {} : { moodAuthorId: peerKey })}
              />
            </span>
          ) : (
            <button
              type="button"
              onClick={avatarDoor.kind === 'details' ? details : preview ? (details ?? onToggleExpanded) : onToggleExpanded}
              {...(avatarDoor.kind === 'details' || preview ? { 'aria-haspopup': 'dialog' as const } : { 'aria-expanded': expanded })}
              aria-label={
                avatarDoor.kind === 'details'
                  ? translate(currentInterfaceLanguage(), 'a11y.avatar.conversation', { name: title })
                  : preview
                    ? translate(interfaceLanguage, 'thread.header.details')
                    : toggleLabel
              }
              {...(avatarDoor.kind === 'details' ? { 'data-thread-avatar-door': 'details' } : {})}
              className="shrink-0"
            >
              {/* LA PHOTO PAR `avatarOf` (#6975) — `peerOf(conversation,
                  viewerId)` était déjà appelé À LA LIGNE SUIVANTE pour la
                  présence : la donnée arrivait jusqu'ici et l'en-tête de CHAQUE
                  conversation rendait des initiales. */}
              <Avatar
                initials={initialsOf(title)}
                color={accent}
                size={44}
                {...(photo === undefined ? {} : { src: photo })}
                {...peerSignals}
              />
            </button>
          )}
        </AvatarMenuTrigger>
        {showsFlame && onDismissFlame !== undefined ? (
          <HeaderFlame snapshot={engagement} replay={flameReplay} onDismiss={onDismissFlame} />
        ) : null}
        </div>
      </div>
      {search.open && !preview ? <ThreadSearchPanel search={search} onPick={pickSearchHit} /> : null}
      {/*
        LE BANDEAU DE COUPURE A QUITTÉ CET EN-TÊTE (#6080) — remplacé par la
        PASTILLE de synchronisation, montée une fois pour toute l'application
        (`components/sync-pill.tsx`, `Shell`).

        Trois raisons, dans cet ordre :

        1. **Il disait MOINS.** « Vos messages ne partiront pas maintenant »
           annonce un empêchement sans dire ce qu'il retient : la pastille
           COMPTE ce qui attend (« Hors ligne — 3 en attente »), parce qu'elle
           lit l'outbox, que cet en-tête ne lisait pas.
        2. **Il ne le disait QUE DANS UN FIL.** Hors ligne sur l'écran de
           liste, l'application n'annonçait rien du tout — et c'est pourtant là
           qu'on arrive.
        3. **Il POUSSAIT la mise en page.** Un `<p>` en flux sous l'en-tête
           déplaçait tout le fil de 22 px à la coupure, puis le remontait à la
           reconnexion — une mise en page qui bouge pour annoncer un état
           transitoire, exactement ce que la case de 84 de la Lentille
           interdit ailleurs. La pastille flotte : elle ne déplace rien.

        Le raisonnement d'origine reste vrai et passe intact à la pastille :
        l'application lit parfaitement hors ligne (précache), donc annoncer la
        coupure par un voile ou une modale punirait l'utilisateur pour un état
        où tout ce qu'il veut lire est déjà là.
      */}
    </header>
  );
}
