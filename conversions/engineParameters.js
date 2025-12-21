const _ = require('lodash')

// -----------------------------------------------------------------------------
// NMEA 2000 mandated update rates
// -----------------------------------------------------------------------------
const RAPID_INTERVAL_MS   = 250    // 4 Hz → PGN 127488
const DYNAMIC_INTERVAL_MS = 1000   // 1 Hz → PGN 127489

// -----------------------------------------------------------------------------
// Helpers (N2K-friendly rounding)
// -----------------------------------------------------------------------------
function round1(v) { return Math.round(v * 10) / 10 }
function round2(v) { return Math.round(v * 100) / 100 }
function roundInt(v) { return Math.round(v) }

// seconds → ISO 8601 duration (canboat-safe)
function secondsToDuration(sec) {
  if (sec == null) return undefined
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `PT${h}H${m}M${s}S`
}

// rad/s → RPM (Signal K uses rad/s)
function radPerSecToRPM(rad) {
  return rad * 60 / (2 * Math.PI)
}

// ============================================================================

module.exports = (app, plugin) => {

  // Track timers so they don’t stack on restart
  const timers = []

  plugin.stop = () => {
    timers.forEach(t => clearInterval(t))
    timers.length = 0
  }

  return [
    {
      title: 'Engine Parameters (127488 @ 4Hz, 127489 @ 1Hz)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',

      properties: {
        engines: {
          title: 'Engine Mapping',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              signalkId:  { type: 'string' },
              instanceId:{ type: 'number' }
            }
          }
        }
      },

      conversions: (options) => {
        const engines = _.get(options, 'ENGINE_PARAMETERS.engines')
        if (!Array.isArray(engines) || engines.length === 0) {
          return null
        }

        // ---------------------------------------------------------------------
        // PGN 127488 — Engine Parameters, Rapid Update (4 Hz)
        // ---------------------------------------------------------------------
        engines.forEach(engine => {
          timers.push(setInterval(() => {
            const radPerSec =
              app.getSelfPath(`propulsion.${engine.signalkId}.revolutions`)

            if (typeof radPerSec !== 'number' || !isFinite(radPerSec)) {
              return
            }

            app.emit('nmea2000JsonOut', {
              pgn: 127488,
              'Engine Instance': engine.instanceId,
              'Speed': roundInt(radPerSecToRPM(radPerSec))
            })
          }, RAPID_INTERVAL_MS))
        })

        // ---------------------------------------------------------------------
        // PGN 127489 — Engine Parameters, Dynamic (1 Hz)
        // ---------------------------------------------------------------------
        engines.forEach(engine => {
          timers.push(setInterval(() => {

            const base = `propulsion.${engine.signalkId}`

            const oilPres   = app.getSelfPath(`${base}.oilPressure`)
            const oilTemp   = app.getSelfPath(`${base}.oilTemperature`)
            const coolantT  = app.getSelfPath(`${base}.temperature`)
            const altVolt   = app.getSelfPath(`${base}.alternatorVoltage`)
            const fuelRate  = app.getSelfPath(`${base}.fuel.rate`)
            const runTime   = app.getSelfPath(`${base}.runTime`)
            const coolPres  = app.getSelfPath(`${base}.coolantPressure`)
            const fuelPres  = app.getSelfPath(`${base}.fuel.pressure`)
            const engLoad   = app.getSelfPath(`${base}.engineLoad`)
            const engTorque = app.getSelfPath(`${base}.engineTorque`)

            app.emit('nmea2000JsonOut', {
              pgn: 127489,
              'Engine Instance': engine.instanceId,

              // Pressures
              'Oil pressure':        oilPres   ?? undefined,
              'Coolant Pressure':    coolPres  ?? undefined,
              'Fuel Pressure':       fuelPres  ?? undefined,

              // Temperatures (Kelvin expected by canboat)
              'Oil temperature':     oilTemp   ?? undefined,
              'Temperature':         coolantT  ?? undefined,

              // Electrical
              'Alternator Potential':
                altVolt == null ? undefined : round2(altVolt),

              // Fuel rate (m³/s → L/h)
              'Fuel Rate':
                fuelRate > 0
                  ? round1(fuelRate * 3600 * 1000)
                  : undefined,

              // Runtime
              'Total Engine hours':
                runTime == null ? undefined : secondsToDuration(runTime),

              // Status (unused for now)
              'Discrete Status 1': [],
              'Discrete Status 2': [],

              // Load / torque (percent)
              'Engine Load':
                engLoad == null ? undefined : roundInt(engLoad * 100),

              'Engine Torque':
                engTorque == null ? undefined : roundInt(engTorque * 100)
            })

          }, DYNAMIC_INTERVAL_MS))
        })

        // No event-driven conversions used
        return []
      }
    }
  ]
}
