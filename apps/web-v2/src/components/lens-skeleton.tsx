import { useEffect, useState } from 'react';

import lentilleTokens from '@meeshy/shared/design/lentille-tokens.json';

import { ROW_HEIGHT } from './lens-row';

/**
 * LE SQUELETTE DE LA LISTE (#5650, F5/§5 étape 9) — CACHE VIDE seulement
 * (§ Instant App Principles, `CLAUDE.md` racine : « No spinner when cache
 * has data »). Miroir `LentilleSkeletonRow` (`ConversationListView.swift:
 * 1698-1710`) : SIX lignes, géométrie EXACTE de `LensRow` (`ROW_HEIGHT`
 * IMPORTÉ, jamais un `84` réécrit — un futur changement de cote romprait ce
 * fichier au COMPILATEUR plutôt qu'en silence à l'exécution) — sinon la
 * liste saute latéralement/verticalement quand les placeholders sont
 * remplacés par les rangées réelles (§4, `check-gateway-build.mjs`).
 *
 * L'APPARITION est un `transition` d'`opacity` (JAMAIS une `@keyframes` —
 * la charte n'en autorise qu'UNE dans tout le dépôt, déjà prise par
 * `typingDot`, `app.css`) ; la règle 32 (`prefers-reduced-motion`) la coupe
 * déjà GLOBALEMENT (`app.css`, `transition-duration: 0.01ms !important`),
 * donc rien de spécifique à écrire ici pour ce cas.
 */
const PLACEHOLDER_BAR_STYLE = { borderRadius: 4, backgroundColor: 'var(--color-ios-card)' } as const;

function SkeletonRow({ delayMs }: { readonly delayMs: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(true), []);

  return (
    <li data-skeleton-row style={{ height: ROW_HEIGHT, flexShrink: 0, position: 'relative' }}>
      <div
        className="absolute inset-0 flex items-center gap-3 pl-3 pr-12"
        style={{ opacity: visible ? 1 : 0, transitionProperty: 'opacity', transitionDuration: '300ms', transitionDelay: `${delayMs}ms` }}
      >
        <div className="shrink-0 rounded-full" style={{ width: 44, height: 44, backgroundColor: 'var(--color-ios-card)' }} />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div style={{ ...PLACEHOLDER_BAR_STYLE, width: '40%', height: 15 }} />
          <div style={{ ...PLACEHOLDER_BAR_STYLE, width: '70%', height: 13 }} />
          <div style={{ ...PLACEHOLDER_BAR_STYLE, width: '20%', height: 12 }} />
        </div>
      </div>
    </li>
  );
}

/**
 * LE BANDEAU DE SECTION FANTÔME — MÊME BOÎTE que `LensSticker`
 * (`components/lens-sticker.tsx`, tokens `lentilleTokens.list.sticker`),
 * sans son LIBELLÉ (une barre neutre à la place du texte). Sans lui, le
 * contenu réel (TOUJOURS sous au moins UN en-tête de section — `LensSection`
 * en rend un inconditionnellement, `lens-sticker.tsx:36-51`) apparaissait
 * DÉCALÉ vers le bas par rapport au squelette : mesuré par
 * `check-gateway-build.mjs`, un saut de ~32 px de la première rangée entre
 * le squelette et le contenu réel — exactement la hauteur de ce bandeau,
 * absent du squelette avant ce correctif. Les cotes viennent de la MÊME
 * table que `LensSticker` (D-4) : cette boîte ne peut pas diverger de la
 * vraie sans qu'un changement de token les fasse bouger ENSEMBLE.
 */
function SkeletonSectionStub() {
  const sticker = lentilleTokens.list.sticker;
  return (
    <h2
      aria-hidden="true"
      className="-mx-2 px-4 uppercase"
      style={{
        // `marginTop` reproduit celui de `LensSection` — `<li data-section>
        // style={{ marginTop: … }}` (`lens-sticker.tsx:100`), le PREMIER
        // dénivelé avant tout en-tête réel : sans lui, le bandeau fantôme
        // avait la BONNE hauteur mais partait 8 px trop HAUT, laissant le
        // même saut mesuré par `check-gateway-build.mjs`.
        marginTop: lentilleTokens.list.row.marginVertical,
        fontSize: sticker.size,
        fontWeight: sticker.weight,
        letterSpacing: `${sticker.letterSpacingEm}em`,
        padding: `${sticker.padding.vertical}px ${sticker.padding.horizontal}px`,
      }}
    >
      {/* MÊME ÉLÉMENT, MÊME TYPOGRAPHIE que `LensSticker` — c'est ce qui
          rend sa hauteur EXACTEMENT identique sans dupliquer le calcul de
          hauteur de ligne du navigateur. Le TEXTE, lui, est invisible : ce
          n'est pas encore un vrai libellé de section. */}
      <span style={{ visibility: 'hidden' }}>Chargement</span>
    </h2>
  );
}

const ROWS = [0, 1, 2, 3, 4, 5] as const;
const STAGGER_MS = 40;

/**
 * LE BANDEAU FANTÔME PUIS LES SIX LIGNES — sans le `<ul>` englobant, pour un
 * hôte qui tient DÉJÀ sa propre liste stable (`routes/conversations.tsx`, où
 * `<ul ref={frame}>` doit rester le MÊME nœud DOM entre le chargement et le
 * contenu réel : `useScene(frame)` attache ses écouteurs de défilement une
 * SEULE fois, au montage — un `<ul>` REMPLACÉ par un autre laisserait la
 * scène orpheline, jamais réarmée). `LensSkeleton`, ci-dessous, en est
 * l'usage AUTONOME.
 */
export function LensSkeletonRows() {
  return (
    <>
      <SkeletonSectionStub />
      {ROWS.map((i) => (
        <SkeletonRow key={i} delayMs={i * STAGGER_MS} />
      ))}
    </>
  );
}

export function LensSkeleton() {
  return (
    <ul id="contenu" aria-busy="true" aria-label="Chargement des conversations" className="flex flex-1 flex-col overflow-hidden px-2">
      <LensSkeletonRows />
    </ul>
  );
}
