import { useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { ConversationRail } from '@/components/conversation-rail';
import { ListHeader } from '@/components/list-header';
import { Glyph } from '@/components/glyph';
import { LensRow } from '@/components/lens-row';
import { LensSection } from '@/components/lens-sticker';
import { LensSkeletonRows } from '@/components/lens-skeleton';
import { useScene } from '@/lib/lens/scene';
import { PINNED_RAIL_RELEASE_RATIO, PINNED_RAIL_REVEAL_RATIO } from '@/lib/lens/pinned-rail';
import { apiConfig } from '@/lib/api/config';
import { rowAction, useConversations } from '@/lib/api/query';
import type { Conversation } from '@/lib/api/types';
import { sessionStore } from '@/lib/api/session';
import { useTypistNames } from '@/lib/api/use-typists';
import { resolveViewer } from '@/lib/api/viewer';
import { conversationStore, effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import { applyFilter, emptinessOf, FILTER_LABELS, LIST_FILTERS, orderConversations, type ListFilter } from '@/lib/lens/filters';
import { partagerInvitation, RETOUR_INVITATION } from '@/lib/view/invitation';
import { QuickActions, type QuickAction } from '@/components/quick-actions';
import { resolveLensSections } from '@/lib/lens/sections';
import { useOnline } from '@/lib/net/online';
import { useOutOfView } from '@/lib/view/use-out-of-view';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useMinute } from '@/lib/view/use-minute';

/**
 * L'ECRAN DE LISTE.
 *
 * Anatomie reprise d'iOS (`ConversationListView`) : un en-tete FLOTTANT (il n'y
 * a aucune barre de navigation systeme dans l'app iOS), un rail de stories, une
 * rangee de filtres, l'empilement de cartes, et une barre de recherche EN BAS —
 * pas en haut. Ce dernier point est le plus contre-intuitif pour qui vient du
 * web, et c'est un choix d'accessibilite : sur un telephone tenu d'une main, le
 * haut de l'ecran est hors de portee du pouce.
 */

/**
 * LE RAIL ET SA BANDE ÉPINGLÉE VIVENT DÉSORMAIS DANS LEURS PROPRES MODULES
 * (#6103, décision #6070) — `components/conversation-rail.tsx` (la cellule,
 * la tuile fantôme de chargement, l'exclusion des archivées) et
 * `components/list-header.tsx` (la bascule titre ↔ bande). Voir leurs
 * doc-comments pour la géographie complète : le grand rail vit DANS la vue
 * défilante (`<ul id="contenu">` ci-dessous), la bande compacte DANS
 * l'en-tête — jamais superposés au même endroit, contrairement à l'ancienne
 * forme qui compactait le rail SUR PLACE et laissait une réserve de hauteur
 * vide une fois défilé.
 */

/**
 * `rowAction` (#5650, F2/F4/§5 étape 9) — RÉFÉRENCE DE MODULE STABLE
 * importée de `lib/api/query.ts` (« l'adaptateur UNIQUE ») : elle applique
 * l'override optimiste PUIS, en source `gateway`, appelle le port réel et
 * arbitre l'issue (`performRowAction`) — `handleRowAction` (module-level, ce
 * fichier) n'existe plus : sa seule responsabilité (l'override immédiat)
 * vit désormais avec l'appel réseau qui la CONFIRME ou la DÉFAIT, un seul
 * geste au lieu de deux fils divergents.
 */

/**
 * L'ÉCHEC DE LA LISTE, à CACHE VIDE — iOS `.syncError`
 * (`ConversationListView.swift:1761-1793`) : icône, titre, sous-titre,
 * « Réessayer » ⇒ `refetch()`, plus la phrase « Hors ligne » quand c'est le
 * cas (même forme que `ProgressionError`, `routes/progression.tsx`).
 *
 * Rendu comme UN `<li>`, jamais un conteneur à part : cet écran garde
 * `<ul ref={frame} id="contenu">` MONTÉ EN PERMANENCE (chargement, échec,
 * contenu réel confondus) — c'est ce qui laisse `useScene(frame)` attacher
 * ses écouteurs UNE fois, au montage, sans jamais les perdre quand l'état
 * bascule (§5 étape 9, revue-correction : un `<ul>` REMPLACÉ par un autre
 * nœud laissait la scène de perspective orpheline — mesuré par
 * `check-lens.mjs`, six invariants rompus).
 */
/** Référence STABLE — un `[]` littéral par rendu changerait l'identité de
 * `conversations` à chaque image et défairait les mémos qui en dépendent. */
const EMPTY_CONVERSATIONS: readonly Conversation[] = [];

/**
 * `content-center` ET NON `place-items-center` SEUL (#5650, revue-correction)
 * — `grid flex-1 place-items-center` centre chaque enfant DANS SA RANGÉE, et
 * les rangées implicites se répartissent sur toute la hauteur : à l'écran,
 * l'icône était collée en haut, le titre au tiers, le bouton en bas — quatre
 * éléments éparpillés au lieu d'un bloc. `align-content: center` TASSE les
 * rangées au centre ; `gap-3` redevient l'espacement réel entre elles.
 */
function ListError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {online ? 'Impossible de charger vos conversations' : 'Hors ligne'}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {/*
          UNE PHRASE DE PRODUIT, JAMAIS LE MESSAGE DU SERVEUR
          (revue-correction #5650) — cette ligne rendait `error.message`,
          c'est-à-dire la CHAÎNE PLATE que la passerelle sert
          (`sendError`) : « Internal server error », « Unauthorized access
          to this conversation »… de l'ANGLAIS technique sur le premier
          écran d'un lecteur francophone, et une fuite d'interne quand la
          chaîne nomme une contrainte ou une table. iOS ne fait pas
          autrement : `conversations.error.title` + un sous-titre FIXE
          (`ConversationListView.swift:1761-1793`), jamais l'erreur brute.
        */}
        {online
          ? 'Réessayez dans un instant — vos messages sont en sécurité.'
          : 'Vos conversations s’afficheront à la reconnexion.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        Réessayer
      </button>
    </li>
  );
}

