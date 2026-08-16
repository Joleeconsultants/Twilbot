/*
 * Public, dependency-free browser shell for a tenant-owned Twilbot site.
 * The tenant supplies its brand and keeps all live routes and credentials private.
 */
(function attachTwilbotShell(global) {
  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function apply(config) {
    const options = config || {};
    const title = text(options.title) || "Twilbot";
    const subtitle = text(options.subtitle);
    const document = global.document;
    if (!document) return;

    document.title = title;
    for (const selector of ["meta[name='application-name']", "meta[name='apple-mobile-web-app-title']"]) {
      const element = document.querySelector(selector);
      if (element) element.setAttribute("content", title);
    }
    for (const element of document.querySelectorAll("[data-twilbot-title]")) element.textContent = title;
    for (const element of document.querySelectorAll("[data-twilbot-subtitle]")) element.textContent = subtitle;
    document.documentElement.dataset.twilbotShell = "ready";
  }

  global.TwilbotShell = Object.freeze({ apply });
  if (global.TWILBOT_SHELL_CONFIG) {
    if (global.document && global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", () => apply(global.TWILBOT_SHELL_CONFIG), { once: true });
    } else {
      apply(global.TWILBOT_SHELL_CONFIG);
    }
  }
})(window);
