# Twilbot

Tenant-neutral primitives for a Cloudflare Worker phone application.

This package intentionally contains no tenant domains, prompt text, phone numbers, email addresses, integration aliases, API tokens, cloud account identifiers, deploy workflows, or vendor-specific routing rules.

## Includes

- Prompt-template interpolation with `{{variable}}` support.
- Deterministic condition evaluation.
- Callback-driven prompt-graph advancement that private adapters use for live calls.
- Generic REST request shaping for live variables, output sorters, and output destinations.
- Generic post-call output payload and plain-text/email formatting.
- Provider-neutral realtime event classification for a ConversationRelay-style
  adapter.
- A reusable post-call output pipeline contract: start, load settings, format,
  optional REST sorters, optional email, REST destinations, then persistence.
- A bounded retry-delay helper for adapter schedulers and durable workflows.

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

The prompt-graph runner intentionally delegates branch decisions and answer
requirements to the tenant adapter. That keeps a tenant's Workers AI model,
call policy, and provider bindings private while the queue traversal behavior
is shared and fully testable.

Alias names such as `COMPANY_LOOKUP_TOKEN` may be stored as editable GitHub Actions variables in the private tenant repository. The value behind the alias must remain in the tenant's Cloudflare Secret Store, Worker secret, or GitHub Secret. The public engine receives neither.

The public engine never deploys a Worker and never receives tenant credentials.

## Reusable Worker Contracts

`classifyConversationRelayEvent()` turns an untrusted decoded realtime event
into one of `connected`, `caller_prompt`, `dtmf`, `error`, or `unknown`. It
does not authenticate a provider and does not perform WebSocket I/O.

`runPostCallOutputPipeline()` owns the generic delivery ordering while the
private adapter supplies durable workflow steps and concrete implementations.
This preserves durable retries and visual workflow steps without putting
Cloudflare bindings, an email address, REST URL, or a ticketing integration in
this repository.

`outputRetryDelaySeconds()` is a small, bounded exponential-backoff utility
for adapters that schedule retry attempts themselves.

## Web shell

The reusable browser shell lives in [`web/`](web/). It is intentionally limited
to generic Twilbot presentation behavior. Private tenant repositories vendor the
asset at build time and supply their own routes, feature configuration, and
integrations.

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
