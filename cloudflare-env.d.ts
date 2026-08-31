declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  all(): Promise<{ results: unknown[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown>;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    writeHttpMetadata(headers: Headers): void;
  } | null>;
  delete(key: string): Promise<void>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
