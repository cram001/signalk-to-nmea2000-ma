const _ = require('lodash')

// -----------------------------------------------------------------------------
// Timing (per NMEA 2000 expectations)
// -----------------------------------------------------------------------------
const RAPID_INTERVAL_MS   = 250   // PGN 127488 ≈ 4 Hz
const DYNAMIC_INTERVAL_MS = 1000  // PGN 127489 ≈ 1 Hz

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function present(v) {
  return v !== null && v !== undefined && Number.isFinite(v)
}

// rate limiter per engine + PGN
const lastSent = {
  rapid:   new Map(),
  dynamic: new Map()
}

function rateLimit(map, key, intervalMs) {
  const now  = Date.now()
  const last = map.get(key) || 0
  if (now - last < intervalMs) return false
  map.set(key, now)
  return true
}

// -----------------------------------------------------------------------------
// Signal K → NMEA2000
// -----------------------------------------------------------------------------
module.exports = (app, plugin) => {

  // Signal K propulsion paths
  const engParKeys = [
    'oilPressure',        // Pa
    'oilTemperature',     // K
    'temperature',        // K
    'alternatorVoltage',  // V
    'fuel.rate',          // m3/s
    'runTime',            // s
    'coolantPressure',    // Pa
    'fuel.pressure',      // Pa
    'engineLoad',         // ratio 0..1
    'engineTorque'        // ratio 0..1
  ]

  const engRapidKeys = [
    'revolutions',        // rps
    'boostPressure',      // Pa
    'drive.trimState'     // ratio
  ]

  return [
    /* ---------------------------------------------------------------------- */
    /* Engine Parameters – Rapid (PGN 127488)                                  */
    /* ---------------------------------------------------------------------- */
    {
      title: 'Engine Parameters, Rapid Update (127488)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',

      properties: {
        engines: {
          type: 'array',
          items: {
            type: 'object',
            required: ['signalkId', 'instanceId'],
            properties: {
              signalkId:  { type: 'string' },
              instanceId: { type: 'number' }
            }
          }
        }
      },

      conversions: (options) => {
        const engines = _.get(options, 'ENGINE_PARAMETERS.engines')
        if (!Array.isArray(engines) || engines.length === 0) return null

        return engines.map(engine => ({
          keys: engRapidKeys.map(k => `propulsion.${engine.signalkId}.${k}`),

          callback: (revolutions_rps, boostPressurePa, trimStateRatio) => {
            if (!rateLimit(lastSent.rapid, engine.instanceId, RAPID_INTERVAL_MS)) {
              return null
            }

            if (!present(revolutions_rps)) return null

            const msg = {
              pgn: 127488,
              instance: engine.instanceId,
              speed: revolutions_rps * 60   // rps → rpm
            }

            if (present(boostPressurePa)) {
              msg.boostPressure = boostPressurePa
            }

            if (present(trimStateRatio)) {
              msg.tiltTrim = trimStateRatio * 100
            }

            return [msg]
          }
        }))
      }
    },

    /* ---------------------------------------------------------------------- */
    /* Engine Parameters – Dynamic (PGN 127489)                                */
    /* ---------------------------------------------------------------------- */
    {
      title: 'Engine Parameters, Dynamic (127489)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',

      conversions: (options) => {
        const engines = _.get(options, 'ENGINE_PARAMETERS.engines')
        if (!Array.isArray(engines) || engines.length === 0) return null

        return engines.map(engine => ({
          keys: engParKeys.map(k => `propulsion.${engine.signalkId}.${k}`),

          callback: (
            oilPresPa,
            oilTempK,
            tempK,
            altVoltV,
            fuelRate_m3ps,
            runTime_s,
            coolPresPa,
            fuelPresPa,
            engLoadRatio,
            engTorqueRatio
          ) => {

            if (!rateLimit(lastSent.dynamic, engine.instanceId, DYNAMIC_INTERVAL_MS)) {
              return null
            }

            const msg = {
              pgn: 127489,
              instance: engine.instanceId,

              // BITLOOKUP fields MUST be numeric bitmasks
              discreteStatus1: 0,
              discreteStatus2: 0
            }

            let hasData = false

            if (present(oilPresPa)) {
              msg.oilPressure = oilPresPa
              hasData = true
            }

            if (present(oilTempK)) {
              msg.oilTemperature = oilTempK
              hasData = true
            }

            if (present(tempK)) {
              msg.temperature = tempK
              hasData = true
            }

            if (present(altVoltV)) {
              msg.alternatorPotential = altVoltV
              hasData = true
            }

            if (present(fuelRate_m3ps)) {
              msg.fuelRate = fuelRate_m3ps * 3600 * 1000 // m3/s → L/h
              hasData = true
            }

            if (present(runTime_s)) {
              msg.totalEngineHours = runTime_s   // seconds (per canboat)
              hasData = true
            }

            if (present(coolPresPa)) {
              msg.coolantPressure = coolPresPa
              hasData = true
            }

            if (present(fuelPresPa)) {
              msg.fuelPressure = fuelPresPa
              hasData = true
            }

            if (present(engLoadRatio)) {
              msg.engineLoad = engLoadRatio * 100
              hasData = true
            }

            if (present(engTorqueRatio)) {
              msg.engineTorque = engTorqueRatio * 100
              hasData = true
            }

            if (!hasData) return null
            return [msg]
          }
        }))
      }
    }
  ]
}
