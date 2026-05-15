// Shim that replaces TanStack Start's `useServerFn` for our client-only build.
// Server functions are now plain async client functions; useServerFn is a no-op.
export function useServerFn<T>(fn: T): T {
  return fn;
}
