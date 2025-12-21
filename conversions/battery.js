const _ = require('lodash')

// ----------------- rounding helpers -----------------

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

// ===================================================

module.exports = (app, plugin) => {

  const batteryKeys = [
    'voltage',
    'current',
    'temperature',
    'capacity.stateOfCharge',
    'capacity.timeRemaining',
    'capacity.stateOfHealth',
    'ripple',
    'ampHours'
  ]

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
      if (!_.get(options, 'BATTERYv2.batteries')) {
        return null
      }

      return options.BATTERYv2.batteries.map(battery => {

        return {
          keys: batteryKeys.map(
            k => `electrical.batteries.${battery.signalkId}.${k}`
          ),

          timeouts: batteryKeys.map(() => 60000),

          callback: (
            voltage,
            current,
            temperature,
            soc,
            timeRemaining,
            soh,
            ripple,
            ampHours
          ) => {

            const out = []

            // ------------------------------------------------
            // PGN 127508 — Battery Status
            // ------------------------------------------------
            if (
              voltage != null ||
              current != null ||
              temperature != null
            ) {
              out.push({
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
              out.push({
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

            return out
          }
        }
      })
    }
  }
}