/**
 * **Les portes RÉELLES du démarrage — et elles seules.**
 *
 * iOS en peint NEUF (`ConversationListQuickActions`) : chercher des membres,
 * voir ses contacts, ses affiliations, écrire, story, mood, post, inviter,
 * lien raccourci. La v3.1 n'a de route pour AUCUNE d'entre elles
 * (`route-table.tsx` : `list`, `thread`, `login`, `signup`, `progression`) —
 * les porter toutes ici peindrait huit contrôles qui mentent, c'est-à-dire
 * exactement ce que la revue #5559 a dû DÉFAIRE sur l'en-tête de cet écran.
 *
 * Reste celle qui n'a besoin d'aucune route pour AGIR : inviter. C'est aussi
 * la seule des quatre que l'état vide promettait (« un message, une story, un
 * mood, un post — ou invitez vos amis ») qu'on puisse tenir aujourd'hui ; la
 * phrase a donc été réécrite pour ne plus promettre les trois autres.
 *
 * Les huit portes manquantes sont un chantier de parité, pas un oubli : elles
 * arriveront avec leurs écrans et s'ajouteront ICI — une ligne par porte,
 * impossible à ajouter sans son effet puisque `run` n'est pas optionnel.
 */
const ACTIONS_DE_DEMARRAGE: readonly QuickAction[] = [
  {
    key: 'inviter',
    label: 'Inviter des amis',
    hint: 'Partagez votre lien Meeshy : c’est ainsi que naît une première conversation.',
    glyph: 'linkSimple',
    // HÉROS, alors qu'iOS range `invite` en TUILE. L'écart est assumé et
    // TEMPORAIRE : les trois héros d'iOS — chercher des membres, ses contacts,
    // ses affiliations — n'ont aucune porte sur la v3.1 (#5765). Laisser le
    // rang vacant montrerait une seule petite tuile à qui démarre, là où la
    // directive demande un gros bouton. Le jour où les trois héros arrivent,
    // celui-ci reprend son rang de tuile.
    hero: true,
    run: async () => RETOUR_INVITATION[await partagerInvitation(window.location.origin)],
  },
];

