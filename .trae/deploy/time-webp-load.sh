#!/bin/bash
H=https://www.danqing.site
FILES="flower greavewave hero horatii lotus monalisa mountain pearl sculpture starrynight sunrise thinker waterlilies"

echo "--- aggregate download timing (3 runs) ---"
for i in 1 2 3; do
  start=$(date +%s%N)
  for f in $FILES; do
    curl -s -o /dev/null "$H/images/gallery-$f.webp"
  done
  end=$(date +%s%N)
  echo "run $i: $(( (end-start)/1000000 )) ms"
done

echo "--- total sizes ---"
echo -n "webp total: "; du -cb /var/www/danqing-ai/website/images/gallery-*.webp | tail -1
echo -n "jpg  total: "; du -cb /var/www/danqing-ai/website-backup-20260808-6/images/gallery-*.jpg | tail -1