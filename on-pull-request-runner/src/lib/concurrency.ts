/**
 * Bounded parallelism for ORL batch execution.
 */

export type MapPoolArgs<T, R> = {
  items: T[];
  concurrency: number;
  fn: (item: T, index: number) => Promise<R>;
};

/**
 * Maps `items` with at most `concurrency` concurrent invocations of `fn`, preserving result order.
 */
export async function mapPool<T, R>(args: MapPoolArgs<T, R>): Promise<R[]> {
  const { items, concurrency, fn } = args;
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}
