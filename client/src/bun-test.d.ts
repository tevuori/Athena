declare module "bun:test" {
  interface Matchers<T> {
    toBe(expected: T): void;
    toBeNull(): void;
    toBeUndefined(): void;
    toEqual(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatchObject(expected: Record<string, unknown>): void;
    toBeGreaterThan(expected: number): void;
  }

  export function describe(name: string, fn: () => void): void;
  export function expect<T>(actual: T): Matchers<T>;
  export function it(name: string, fn: () => void | Promise<void>): void;
}
