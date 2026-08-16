# Twilbot Web App

`twilbot-app.html` is the complete, tenant-neutral Twilbot browser interface:
call status, prompt builder, conditional-flow editor, dynamic variables, REST
API request tools, generated-audio controls, output switches, and call logs.

It deliberately uses only same-origin generic `/api/phone/*` routes. A private
tenant adapter supplies those routes, storage, secrets, authentication, phone
provider configuration, output providers, and tenant settings. The public app
contains no tenant domains, phone numbers, contacts, aliases, prompts, or
vendor-specific behavior.

`twilbot-shell.js` remains a small optional helper that applies a tenant-owned
visible product name.

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

The private tenant adapter vendors both browser assets during its build and owns
every functional endpoint, authentication rule, storage binding, and tenant setting.
