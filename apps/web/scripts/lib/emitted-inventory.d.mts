import type { EmittedAddress, ServingTable } from './emitted-addresses.mjs';

export declare const ROOT: string;
export declare const WEB: string;
export declare const SOURCES: readonly string[];
export declare function sourceFiles(root?: string): string[];
export declare function emittedInventory(root?: string): EmittedAddress[];
export declare function servingTable(options?: { readonly root?: string; readonly dist?: string | null }): ServingTable;
