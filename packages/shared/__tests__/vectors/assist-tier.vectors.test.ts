/**
 * Vecteurs inter-plateformes pour `resolveAssistTier`
 * (`packages/shared/utils/reading-modes.ts`, C-013 — cascade de
 * confidentialité de l'assistance, workshop §4.4).
 *
 * Fixtures : `packages/shared/fixtures/reading-modes/assist-tier.vectors.json`.
 * Générées en EXÉCUTANT la loi TS (jamais à la main) — C-025,
 * `tasks/lentille-workshop-execution.md` (« le trou qui ne se voit pas en
 * recette »).
 *
 * ── Sémantique de l'adaptateur ──
 * `input` = `AssistTierInput` tel quel (`deviceCapability`, `encryptionMode`,
 * `userConsent`, `conversationType`). `conversationType` est un champ réservé
 * — la loi ne le lit jamais aujourd'hui (voir son commentaire dans la loi) —
 * fixé à `'direct'` dans les fixtures sans effet sur `expected`. `expected`
 * est directement la chaîne `AssistTier`.
 *
 * Grille capacité × e2ee × consentement — DONT les trois vecteurs contractuels
 * non négociables (garde workshop §4.4) :
 *   1. `e2ee` + `deviceCapability: false` ⇒ `'deterministic'` — JAMAIS
 *      `'serverAgent'`, quel que soit le consentement (deux cas : consent
 *      true ET false, tous deux `'deterministic'`) — le serveur ne détient
 *      jamais le clair d'une conversation e2ee.
 *   2. `e2ee` + `deviceCapability: true` ⇒ `'localAgent'` — un appareil
 *      capable court-circuite la cascade avant même de consulter le mode
 *      de chiffrement.
 *   3. mode serveur (`'server'`/`'hybrid'`/`null`) + `deviceCapability: false`
 *      + `userConsent: true` ⇒ `'serverAgent'` ; sans consentement ⇒
 *      `'deterministic'` (le plancher permanent, rang 3).
 */
import { resolveAssistTier, type AssistTierInput, type AssistTier } from '../../utils/reading-modes.js';
import { runVectors } from './harness.js';

runVectors<AssistTierInput, AssistTier>('assist-tier', resolveAssistTier);
