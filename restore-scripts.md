============================================================
Signal K Customization Persistence System
Cerbo GX (Venus OS)
============================================================

PURPOSE
-------
Ensure custom Signal K modifications survive:
- Venus OS firmware updates
- Signal K reinstalls
- signalk-to-nmea2000 plugin updates

This system restores:
1) Custom NMEA2000 conversion scripts
2) Custom Signal K landing page redirect


============================================================
SYSTEM ARCHITECTURE
============================================================

All persistent files are stored under:

/data

Venus OS firmware updates overwrite:
/usr
/etc

BUT NOT:
/data

We use:
/data/rc.local

as the boot hook to reapply modifications automatically.


============================================================
FINAL DIRECTORY STRUCTURE
============================================================

/data/
│
├── rc.local
├── patch-signalk-landing.sh
│
└── custom/
    └── signalk/
        ├── install-conversions.sh
        └── conversions/
            ├── engineParameters.js
            ├── battery.js
            └── (other custom conversion files)


============================================================
1) BOOT HOOK FILE
============================================================

File:
/data/rc.local

Contents:

#!/bin/sh

# Allow Signal K filesystem/services to settle
sleep 5

# Patch Signal K landing page
/data/patch-signalk-landing.sh

# Restore custom signalk-to-nmea2000 conversion scripts
/data/custom/signalk/install-conversions.sh

exit 0


Make executable:

chmod +x /data/rc.local


============================================================
2) CONVERSION RESTORE SCRIPT
============================================================

File:
/data/custom/signalk/install-conversions.sh

Contents:

#!/bin/sh
set -e

SRC="/data/custom/signalk/conversions"

DST1="/usr/lib/node_modules/signalk-server/node_modules/signalk-to-nmea2000/conversions"
DST2="/data/conf/signalk/node_modules/signalk-to-nmea2000/conversions"

echo "[signalk] Restoring custom NMEA2000 conversion scripts"

if [ ! -d "$SRC" ]; then
  echo "[signalk] No custom conversions directory found"
  exit 0
fi

for DST in "$DST1" "$DST2"; do
  if [ ! -d "$DST" ]; then
    echo "[signalk] Skipping missing destination: $DST"
    continue
  fi

  for f in "$SRC"/*.js 2>/dev/null; do
    [ -f "$f" ] || continue
    base="$(basename "$f")"
    echo "  → Installing $base → $DST"
    cp -f "$f" "$DST/$base"
  done
done

echo "[signalk] Conversion scripts restored"


Make executable:

chmod +x /data/custom/signalk/install-conversions.sh


============================================================
3) CUSTOM CONVERSION SOURCE LOCATION
============================================================

All custom .js conversion files must live in:

/data/custom/signalk/conversions/

Example:

/data/custom/signalk/conversions/engineParameters.js
/data/custom/signalk/conversions/battery.js

These are copied automatically at every boot.


============================================================
4) LANDING PAGE PATCH SCRIPT
============================================================

File:
/data/patch-signalk-landing.sh

Contents:

#!/bin/sh

FILE=/usr/lib/node_modules/signalk-server/dist/serverroutes.js

# Already patched? exit cleanly
grep -q "/@mxtommy/kip/" "$FILE" && exit 0

echo "Patching SignalK landing page..."

sed -i "s|let landingPage = '/admin/';|let landingPage = '/@mxtommy/kip/';|" "$FILE"


Make executable:

chmod +x /data/patch-signalk-landing.sh


============================================================
WHAT HAPPENS AT BOOT
============================================================

1. Cerbo boots
2. /data/rc.local executes
3. Wait 5 seconds
4. Landing page is patched (if needed)
5. Custom conversion scripts are copied into active plugin directories
6. Signal K starts normally
7. Custom engine/battery conversions are active


============================================================
HOW TO VERIFY AFTER UPDATE
============================================================

After firmware or Signal K update:

1) SSH into Cerbo
2) Run:

   tail -f /var/log/messages

You should see:

   [signalk] Restoring custom NMEA2000 conversion scripts
   → Installing engineParameters.js
   [signalk] Conversion scripts restored


============================================================
HOW TO RECREATE FROM SCRATCH
============================================================

If everything is wiped except /data:

1) Recreate directories:

   mkdir -p /data/custom/signalk/conversions

2) Recreate these files:
   - /data/rc.local
   - /data/patch-signalk-landing.sh
   - /data/custom/signalk/install-conversions.sh

3) Make all executable:

   chmod +x /data/rc.local
   chmod +x /data/patch-signalk-landing.sh
   chmod +x /data/custom/signalk/install-conversions.sh

4) Restore your custom conversion .js files into:

   /data/custom/signalk/conversions/

5) Reboot:

   reboot


============================================================
IMPORTANT RULES
============================================================

NEVER edit files directly in:
/usr/lib/node_modules/

They will be erased by firmware updates.

ALWAYS edit your custom versions in:
/data/custom/signalk/conversions/

Then reboot.


============================================================
SYSTEM SUMMARY
============================================================

Boot Hook:        /data/rc.local
Restore Script:   /data/custom/signalk/install-conversions.sh
Landing Patch:    /data/patch-signalk-landing.sh
Custom JS Files:  /data/custom/signalk/conversions/

All stored in /data
Fully firmware-update resistant
Automatically self-restoring at boot

============================================================
END OF DOCUMENT
============================================================