export default function ConversationsScreen() {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const frame = useRef<HTMLUListElement | null>(null);

  /**
   * **LA BANDE ÉPINGLÉE PREND LA PLACE DU TITRE QUAND LE GRAND RAIL EST
   * SORTI DU SCROLLPORT** (#6103, décision #6070) — voir `ListHeader` et
   * `ConversationRail` pour la géographie complète, et `pinned-rail.ts` pour
   * les deux seuils. `useOutOfView` délègue la mesure à un
   * `IntersectionObserver` : aucun `scrollTop` lu à la main ici, contrairement
   * à `useScene` juste en dessous, qui a besoin d'une valeur CONTINUE (la
   * perspective) là où cette bascule n'est qu'un booléen.
   *
   * `observeGrandRail` est une réf de RAPPEL, jamais un `RefObject` : le grand
   * rail QUITTE le DOM sur le chemin d'échec (cache vide + erreur) et y
   * REVIENT à la reprise — voir le doc-comment de `useOutOfView` pour les deux
   * défauts que le `RefObject` laissait passer.
   */
  const { pinned, observe: observeGrandRail } = useOutOfView({
    root: frame,
    revealRatio: PINNED_RAIL_REVEAL_RATIO,
    releaseRatio: PINNED_RAIL_RELEASE_RATIO,
  });
  const { focus, level } = useScene(frame);
  const online = useOnline();

  /**
   * LA SOURCE (#5650) — `useConversations()` sert les fixtures OU la
   * passerelle selon `apiConfig.source`, résolu à la CONSTRUCTION. `session`
   * et `viewer` suivent la même règle que `thread.tsx` (`resolveViewer`,
   * `lib/api/viewer.ts`) : en fixtures, l'identité du POC ; en gateway,
   * la session RÉELLE.
   */
  const list = useConversations();
  /** `loading` — CACHE VIDE ET requête en vol, jamais « une requête est en
   * cours » : un rafraîchissement de fond sur un cache PLEIN ne remet ni
   * squelette ni `aria-busy` (§ Instant App Principles). Et `isError` sur un
   * cache vide est un ÉCHEC, pas un chargement — annoncer « Chargement des
   * conversations » au-dessus d'un `role="alert"` masquerait l'alerte pour
   * un lecteur d'écran, qui n'annonce pas le contenu d'une région occupée. */
  const loading = list.data === undefined && !list.isError;
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiConfig.source, session }), [session]);
  const { languages: readerLanguages } = useReaderLanguages();
  const conversations = list.data ?? EMPTY_CONVERSATIONS;
  const overrides = useStore(conversationStore, (s) => s.overrides);
  /**
   * QUI ÉCRIT, PAR CONVERSATION (#5793) — l'écran s'abonne UNE fois et
   * distribue : une rangée est rendue dans un `.map`, elle ne peut pas appeler
   * de hook. Même forme que `overrides` juste au-dessus, et `sameRowProps`
   * (`components/lens-row.tsx`) borne le coût — seule la rangée dont le nom
   * change se re-rend.
   */
  const typists = useTypistNames(viewer.id ?? '');
  /** Le corpus du RAIL — `ConversationRail` applique lui-même la même
   * précédence iOS que `applyFilter` (l'archivé sort) : un seul site, pour
   * les DEUX géographies (grande et épinglée). */
  const railProps = useMemo(
    () => ({ conversations, viewerId: viewer.id ?? '', overrides, loading }),
    [conversations, viewer.id, overrides, loading],
  );

  /**
   * LES SECTIONS (#5694, écart 6) — `resolveLensSections` re-partitionne le
   * corpus FILTRÉ (recherche et archives déjà réglées par `applyFilter`) en
   * ÉPINGLES → EN DIRECT → AUJOURD'HUI → HIER → CETTE SEMAINE → PLUS ANCIEN ;
   * chaque section est déjà TRIÉE en interne (`sortConversations`), donc
   * l'ordre issu de `orderConversations` ne sert plus qu'à `emptinessOf` et
   * à la queue de liste — jamais au rendu, désormais porté par les sections.
   * `now`/`timeZone` sont INJECTÉS depuis la peau, jamais lus dans la loi.
   *
   * LES TROIS PASSES SONT MÉMORISÉES ENSEMBLE (revue #5694). Cet écran se
   * re-rend à CHAQUE élection de la scène — plusieurs fois par seconde
   * pendant un défilement — et à chaque entrée/sortie de scène. Refaire à
   * chacun de ces rendus un filtre, un tri et un partitionnement, tous les
   * trois en O(n log n) sur le corpus ENTIER, c'est la dépense qu'on ne
   * peut pas se permettre le jour où la liste sert des centaines de
   * conversations — et c'est la forme que les trente écrans suivants
   * copieront. Les entrées réelles sont peu nombreuses et stables : le
   * filtre, la recherche, les remplacements optimistes du magasin, le fuseau
   * — et LA MINUTE, sans laquelle les sections temporelles gèleraient au
   * montage et « Aujourd'hui » resterait « Aujourd'hui » après minuit.
   */
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const minute = useMinute();
  const { visible, emptiness, sections } = useMemo(() => {
    const kept = applyFilter({ conversations, filter, search, viewerId: viewer.id ?? '', overrides });
    const ordered = orderConversations(kept, overrides);
    return {
      visible: ordered,
      emptiness: emptinessOf(conversations, ordered),
      sections: resolveLensSections({ conversations: kept, overrides, now: new Date(), timeZone }),
    };
    // `minute` n'entre dans AUCUNE des expressions ci-dessus : c'est
    // volontaire — elle y est la clé qui fait ré-évaluer `new Date()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, filter, search, viewer.id, overrides, timeZone, minute]);

  return (
    /* `pt-safe` : l'encoche HAUTE est portee par le CADRE de l'ecran, dans ses
       100dvh (box-sizing: border-box) — jamais par `<body>`, qui l'AJOUTAIT
       et poussait la barre de recherche hors du cadre (#5604, app.css). */
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <ListHeader pinned={pinned} railProps={railProps} />

      {/*
        AUCUN `gap` : l'espacement des cartes est ce qui les faisait lire comme
        des boîtes. La Lentille est un flux — les rangées se touchent, et c'est
        la perspective qui les sépare.
      */}
      {/*
        `pt-2` NE VIT PLUS ICI (#5694, correction défaut 3) — c'est `LensSection`
        qui ouvre l'espace au-dessus de CHAQUE en-tête, marge comprise pour la
        première. Un `padding-top` sur ce scrollport décalait le repère de
        `position: sticky` (borné à sa boîte de PADDING) à `y = 8` au lieu de
        `y = 0` : 8 px de rangée défilaient hors de portée de l'en-tête collant
        et s'y peignaient tranchés au-dessus. Voir le doc-comment de `LensSection`.
      */}
      {/*
        `<ul ref={frame} id="contenu">` reste MONTÉ EN PERMANENCE — voir le
        doc-comment de `ListError` : c'est ce qui laisse `useScene(frame)`
        attacher ses écouteurs UNE fois et ne jamais les perdre quand l'état
        du réseau bascule. `aria-busy`/`aria-label` reflètent l'état de
        CHARGEMENT sur ce MÊME nœud, jamais un second conteneur.
      */}
      <ul
        ref={frame}
        id="contenu"
        className="flex flex-1 flex-col overflow-y-auto px-2"
        {...(loading ? { 'aria-busy': true, 'aria-label': 'Chargement des conversations' } : {})}
      >
        {/*
          LE RAIL ET LES FILTRES VIVENT DÉSORMAIS DANS LA VUE DÉFILANTE
          (#6103, décision #6070) — miroir `ConversationListView.swift:
          1659-1671` : « lentilleRailOrStoryTray » puis « composedFilterChips »
          sont les DEUX PREMIERS enfants du contenu qui défile, AVANT les
          sections. `-mx-2` neutralise le `px-2` de ce scrollport — même
          technique que `LensSection` pour un plein-bord — puisque
          `ConversationRail`/le `<nav>` posent leur propre `px-4`.

          Le rail GRANDE ne compacte plus JAMAIS lui-même : seule la bande
          `pinned` de `ListHeader`, ailleurs dans le DOM, prend cette forme.
          `check-lens.mjs` mesure les deux faces : la bande compacte bien
          quand le grand rail sort du champ, et pourtant AUCUNE rangée de la
          Lentille ne bouge.

          `inert={pinned}` (#6103, revue-correction) — LE MÊME booléen qui
          fait apparaître la bande dans `ListHeader` retire le grand rail de
          l'ordre de tabulation et de l'arbre d'accessibilité pendant qu'elle
          le remplace : sans lui, ses neuf liens restaient DOUBLÉS avec ceux
          de la bande (même corpus, même `aria-label`), et un `Tab` depuis la
          dernière tuile de la bande y retombait — forçant le navigateur à
          faire défiler ce rail hors champ DANS la vue, ce qui ramenait la
          liste en tête et démontait la bande pour rien de plus qu'un
          `Tab`. Voir le doc-comment de `ConversationRail` pour le détail.
        */}
        <li className="-mx-2 shrink-0">
          <ConversationRail ref={observeGrandRail} variant="grande" inert={pinned} {...railProps} />
        </li>
        <li className="-mx-2 shrink-0">
          <nav aria-label="Filtres" className="overflow-x-auto">
            <ul className="flex gap-2 px-4 py-1.5">
              {LIST_FILTERS.map((f) => {
                const active = f === filter;
                return (
                  <li key={f}>
                    <button
                      type="button"
                      onClick={() => setFilter(f)}
                      aria-pressed={active}
                      className="rounded-chip px-3 py-1.5 text-title font-medium whitespace-nowrap transition-colors"
                      style={
                        active
                          ? { backgroundColor: 'var(--color-ios-brand)', color: 'white' }
                          : {
                              backgroundColor: 'var(--color-ios-card)',
                              color: 'var(--color-ios-ink-2)',
                              border: '0.5px solid var(--color-edge)',
                            }
                      }
                    >
                      {FILTER_LABELS[f]}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </li>
        {/*
          LES TROIS ÉTATS DU RÉSEAU (#5650, F5/§5 étape 9), même doctrine que
          `ConversationListViewModel.performLoadConversations` : `list.data`
          présent (même STALE) ⇒ peindre SANS spinner ; `undefined` ET
          `isError` (cache VIDE, requête en échec) ⇒ `ListError` avec
          « Réessayer » ; `undefined` seul (cache vide, requête en vol) ⇒ le
          squelette à géométrie exacte. Un refetch de fond qui échoue alors
          qu'une donnée est déjà affichée NE CHANGE RIEN à l'écran (iOS
          `.offline` garde le snapshot) : c'est la branche `list.data`
          présent qui l'assure, quel que soit `list.isError`.
        */}
        {list.data === undefined && list.isError ? (
          <ListError online={online} onRetry={() => void list.refetch()} />
        ) : loading ? (
          <LensSkeletonRows />
        ) : (
          <>
        {/*
          SECTIONS ET STICKERS COLLANTS (#5694, écart 6) — `pinnedViews:
          [.sectionHeaders]` côté iOS. Chaque section est un BLOC (`LensSection`)
          qui contient son en-tête collant puis ses rangées : `position: sticky`
          fait le reste, sans second conteneur de défilement. Le bloc n'est pas
          décoratif — c'est lui qui BORNE le collant, donc qui fait chasser un
          en-tête par le suivant au lieu de les empiler tous en haut (revue
          #5694 ; voir le doc-comment de `LensSticker`).
        */}
        {sections.map((section) => (
          <LensSection key={section.id} id={section.id}>
            {section.conversations.map((c) => (
              <LensRow
                key={c.id}
                conversation={c}
                languages={readerLanguages}
                viewerId={viewer.id ?? ''}
                flags={effectiveFlagsOf(c, overrides)}
                unreadCount={effectiveUnreadOf(c, overrides)}
                onRowAction={rowAction}
                typist={typists[c.id]}
                status={{
                  /**
                   * L'APLATISSEMENT AU REPOS (#5694, écart 2) —
                   * `LentilleMagnifiableRow.isMagnified = scene.level > 0 &&
                   * election.electedId == id`
                   * (`Mode/LentilleMagnification.swift:435-437`) : la
                   * rangée élue ne reste MAGNIFIÉE visuellement qu'en scène
                   * ACTIVE. `level` retombe à 0 après `SCENE_REST_DELAY_MS`
                   * d'immobilité (`lens/scene.ts`) — sans ce gate, le
                   * supplément magnifié restait affiché indéfiniment après
                   * la fin du défilement.
                   */
                  magnified: level > 0 && focus === c.id,
                  /* La perspective est écrite par la scène directement dans le
                     style du nœud, à chaque image. Ces valeurs-ci ne sont que
                     l'état de DÉPART, avant la première passe. */
                  alpha: 1,
                  scale: 1,
                  breathing: 0,
                }}
              />
            ))}
          </LensSection>
        ))}
        {/*
          DEUX états VIDES DISTINCTS (#5559 T15) : `empty-corpus` (aucune
          conversation du tout — l'écran de DÉMARRAGE) contre `empty-filter`
          (un filtre ou une recherche qui ne rend rien sur un corpus non
          vide). Les confondre ferait dire « aucune conversation ne
          correspond à… » à un compte qui n'en a encore AUCUNE — un message
          qui accuse la recherche d'un vide qu'elle n'a pas produit.
        */}
        {emptiness === 'empty-corpus' ? (
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="users" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation pour l’instant.
            </p>
            {/*
              LA SORTIE DE L'ÉCRAN DE DÉMARRAGE (2026-09-08). Cet état récitait
              « Un message, une story, un mood, un post — ou invitez vos amis »
              — la phrase d'iOS, où elle SURMONTE neuf boutons — sous ZÉRO
              bouton. Il annonçait quatre gestes et n'en offrait aucun, quand
              `empty-filter`, douze lignes plus bas, a toujours eu sa sortie.

              Un état vide dont on ne voit pas l'issue est un cul-de-sac : le
              commentaire de la cale le dit déjà pour l'état filtré. Celui-ci
              était pire — il DÉCRIVAIT l'issue sans la donner.
            */}
            <QuickActions
              title="Commencez ici"
              subtitle="Meeshy s’écrit à plusieurs — invitez quelqu’un à vous rejoindre."
              actions={ACTIONS_DE_DEMARRAGE}
              conversationCount={0}
            />
          </li>
        ) : null}
        {emptiness === 'empty-filter' ? (
          /* Status vide : jamais un spinner, jamais une phrase seule — un
             contour pointille de CONTROLE, un glyphe, une phrase, une sortie. */
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="magnifyingGlass" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation ne correspond à « {search || FILTER_LABELS[filter]} ».
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
              className="rounded-chip px-5 text-body font-semibold text-white"
              style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
            >
              Tout afficher
            </button>
          </li>
        ) : null}
        {/*
          LA QUEUE DE LISTE — une demi-hauteur de fenêtre de vide sous la
          dernière rangée. Sans elle, la bande de focus, ancrée à 140 du bas,
          ne pourrait jamais atteindre les dernières conversations : elles
          resteraient à jamais non magnifiées, et la liste se terminerait par
          une zone morte que rien n'explique.

          ELLE N'EXISTE QUE S'IL Y A UNE RANGÉE À MAGNIFIER. Rendue
          inconditionnellement, elle poussait l'état vide 50 dvh plus bas :
          mesuré à 390×844, le panneau « Aucune conversation ne correspond… »
          commençait à 688 px et finissait à 899 — sa SORTIE, le bouton « Tout
          afficher », tombait donc hors de l'écran. Un état vide dont on ne
          voit pas l'issue est un cul-de-sac, et une cale destinée à la
          magnification n'a rien à caler quand il n'y a rien à magnifier.
        */}
        {/*
          ET LA CALE PORTE LES ACCÈS RAPIDES (2026-09-08). iOS met exactement
          ici les siens — `ConversationListView.listTail`, haut d'une demi-région
          visible, la MÊME hauteur et la MÊME raison. La v3.1 n'y mettait qu'un
          `aria-hidden` : une demi-fenêtre de vide sous la dernière ligne, sans
          une issue, là où l'utilisateur arrive précisément parce qu'il a fini de
          lire sa liste et cherche quoi faire.

          La hauteur reste : c'est elle qui laisse la dernière conversation
          rejoindre la bande de focus. Ce qui change, c'est qu'elle n'est plus
          VIDE — et elle cesse donc d'être `aria-hidden`, puisqu'elle porte
          maintenant quelque chose à lire.
        */}
        {/*
          L’ORDRE SUIT iOS (2026-09-09) : la branche VIDE se rend AVANT `listTail`
          (`ConversationListView` — le `if groupedConversations.isEmpty` précède la
          queue). La v3.1 les avait dans l’ordre inverse : en recherche infructueuse,
          le bloc d’accès rapides s’intercalait AU-DESSUS du « Aucune conversation ne
          correspond à… », si bien que la réponse à ce qu’on venait de taper arrivait
          après une proposition de faire autre chose.
        */}
        {/*
          ELLE EST RENDUE DÈS QU'ON A UNE CONVERSATION — jamais conditionnée à
          ce que le FILTRE laisse voir (correction porteur 2026-09-09).

          Mesuré sur iOS : `listTail` vit à l'indentation de `if
          groupedConversations.isEmpty { … } else { … }`, donc DEHORS — la queue
          se rend dans TOUTES les branches, y compris « la recherche ne rend
          rien ». La v3.1 la conditionnait à `visible.length > 0`, le compte
          FILTRÉ : chercher un mot absent effaçait d'un coup la seule aide de
          l'écran, exactement au moment où l'on ne trouve pas ce qu'on cherche.

          La HAUTEUR, elle, reste conditionnée aux rangées : c'est une cale de
          magnification, et elle n'a rien à caler quand rien n'est affiché.
          Sans cette distinction, l'état filtré vide repartait 50 dvh plus bas —
          le défaut que le commentaire ci-dessus a déjà corrigé une fois.
        */}
        {conversations.length > 0 ? (
          <li style={{ minHeight: visible.length > 0 ? '50dvh' : 0, flexShrink: 0 }}>
            <QuickActions
              title="Et maintenant ?"
              subtitle="Meeshy s’écrit à plusieurs — invitez quelqu’un à vous rejoindre."
              actions={ACTIONS_DE_DEMARRAGE}
              conversationCount={conversations.length}
            />
          </li>
        ) : null}
          </>
        )}
      </ul>

      {/* La barre de recherche EN BAS — a portee du pouce (cf. doc-comment). */}
      <div className="shrink-0 px-4 pt-2 pb-safe">
        <div
          className="flex items-center gap-3 px-4 py-3 backdrop-blur-xl"
          style={{
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 85%, transparent)',
            border: '1px solid var(--color-edge)',
          }}
        >
          <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une conversation"
            className="min-w-0 flex-1 bg-transparent text-bubble outline-none placeholder:text-ios-ink-3"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="grid size-6 place-items-center">
              <Glyph name="x" size={14} title="Effacer" style={{ color: 'var(--color-error)' }} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
