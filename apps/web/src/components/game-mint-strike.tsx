import { useEffect, useRef, useState, type ComponentType } from 'react';

import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MintScene } from '@/components/game';
import type { MintCeremonyProps } from '@/components/game/mint-ceremony';
import { CHOREOGRAPHY_DURATION_MS } from '@/lib/game/choreography';
import { registerStrikeStage, strikeGate, type StrikeGate } from '@/lib/game/strike-gate';

/**
 * MEE ET MEO FRAPPENT UNE MEESH (#9537, conception V ; la cérémonie : #11177, épopée § 7) — la scène de la frappe,
 * posée là où l'on frappe : le HÉROS de frappe de Progression et la feuille que le compteur de Meeshes ouvre en
 * haut à droite. Une seule pièce de code pour les deux, un seul geste.
 *
 * L'hôte incrémente `strikeKey` à chaque intention de frappe (`GameActions`) : la CÉRÉMONIE part aussitôt, en plein
 * écran (`components/game/mint-ceremony.tsx`, chargée à part et préchargée au montage) — des milliers d'étincelles
 * tissent le cercle, Mee et Meo y sèment la poussière, le flan se fige, et la frappe arrive en dernier. La pièce
 * file ensuite ICI, dans la scène au repos, qui montre alors son revers. Une seule scène joue la cérémonie d'une
 * frappe (`StrikeGate.claim`) ; si son module ne se charge pas, le geste court d'avant (1,2 s) joue sur place.
 *
 * Tant que la scène est à l'écran elle se DÉCLARE à la porte de la frappe (`registerStrikeStage`) : le compteur de
 * Meeshes attend l'arrivée de la pièce avant de monter. Sans scène, rien n'attend.
 *
 * Le numéro montré est celui de la pièce EN TRAIN d'être frappée — l'aperçu d'avant le geste, que le compteur fait
 * avancer ensuite — puis celui que la passerelle confirme POUR CE GESTE : la confirmation de la frappe précédente
 * ne reprend pas la scène d'une seconde frappe. DÉCORATIVE (`aria-hidden`) : l'hôte dit le résultat.
 */
export type MintStrikeCoin = { readonly number: number; readonly edition: MeeshEdition };

export type MintStrikeProps = {
  readonly size: number;
  readonly strikeKey: number;
  /** La prochaine pièce, telle que l'aperçu la montre avant le geste. */
  readonly next: MintStrikeCoin;
  /** La pièce confirmée par la passerelle, quand elle l'est. */
  readonly confirmed?: MintStrikeCoin | null;
  /** Pour les témoins : la porte de la frappe. Défaut : celle de l'application. */
  readonly gate?: StrikeGate;
};

type Struck = { readonly key: number; readonly coin: MintStrikeCoin | null; readonly stale: MintStrikeCoin | null };

type CeremonyScene = ComponentType<MintCeremonyProps>;
type Ceremony = { readonly key: number; readonly coin: MintStrikeCoin; readonly Scene: CeremonyScene };

let ceremonyModule: Promise<CeremonyScene> | null = null;

/** Le module de la cérémonie, chargé une fois : au montage de la première scène de frappe, pour que le geste parte au toucher. */
export function loadMintCeremony(): Promise<CeremonyScene> {
  ceremonyModule ??= import('@/components/game/mint-ceremony').then(
    (module) => module.MintCeremony,
    (error: unknown) => {
      ceremonyModule = null;
      throw error;
    },
  );
  return ceremonyModule;
}

const FALLBACK_SETTLE_MS = CHOREOGRAPHY_DURATION_MS.mint + 60;

export function MintStrike({ size, strikeKey, next, confirmed = null, gate = strikeGate }: MintStrikeProps) {
  const [struck, setStruck] = useState<Struck>({ key: strikeKey, coin: null, stale: null });
  if (struck.key !== strikeKey) setStruck({ key: strikeKey, coin: next, stale: confirmed });
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [inlineKey, setInlineKey] = useState(0);
  const stage = useRef<HTMLSpanElement>(null);
  const firstKey = useRef(strikeKey);

  useEffect(() => registerStrikeStage(), []);
  useEffect(() => void loadMintCeremony().catch(() => undefined), []);

  const coin = struck.key === strikeKey ? struck.coin : next;
  const striking = coin ?? next;

  useEffect(() => {
    if (strikeKey === firstKey.current || !gate.claim()) return undefined;
    let alive = true;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    loadMintCeremony().then(
      (Scene) => {
        if (alive) setCeremony({ key: strikeKey, coin: striking, Scene });
      },
      () => {
        if (!alive) return;
        setInlineKey((key) => key + 1);
        fallback = setTimeout(() => gate.settle(), FALLBACK_SETTLE_MS);
      },
    );
    return () => {
      alive = false;
      if (fallback !== undefined) clearTimeout(fallback);
    };
  }, [strikeKey]);

  const stale = struck.key === strikeKey ? struck.stale : confirmed;
  const shown = coin === null ? confirmed ?? next : confirmed !== null && confirmed !== stale ? confirmed : coin;
  const Scene = ceremony?.Scene;
  return (
    <>
      <span ref={stage} data-game-strike-stage="" style={{ display: 'inline-block' }}>
        <MintScene size={size} face={coin === null ? 'obverse' : 'reverse'} edition={shown.edition} number={shown.number} playKey={inlineKey} />
      </span>
      {ceremony === null || Scene === undefined ? null : (
        <Scene key={ceremony.key} edition={ceremony.coin.edition} number={ceremony.coin.number} gate={gate} target={() => stage.current} onDone={() => setCeremony(null)} />
      )}
    </>
  );
}
