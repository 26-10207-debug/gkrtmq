declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<{ meta: { changes?: number } }>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<Array<{results:T[];meta:{changes?:number;rows_read?:number;rows_written?:number}}>>;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ): Promise<unknown>;
  head(key:string):Promise<R2ObjectMetadata|null>;
  get(key:string,options:{onlyIf?:{etagMatches:string};range?:{offset:number;length:number}}):Promise<R2ObjectBody|R2ObjectMetadata|null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}
interface R2ObjectMetadata{size:number;etag:string;httpEtag:string;uploaded:Date;writeHttpMetadata(headers:Headers):void;}
interface R2ObjectBody extends R2ObjectMetadata{
    body: ReadableStream<Uint8Array>;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
    writeHttpMetadata(headers: Headers): void;
}
declare module "*?url" { const value:string;export default value; }

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
