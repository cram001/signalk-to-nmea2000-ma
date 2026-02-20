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
              title: 'Signal K path for Engine Temperature (Kelvin)'
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
          engineTorque: undefined
        }

        const keys = [
          `${base}.revolutions`,
          `${base}.boostPressure`,
          `${base}.drive.trimState`,
          `${base}.oilPressure`,            // unchanged per your instruction
          `${base}.oilTemperature`,
          `${base}.alternatorVoltage`,
          `${base}.fuel.rate`,
          `${base}.runTime`,
          `${base}.coolantPressure`,
          `${base}.fuel.pressure`,
          `${base}.engineLoad`,
          `${base}.engineTorque`,
          tempKey
        ].filter(Boolean)

        return {
          keys,
          timeouts: new Array(keys.length).fill(10000),

          callback: (...values) => {

            let i = 0

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

            // ---------------- Cache Updates ----------------

            if (present(rps))
              last.rpm = roundRPMToNearest10(rps * 60)

            if (present(boostPa))
              last.boostPressure = boostPa / 100

            if (present(trimRatio))
              last.trim = trimRatio * 100

            if (present(oilPa))
              last.oilPressure = oilPa / 100

            if (present(oilTempK))
              last.oilTemp = oilTempK

            if (present(engineTempK))
              last.coolantTemp = engineTempK

            if (present(altVolt))
              last.altVolt = altVolt

            if (present(fuelM3ps))
              last.fuelRate = fuelM3ps * 3600 * 1000

            if (present(runTime))
              last.runTime = runTime

            if (present(coolPa))
              last.coolantPressure = coolPa / 100

            if (present(fuelPa))
              last.fuelPressure = fuelPa / 100

            if (present(loadRatio))
              last.engineLoad = loadRatio * 100

            if (present(torqueRatio))
              last.engineTorque = torqueRatio * 100

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
              "Discrete Status 1": [],
              "Discrete Status 2": []
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

            if (hasData)
              result.push(dynamic)

            return result
          }
        }
      })
    }
  }
}
