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
root@einstein:/data/custom/signalk# ls
conversions             install-conversions.sh
root@einstein:/data/custom/signalk# cd conversions
root@einstein:/data/custom/signalk/conversions# cat battery.js
const _ = require('lodash')

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function extractValue(v) {
  if (v == null) return undefined
  if (typeof v === 'object' && v.value != null) return v.value
  if (typeof v === 'number') return v
  return undefined
}

function roundVoltage(v) {
  return Math.round(v * 100) / 100
}

function roundCurrent(a) {
  return Math.round(a * 10) / 10
}

function roundTempK(t) {
  return Math.round(t * 10) / 10
}

// ============================================================================

module.exports = (app, plugin) => {

  return {
    title: 'Battery Status (127508 + 127506)',
    optionKey: 'BATTERYv2',
    context: 'vessels.self',

    properties: {
      batteries: {
        title: 'Battery Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId:  { type: 'string' },
            instanceId: { type: 'number' }
          }
        }
      }
    },

    conversions: (options) => {

      if (!_.get(options, 'BATTERYv2.batteries')) {
        return null
      }

      return options.BATTERYv2.batteries.map(battery => {

        const base = `electrical.batteries.${battery.signalkId}`

        // Cache last known values
        let last = {
          voltage: undefined,
          current: undefined,
          temperature: undefined,
          soc: undefined,
          timeRemain: undefined,
          soh: undefined,
          ripple: undefined
        }

        return {
          keys: [
            `${base}.voltage`,
            `${base}.current`,
            `${base}.temperature`,
            `${base}.capacity.stateOfCharge`,
            `${base}.capacity.timeRemaining`,
            `${base}.capacity.stateOfHealth`,
            `${base}.ripple`
          ],

          timeouts: [5000, 5000, 5000, 5000, 5000, 5000, 5000],

          callback: (
            voltageRaw,
            currentRaw,
            temperatureRaw,
            socRaw,
            timeRemainingRaw,
            sohRaw,
            rippleRaw
          ) => {

            // Extract new values
            const v  = extractValue(voltageRaw)
            const c  = extractValue(currentRaw)
            const t  = extractValue(temperatureRaw)
            const s  = extractValue(socRaw)
            const tr = extractValue(timeRemainingRaw)
            const sh = extractValue(sohRaw)
            const r  = extractValue(rippleRaw)

            // Update cache
            if (v  != null) last.voltage = v
            if (c  != null) last.current = c
            if (t  != null) last.temperature = t
            if (s  != null) last.soc = s
            if (tr != null) last.timeRemain = tr
            if (sh != null) last.soh = sh
            if (r  != null) last.ripple = r

            const result = []

            // -------------------------------------------------------------
            // PGN 127508 — Battery Status
            // Emit only if voltage AND current exist
            // -------------------------------------------------------------
            if (last.voltage != null && last.current != null) {

              result.push({
                pgn: 127508,
                instance: battery.instanceId,
                voltage: roundVoltage(last.voltage),
                current: roundCurrent(last.current),
                temperature:
                  last.temperature == null
                    ? undefined
                    : roundTempK(last.temperature),
                sid: undefined
              })
            }

            // -------------------------------------------------------------
            // PGN 127506 — DC Detailed Status
            // Emit only if SOC exists
            // -------------------------------------------------------------
            if (last.soc != null) {

              result.push({
                pgn: 127506,
                instance: battery.instanceId,
                dcType: 0, // 0 = Battery

                stateOfCharge: Math.round(last.soc * 100),

                stateOfHealth:
                  last.soh == null
                    ? undefined
                    : Math.round(last.soh * 100),

                timeRemaining:
                  last.timeRemain == null
                    ? undefined
                    : Math.min(65535, Math.round(last.timeRemain)),

                rippleVoltage:
                  last.ripple == null
                    ? undefined
                    : Math.max(0, roundVoltage(last.ripple)),

                remainingCapacity: undefined,
                sid: undefined
              })
            }

            return result
          }
        }
      })
    }
  }
}
