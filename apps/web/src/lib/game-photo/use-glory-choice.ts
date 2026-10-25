import { useCallback, useEffect, useMemo, useState } from 'react';

import type { GloryFrameBirdLayout } from '@meeshy/shared/types/glory-frame-format';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

import type { PhotoEnv } from './env';
import { INITIAL_CHOICE, chooseFrame, choosePose, presenceOf, reconcileChoice, type GloryChoice, type GloryOffer, type TilePresence } from './glory-choice';
import type { GloryScene, GloryStep, GloryTexts } from './glory/glory-scene';

/**
 * LE CADRE ET LA POSE DU DÉROULÉ (#10164, L11) — ce que l'écran tient entre la
 * loi pure du choix (`glory-choice.ts`) et l'environnement : l'OFFRE de
 * l'étape (relue à chaque époque du catalogue), le choix, la PRÉSENCE vécue par
 * tuile, et la SCÈNE d'aperçu du cadre choisi (couches à demi-résolution),
 * rouverte à chaque changement de cadre ou de pose.
 *
 *  - sans port `gloryOffer` (ancien environnement, témoins du cadre décoré) :
 *    aucune bande, la scène se demande comme avant, sur la présélection ;
 *  - une tuile ABSENTE choisie se charge aussitôt (`gloryWarm`, priorité du
 *    geste manuel) : carte simple en attendant, jamais de spinner, et l'aperçu
 *    bascule sur le cadre dès qu'il est prêt ; un échec se dit et se réessaie ;
 *  - la scène de l'image FINALE (`openFinal`) s'ouvre à pleine résolution sur
 *    le même choix, le temps de composer ;
 *  - la scène d'aperçu ouverte RESTE jusqu'à l'arrivée de celle qui la remplace :
 *    rouvrir (couches décodées, centaines de ms) n'est pas un choix, et un
 *    transit à `null` se lirait « carte simple » — composée, puis offerte à
 *    « Enregistrer ». `scenePose` est la pose avec laquelle ELLE s'est ouverte,
 *    `settled` dit qu'elle sert le choix actuel : rien ne se recompose avant.
 *    Seuls la carte simple choisie et un cadre que l'environnement ne sait pas
 *    ouvrir (ou dont l'ouverture échoue) la referment.
 */
export type GloryChoiceState = {
  readonly offer: GloryOffer | null;
  readonly choice: GloryChoice;
  readonly presence: (ref: FrameRef) => TilePresence;
  readonly scene: GloryScene | null;
  readonly scenePose: GloryFrameBirdLayout | null;
  /** La scène montrée sert le choix ACTUEL : `false` le temps qu'une autre s'ouvre — rien ne se recompose sur ce transit. */
  readonly settled: boolean;
  readonly chooseFrame: (ref: FrameRef | null) => void;
  readonly choosePose: (pose: GloryFrameBirdLayout | null) => void;
  readonly retry: (ref: FrameRef) => void;
  readonly openFinal: () => Promise<GloryScene | null>;
};

type Input = {
  readonly env: PhotoEnv;
  readonly step: GloryStep;
  readonly texts: GloryTexts;
  readonly epoch: number;
  /** La pose relue dans la recette d'une reprise (#10166) : tenue tant que le cadre présélectionné la déclare. */
  readonly initialPose?: GloryFrameBirdLayout | null;
};

type SceneWant = { readonly kind: 'preselected'; readonly pose: GloryFrameBirdLayout | null } | { readonly kind: 'none' } | { readonly kind: 'frame'; readonly frame: FrameRef; readonly pose: GloryFrameBirdLayout | null };

