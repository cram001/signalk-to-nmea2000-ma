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

// rad/s → RPM (Signal K uses rad/s in many feeds; if yours is Hz or RPM, adjust)
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
              instanceId: { type: 'number' }
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
              // PGN expects RPM
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

            const oilPresPa = app.getSelfPath(`${base}.oilPressure`)
            const oilTempK  = app.getSelfPath(`${base}.oilTemperature`)
            const coolantK  = app.getSelfPath(`${base}.temperature`)
            const altVolt   = app.getSelfPath(`${base}.alternatorVoltage`)
            const fuelRate  = app.getSelfPath(`${base}.fuel.rate`)         // m³/s (Signal K)
            const runTimeS  = app.getSelfPath(`${base}.runTime`)           // seconds (Signal K)
            const coolPresPa= app.getSelfPath(`${base}.coolantPressure`)
            const fuelPresPa= app.getSelfPath(`${base}.fuel.pressure`)
            const engLoad   = app.getSelfPath(`${base}.engineLoad`)        // 0..1
            const engTorque = app.getSelfPath(`${base}.engineTorque`)      // 0..1

            // Pressures: Signal K uses Pa; PGN 127489 uses kPa in canboat JSON
            const oilPresKpa  = (typeof oilPresPa === 'number' && isFinite(oilPresPa)) ? oilPresPa / 1000 : undefined
            const coolPresKpa = (typeof coolPresPa === 'number' && isFinite(coolPresPa)) ? coolPresPa / 1000 : undefined
            const fuelPresKpa = (typeof fuelPresPa === 'number' && isFinite(fuelPresPa)) ? fuelPresPa / 1000 : undefined

            app.emit('nmea2000JsonOut', {
              pgn: 127489,
              'Engine Instance': engine.instanceId,

              // Pressures (kPa)
              'Oil pressure':     oilPresKpa  == null ? undefined : round1(oilPresKpa),
              'Coolant Pressure': coolPresKpa == null ? undefined : round1(coolPresKpa),
              'Fuel Pressure':    fuelPresKpa == null ? undefined : round1(fuelPresKpa),

              // Temperatures (Kelvin)
              'Oil temperature':  (typeof oilTempK === 'number' && isFinite(oilTempK)) ? round1(oilTempK) : undefined,
              'Temperature':      (typeof coolantK === 'number' && isFinite(coolantK)) ? round1(coolantK) : undefined,

              // Electrical
              'Alternator Potential':
                (typeof altVolt === 'number' && isFinite(altVolt)) ? round2(altVolt) : undefined,

              // Fuel rate (m³/s → L/h)
              'Fuel Rate':
                (typeof fuelRate === 'number' && isFinite(fuelRate) && fuelRate > 0)
                  ? round1(fuelRate * 3600 * 1000)
                  : undefined,

              // Runtime (canboat-safe duration)
              'Total Engine hours':
                (typeof runTimeS === 'number' && isFinite(runTimeS) && runTimeS >= 0)
                  ? secondsToDuration(runTimeS)
                  : undefined,

              // Status (unused for now)
              'Discrete Status 1': [],
              'Discrete Status 2': [],

              // Load / torque (%)
              'Engine Load':
                (typeof engLoad === 'number' && isFinite(engLoad))
                  ? roundInt(engLoad * 100)
                  : undefined,

              'Engine Torque':
                (typeof engTorque === 'number' && isFinite(engTorque))
                  ? roundInt(engTorque * 100)
                  : undefined
            })

          }, DYNAMIC_INTERVAL_MS))
        })

        // No event-driven conversions used
        return []
      }
    }
  ]
}
