import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatCurrencyFromCents as formatCurrencyFromCentsLocalized } from '@/i18n/runtime';

/**
 * Merge Tailwind CSS classes with proper precedence
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a cents amount as localized whole-currency USD ("$13", "13 $US").
 *
 * The currency is USD because that is what Stripe charges; only the *format* is
 * localized. Rendering a USD amount in the user's local currency would be a
 * pricing change, not a translation.
 */
export function formatUsd(cents: number): string {
  return formatCurrencyFromCentsLocalized(cents);
}

/**
 * Convert file to base64
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // Remove data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Trigger a browser download for an in-memory Blob, then release the object
 * URL so the blob is not pinned in memory for the life of the page.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

/**
 * Escape HTML special characters before building an innerHTML string from
 * user-authored text (e.g. markdown-to-HTML formatters using dangerouslySetInnerHTML).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Block execution-capable URL schemes (javascript:, data:, vbscript:, etc.) in markdown
 * link targets. Scheme-less URLs (relative paths, protocol-relative, bare domains like
 * "example.com") are left untouched since browsers only ever navigate to them, never
 * execute them. Tabs/newlines are stripped first since browsers ignore them when parsing
 * a URL scheme, a known filter-bypass trick (e.g. "java\tscript:").
 */
export function sanitizeMarkdownUrl(url: string): string {
  const trimmed = url.trim().replace(/[\t\n\r]/g, '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^(https?|mailto|tel):/i.test(trimmed)) {
    return '#';
  }
  return trimmed;
}