export function useGloryChoice({ env, step, texts, epoch, initialPose = null }: Input): GloryChoiceState {
  const [offer, setOffer] = useState<GloryOffer | null>(null);
  const [choice, setChoice] = useState<GloryChoice>(() => ({ ...INITIAL_CHOICE, pose: initialPose }));
  const [lived, setLived] = useState<ReadonlyMap<string, TilePresence>>(new Map());
  /* La scène montrée et le souhait qu'elle a servi : tant que ce souhait n'est pas l'actuel, une autre est en route. */
  const [shown, setShown] = useState<{ readonly want: SceneWant; readonly scene: GloryScene | null } | null>(null);
  const scene = shown?.scene ?? null;
  /* Un chargement abouti rouvre la scène : la tuile qui vient d'arriver se peint sans autre geste. */
  const [warmed, setWarmed] = useState(0);
  const hasOffer = env.gloryOffer !== undefined;

  useEffect(() => {
    if (env.gloryOffer === undefined) return;
    let live = true;
    void env
      .gloryOffer(step)
      .then((next) => {
        if (!live) return;
        setOffer(next);
        setChoice((current) => reconcileChoice(current, next));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [env, step, epoch]);

  const want = useMemo((): SceneWant | null => {
    if (!hasOffer) return { kind: 'preselected', pose: choice.pose };
    if (offer === null) return choice.byUser ? { kind: 'none' } : null;
    return choice.frame === null ? { kind: 'none' } : { kind: 'frame', frame: choice.frame, pose: choice.pose };
  }, [hasOffer, offer, choice]);

  /* La scène remplacée se rend APRÈS le rendu qui montre la suivante : l'aperçu ne peint jamais une scène fermée. */
  useEffect(() => () => shown?.scene?.close(), [shown]);

  useEffect(() => {
    if (want === null) return;
    if (env.glory === undefined || want.kind === 'none') {
      setShown({ want, scene: null });
      return;
    }
    let live = true;
    const request = want.kind === 'frame' ? { step, texts, scale: 0.5, frame: want.frame, pose: want.pose } : { step, texts, scale: 0.5 };
    void env
      .glory(request)
      .then(
        (next) => {
          if (!live) {
            next?.close();
            return;
          }
          setShown({ want, scene: next });
        },
        () => {
          if (live) setShown({ want, scene: null });
        },
      );
    return () => {
      live = false;
    };
  }, [env, step, texts, want, epoch, warmed]);

  const frameKey = choice.frame?.frameId ?? null;
  const framePresence = frameKey === null || offer === null ? null : presenceOf(offer, { pack: choice.frame?.pack ?? '', frameId: frameKey }, lived);
  useEffect(() => {
    const frame = choice.frame;
    if (frame === null || framePresence !== 'missing' || env.gloryWarm === undefined) return;
    setLived((map) => new Map(map).set(frame.frameId, 'loading'));
    /* L'issue se note toujours, même si le choix a bougé entre-temps : la présence est celle de la TUILE, pas du choix. */
    void env
      .gloryWarm(frame)
      .then((ok) => {
        setLived((map) => new Map(map).set(frame.frameId, ok ? 'ready' : 'failed'));
        if (ok) setWarmed((count) => count + 1);
      })
      .catch(() => setLived((map) => new Map(map).set(frame.frameId, 'failed')));
  }, [env, choice.frame, framePresence]);

  const presence = useCallback((ref: FrameRef): TilePresence => (offer === null ? 'ready' : presenceOf(offer, ref, lived)), [offer, lived]);
  const pickFrame = useCallback((ref: FrameRef | null) => setChoice((current) => chooseFrame(current, offer, ref)), [offer]);
  const pickPose = useCallback((pose: GloryFrameBirdLayout | null) => setChoice((current) => choosePose(current, offer, pose)), [offer]);
  const retry = useCallback((ref: FrameRef) => {
    setLived((map) => {
      const next = new Map(map);
      next.delete(ref.frameId);
      return next;
    });
  }, []);

  const openFinal = useCallback(async (): Promise<GloryScene | null> => {
    if (scene === null || env.glory === undefined || want === null || want.kind === 'none') return null;
    const request = want.kind === 'frame' ? { step, texts, scale: 1, frame: want.frame, pose: want.pose } : { step, texts, scale: 1 };
    return env.glory(request).catch(() => null);
  }, [env, scene, step, texts, want]);

  return { offer, choice, presence, scene, scenePose: scene === null || shown === null || shown.want.kind === 'none' ? null : shown.want.pose, settled: want === null || shown?.want === want, chooseFrame: pickFrame, choosePose: pickPose, retry, openFinal };
}
