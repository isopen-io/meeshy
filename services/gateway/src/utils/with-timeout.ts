/**
 * Runs a promise against a deadline, rejecting if it does not settle in time.
 *
 * Unlike the bare `Promise.race([operation, timeoutPromise])` idiom, the timer
 * is ALWAYS cleared once the operation settles (resolve, reject, or timeout).
 * The bare idiom leaks the timer whenever the operation wins the race: the
 * pending `setTimeout` callback stays scheduled until the deadline, keeping the
 * event loop busy and retaining the closure. On hot paths (e.g. one ZMQ send
 * per translated message, targeting 100k msg/s) that is hundreds of thousands
 * of live timers at peak — this helper removes that churn.
 *
 * @param operation the promise to await
 * @param timeoutMs deadline in milliseconds
 * @param message rejection message when the deadline is reached
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message = `Operation timed out after ${timeoutMs}ms`
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
