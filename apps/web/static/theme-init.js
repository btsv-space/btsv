// Applied before first paint so the theme does not flash. External (not inline)
// so the app can run under `script-src 'self'`.
(function () {
  var m = window.matchMedia("(prefers-color-scheme: dark)");
  if (m.matches) document.documentElement.classList.add("dark");
  m.addEventListener("change", function (e) {
    document.documentElement.classList.toggle("dark", e.matches);
  });
})();
