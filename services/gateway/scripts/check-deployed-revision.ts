/**
 * Un conteneur en retard sur ses routes se signale AVANT l'utilisateur
 * (#5644). Compare le `build.commit` servi par `/health` d'une cible
 * (production, staging, …) à SA branche de référence, et échoue quand
 * l'écart dépasse un seuil — ou quand le SHA déployé n'est pas un ancêtre de
 * la référence, la forme exacte de l'incident du 2026-09-07 (deux commits à
 * six minutes l'un de l'autre, sur des branches parallèles : comparer leurs
 * DATES n'aurait rien prouvé, seul `git merge-base --is-ancestor` tranche).
 *
 * Chaque cible porte SA propre référence, jamais une seule référence
 * globale : la production suit `origin/main`, staging suit `origin/dev`
 * (#5616, « une poussée sur `dev` déploie staging ») — les comparer à la
 * même branche ferait rougir staging en continu, en retard sur `main` par
 * construction tant qu'une release n'a pas fusionné `dev`.
 *
 * Usage (depuis `services/gateway`, avec l'historique complet du dépôt) :
 *
 *   npx tsx scripts/check-deployed-revision.ts
 *
 * Variables d'environnement :
 *   DEPLOYED_REVISION_TARGETS  "label=url@ref,label=url@ref" — défaut :
 *                              production (gate.meeshy.me, origin/main) +
 *                              staging (staging.meeshy.me, origin/dev)
 *   MAX_COMMITS_BEHIND         écart toléré avant alerte — défaut 30
 *
 * La RÈGLE de verdict est pure et testée indépendamment :
 * `src/route-manifest/deployed-revision.ts`. Ce script ne fait que lire le
 * réseau et git, et la lui passer.
 */
import { execFileSync } from 'node:child_process';

import { evaluateDeployedRevision } from '../src/route-manifest/deployed-revision';

type Cible = { readonly label: string; readonly healthUrl: string; readonly reference: string };

const CIBLES_PAR_DEFAUT =
  'production=https://gate.meeshy.me/health@origin/main,staging=https://staging.meeshy.me/health@origin/dev';

function analyserCibles(brut: string): readonly Cible[] {
  return brut.split(',').map((entrée) => {
    const [label, urlEtRéférence] = entrée.split('=').map((part) => part?.trim());
    const [healthUrl, reference] = urlEtRéférence?.split('@').map((part) => part?.trim()) ?? [];
    if (!label || !healthUrl || !reference) {
      throw new Error(`DEPLOYED_REVISION_TARGETS mal formé : "${entrée}" (attendu "label=url@ref")`);
    }
    return { label, healthUrl, reference };
  });
}

async function lireCommitDéployé(healthUrl: string): Promise<string | null> {
  const réponse = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  if (!réponse.ok) {
    throw new Error(`${healthUrl} a répondu ${réponse.status}`);
  }
  const corps = (await réponse.json()) as { build?: { commit?: string | null } };
  return corps.build?.commit ?? null;
}

/** `null` : le SHA est inconnu localement (historique tronqué) ou git a échoué autrement. */
function estAncêtre(sha: string, référence: string): boolean | null {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, référence], { stdio: 'pipe' });
    return true;
  } catch (erreur) {
    // Code 1 : git a RÉPONDU "non ancêtre" — un verdict, pas un échec.
    if ((erreur as { status?: number }).status === 1) return false;
    return null;
  }
}

function commitsDeRetard(sha: string, référence: string): number | null {
  try {
    const sortie = execFileSync('git', ['rev-list', '--count', `${sha}..${référence}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    const compte = Number.parseInt(sortie.toString('utf8').trim(), 10);
    return Number.isNaN(compte) ? null : compte;
  } catch {
    return null;
  }
}

type ÉvaluationCible = {
  readonly cible: Cible;
  readonly sha: string | null;
  readonly verdict: string;
  readonly reason: string;
  readonly isAlert: boolean;
};

async function évaluerCible(cible: Cible, seuil: number): Promise<ÉvaluationCible> {
  const sha = await lireCommitDéployé(cible.healthUrl);
  if (!sha) {
    return {
      cible,
      sha: null,
      verdict: 'inconnu',
      reason: `/health ne porte aucun build.commit (${cible.healthUrl})`,
      isAlert: false,
    };
  }

  const résultat = evaluateDeployedRevision({
    isAncestor: estAncêtre(sha, cible.reference),
    commitsBehind: commitsDeRetard(sha, cible.reference),
    maxCommitsBehind: seuil,
  });

  return { cible, sha, ...résultat };
}

async function main(): Promise<void> {
  const seuil = Number.parseInt(process.env.MAX_COMMITS_BEHIND ?? '30', 10);
  const cibles = analyserCibles(process.env.DEPLOYED_REVISION_TARGETS ?? CIBLES_PAR_DEFAUT);

  const évaluations = await Promise.all(cibles.map((cible) => évaluerCible(cible, seuil)));

  let enAlerte = false;
  for (const évaluation of évaluations) {
    const shaCourt = évaluation.sha ? évaluation.sha.slice(0, 7) : 'inconnu';
    const préfixe = évaluation.isAlert ? '::error::' : évaluation.verdict === 'inconnu' ? '::warning::' : '';
    console.log(
      `${préfixe}[${évaluation.cible.label} vs ${évaluation.cible.reference}] ${évaluation.verdict} (${shaCourt}) — ${évaluation.reason}`
    );
    if (évaluation.isAlert) enAlerte = true;
  }

  process.exit(enAlerte ? 1 : 0);
}

main().catch((erreur) => {
  console.error('[check-deployed-revision]', erreur);
  process.exit(1);
});
