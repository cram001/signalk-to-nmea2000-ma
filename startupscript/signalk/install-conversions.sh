#!/bin/sh
set -e

SRC="/data/custom/signalk/conversions"

DST1="/usr/lib/node_modules/signalk-server/node_modules/signalk-to-nmea2000/conversions"
DST2="/data/conf/signalk/node_modules/signalk-to-nmea2000/conversions"

echo "[signalk] Restoring custom NMEA2000 conversion scripts"

for DST in "$DST1" "$DST2"; do
  if [ ! -d "$DST" ]; then
    echo "[signalk] Skipping missing destination: $DST"
    continue
  fi

  for f in "$SRC"/*.js; do
    base="$(basename "$f")"
    echo "  → Installing $base → $DST"
    cp "$f" "$DST/$base"
  done
done

echo "[signalk] Conversion scripts restored"
