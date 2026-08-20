# Tenant-config contract (version 1)

The JSON files matching `tenant-config*.json` (except `tenant-config.schema.json`)
are the machine-readable **AI-onboard contract** for this engine.

An AI or Cursor agent should emit this shape, then validate it before a private
adapter imports it. Prompt graphs, Worker deploy, and vendor preview keys stay
in the private adapter. This package never receives secret values.

## Version

`version` must be `1`. That value is `TENANT_CONFIG_VERSION` in `src/index.ts`.

## Files

| File | Role |
| --- | --- |
| `tenant-config.example.json` | Minimal live-variable REST tool |
| `tenant-config.second-tenant.example.json` | Second independent tenant: lookup, sorter, and destination |
| `tenant-config.schema.json` | JSON Schema for the same contract |

## Required shape

```json
{
  "version": 1,
  "branding": { "applicationName": "Example Phone" },
  "restTools": []
}
```

Each REST tool is generic HTTPS only:

- `key`: lowercase snake_case
- `scope`: `live_variable` | `output_sorter` | `output_destination`
- `method`: `GET` | `POST` | `PUT` | `PATCH`
- `url`: `https://` with no credential-like query parameters
- `tokenAlias`: optional uppercase identifier, never a bearer token
- `parameters`: at least one of `source` or `value`

## Validate generated output

```js
import { parseTenantConfig, validateTenantConfig } from "@twilbot/engine";

const result = validateTenantConfig(generated);
if (!result.ok) throw new Error(result.errors.join("\n"));
```

From this repository:

```powershell
npm run validate:examples
npm run check
```

CI workflow `check` is tests-only and supports `workflow_dispatch`:

```powershell
gh workflow run check --repo <engine-repo>
```

## Must not appear in generated engine config

- Secret values, bearer tokens, or `token` / `api_key` query parameters
- Tenant phone numbers, personal emails, or customer records
- Vendor-specific ticket fields or preview-vendor keys
- Deploy credentials or Worker bindings
