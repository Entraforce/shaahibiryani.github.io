# shaahi-staging — Uber Direct end-to-end test environment

Isolated from production: own database, own keys, TEST modes only.

| Piece | Staging value |
|---|---|
| Database | `00-prod-schema.sql` (production STRUCTURE only, read-only export, no rows) → `01-staging-isolation.sql` → `../migrations/20261031000000_uber_direct_sandbox.sql` |
| Menu prices | copied from the public menu endpoint (no customer data) |
| Stripe | `STRIPE_SECRET_KEY_WEB` = test key (`sk_test_`), `STRIPE_LIVEMODE=false` |
| Uber Direct | `UBER_DIRECT_MODE=sandbox` + TEST credentials; robo courier |
| Clover | `CLOVER_SYNC_MODE` unset = disabled; clover-sync NOT deployed |
| Printing | `integration_settings.cloudprnt = false`; cloudprnt NOT deployed |
| Kitchen display | local copy on this Mac pointed at staging; test staff login |
| Functions deployed | create-web-order, confirm-web-order, uber-delivery-quote, uber-dispatch, uber-webhook |

Secrets live in Supabase (staging) secrets and `~/.config/shaahi/*.env` (chmod 600). Never in git.
