import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPOSE_CONFIDENCE_FLOOR,
  COMPOSE_MIN_LETTERS,
  composeLanguage,
  letterCount,
  normalizedSupportedCode,
  type DetectedLanguage,
} from '@/lib/send/compose-language';
import { defaultLanguageDetector, type LanguageDetector } from '@/lib/send/language-detector';

/**
 * LA PASTILLE DIT CE QUI PARTIRA (#5828, § Étape 3) — miroir du COUPLE
 * `TextAnalyzer` + `ComposerLanguageResolver` (`packages/MeeshyUI/.../TextAnalyzer.swift`,
 * `ComposerModels.swift:143-171`) : debounce, plancher de confiance, verrou à
 * dix mots, choix manuel qui gagne, et surtout une langue COURANTE qui ne
 * redescend JAMAIS d'elle-même au rang 1 du lecteur (§ `ComposeSticky`).
 *
 * QUATRE RANGS, dans cet ordre : le choix ÉPINGLÉ (`languageOverride`) → une
 * détection ADOPTÉE (≥ 4 lettres, confiance ≥ 0,86) → la langue COURANTE (la
 * dernière adoptée, `currentLanguage`) → le rang 1 du Prisme du LECTEUR, puis
 * `'fr'`. Les deux derniers seuls sont un REPLI : ce que la loi pure
 * (`compose-language.ts`) reçoit en `preferred`.
 */
export type ComposeLanguageSource = 'chosen' | 'detected' | 'sticky' | 'preferred';

/** `TextAnalyzer.swift:82` — le débounce avant d'interroger le détecteur. */
export const COMPOSE_DETECT_DEBOUNCE_MS = 300;
/** `TextAnalyzer.swift:99` — au-delà, la langue détectée est DÉFINITIVE pour ce message. */
export const COMPOSE_LOCK_WORDS = 10;

/**
 * LE RANG « COURANT » D'iOS, en un seul état (revue-correction #5828).
 *
 * `ComposerLanguageResolver.resolve` (`ComposerModels.swift:155-170`) ne rend
 * une valeur que pour DÉPLACER `currentLanguage` : sans choix manuel et sans
 * détection adoptée, elle rend `nil` — « current already wins », et son
 * doc-comment (`:141-142`) le dit en clair, « pill stays where it was (no
 * flicker on 2-3 char noise) ». `currentLanguage` n'est donc JAMAIS remis au
 * rang 1 du lecteur : ni par un texte vidé (`TextAnalyzer.swift:104-119` vide
 * la DÉTECTION, pas la pastille), ni par un texte trop court, ni par un envoi
 * (`textAnalyzer.reset()` laisse `composerState.selectedLanguage` en place).
 *
 * `code` est cette langue COURANTE ; `pinned` distingue le geste explicite —
 * l'utilisateur a touché la pastille POUR CE MESSAGE (`languageOverride`), et
 * aucune détection ne la déplace tant qu'il n'a pas envoyé.
 */
type ComposeSticky = { readonly code: string; readonly pinned: boolean };

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/u).length;
}

