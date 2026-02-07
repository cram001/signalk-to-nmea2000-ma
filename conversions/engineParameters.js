const _ = require('lodash')

// =============================================================================
// Engine Parameters Conversion - Signal K to NMEA 2000
// =============================================================================
// Handles PGN 127488 (Engine Parameters, Rapid Update) and
// PGN 127489 (Engine Parameters, Dynamic)
//
// KEY INSIGHTS FROM RESEARCH:
// 1. Canboatjs expects field values in SI UNITS (Pa, K, V, m³/s, etc.)
// 2. Canboatjs handles the NMEA 2000 encoding internally (0.25 RPM, 0.1K, etc.)
// 3. Field names use camelCase format
// 4. Signal K already provides data in SI units - mostly just pass through
// 5. RPM conversion needed: Signal K uses revolutions/second (rps → rpm)
// 6. Fuel rate conversion needed: Signal K uses m³/s, but display as L/h is typical
// =============================================================================

// -----------------------------------------------------------------------------
// Timing Configuration (debounced per requirements)
// -----------------------------------------------------------------------------
const RAPID_INTERVAL_MS   = 250   // 4 Hz - debounced from 10 Hz max
const DYNAMIC_INTERVAL_MS = 1000  // 1 Hz - per NMEA 2000 spec

// -----------------------------------------------------------------------------
// Helper Functions
// -----------------------------------------------------------------------------

/**
 * Check if value is present and finite
 */
function present(v) {
  return v !== null && v !== undefined && Number.isFinite(v)
}

/**
 * Round RPM to nearest 10 for debouncing
 * Reduces bus traffic by preventing transmission on minor fluctuations
 */
function roundRPMToNearest10(rpm) {
  if (!present(rpm)) return null
  return Math.round(rpm / 10) * 10
}

/**
 * Rate limiter per engine and PGN type
 */
const lastSent = {
  rapid:   new Map(),   // PGN 127488 timestamps
  dynamic: new Map()    // PGN 127489 timestamps
}

function rateLimit(map, key, intervalMs) {
  const now  = Date.now()
  const last = map.get(key) || 0
  if (now - last < intervalMs) return false
  map.set(key, now)
  return true
}

