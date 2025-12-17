const _ = require('lodash')

module.exports = (app, plugin) => {

  const batteryKeys = [
    'voltage',
    'current',
    'temperature',
    'capacity.stateOfCharge',
    'capacity.timeRemaining',
    'capacity.stateOfHealth',
    'ripple'
  ]

function round1(value) {
  return Math.round(value * 10) / 10
}

function round2(value) {
  return Math.round(value * 100) / 100
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}  
  
function roundInt(value) {
  return Math.round(value)
}

function secondsToDuration(sec) {
  if (sec == null) return undefined
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  return `PT${h}H${m}M${s}S`
}
  
  return {
    title: 'Battery (127506 & 127508)',
    optionKey: 'BATTERYv2',
    context: 'vessels.self',
    properties: {
      batteries: {
        title: 'Battery Mapping',
        type: 'array',
        items: {
          type: 'object',
          properties: {
            signalkId: {
              title: 'Signal K battery id',
              type: 'string'
            },
            instanceId: {
              title: 'NMEA2000 Battery Instance Id',
              type: 'number'
            }
          }
        }
      }
    },

    testOptions: {
      BATTERYv2: {
        batteries: [
          {
            signalkId: 0,
            instanceId: 1
          }
        ]
      }
    },

    conversions: (options) => {
      if ( !_.get(options, 'BATTERYv2.batteries') ) {
        return null
      }
      return options.BATTERYv2.batteries.map(battery => {
        return {
          keys: batteryKeys.map(key => `electrical.batteries.${battery.signalkId}.${key}`),
          timeouts: batteryKeys.map(key => 60000),
          callback: (voltage, current, temperature, stateOfCharge, timeRemaining, stateOfHealth, ripple, ampHours) => {
            var res = []
            if ( voltage != null
                 || current != null
                 || temperature != null ) {
              res.push({
                pgn: 127508,
                "Battery Instance": battery.instanceId,
//                "Instance": battery.instanceId
                Voltage: round2(voltage),
                Current: round1(current),
                Temperature: round2(temperature)
              })
            }
            
            if ( stateOfCharge != null
                 || timeRemaining != null
                 || stateOfHealth != null
                 || ripple != null ) {
              stateOfCharge = _.isUndefined(stateOfCharge) || stateOfCharge == null ? undefined : roundInt(stateOfCharge)*100
              stateOfHealth = _.isUndefined(stateOfHealth) || stateOfHealth == null ? undefined : roundInt(stateOfHealth)*100
              
              res.push({
                pgn: 127506,
                "DC Instance": battery.instanceId,
                "DC Type": "Battery",
//                "Instance": battery.instanceId
                'State of Charge': roundInt(stateOfCharge),
                'State of Health': roundInt(stateOfHealth),
                'Time Remaining': secondsToDuration(timeRemaining),
                'Ripple Voltage': round3(ripple),
                'Amp Hours': roundInt(ampHours)
              })
            }
            return res
          },
          tests: [{
            input: [12.5, 23.1, 290.15, 0.93, 12340, 0.6, 12.0],
            expected: [{
              "prio": 2,
              "pgn": 127508,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "Voltage": 12.53,
                "Current": 23.16,
                "Temperature": 290.15
              }
            },{
              "prio": 2,
              "pgn": 127506,
              "dst": 255,
              "fields": {
                "Instance": 1,
                "DC Type": "Battery",
                "State of Charge": 93,
                "State of Health": 60,
                "Time Remaining": "03:26:00",
                "Ripple Voltage": 0.235,
                "Amp Hours": 243
              }
            }]
          }]
        }
      })
    }
  }
}


