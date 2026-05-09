/**
 * Runs a set of tasks in parallel with a concurrency limit.
 * Supports arrays, iterables, and async iterables.
 */
export async function runInPool<T>(
  concurrency: number,
  items: Iterable<T> | AsyncIterable<T> | T[],
  task: (item: T) => Promise<void>,
): Promise<void> {
  const active = new Set<Promise<void>>();

  for await (const item of items) {
    const promise = task(item);
    active.add(promise);

    // Remove the promise from the active set when it completes
    promise.finally(() => {
      active.delete(promise);
    });

    // If we've reached the concurrency limit, wait for at least one task to finish
    if (active.size >= concurrency) {
      await Promise.race(active);
    }
  }

  // Wait for all remaining tasks to finish
  await Promise.all(active);
}

/**
 * Maps an array of items to results in parallel with a concurrency limit.
 * Preserves order of results.
 */
export async function mapPool<T, R>(
  concurrency: number,
  items: T[],
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);

  await runInPool(
    concurrency,
    items.map((item, index) => ({ item, index })),
    async ({ item, index }) => {
      results[index] = await task(item, index);
    },
  );

  return results;
}
