# Twilbot

Tenant-neutral primitives for a Cloudflare Worker phone application.

This package intentionally contains no tenant domains, prompt text, phone numbers, email addresses, integration aliases, API tokens, cloud account identifiers, deploy workflows, or vendor-specific routing rules.

## Includes

- Prompt-template interpolation with `{{variable}}` support.
- Deterministic condition evaluation.
- Generic REST request shaping for live variables, output sorters, and output destinations.
- Generic post-call output payload and plain-text formatting.

## Does Not Include

- Twilio, Cloudflare Access, or Worker route configuration.
- R2, KV, D1, Durable Object, Workflow, Email, or AI bindings.
- Tenant prompts, phone numbers, domains, sender addresses, customer data, or credentials.
- Any customer-specific integration such as ticketing, CRM, or lookup behavior.

Those belong in a private tenant repository that pins a reviewed engine release.

## Tenant Adapter Pattern

Each tenant repository should:

1. Pin an engine release by immutable version or commit.
2. Own its own Cloudflare Worker config, bindings, secrets, domains, Access policy, and deployment action.
3. Keep prompts and integration configuration private.
4. Invoke client-specific systems only through configured REST endpoints.

Alias names such as `COMPANY_LOOKUP_TOKEN` may be stored as editable GitHub Actions variables in the private tenant repository. The value behind the alias must remain in the tenant's Cloudflare Secret Store, Worker secret, or GitHub Secret. The public engine receives neither.

The public engine never deploys a Worker and never receives tenant credentials.

## Security Boundary

`tokenAlias` is an identifier only. A tenant adapter resolves it from its own secret provider. Never persist an actual bearer token in public configuration, browser storage, output records, issue text, or logs.

## Release Checklist

Before publication, run:

```powershell
npm install
npm run check
rg -n -i "tenant-name|example\.internal|@company\.test|secret|token-value" .
```

Review every match. The final scan should find only documentation discussing security, not real tenant values.
