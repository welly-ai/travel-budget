export class UnsafePathError extends Error {}
export function isSafeName(name: unknown): name is string;
export function isSafeId(id: unknown): id is string;
export function assertSafeName(name: unknown, label?: string): string;
export function assertSafeId(id: unknown, label?: string): string;
export function resolveInside(root: string, ...names: string[]): string;
export function resolveRepoFile(root: string, rel: string): string;
