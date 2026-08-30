export declare const ROOT: string;
export declare const CACHE: string;
export declare const NODE_MODULES: string;
export declare const PAQUETS: readonly string[];
export declare function ensureVendor(journal?: (message: string) => void): string;
export declare function vendorRequire(nom: string): unknown;
export declare function chromiumPath(): string;
