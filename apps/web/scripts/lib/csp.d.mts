/**
 * Les types du module voisin — même motif que `document-network.d.mts` : node
 * lit le `.mjs` (les gardes), bun le témoigne, seul `tsc` lit ces déclarations.
 */
export const NGINX_CSP_REGION: RegExp;
export function scriptHash(body: string): string;
export function inlineScriptHashes(html: string): string[];
export function distScriptHashes(dist: string): string[];
export function nginxScriptHashes(nginx: string): string[];
export function withNginxScriptHashes(nginx: string, hashes: readonly string[]): string;
export function documentPolicy(nginx: string, options: { readonly forwardedProto: string | undefined }): string;
