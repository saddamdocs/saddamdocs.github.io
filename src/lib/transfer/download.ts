/**
 * Saving a file through the browser's ordinary download (PLAN 4.15: no folder access is needed).
 *
 * Talks to: the document, through a temporary `<a download>` element. It never navigates the page:
 * the `download` attribute makes the browser save the Blob instead of opening it.
 *
 */

/**
 * Downloads a Blob under a file name.
 *
 * @param name - The file name the browser suggests.
 * @param blob - The contents.
 * @returns Nothing. The browser shows its own download UI.
 */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Today's date as `YYYY-MM-DD` in local time, for export file names (PLAN 4.15).
 *
 * @param now - The time; the current time by default.
 * @returns The date.
 */
export function dateStamp(now: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
