import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * UN SCRIPT INLINÉ, MINIFIÉ (#10003, D-186).
 *
 * Le script de la landing est inliné par son TEXTE (`landingBootScript`) : le
 * texte que rend `Function.prototype.toString` garde les noms et l'indentation
 * de la source. La landing le paie à chaque visite, sous un plafond de 10 Ko
 * (`budgets.json → landing_page.kb`) ; Bun le minifie ici (noms locaux,
 * espaces), sans en changer le comportement — son témoin l'exécute minifié.
 */
type BunBuild = (options: { readonly entrypoints: readonly string[]; readonly minify: boolean; readonly target: 'browser' }) => Promise<{
  readonly success: boolean;
  readonly logs: readonly unknown[];
  readonly outputs: readonly { readonly text: () => Promise<string> }[];
}>;

/** Le runtime Bun, décrit par ce qu'on en appelle — le `tsconfig` du web ne
 * charge pas ses types (même dispositif que `scripts/render-frame-board.ts`). */
const runtime = (): BunBuild => (globalThis as unknown as { readonly Bun: { readonly build: BunBuild } }).Bun.build;

export async function minifyInlineScript(code: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'meeshy-inline-'));
  try {
    const entry = join(dir, 'inline.js');
    writeFileSync(entry, code);
    const result = await runtime()({ entrypoints: [entry], minify: true, target: 'browser' });
    const output = result.outputs[0];
    if (!result.success || output === undefined) throw new Error(`La minification du script inliné a échoué : ${result.logs.join('\n')}`);
    return (await output.text()).trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
