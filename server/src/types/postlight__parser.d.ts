declare module "@postlight/parser" {
  export interface ParseResult {
    title?: string;
    content?: string;
    excerpt?: string;
    author?: string;
    date_published?: string | null;
    dek?: string;
    lead_image_url?: string | null;
    word_count?: number;
    url?: string;
  }
  export interface ParseOptions {
    fallback?: boolean;
    contentType?: string;
    headers?: Record<string, string>;
  }
  export function parse(html: string, opts?: ParseOptions): Promise<ParseResult | null>;
  export function parseUrl(url: string, opts?: ParseOptions): Promise<ParseResult | null>;
  export function fetchResource(url: string, opts?: ParseOptions): Promise<any>;
  export function addExtractor(extractor: any): void;
  export const Mercury: { parse: typeof parse; parseUrl: typeof parseUrl };
}
