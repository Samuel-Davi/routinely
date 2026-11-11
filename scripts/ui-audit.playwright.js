/**
 * UI audit used to compare the interface before and after a design change.
 *
 * It is a Playwright page function (no dependency in this repo): run it with the
 * Playwright MCP tool `browser_run_code_unsafe` passing this file as `filename`,
 * or paste it into any Playwright script as `await audit(page)`.
 *
 * For each page and viewport it counts:
 *  - touch targets whose real hit area is smaller than 44×44 px (probed with
 *    `elementFromPoint`, so padding added through pseudo-elements counts);
 *  - text rendered below 12 px;
 *  - elements that still animate or transition under `prefers-reduced-motion`.
 */
async (page) => {
  const BASE = 'http://localhost:3000';
  const PAGES = ['/', '/tarefas', '/compromissos', '/historico', '/preferencias'];
  const VIEWPORTS = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  const measure = () => {
    const MIN = 44;
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    // 1. Touch targets
    const interactive = [
      ...document.querySelectorAll(
        'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [role="radio"], [role="checkbox"], [role="switch"]',
      ),
    ]
      .filter(visible)
      // Visually hidden until focused (skip link): not a pointer target.
      .filter((el) => !el.classList.contains('sr-only'));
    const small = [];
    let calendarBlocks = 0;
    for (const el of interactive) {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const reach = MIN / 2 - 1;
      const hits = (x, y) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && (hit === el || el.contains(hit) || hit.closest('label')?.contains(el) === true);
      };
      const ok = hits(cx - reach, cy) && hits(cx + reach, cy) && hits(cx, cy - reach) && hits(cx, cy + reach);
      if (ok) continue;
      // Calendar blocks are sized by their duration; reported separately.
      if (el.closest('[data-date]')) {
        calendarBlocks += 1;
        continue;
      }
      small.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 28)} ${Math.round(rect.width)}×${Math.round(rect.height)}`);
    }

    // 2. Small text
    let tinyText = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    while (walker.nextNode()) {
      const parent = walker.currentNode.parentElement;
      if (!parent || seen.has(parent) || !walker.currentNode.textContent.trim() || !visible(parent)) continue;
      seen.add(parent);
      if (parent.closest('.sr-only')) continue;
      if (parseFloat(getComputedStyle(parent).fontSize) < 12) tinyText += 1;
    }

    // 3. Motion that survives prefers-reduced-motion
    const seconds = (value) => Math.max(...value.split(',').map((part) => parseFloat(part) * (part.includes('ms') ? 0.001 : 1)));
    let moving = 0;
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      const animated = style.animationName !== 'none' && seconds(style.animationDuration) > 0.011;
      if (seconds(style.transitionDuration) > 0.011 || animated) moving += 1;
    }

    return { smallTargets: small.length, calendarBlocks, tinyText, moving, examples: [...new Set(small)].slice(0, 12) };
  };

  const results = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const path of PAGES) {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
      await page.goto(BASE + path, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      results.push({ viewport: viewport.name, path, ...(await page.evaluate(measure)) });
    }
  }
  await page.emulateMedia({ reducedMotion: null, colorScheme: null });

  const total = (key) => results.reduce((sum, row) => sum + row[key], 0);
  return {
    totals: {
      smallTargets: total('smallTargets'),
      calendarBlocksUnder44: total('calendarBlocks'),
      tinyText: total('tinyText'),
      movingUnderReducedMotion: total('moving'),
    },
    perPage: results.map((row) => `${row.viewport} ${row.path}: targets ${row.smallTargets}, blocks ${row.calendarBlocks}, tiny ${row.tinyText}, moving ${row.moving}`),
    examples: [...new Set(results.flatMap((row) => row.examples))].slice(0, 40),
  };
}
