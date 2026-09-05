export type DossierDemande =
  | { readonly ok: true; readonly dossier: string }
  | { readonly ok: false; readonly raison: string };

export declare const dossierDeSortie: (
  argumentsDeLigne: readonly string[],
  defaut: string,
) => DossierDemande;
