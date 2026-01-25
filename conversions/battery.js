const _ = require('lodash')

// -----------------------------------------------------------------------------
// Update rate
// -----------------------------------------------------------------------------
const BATTERY_INTERVAL_MS = 1000   // 1 Hz

// -----------------------------------------------------------------------------
// Rounding helpers (NMEA-friendly)
// -----------------------------------------------------------------------------
function roundVoltage(v) {
  return Math.round(v * 100) / 100      // 0.01 V
}

function roundCurrent(a) {
  return Math.round(a * 10) / 10         // 0.1 A
}

function roundTempK(t) {
  return Math.round(t * 10) / 10         // 0.1 K
}

// seconds → ISO 8601 duration (canboat-safe)
function secondsToDuration(sec) {
  if (sec == null) return undefined
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `PT${h}H${m}M${s}S`
}

// ============================================================================

module.exports = (app, plugin) => {

  const timers = []

  plugin.stop = () => {
    timers.forEach(t => clearInterval(t))
    timers.length = 0
  }

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
            signalkId:  { type: 'string' },
            instanceId: { type: 'number' }
          }
        }
      }
    },

    conversions: (options) => {
      const batteries = _.get(options, 'BATTERYv2.batteries')
      if (!Array.isArray(batteries) || batteries.length === 0) {
        return null
      }

      batteries.forEach(battery => {
        timers.push(setInterval(() => {

          const base = `electrical.batteries.${battery.signalkId}`

          const voltage       = app.getSelfPath(`${base}.voltage`)
          const current       = app.getSelfPath(`${base}.current`)
          const temperature   = app.getSelfPath(`${base}.temperature`)
          const soc            = app.getSelfPath(`${base}.capacity.stateOfCharge`)
          const timeRemaining  = app.getSelfPath(`${base}.capacity.timeRemaining`)
          const soh            = app.getSelfPath(`${base}.capacity.stateOfHealth`)
          const ripple         = app.getSelfPath(`${base}.ripple`)
          const ampHours       = app.getSelfPath(`${base}.ampHours`)

          // ------------------------------------------------
          // PGN 127508 — Battery Status
          // ------------------------------------------------
          if (
            voltage != null ||
            current != null ||
            temperature != null
          ) {
            app.emit('nmea2000JsonOut', {
              pgn: 127508,
              'Battery Instance': battery.instanceId,

              Voltage:
                voltage == null
                  ? undefined
                  : roundVoltage(voltage),

              Current:
                current == null
                  ? undefined
                  : roundCurrent(current),

              Temperature:
                temperature == null
                  ? undefined
                  : roundTempK(temperature)
            })
          }

          // ------------------------------------------------
          // PGN 127506 — DC Detailed Status
          // ------------------------------------------------
          if (
            soc != null ||
            timeRemaining != null ||
            soh != null ||
            ripple != null ||
            ampHours != null
          ) {
            app.emit('nmea2000JsonOut', {
              pgn: 127506,
              'DC Instance': battery.instanceId,
              'DC Type': 'Battery',

              'State of Charge':
                soc == null ? undefined : Math.round(soc * 100),

              'State of Health':
                soh == null ? undefined : Math.round(soh * 100),

              'Time Remaining':
                timeRemaining == null
                  ? undefined
                  : secondsToDuration(timeRemaining),

              'Ripple Voltage':
                ripple == null
                  ? undefined
                  : roundVoltage(ripple),

              'Amp Hours':
                ampHours == null
                  ? undefined
                  : Math.round(ampHours)
            })
          }

        }, BATTERY_INTERVAL_MS))
      })

      // Timer-driven only
      return []
    }
  }
}
