interface D1Result<T = unknown> { results: T[]; success: boolean; meta: Record<string, unknown> }
interface Fetcher { fetch(request: Request): Promise<Response> }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
interface R2ObjectBody {
  body: ReadableStream;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  writeHttpMetadata(headers: Headers): void;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<{ key: string } | null>;
  put(key: string, value: ArrayBuffer | ReadableStream | Blob | string, options?: unknown): Promise<unknown>;
  list(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>;
}
declare module "cloudflare:workers" {
  export const env: {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    INSIGHTLAB_ADMIN_EMAILS?: string;
  };
}
