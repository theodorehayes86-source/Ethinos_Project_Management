import { logger } from "./logger";

const DEFAULT_CONCURRENCY = 5;

/**
 * Process an array with bounded concurrency — at most `limit` items are
 * in-flight at once. Errors for individual items are caught and logged;
 * they do not abort the remaining items.
 *
 * @param items   Items to process
 * @param limit   Maximum concurrent calls (defaults to EMAIL_CONCURRENCY env var, then 5)
 * @param fn      Async function to call for each item
 */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<R | undefined>> {
  const results: Array<R | undefined> = new Array(items.length).fill(undefined);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      const item = items[idx];
      try {
        results[idx] = await fn(item, idx);
      } catch (err) {
        logger.error({ err, index: idx }, "[mapLimit] Item failed — continuing batch");
      }
    }
  }

  const concurrency = Math.max(1, limit);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

/**
 * Convenience wrapper that reads EMAIL_CONCURRENCY from the environment,
 * falling back to DEFAULT_CONCURRENCY (5).
 */
export function getEmailConcurrency(): number {
  const raw = process.env["EMAIL_CONCURRENCY"];
  if (!raw) return DEFAULT_CONCURRENCY;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CONCURRENCY;
}
