#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# check-teams-headers.sh
#
# Smoke-tests the production URL to confirm:
#   1. X-Frame-Options is NOT present in the response (Teams blocks iframed
#      pages when this header is set to SAMEORIGIN or DENY).
#   2. Content-Security-Policy contains a frame-ancestors directive that
#      allows Teams origins.
#
# Usage:
#   bash scripts/check-teams-headers.sh [URL]
#
# The URL defaults to https://project.ethinos.com.
# Exit code 0 = all checks passed; 1 = one or more checks failed.
# ---------------------------------------------------------------------------

set -euo pipefail

URL="${1:-https://project.ethinos.com}"
PASS=0
FAIL=1

echo "=== Teams framing header check ==="
echo "URL: $URL"
echo ""

# Fetch only the response headers (follow redirects, 10 s timeout)
HEADERS=$(curl -sI --max-time 10 --location "$URL") || {
  echo "FAIL: Could not reach $URL (curl exit $?)"
  exit $FAIL
}

echo "--- Raw response headers ---"
echo "$HEADERS"
echo "----------------------------"
echo ""

# ---- Check 1: X-Frame-Options must be absent --------------------------------
if echo "$HEADERS" | grep -qi "^x-frame-options:"; then
  XFO_VALUE=$(echo "$HEADERS" | grep -i "^x-frame-options:" | head -1 | tr -d '\r')
  echo "FAIL [X-Frame-Options]  Header is present: $XFO_VALUE"
  echo "       Teams will refuse to load the tab while this header exists."
  CHECK1=$FAIL
else
  echo "PASS [X-Frame-Options]  Header is absent (correct)."
  CHECK1=$PASS
fi

# ---- Check 2: CSP frame-ancestors must be present --------------------------
CSP_LINE=$(echo "$HEADERS" | grep -i "^content-security-policy:" | head -1 | tr -d '\r')

if [ -z "$CSP_LINE" ]; then
  echo "FAIL [CSP frame-ancestors]  Content-Security-Policy header is missing entirely."
  echo "       Set 'frame-ancestors' in .htaccess or Express middleware."
  CHECK2=$FAIL
elif echo "$CSP_LINE" | grep -qi "frame-ancestors"; then
  echo "PASS [CSP frame-ancestors]  $CSP_LINE"
  CHECK2=$PASS
else
  echo "FAIL [CSP frame-ancestors]  CSP header found but contains no frame-ancestors directive."
  echo "       Header: $CSP_LINE"
  CHECK2=$FAIL
fi

echo ""

# ---- Summary ----------------------------------------------------------------
if [ $CHECK1 -eq $PASS ] && [ $CHECK2 -eq $PASS ]; then
  echo "All checks PASSED — Teams tab should load without a blank screen."
  exit $PASS
else
  echo "One or more checks FAILED — see details above."
  echo ""
  echo "Remediation hints:"
  echo "  • Ensure mod_headers is enabled in Apache:  sudo a2enmod headers && sudo systemctl reload apache2"
  echo "  • Confirm AllowOverride includes FileInfo (or use AllowOverride All) in the VirtualHost block."
  echo "  • If Apache proxy strips response headers, add the Header directives to the VirtualHost directly."
  exit $FAIL
fi
