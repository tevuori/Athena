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
  export class Parser {
    static parse(html: string, opts?: ParseOptions): Promise<ParseResult | null>;
    static parseUrl(url: string, opts?: ParseOptions): Promise<ParseResult | null>;
  }
  export const Mercury: typeof Parser;
}
