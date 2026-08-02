#!/bin/bash
# Fix JWT multi-line PEM values in .env file
set -e
cd /var/www/danqing-ai/server

# Read PEM files and convert to single-line with \n escapes
PRIVATE=$(cat jwt-private.pem | awk '{printf "%s\\n", $0}')
PUBLIC=$(cat jwt-public.pem | awk '{printf "%s\\n", $0}')

# Remove existing multi-line JWT entries and trailing PEM lines
# First, extract everything before JWT_PRIVATE_KEY line
BEFORE=$(awk '/^JWT_PRIVATE_KEY=/{exit} {print}' .env)
# Extract everything after the last PEM-related line (after JWT_PUBLIC_KEY block)
AFTER=$(awk '
  /^JWT_PUBLIC_KEY=/ { found=1 }
  found && /-----END PUBLIC KEY-----/ { found=2; next }
  found==2 { print }
' .env)

# Also get lines after the public key section that are actual config
# Actually, let's just rebuild the .env properly
# Extract all non-JWT-KEY lines, then append fixed JWT keys

# Create new .env: keep all lines except multi-line JWT PEM content
python3 << 'PYEOF'
import re

with open('.env') as f:
    lines = f.readlines()

result = []
skip_until_end = False
for line in lines:
    stripped = line.strip()
    if skip_until_end:
        if '-----END' in stripped:
            skip_until_end = False
        continue
    if stripped.startswith('JWT_PRIVATE_KEY=-----BEGIN'):
        # Read private key from file
        with open('jwt-private.pem') as pf:
            pem = pf.read().strip()
        escaped = pem.replace('\n', '\\n')
        result.append(f'JWT_PRIVATE_KEY="{escaped}"\n')
        skip_until_end = True
    elif stripped.startswith('JWT_PUBLIC_KEY=-----BEGIN'):
        with open('jwt-public.pem') as pf:
            pem = pf.read().strip()
        escaped = pem.replace('\n', '\\n')
        result.append(f'JWT_PUBLIC_KEY="{escaped}"\n')
        skip_until_end = True
    else:
        result.append(line)

with open('.env', 'w') as f:
    f.writelines(result)

print("FIX_OK")
PYEOF
