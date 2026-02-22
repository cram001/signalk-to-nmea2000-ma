const _ = require('lodash')

// =============================================================================
// Engine Parameters Conversion (127488 + 127489)
// useCamelCompat: false compatible
// =============================================================================


function extractValue(v) {
  if (v == null) return undefined
  if (typeof v === 'object' && v.value != null) return v.value
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return undefined
}

function present(v) {
  return v !== undefined && v !== null && Number.isFinite(v)
}

function roundRPMToNearest10(rpm) {
  return Math.round(rpm / 10) * 10
}

// Returns true if a Signal K alarm/notification value indicates active alarm
function isAlarmActive(v) {
  if (v == null) return false
  const val = (typeof v === 'object' && v.value != null) ? v.value : v
  // SK alarm states: 'alarm', 'warn', 'alert' = active; 'normal' / null = inactive
  return val === 'alarm' || val === 'warn' || val === 'alert' || val === true || val === 1
}

// Build a 16-bit bitmask from an array of boolean values (index 0 = bit 0)
function buildBitmask(bits) {
  let mask = 0
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) mask |= (1 << i)
  }
  return mask
}

module.exports = (app, plugin) => {

  return {
    title: 'Engine Parameters (127488 + 127489)',
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
            instanceId: { type: 'number' },
            engineTempPath: {
              type: 'string',
              title: 'Signal K FULL path for Engine Temperature (Kelvin)'
            }
          }
        }
      }
    },

    conversions: (options) => {

      if (!_.get(options, 'ENGINE_PARAMETERS.engines')) {
        return null
      }

      return options.ENGINE_PARAMETERS.engines.map(engine => {

        const base = `propulsion.${engine.signalkId}`
        const tempKey = engine.engineTempPath || null

        let last = {
          rpm: undefined,
          boostPressure: undefined,
          trim: undefined,

          oilPressure: undefined,
          oilTemp: undefined,
          coolantTemp: undefined,
          altVolt: undefined,
          fuelRate: undefined,
          runTime: undefined,
          coolantPressure: undefined,
          fuelPressure: undefined,
          engineLoad: undefined,
          engineTorque: undefined,

          // Discrete Status 1 alarm states (raw SK values, cached individually)
          alm_checkEngine:           undefined,
          alm_overTemperature:       undefined,
          alm_lowOilPressure:        undefined,
          alm_lowOilLevel:           undefined,
          alm_lowFuelPressure:       undefined,
          alm_lowSystemVoltage:      undefined,
          alm_lowCoolantLevel:       undefined,
          alm_waterFlow:             undefined,
          alm_waterInFuel:           undefined,
          alm_chargeIndicator:       undefined,
          alm_preheatIndicator:      undefined,
          alm_highBoostPressure:     undefined,
          alm_revLimitExceeded:      undefined,
          alm_egrSystem:             undefined,
          alm_throttlePosSensor:     undefined,
          alm_emergencyStop:         undefined,

          // Discrete Status 2 alarm states
          alm_warningLevel1:         undefined,
          alm_warningLevel2:         undefined,
          alm_powerReduction:        undefined,
          alm_maintenanceNeeded:     undefined,
          alm_engineCommError:       undefined,
          alm_subThrottle:           undefined,
          alm_neutralStartProtect:   undefined,
          alm_engineShuttingDown:    undefined,
        }

        // ── Alarm SK paths ──────────────────────────────────────────────────
        // Signal K stores engine alarms under propulsion.<id>.alarms.<name>.value
        // A value of 'alarm'/'warn'/'alert' means the alarm is active.
        const alarmPaths = {
          // Status 1
          alm_checkEngine:        `${base}.alarms.checkEngine.value`,
          alm_overTemperature:    `${base}.alarms.overTemperature.value`,
          alm_lowOilPressure:     `${base}.alarms.lowOilPressure.value`,
          alm_lowOilLevel:        `${base}.alarms.lowOilLevel.value`,
          alm_lowFuelPressure:    `${base}.alarms.lowFuelPressure.value`,
          alm_lowSystemVoltage:   `${base}.alarms.lowSystemVoltage.value`,
          alm_lowCoolantLevel:    `${base}.alarms.lowCoolantLevel.value`,
          alm_waterFlow:          `${base}.alarms.waterFlow.value`,
          alm_waterInFuel:        `${base}.alarms.waterInFuel.value`,
          alm_chargeIndicator:    `${base}.alarms.chargeIndicator.value`,
          alm_preheatIndicator:   `${base}.alarms.preheatIndicator.value`,
          alm_highBoostPressure:  `${base}.alarms.highBoostPressure.value`,
          alm_revLimitExceeded:   `${base}.alarms.revLimitExceeded.value`,
          alm_egrSystem:          `${base}.alarms.egrSystem.value`,
          alm_throttlePosSensor:  `${base}.alarms.throttlePositionSensor.value`,
          alm_emergencyStop:      `${base}.alarms.emergencyStop.value`,
          // Status 2
          alm_warningLevel1:      `${base}.alarms.warningLevel1.value`,
          alm_warningLevel2:      `${base}.alarms.warningLevel2.value`,
          alm_powerReduction:     `${base}.alarms.powerReduction.value`,
          alm_maintenanceNeeded:  `${base}.alarms.maintenanceNeeded.value`,
          alm_engineCommError:    `${base}.alarms.engineCommError.value`,
          alm_subThrottle:        `${base}.alarms.subThrottle.value`,
          alm_neutralStartProtect:`${base}.alarms.neutralStartProtect.value`,
          alm_engineShuttingDown: `${base}.alarms.engineShuttingDown.value`,
        }

        const alarmKeys   = Object.keys(alarmPaths)
        const alarmValues = alarmKeys.map(k => alarmPaths[k])

        const keys = [
          `${base}.revolutions`,
          `${base}.boostPressure`,
          `${base}.drive.trimState`,
          `${base}.oilPressure`,
          `${base}.oilTemperature`,
          `${base}.alternatorVoltage`,
          `${base}.fuel.rate`,
          `${base}.runTime`,
          `${base}.coolantPressure`,
          `${base}.fuel.pressure`,
          `${base}.engineLoad`,
          `${base}.engineTorque`,
          tempKey,
          ...alarmValues          // alarm paths appended after numeric fields
        ].filter(Boolean)

        // Number of numeric fields before the alarm block
        const NUM_FIELDS = 12 + (tempKey ? 1 : 0)

        return {
          keys,
          timeouts: new Array(keys.length).fill(10000),

          callback: (...values) => {

            let i = 0

            // ── Numeric fields ──────────────────────────────────────────────
            const rps         = extractValue(values[i++])
            const boostPa     = extractValue(values[i++])
            const trimRatio   = extractValue(values[i++])
            const oilPa       = extractValue(values[i++])
            const oilTempK    = extractValue(values[i++])
            const altVolt     = extractValue(values[i++])
            const fuelM3ps    = extractValue(values[i++])
            const runTime     = extractValue(values[i++])
            const coolPa      = extractValue(values[i++])
            const fuelPa      = extractValue(values[i++])
            const loadRatio   = extractValue(values[i++])
            const torqueRatio = extractValue(values[i++])
            const engineTempK = tempKey ? extractValue(values[i++]) : undefined

            // ── Alarm fields ────────────────────────────────────────────────
            // values[i..] correspond 1:1 with alarmKeys order
            for (let j = 0; j < alarmKeys.length; j++) {
              last[alarmKeys[j]] = values[i + j]  // store raw SK value (object or scalar)
            }

            // ── Numeric cache updates ────────────────────────────────────────
            if (present(rps))
              last.rpm = roundRPMToNearest10(rps * 60)

            if (present(boostPa))
              last.boostPressure = boostPa

            if (present(trimRatio))
              last.trim = trimRatio * 100

            if (present(oilPa))
              last.oilPressure = oilPa

            if (present(oilTempK))
              last.oilTemp = oilTempK

            if (present(engineTempK))
              last.coolantTemp = engineTempK

            if (present(altVolt))
              last.altVolt = altVolt

            if (present(fuelM3ps))
              last.fuelRate = Math.round(fuelM3ps * 3600 * 1000 * 10) / 10

            if (present(runTime))
              last.runTime = runTime

            if (present(coolPa))
              last.coolantPressure = coolPa

            if (present(fuelPa))
              last.fuelPressure = fuelPa

            if (present(loadRatio))
              last.engineLoad = Math.round(loadRatio * 100)

            if (present(torqueRatio))
              last.engineTorque = Math.round(torqueRatio * 100)

            // ── Build Discrete Status bitmasks ───────────────────────────────
            //
            // Status 1 (tN2kDD206):
            //   bit 0  Check Engine
            //   bit 1  Over Temperature
            //   bit 2  Low Oil Pressure
            //   bit 3  Low Oil Level
            //   bit 4  Low Fuel Pressure
            //   bit 5  Low System Voltage
            //   bit 6  Low Coolant Level
            //   bit 7  Water Flow
            //   bit 8  Water In Fuel
            //   bit 9  Charge Indicator
            //   bit 10 Preheat Indicator
            //   bit 11 High Boost Pressure
            //   bit 12 Rev Limit Exceeded
            //   bit 13 EGR System
            //   bit 14 Throttle Position Sensor
            //   bit 15 Emergency Stop Mode
            //
            const status1 = buildBitmask([
              isAlarmActive(last.alm_checkEngine),
              isAlarmActive(last.alm_overTemperature),
              isAlarmActive(last.alm_lowOilPressure),
              isAlarmActive(last.alm_lowOilLevel),
              isAlarmActive(last.alm_lowFuelPressure),
              isAlarmActive(last.alm_lowSystemVoltage),
              isAlarmActive(last.alm_lowCoolantLevel),
              isAlarmActive(last.alm_waterFlow),
              isAlarmActive(last.alm_waterInFuel),
              isAlarmActive(last.alm_chargeIndicator),
              isAlarmActive(last.alm_preheatIndicator),
              isAlarmActive(last.alm_highBoostPressure),
              isAlarmActive(last.alm_revLimitExceeded),
              isAlarmActive(last.alm_egrSystem),
              isAlarmActive(last.alm_throttlePosSensor),
              isAlarmActive(last.alm_emergencyStop),
            ])

            //
            // Status 2 (tN2kDD223):
            //   bit 0  Warning Level 1
            //   bit 1  Warning Level 2
            //   bit 2  Power Reduction
            //   bit 3  Maintenance Needed
            //   bit 4  Engine Comm Error
            //   bit 5  Sub or Secondary Throttle
            //   bit 6  Neutral Start Protect
            //   bit 7  Engine Shutting Down
            //   bits 8–15 manufacturer-defined (sent as 0)
            //
            const status2 = buildBitmask([
              isAlarmActive(last.alm_warningLevel1),
              isAlarmActive(last.alm_warningLevel2),
              isAlarmActive(last.alm_powerReduction),
              isAlarmActive(last.alm_maintenanceNeeded),
              isAlarmActive(last.alm_engineCommError),
              isAlarmActive(last.alm_subThrottle),
              isAlarmActive(last.alm_neutralStartProtect),
              isAlarmActive(last.alm_engineShuttingDown),
            ])

            const result = []

            // ================================================================
            // PGN 127488 - Rapid Update
            // ================================================================

            if (present(last.rpm)) {

              const rapid = {
                pgn: 127488,
                "Engine Instance": engine.instanceId,
                "Instance": engine.instanceId,
                "Speed": last.rpm
              }

              if (present(last.boostPressure))
                rapid["Boost Pressure"] = last.boostPressure

              if (present(last.trim))
                rapid["Tilt/Trim"] = last.trim

              result.push(rapid)
            }

            // ================================================================
            // PGN 127489 - Dynamic
            // ================================================================

            const dynamic = {
              pgn: 127489,
              "Engine Instance": engine.instanceId,
              "Instance": engine.instanceId,
              // Always include discrete status fields as integer bitmasks.
              // A value of 0 means all clear. canboatjs encodes these as
              // 16-bit fields; 0xFFFF would mean "not available".
              "Discrete Status 1": status1,
              "Discrete Status 2": status2,
            }

            let hasData = false

            if (present(last.oilPressure)) {
              dynamic["Oil pressure"] = last.oilPressure
              hasData = true
            }

            if (present(last.oilTemp)) {
              dynamic["Oil temperature"] = last.oilTemp
              hasData = true
            }

            if (present(last.coolantTemp)) {
              dynamic["Temperature"] = last.coolantTemp
              hasData = true
            }

            if (present(last.altVolt)) {
              dynamic["Alternator Potential"] = last.altVolt
              hasData = true
            }

            if (present(last.fuelRate)) {
              dynamic["Fuel Rate"] = last.fuelRate
              hasData = true
            }

            if (present(last.runTime)) {
              dynamic["Total Engine hours"] = last.runTime
              hasData = true
            }

            if (present(last.coolantPressure)) {
              dynamic["Coolant Pressure"] = last.coolantPressure
              hasData = true
            }

            if (present(last.fuelPressure)) {
              dynamic["Fuel Pressure"] = last.fuelPressure
              hasData = true
            }

            if (present(last.engineLoad)) {
              dynamic["Engine Load"] = last.engineLoad
              hasData = true
            }

            if (present(last.engineTorque)) {
              dynamic["Engine Torque"] = last.engineTorque
              hasData = true
            }

            // Always emit 127489 when we have discrete status data, even if
            // all numeric fields are absent — a status change matters.
            if (hasData || status1 !== 0 || status2 !== 0)
              result.push(dynamic)

            return result
          }
        }
      })
    }
  }
}