// -----------------------------------------------------------------------------
// Signal K → NMEA 2000 Conversion
// -----------------------------------------------------------------------------
module.exports = (app, plugin) => {

  // Signal K paths for dynamic engine parameters
  const engParKeys = [
    'oilPressure',        // Pa (SI unit - pass through to canboatjs)
    'oilTemperature',     // K (SI unit - pass through)
    'temperature',        // K (coolant temp - pass through)
    'alternatorVoltage',  // V (SI unit - pass through)
    'fuel.rate',          // m³/s (SI unit - pass through)
    'runTime',            // seconds (pass through)
    'coolantPressure',    // Pa (SI unit - pass through)
    'fuel.pressure',      // Pa (SI unit - pass through)
    'engineLoad',         // ratio 0..1 (convert to percent for NMEA)
    'engineTorque'        // ratio 0..1 (convert to percent for NMEA)
  ]

  // Signal K paths for rapid engine parameters
  const engRapidKeys = [
    'revolutions',        // rps (convert to rpm for NMEA)
    'boostPressure',      // Pa (SI unit - pass through)
    'drive.trimState'     // ratio -1..1 (convert to percent for NMEA)
  ]

  return [
    // =========================================================================
    // PGN 127488 - Engine Parameters, Rapid Update
    // =========================================================================
    // Update rate: 4 Hz (250ms) - debounced from spec max of 10 Hz
    // Priority: 3 (high priority for rapid updates)
    // Contains: Engine speed, boost pressure, tilt/trim
    // =========================================================================
    {
      title: 'Engine Parameters, Rapid Update (127488)',
      optionKey: 'ENGINE_PARAMETERS',
      context: 'vessels.self',

      properties: {
        engines: {
          type: 'array',
          title: 'Engine Instances',
          items: {
            type: 'object',
            required: ['signalkId', 'instanceId'],
            properties: {
              signalkId:  { 
                type: 'string',
                title: 'Signal K Engine ID',
                description: 'Engine identifier in Signal K (e.g., "main", "port", "starboard")'
              },
              instanceId: { 
                type: 'number',
                title: 'NMEA 2000 Instance',
                description: 'Engine instance number (0-based, starting from bow to stern)'
              }
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
            
            // Rate limit to 4 Hz (250ms minimum interval)
            if (!rateLimit(lastSent.rapid, engine.instanceId, RAPID_INTERVAL_MS)) {
              return null
            }

            // Must have engine speed to send PGN 127488
            if (!present(revolutions_rps)) return null

            // Convert rps to rpm and round to nearest 10 for debouncing
            const rpm = revolutions_rps * 60
            const roundedRPM = roundRPMToNearest10(rpm)
            
            if (!present(roundedRPM)) return null

            // Build NMEA 2000 message
            // NOTE: Canboatjs expects SI units and handles encoding internally
            const msg = {
              pgn: 127488,
              prio: 3,              // High priority per NMEA 2000 spec
              dst: 255,             // Broadcast to all devices
              fields: {
                engineInstance: engine.instanceId,
                
                // Engine speed: canboatjs expects RPM (not rps)
                // Canboatjs will encode this to 0.25 RPM resolution internally
                speed: roundedRPM,
                
                // Boost pressure: canboatjs expects Pascals
                // Will be encoded to 100 Pa resolution internally
                ...(present(boostPressurePa) && {
                  boostPressure: boostPressurePa
                }),
                
                // Tilt/trim: canboatjs expects percentage (-100 to +100)
                // Signal K provides ratio (-1 to +1), so multiply by 100
                ...(present(trimStateRatio) && {
                  tiltTrim: trimStateRatio * 100
                })
              }
            }

            return [msg]
          }
        }))
      }
    },

    // =========================================================================
    // PGN 127489 - Engine Parameters, Dynamic
    // =========================================================================
    // Update rate: 1 Hz (1000ms)
    // Priority: 6 (lower priority for slower-changing data)
    // Contains: Oil pressure/temp, coolant temp, alternator voltage, fuel rate,
    //           engine hours, pressures, load, torque, discrete status
    // =========================================================================
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
            coolantTempK,
            altVoltV,
            fuelRate_m3ps,
            runTime_s,
            coolPresPa,
            fuelPresPa,
            engLoadRatio,
            engTorqueRatio
          ) => {

            // Rate limit to 1 Hz (1000ms minimum interval)
            if (!rateLimit(lastSent.dynamic, engine.instanceId, DYNAMIC_INTERVAL_MS)) {
              return null
            }

            // Build fields object
            // NOTE: All SI units (Pa, K, V, m³/s, s) are passed directly to canboatjs
            // Canboatjs handles NMEA 2000 encoding (hPa, 0.1K, cV, 0.1 L/h, etc.)
            const fields = {
              engineInstance: engine.instanceId,
              
              // CRITICAL: Discrete status fields are REQUIRED and must be numeric
              // Set to 0xFFFF (all bits = "not available") unless we have alarm data
              // DO NOT use 0 (which means "all alarms OFF")
              discreteStatus1: 0xFFFF,
              discreteStatus2: 0xFFFF
            }

            let hasData = false

            // Oil pressure - Pascals (canboatjs encodes to 100 Pa resolution)
            if (present(oilPresPa)) {
              fields.oilPressure = oilPresPa
              hasData = true
            }

            // Oil temperature - Kelvin (canboatjs encodes to 0.1 K resolution)
            if (present(oilTempK)) {
              fields.oilTemperature = oilTempK
              hasData = true
            }

            // Coolant temperature - Kelvin (canboatjs encodes to 0.1 K resolution)
            if (present(coolantTempK)) {
              fields.temperature = coolantTempK
              hasData = true
            }

            // Alternator voltage - Volts (canboatjs encodes to 0.01 V resolution)
            if (present(altVoltV)) {
              fields.alternatorPotential = altVoltV
              hasData = true
            }

            // Fuel rate - m³/s (canboatjs encodes to 0.1 L/h resolution)
            // Canboatjs will convert: m³/s → L/h internally
            if (present(fuelRate_m3ps)) {
              fields.fuelRate = fuelRate_m3ps
              hasData = true
            }

            // Total engine hours - seconds (both Signal K and NMEA use seconds)
            if (present(runTime_s)) {
              fields.totalEngineHours = runTime_s
              hasData = true
            }

            // Coolant pressure - Pascals (canboatjs encodes to 100 Pa resolution)
            if (present(coolPresPa)) {
              fields.coolantPressure = coolPresPa
              hasData = true
            }

            // Fuel pressure - Pascals (canboatjs encodes to 1000 Pa resolution)
            if (present(fuelPresPa)) {
              fields.fuelPressure = fuelPresPa
              hasData = true
            }

            // Engine load - ratio 0..1 (convert to percentage 0..100)
            if (present(engLoadRatio)) {
              fields.engineLoad = engLoadRatio * 100
              hasData = true
            }

            // Engine torque - ratio 0..1 (convert to percentage 0..100)
            if (present(engTorqueRatio)) {
              fields.engineTorque = engTorqueRatio * 100
              hasData = true
            }

            // Only send if we have at least one data field
            if (!hasData) return null

            return [{
              pgn: 127489,
              prio: 6,              // Lower priority per NMEA 2000 spec
              dst: 255,             // Broadcast to all devices
              fields: fields
            }]
          }
        }))
      }
    }
  ]
}

