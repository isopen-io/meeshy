/**
 * Les formes que le balayage doit VOIR.
 *
 * Un balayage qui ne trouve jamais rien rend un inventaire vide pour la
 * mauvaise raison, et c'est indiscernable du succès (cycle 93 : un compte est
 * une affirmation, il se compte). Cette fixture est ce qui distingue les deux.
 *
 * Les quatre formes sont celles RELEVÉES en production au cycle 130 : l'appel
 * de méthode nu, l'appel à travers un chaînage optionnel, l'IIFE asynchrone, et
 * l'appel armé dans un `setTimeout` — le plus cher, parce qu'aucun `try/catch`
 * n'entoure le rappel d'un timer.
 */
declare const svc: {
  work(): Promise<void>;
  arm(cb: () => void, ms: number): void;
};
declare const maybe: { work(): Promise<void> } | null;

export function bare(): void {
  void svc.work();
}

export function optional(): void {
  void maybe?.work();
}

export function iife(): void {
  void (async () => {
    await svc.work();
  })();
}

export function inTimer(): void {
  svc.arm(() => {
    void svc.work();
  }, 10);
}
