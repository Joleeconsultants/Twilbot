# Twilbot Web Shell

`twilbot-shell.js` is a dependency-free public browser asset for a tenant-owned
Twilbot site. It applies the tenant's visible product name without embedding any
tenant domains, routes, credentials, prompts, customer data, or vendor logic.

```html
<h1 data-twilbot-title>Twilbot</h1>
<p data-twilbot-subtitle></p>
<script>
  window.TWILBOT_SHELL_CONFIG = { title: "Example Phone" };
</script>
<script defer src="/twilbot-shell.js"></script>
<script>
  window.addEventListener("DOMContentLoaded", () => {
    window.TwilbotShell.apply(window.TWILBOT_SHELL_CONFIG);
  });
</script>
```

The private tenant adapter vendors this file during its build and owns every
functional endpoint, authentication rule, storage binding, and tenant setting.