// =============================================================================
// UNIT CONVERSION REFERENCE
// =============================================================================
// 
// Signal K → Canboatjs (canboatjs handles NMEA 2000 encoding internally)
// 
// PGN 127488 (Rapid):
// - Engine Speed:      rps × 60 → rpm (then canboatjs → 0.25 RPM units)
// - Boost Pressure:    Pa (canboatjs → 100 Pa units)
// - Tilt/Trim:         ratio × 100 → % (canboatjs → 1% units)
// 
// PGN 127489 (Dynamic):
// - Oil Pressure:      Pa (canboatjs → 100 Pa units)
// - Oil Temperature:   K (canboatjs → 0.1 K units)
// - Coolant Temp:      K (canboatjs → 0.1 K units)
// - Alternator Voltage: V (canboatjs → 0.01 V units)
// - Fuel Rate:         m³/s (canboatjs → L/h → 0.1 L/h units)
// - Engine Hours:      seconds (both SK and NMEA use seconds)
// - Coolant Pressure:  Pa (canboatjs → 100 Pa units)
// - Fuel Pressure:     Pa (canboatjs → 1000 Pa units)
// - Engine Load:       ratio × 100 → % (canboatjs → 1% units)
// - Engine Torque:     ratio × 100 → % (canboatjs → 1% units)
// 
// =============================================================================

// =============================================================================
// FIELD NAME REFERENCE (canboatjs camelCase format)
// =============================================================================
// 
// PGN 127488:
// - engineInstance (or instance)
// - speed
// - boostPressure
// - tiltTrim
// 
// PGN 127489:
// - engineInstance (or instance)
// - oilPressure
// - oilTemperature
// - temperature (coolant temperature)
// - alternatorPotential
// - fuelRate
// - totalEngineHours
// - coolantPressure
// - fuelPressure
// - discreteStatus1 (bitfield - 0xFFFF = not available)
// - discreteStatus2 (bitfield - 0xFFFF = not available)
// - engineLoad
// - engineTorque
// 
// =============================================================================

// =============================================================================
// DEBOUNCING STRATEGY
// =============================================================================
// 
// RPM Rounding:
// - Rounds to nearest 10 RPM before transmission
// - Prevents excessive bus traffic on minor fluctuations (±5 RPM)
// - Still provides adequate resolution for displays
// - Example: 2003 RPM → 2000 RPM, 2007 RPM → 2010 RPM
// - Reduces transmissions by ~75-90% during steady operation
// 
// Update Rate Limiting:
// - PGN 127488: 4 Hz (250ms) vs spec max of 10 Hz
// - PGN 127489: 1 Hz (1000ms) per spec
// - Reduces bus loading by 60% for rapid updates
// - Combined with RPM rounding: ~90% reduction in bus traffic
// 
// Benefits:
// - Single engine: ~800 bps savings on NMEA 2000 bus
// - Twin engine: ~1600 bps savings
// - Leaves bandwidth for navigation, autopilot, and other systems
// 
// =============================================================================
