/**
 * `FocalBridgeRow` — rangée pont/agent pointillée (WF-112).
 *
 * lentille-implementation-contract §4.3, colonne Fil, ligne « Agent ✦ » :
 * « rangée pont/agent : bord pointillé 1.5, radius 14 ». Bord + radius par
 * les tokens `--lentille-thread-agent-row-*` (garde R15).
 *
 * SURFACE STUB (mission WF-112 : « surfaces stub, zéro donnée fabriquée,
 * C1/C2/C3 ») — ce composant est un rang PRÉSENTATIONNEL PUR, testé
 * isolément, NON monté dans l'arbre vivant `FocalThread` par ce commit :
 *
 *   - C1 (étage déterministe = plancher permanent) : le texte du pont — et
 *     son glyphe ✦ — viennent de `LentilleBridgeLine` (WL-102), RÉUTILISÉ
 *     VERBATIM (pas réécrit, pas dupliqué) : c'est déjà le composant qui
 *     résout `ConversationBridge` (étages `fallback` déterministe / `agent`)
 *     pour la liste, et qui applique déjà le contraste AA garanti
 *     (`resolveBridgeTintColor`, `lentille-contrast.ts`). Ce fichier
 *     n'ajoute QU'UN conteneur — le bord pointillé propre au fil — jamais
 *     une seconde loi de résolution de pont.
 *   - C2 (zéro donnée fabriquée) : `bridge === null` ⇒ ce composant ne rend
 *     RIEN (pas de placeholder inventé, pas de rang vide). Aucun appel de ce
 *     fichier ne construit un `ConversationBridge` à partir de rien.
 *   - C3 (`agent_grammar` reste OFF, §5.2) : la SEULE surface « agent »
 *     construite par ce chantier est la RÉUTILISATION du pont déterministe
 *     existant — aucune grammaire d'agent nouvelle (glyphe additionnel,
 *     coloration spéciale, impersonation) n'est introduite ici. Le jour où
 *     `agent_grammar` s'allume par décision produit écrite, c'est
 *     `LentilleBridgeLine` (son unique producteur de phrase) qui en portera
 *     l'évolution — pas ce conteneur.
 *
 * NON câblé dans `FocalThread` (documenté dans le rapport WF-112) : brancher
 * une source de données réelle pour un pont PAR MESSAGE dans le fil exige un
 * étage gateway/agent qui n'existe pas encore côté web pour cette vague
 * (V5, hors périmètre WF-110..113) — `useLentilleBridges` (WL-103) rend déjà
 * `null` pour toute conversation en l'absence de cache local (documenté dans
 * son propre en-tête) ; l'utiliser ici aurait affiché une rangée vide en
 * permanence, ce que ce composant refuse PAR CONSTRUCTION (retour `null`).
 */
'use client';

import type { ConversationBridge } from '@meeshy/shared/types/conversation-bridge';
import { LentilleBridgeLine } from '../lentille/LentilleBridgeLine';

export interface FocalBridgeRowProps {
  readonly bridge: ConversationBridge | null;
  readonly accentHex: string;
  readonly preferredLanguages: readonly string[];
}

export function FocalBridgeRow({ bridge, accentHex, preferredLanguages }: FocalBridgeRowProps) {
  if (!bridge) return null;

  return (
    <div
      data-testid="focal-bridge-row"
      className="flex items-center gap-2 mt-1"
      style={{
        marginLeft: 'var(--lentille-thread-line2-indent)',
        borderStyle: 'dashed',
        borderWidth: 'var(--lentille-thread-agent-row-border-size)',
        borderRadius: 'var(--lentille-thread-agent-row-radius)',
        padding: 'var(--lentille-thread-row-padding-vertical) var(--lentille-thread-row-padding-horizontal)',
        fontSize: 'var(--lentille-thread-line2-size)',
      }}
    >
      <LentilleBridgeLine bridge={bridge} accentHex={accentHex} preferredLanguages={preferredLanguages} />
    </div>
  );
}

export default FocalBridgeRow;
