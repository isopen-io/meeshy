/**
 * Les formes que le balayage des minuteries NE doit PAS signaler.
 *
 * Sans ce second témoin, la seule façon de rendre le cliquet vert serait de
 * cesser d'armer toute minuterie. Y figurent la forme JUSTE (la primitive
 * gardée), les rappels qui ne peuvent pas lever — `resolve` / `reject` d'une
 * promesse, nus ou en ligne —, et les textes qui portent le mot sans être un
 * appel : une méthode qui s'appelle `setInterval`, son appel par un objet, un
 * commentaire et une chaîne.
 */
import { guardedInterval, guardedTimeout } from '../../../utils/guarded-timer';

declare const cache: { evict(): number };
declare const logger: { error(message: string, context?: Record<string, unknown>): void };
declare const job: { setInterval(minutes: number): void };

export function guardedForms(): NodeJS.Timeout[] {
  return [
    guardedInterval({ name: 'purge', run: () => cache.evict(), everyMs: 10, logger }),
    guardedTimeout({ name: 'expiry', run: () => cache.evict(), afterMs: 10, logger }),
  ];
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function deadline(ms: number): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => reject(new Error('deadline exceeded')), ms);
  });
}

export function budget(ms: number): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(false), ms);
    setTimeout(() => { resolve(undefined); }, ms * 2);
  });
}

export class Job {
  private minutes = 1;

  setInterval(minutes: number): void {
    this.minutes = minutes;
  }

  describe(): string {
    // setInterval(() => cache.evict(), 10) — cité dans un commentaire, pas armé
    return `every ${this.minutes} min, never setTimeout(() => boom(), 1)`;
  }
}

export function reconfigure(): void {
  job.setInterval(5);
}
