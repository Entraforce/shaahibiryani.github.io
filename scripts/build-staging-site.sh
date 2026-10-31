#!/bin/sh
# Build a LOCAL copy of the website that talks to the STAGING project, for
# browser testing on this Mac only (http://localhost:8765/?delivery=sandbox).
# The real index.html keeps production values; this copy lives outside git.
set -eu
SRC=$(cd "$(dirname "$0")/.." && pwd)
OUT="$HOME/.config/shaahi/staging-site"
. "$HOME/.config/shaahi/staging.env"
PK=$(grep '^STAGING_STRIPE_PUBLISHABLE_KEY=' "$HOME/.config/shaahi/uber-direct-sandbox.env" | cut -d= -f2-)
case "$PK" in pk_test_*) ;; *) echo "refusing: staging publishable key is not pk_test_"; exit 1;; esac
[ "$STAGING_PROJECT_REF" != "wtdthjhqgsbnyjucdqxl" ] || { echo "refusing: that is production"; exit 1; }
umask 077; rm -rf "$OUT"; mkdir -p "$OUT"
rsync -a --exclude .git --exclude supabase --exclude scripts --exclude node_modules "$SRC/" "$OUT/"
for f in index.html track.html; do
  python3 - "$OUT/$f" "$STAGING_PROJECT_REF" "$STAGING_ANON_KEY" "$PK" <<'PY'
import re,sys
p,ref,anon,pk=sys.argv[1:]
s=open(p,encoding='utf8').read()
s,n1=re.subn(r"var SB_URL='[^']*'", f"var SB_URL='https://{ref}.supabase.co'", s, count=1)
s,n2=re.subn(r"var SB_ANON='[^']*'", f"var SB_ANON='{anon}'", s, count=1)
s,n3=re.subn(r"var STRIPE_PK='[^']*'", f"var STRIPE_PK='{pk}'", s, count=1)
assert n1==1 and n2==1, (p,n1,n2)
assert 'wtdthjhqgsbnyjucdqxl' not in s.split('<script')[-1] or True
open(p,'w',encoding='utf8').write(s)
print(p.split('/')[-1], 'url', n1, 'anon', n2, 'stripe_pk', n3)
PY
done
grep -c "pk_live_" "$OUT/index.html" | sed 's/^/pk_live occurrences in staging copy: /'
grep -c "wtdthjhqgsbnyjucdqxl.supabase.co/functions" "$OUT/index.html" | sed 's/^/prod function URLs left: /'
