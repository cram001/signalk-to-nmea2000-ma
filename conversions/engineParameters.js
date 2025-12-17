const _ = require('lodash')

const DEFAULT_TIMEOUT = 10000 // ms

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

// ----------------- SK keys -----------------

const engParKeys = [
  'oilPressure',        // Pa
  'oilTemperature',     // K
  'temperature',        // K (coolant)
  'alternatorVoltage',  // V
  'fuel.rate',          // m³/s
  'runTime',            // s
  'coolantPressure',    // Pa
  'fuel.pressure',      // Pa
  'engineLoad',         // 0..1
  'engineTorque'        // 0..1
]

const engRapidKeys = [
  'revolutions',        // rad/s
  'boostPressure',      // Pa
  'drive.trimState'     // 0..1
]

// ============================================================

module.exports = (app, plugin) => {

  return [

    // ----------------------------------------------------------
    // PGN 130312 — Exhaust Temperature
    // ----------------------------------------------------------

    {
      title: 'Temperature, exhaust (130312)',
      optionKey: 'EXHAUST_TEMPERATURE',
      context: 'vessels.self',
      properties: {
        engines: {
          title: 'Engine Mapping',
          type: 'array',
          items: {
            type: 'object',
            properties: {
              signalkId: { type: 'string' },
              tempInstanceId: { type: 'number' }
            }
          }
        }
      },

      conversions: (options) => {
        if (!_.get(options, 'EXHAUST_TEMPERATURE.engines')) return null

        return options.EXHAUST_TEMPERATURE.engines.map(engine => ({
          keys: [
            `propulsion.${engine.signalkId}.exhaustTemperature`
          ],
          callback: (temperature) => {
            if (temperature == null) return []

            return [{
              pgn: 130312,
              'Temperature Instance': engine.tempInstanceId,
              'Source': 'Exhaust Gas Temperature',
              'Actual Temperature': round2(temperature) // K, 0.01
            }]
          }
        }))
      }
    },

    // ----------------------------------------------------------
    // PGN 127489 (Dynamic) + 127488 (Rapid)
    // ----------------------------------------------------------

    {
      title: 'Engine Parameters (127489, 127488)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',
      properties: {
        engines: {
          title: 'Engine Mapping',
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

        const dyn = options.ENGINE_PARAMETERS.engines.map(engine => ({
          keys: engParKeys.map(k => `propulsion.${engine.signalkId}.${k}`),
          timeouts: engParKeys.map(() => DEFAULT_TIMEOUT),

          callback: (
            oilPres,
            oilTemp,
            temp,
            altVolt,
            fuelRate,
            runTime,
            coolPres,
            fuelPres,
            engLoad,
            engTorque
          ) => [{
            pgn: 127489,
            'Engine Instance': engine.instanceId,

            // pressures already in Pa (no scaling)
            'Oil pressure': oilPres ?? undefined,
            'Coolant Pressure': coolPres ?? undefined,
            'Fuel Pressure': fuelPres ?? undefined,

            // temperatures in K
            'Oil temperature': oilTemp ?? undefined,
            'Temperature': temp ?? undefined,

            // volts
            'Alternator Potential': altVolt == null ? undefined : round2(altVolt),

            // m³/s → L/h
            'Fuel Rate':
              fuelRate > 0
                ? round1(fuelRate * 3600 * 1000)
                : undefined,

            // seconds → duration
            'Total Engine hours': secondsToDuration(runTime),

            'Discrete Status 1': [],
            'Discrete Status 2': [],

            // 0..1 → %
            'Engine Load':
              engLoad == null ? undefined : roundInt(engLoad * 100),

            'Engine Torque':
              engTorque == null ? undefined : roundInt(engTorque * 100)
          }]
        }))

        const rapid = options.ENGINE_PARAMETERS.engines.map(engine => ({
          keys: engRapidKeys.map(k => `propulsion.${engine.signalkId}.${k}`),
          timeouts: engRapidKeys.map(() => DEFAULT_TIMEOUT),

          callback: (revolutions, boostPressure, trimState) => [{
            pgn: 127488,
            'Engine Instance': engine.instanceId,

            // rad/s → rpm
            'Speed':
              revolutions == null
                ? undefined
                : roundInt(radPerSecToRPM(revolutions)),

            // Pa → kPa
            'Boost Pressure':
              boostPressure == null
                ? undefined
                : round1(boostPressure / 1000),

            // 0..1 → %
            'Tilt/Trim':
              trimState == null
                ? undefined
                : roundInt(trimState * 100)
          }]
        }))

        return dyn.concat(rapid)
      }
    }
  ]
}