// =============================================================================
// UNIT CONVERSION REFERENCE
// =============================================================================
//
// Signal K → Canboatjs (canboatjs handles NMEA 2000 encoding internally)
//
// PGN 127488 (Rapid):
// - Engine Speed: rps × 60 → rpm (then canboatjs → 0.25 RPM units)
// - Boost Pressure: Pa (canboatjs → 100 Pa units)
// - Tilt/Trim: ratio × 100 → % (canboatjs → 1% units)
//
// PGN 127489 (Dynamic):
// - Oil Pressure: Pa (canboatjs → 100 Pa units)
// - Oil Temperature: K (canboatjs → 0.1 K units)
// - Coolant Temp: K (canboatjs → 0.1 K units)
// - Alternator Voltage: V (canboatjs → 0.01 V units)
// - Fuel Rate: m³/s × 3,600,000 → L/h (canboatjs → 0.1 L/h units)
// - Engine Hours: seconds (both SK and NMEA use seconds)
// - Coolant Pressure: Pa (canboatjs → 100 Pa units)
// - Fuel Pressure: Pa (canboatjs → 1000 Pa units)
// - Engine Load: ratio × 100 → % (canboatjs → 1% units)
// - Engine Torque: ratio × 100 → % (canboatjs → 1% units)
// - Discrete Status 1/2: integer bitmask (canboatjs → 16-bit field)
//   0x0000 = all clear, 0xFFFF = not available
//
// =============================================================================
// DISCRETE STATUS BIT REFERENCE
// =============================================================================
//
// Status 1 (tN2kDD206) — Signal K path: propulsion.<id>.alarms.<name>.value
//   bit 0  checkEngine              propulsion.<id>.alarms.checkEngine.value
//   bit 1  overTemperature          propulsion.<id>.alarms.overTemperature.value
//   bit 2  lowOilPressure           propulsion.<id>.alarms.lowOilPressure.value
//   bit 3  lowOilLevel              propulsion.<id>.alarms.lowOilLevel.value
//   bit 4  lowFuelPressure          propulsion.<id>.alarms.lowFuelPressure.value
//   bit 5  lowSystemVoltage         propulsion.<id>.alarms.lowSystemVoltage.value
//   bit 6  lowCoolantLevel          propulsion.<id>.alarms.lowCoolantLevel.value
//   bit 7  waterFlow                propulsion.<id>.alarms.waterFlow.value
//   bit 8  waterInFuel              propulsion.<id>.alarms.waterInFuel.value
//   bit 9  chargeIndicator          propulsion.<id>.alarms.chargeIndicator.value
//   bit 10 preheatIndicator         propulsion.<id>.alarms.preheatIndicator.value
//   bit 11 highBoostPressure        propulsion.<id>.alarms.highBoostPressure.value
//   bit 12 revLimitExceeded         propulsion.<id>.alarms.revLimitExceeded.value
//   bit 13 egrSystem                propulsion.<id>.alarms.egrSystem.value
//   bit 14 throttlePositionSensor   propulsion.<id>.alarms.throttlePositionSensor.value
//   bit 15 emergencyStop            propulsion.<id>.alarms.emergencyStop.value
//
// Status 2 (tN2kDD223)
//   bit 0  warningLevel1            propulsion.<id>.alarms.warningLevel1.value
//   bit 1  warningLevel2            propulsion.<id>.alarms.warningLevel2.value
//   bit 2  powerReduction           propulsion.<id>.alarms.powerReduction.value
//   bit 3  maintenanceNeeded        propulsion.<id>.alarms.maintenanceNeeded.value
//   bit 4  engineCommError          propulsion.<id>.alarms.engineCommError.value
//   bit 5  subThrottle              propulsion.<id>.alarms.subThrottle.value
//   bit 6  neutralStartProtect      propulsion.<id>.alarms.neutralStartProtect.value
//   bit 7  engineShuttingDown       propulsion.<id>.alarms.engineShuttingDown.value
//   bits 8–15  manufacturer-defined (always transmitted as 0)
//
// Active alarm state detection:
//   SK value 'alarm', 'warn', or 'alert' → bit = 1
//   SK value 'normal', null, undefined   → bit = 0
//
// =============================================================================
// RPM Rounding / Update Rate / Bus Loading notes unchanged from original
// =============================================================================