export function useComposeLanguage(params: {
  readonly preferred: readonly string[];
  /** Injecté par les témoins — défaut `defaultLanguageDetector()` (navigateur
   * si prêt, sinon l'heuristique en chunk à la demande). */
  readonly detector?: LanguageDetector;
}): {
  /** = `composeLanguage(...)` — CE QUI PARTIRA si l'envoi a lieu maintenant. */
  readonly language: string;
  readonly source: ComposeLanguageSource;
  /** Branché sur CHAQUE frappe du champ — à côté de `onTextChange`, jamais à sa place. */
  readonly setText: (text: string) => void;
  /** Le geste de la feuille de langue — GAGNE sur toute détection pour ce message. */
  readonly choose: (code: string) => void;
  /** Après un envoi : le choix cesse d'être ÉPINGLÉ, mais la langue reste
   * COURANTE (`currentLanguage` iOS après `textAnalyzer.reset()`) jusqu'à ce
   * qu'une détection franche (`≥ 0,86`) la déplace. */
  readonly noteSent: () => void;
} {
  const { preferred } = params;

  /** MOTEUR CONSTRUIT UNE FOIS (motif `use-recorder.ts`) — jamais une
   * nouvelle instance à chaque rendu : l'argument de `useRef` serait
   * évalué à chaque frappe sinon. */
  const detectorRef = useRef<LanguageDetector | null>(null);
  if (detectorRef.current === null) detectorRef.current = params.detector ?? defaultLanguageDetector();

  const [text, setTextState] = useState('');
  const [detected, setDetected] = useState<DetectedLanguage | null>(null);
  const [sticky, setSticky] = useState<ComposeSticky | null>(null);
  const [locked, setLocked] = useState(false);

  /** LE JETON DE GÉNÉRATION — un compteur MONOTONE, jamais l'horloge murale
   * (deux frappes dans la même milliseconde rendraient deux jetons identiques
   * et un verdict périmé passerait pour à jour). Un verdict dont le jeton ne
   * correspond plus à la génération COURANTE est jeté : c'est ce qui protège
   * contre une promesse lente qui répondrait après que le texte a changé. */
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  /** Le CANCELLER du minuteur en vol, jamais son identifiant brut — motif
   * `use-recorder.ts` (`cancelIntervalRef`) : évite toute ambiguïté entre
   * l'overload DOM (`number`) et l'overload Node (`Timeout`) de `setTimeout`. */
  const cancelTimerRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      mountedRef.current = false;
      cancelTimerRef.current?.();
    },
    [],
  );

  const setText = useCallback(
    (value: string) => {
      setTextState(value);
      generationRef.current += 1;
      const generation = generationRef.current;
      cancelTimerRef.current?.();
      cancelTimerRef.current = null;

      if (value === '') {
        // LE TEXTE VIDÉ RÉINITIALISE LA DÉTECTION ET LE VERROU (miroir
        // `TextAnalyzer.analyze` texte vidé) — la langue COURANTE, elle,
        // reste : côté iOS `applyDetectedLanguage` ne déplace `currentLanguage`
        // que sur un verdict ADOPTÉ, jamais sur une absence de verdict.
        setDetected(null);
        setLocked(false);
        return;
      }
      if (locked) return; // Verrouillé pour ce message : plus aucune détection.
      if (letterCount(value) < COMPOSE_MIN_LETTERS) return; // Le détecteur n'est même pas interrogé.

      const id = window.setTimeout(() => {
        void detectorRef.current!.detect(value).then((result) => {
          if (!mountedRef.current || generationRef.current !== generation) return; // Périmé.
          if (result === null) return; // Silencieux : la pastille garde sa valeur actuelle.
          setDetected(result);
          if (wordCount(value) >= COMPOSE_LOCK_WORDS) setLocked(true);
          // UN VERDICT ADOPTÉ DÉPLACE LA LANGUE COURANTE — c'est ce que fait
          // `applyDetectedLanguage` en posant `currentLanguage = detected`
          // (`UniversalComposerBar+Layout.swift:340-347`) : la pastille ne
          // redescendra plus au rang 1 du lecteur quand le texte rétrécira.
          // Un choix ÉPINGLÉ gagne encore — `resolve` sert `override` d'abord.
          const adopted =
            result.confidence >= COMPOSE_CONFIDENCE_FLOOR ? normalizedSupportedCode(result.language) : undefined;
          if (adopted !== undefined) {
            setSticky((current) => (current !== null && current.pinned ? current : { code: adopted, pinned: false }));
          }
        });
      }, COMPOSE_DETECT_DEBOUNCE_MS);
      cancelTimerRef.current = () => window.clearTimeout(id);
    },
    [locked],
  );

  const choose = useCallback((code: string) => {
    setSticky({ code, pinned: true });
  }, []);

  const noteSent = useCallback(() => {
    setSticky((current) => (current === null ? null : { code: current.code, pinned: false }));
  }, []);

  /** LE RANG COURANT, DEVANT LE PRISME DU LECTEUR — la langue déjà adoptée
   * (par un choix envoyé ou par une détection franche) passe AVANT
   * `preferred[0]`, jamais devant une détection vivante. `preferred` n'est pas
   * touché quand rien n'est courant : identité STABLE, jamais un tableau
   * reconstruit en ligne (CLAUDE.md § Prisme, cycle 123). */
  const effectivePreferred = useMemo(
    () => (sticky !== null && !sticky.pinned ? [sticky.code, ...preferred] : preferred),
    [sticky, preferred],
  );

  const language = useMemo(
    () =>
      composeLanguage({
        text,
        detected,
        chosen: sticky !== null && sticky.pinned ? sticky.code : null,
        preferred: effectivePreferred,
      }),
    [text, detected, sticky, effectivePreferred],
  );

  const source: ComposeLanguageSource = useMemo(() => {
    if (sticky !== null && sticky.pinned && normalizedSupportedCode(sticky.code) !== undefined) return 'chosen';
    if (
      detected !== null &&
      detected.confidence >= COMPOSE_CONFIDENCE_FLOOR &&
      letterCount(text) >= COMPOSE_MIN_LETTERS &&
      normalizedSupportedCode(detected.language) !== undefined
    ) {
      return 'detected';
    }
    if (sticky !== null && normalizedSupportedCode(sticky.code) !== undefined) return 'sticky';
    return 'preferred';
  }, [sticky, detected, text]);

  return { language, source, setText, choose, noteSent };
}
