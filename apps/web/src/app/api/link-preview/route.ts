import { NextRequest, NextResponse } from 'next/server';
import { parseMetadata, shouldFetchPreview, createPlaceholderPreview } from '@/lib/linkPreview';

// Cache previews keyed by normalized full URL (host + pathname + search) so
// two different articles on the same domain get independent entries.
const previewCache = new Map<string, { preview: any; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

function cacheKey(rawUrl: string): string {
  try {
    const { host, pathname, search } = new URL(rawUrl);
    return `${host}${pathname}${search}`;
  } catch {
    return rawUrl;
  }
}

/**
 * GET /api/link-preview?url=<url>
 * 
 * Server-side proxy for fetching link preview metadata.
 * Avoids CORS issues and provides caching.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  // Validate URL
  if (!shouldFetchPreview(url)) {
    return NextResponse.json(createPlaceholderPreview(url));
  }

  // Check cache — keyed on the full URL so distinct pages on the same host
  // are cached independently and a failed fetch never poisons sibling pages.
  const key = cacheKey(url);
  const cached = previewCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.preview);
  }

  try {
    // Fetch the URL with reasonable limits
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Linkora/1.0; +https://linkora.social)',
        'Accept': 'text/html',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(createPlaceholderPreview(url));
    }

    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return NextResponse.json(createPlaceholderPreview(url));
    }

    // Limit response size to 500KB
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > 500 * 1024) {
      return NextResponse.json(createPlaceholderPreview(url));
    }

    const html = new TextDecoder().decode(buffer);
    const metadata = parseMetadata(html, url);

    // Only cache successful metadata — never pin a placeholder into the cache.
    previewCache.set(key, { preview: metadata, timestamp: Date.now() });

    return NextResponse.json(metadata);
  } catch (err) {
    console.error(`Link preview fetch error for ${url}:`, err);
    return NextResponse.json(createPlaceholderPreview(url));
  }
}
