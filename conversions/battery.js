const _ = require('lodash')

const BATTERY_STATUS_INTERVAL_MS = 1000   // 1 Hz → PGN 127508
const DC_STATUS_INTERVAL_MS      = 1000   // 1 Hz → PGN 127506

// ----------------- helpers -----------------

function round1(v) { return Math.round(v * 10) / 10 }
function round2(v) { return Math.round(v * 100) / 100 }
function round3(v) { return Math.round(v * 1000) / 1000 }
function roundInt(v) { return Math.round(v) }

// seconds → ISO 8601 duration (canboat-safe)
function secondsToDuration(sec) {
  if (sec == null) return undefined
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `PT${h}H${m}M${s}S`
}

// ============================================================

module.exports = (app, plugin) => {

  return {
    title: 'Battery (127508 @ 1Hz, 127506 @ 1Hz)',
    optionKey: 'BATTERYv2',
    context: 'vessels.self',
    properties: {
      batteries: {
        title: 'Battery Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: { type: 'string' },
            instanceId: { type: 'number' }
          }
        }
      }
    },

    conversions: (options) => {
      if (!_.get(options, 'BATTERYv2.batteries')) return null

      options.BATTERYv2.batteries.forEach(battery => {
        const base = `electrical.batteries.${battery.signalkId}`

        // ------------------------------------------------------
        // PGN 127508 — Battery Status (Voltage / Current / Temp)
        // ------------------------------------------------------
        setInterval(() => {
          const voltage     = app.getSelfPath(`${base}.voltage`)
          const current     = app.getSelfPath(`${base}.current`)
          const temperature = app.getSelfPath(`${base}.temperature`)

          // Raymarine guard: require at least voltage
          if (typeof voltage !== 'number' || !isFinite(voltage)) {
            return
          }

          plugin.emit('nmea2000JsonOut', {
            pgn: 127508,
            'Battery Instance': battery.instanceId,
            Voltage: round2(voltage),
            Current: current == null ? undefined : round1(current),
            Temperature: temperature == null ? undefined : round2(temperature)
          })
        }, BATTERY_STATUS_INTERVAL_MS)

        // ------------------------------------------------------
        // PGN 127506 — DC Detailed Status
        // ------------------------------------------------------
        setInterval(() => {
          const soc   = app.getSelfPath(`${base}.capacity.stateOfCharge`)
          const tr    = app.getSelfPath(`${base}.capacity.timeRemaining`)
          const soh   = app.getSelfPath(`${base}.capacity.stateOfHealth`)
          const ripple= app.getSelfPath(`${base}.ripple`)
          const ah    = app.getSelfPath(`${base}.ampHours`)

          // Nothing meaningful to send
          if (
            soc == null &&
            tr == null &&
            soh == null &&
            ripple == null &&
            ah == null
          ) {
            return
          }

          plugin.emit('nmea2000JsonOut', {
            pgn: 127506,
            'DC Instance': battery.instanceId,
            'DC Type': 'Battery',

            'State of Charge':
              soc == null ? undefined : roundInt(soc * 100),

            'State of Health':
              soh == null ? undefined : roundInt(soh * 100),

            'Time Remaining':
              tr == null ? undefined : secondsToDuration(tr),

            'Ripple Voltage':
              ripple == null ? undefined : round3(ripple),

            'Amp Hours':
              ah == null ? undefined : roundInt(ah)
          })
        }, DC_STATUS_INTERVAL_MS)
      })

      // No event-driven conversions
      return []
    }
  }
}
