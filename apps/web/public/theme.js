// Applies the saved theme before first paint, so the page never flashes the wrong one.
// The choice ('system' | 'light' | 'dark') lives in localStorage; see src/lib/theme.ts.
(function () {
  try {
    var choice = localStorage.getItem('routinely:theme') || 'system';
    var dark =
      choice === 'dark' ||
      (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
