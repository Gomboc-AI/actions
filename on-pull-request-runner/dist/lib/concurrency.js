/**
 * Bounded parallelism for ORL batch execution.
 */
/**
 * Maps `items` with at most `concurrency` concurrent invocations of `fn`, preserving result order.
 */
export async function mapPool(args) {
    const { items, concurrency, fn } = args;
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (true) {
            const i = next++;
            if (i >= items.length)
                return;
            results[i] = await fn(items[i], i);
        }
    }
    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}
//# sourceMappingURL=concurrency.js.map