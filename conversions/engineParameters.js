const _ = require('lodash')

const RAPID_INTERVAL_MS   = 250    // 4 Hz → PGN 127488
const DYNAMIC_INTERVAL_MS = 1000   // 1 Hz → PGN 127489

// ----------------- helpers -----------------

function round1(v) {
  return Math.round(v * 10) / 10
}

function round2(v) {
  return Math.round(v * 100) / 100
}

function roundInt(v) {
  return Math.round(v)
}

// seconds → ISO 8601 duration (canboat-safe)
function secondsToDuration(sec) {
  if (sec == null) return undefined
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `PT${h}H${m}M${s}S`
}

// rad/s → rpm
function radPerSecToRPM(rad) {
  return rad * 60 / (2 * Math.PI)
}

// ============================================================

module.exports = (app, plugin) => {

  return [

    // ----------------------------------------------------------
    // PGN 127488 + 127489 — Engine Parameters
    // ----------------------------------------------------------

    {
      title: 'Engine Parameters (127488 @ 4Hz, 127489 @ 1Hz)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',
      properties: {
        engines: {
          title: 'Engine Mapping, ie: main, engine, 1, 2',
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
        if (!_.get(options, 'ENGINE_PARAMETERS.engines')) return null

        // ------------------------------------------------------
        // TIMER-DRIVEN PGN 127488 (Rapid Update, 4 Hz)
        // ------------------------------------------------------
        options.ENGINE_PARAMETERS.engines.forEach(engine => {
          setInterval(() => {
            const revolutions =
              app.getSelfPath(`propulsion.${engine.signalkId}.revolutions`)

            if (typeof revolutions !== 'number' || !isFinite(revolutions)) {
              return
            }

            plugin.emit('nmea2000JsonOut', {
              pgn: 127488,
              'Engine Instance': engine.instanceId,
              'Speed': roundInt(radPerSecToRPM(revolutions))
            })
          }, RAPID_INTERVAL_MS)
        })

        // ------------------------------------------------------
        // TIMER-DRIVEN PGN 127489 (Dynamic, 1 Hz)
        // ------------------------------------------------------
        options.ENGINE_PARAMETERS.engines.forEach(engine => {
          setInterval(() => {

            const base = `propulsion.${engine.signalkId}`

            const oilPres   = app.getSelfPath(`${base}.oilPressure`)
            const oilTemp   = app.getSelfPath(`${base}.oilTemperature`)
            const temp      = app.getSelfPath(`${base}.temperature`)
            const altVolt   = app.getSelfPath(`${base}.alternatorVoltage`)
            const fuelRate  = app.getSelfPath(`${base}.fuel.rate`)
            const runTime   = app.getSelfPath(`${base}.runTime`)
            const coolPres  = app.getSelfPath(`${base}.coolantPressure`)
            const fuelPres  = app.getSelfPath(`${base}.fuel.pressure`)
            const engLoad   = app.getSelfPath(`${base}.engineLoad`)
            const engTorque = app.getSelfPath(`${base}.engineTorque`)

            plugin.emit('nmea2000JsonOut', {
              pgn: 127489,
              'Engine Instance': engine.instanceId,

              'Oil pressure': oilPres ?? undefined,
              'Coolant Pressure': coolPres ?? undefined,
              'Fuel Pressure': fuelPres ?? undefined,

              'Oil temperature': oilTemp ?? undefined,
              'Temperature': temp ?? undefined,

              'Alternator Potential':
                altVolt == null ? undefined : round2(altVolt),

              'Fuel Rate':
                fuelRate > 0
                  ? round1(fuelRate * 3600 * 1000)
                  : undefined,

              'Total Engine hours':
                runTime == null ? undefined : secondsToDuration(runTime),

              'Discrete Status 1': [],
              'Discrete Status 2': [],

              'Engine Load':
                engLoad == null ? undefined : roundInt(engLoad * 100),

              'Engine Torque':
                engTorque == null ? undefined : roundInt(engTorque * 100)
            })
          }, DYNAMIC_INTERVAL_MS)
        })

        // no event-driven conversions needed
        return []
      }
    }
  ]
}
