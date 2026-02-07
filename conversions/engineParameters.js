module.exports = function (app) {
  return {
    title: 'Engine Parameters (127488, 127489)',
    optionKey: 'engineParameters',
    
    // Support both rapid and dynamic updates
    keys: [
      'propulsion.*.revolutions',        // For rapid update
      'propulsion.*.boostPressure',      // For rapid update
      'propulsion.*.oilPressure',        // For dynamic
      'propulsion.*.oilTemperature',     // For dynamic
      'propulsion.*.temperature',        // For dynamic
      'propulsion.*.alternatorVoltage',  // For dynamic
      'propulsion.*.fuelRate',           // For dynamic
      'propulsion.*.runTime',            // For dynamic
      'propulsion.*.coolantPressure',    // For dynamic
      'propulsion.*.fuelPressure',       // For dynamic
      'propulsion.*.engineLoad',         // For dynamic
      'propulsion.*.engineTorque',       // For dynamic
    ],
    
    context: {
      // Track last transmission times to respect update rates
      lastRapidUpdate: {},
      lastDynamicUpdate: {},
      // Cache for building complete messages
      engineData: {}
    },
    
    callback: function (path, value, context) {
      const messages = [];
      
      // Parse engine instance from path
      const pathParts = path.split('.');
      if (pathParts[0] !== 'propulsion' || pathParts.length < 3) {
        return messages;
      }
      
      const engineId = pathParts[1];
      const parameter = pathParts[2];
      const instance = getEngineInstance(engineId);
      
      // Initialize engine data cache
      if (!context.engineData[engineId]) {
        context.engineData[engineId] = {};
      }
      
      // Update cached value
      context.engineData[engineId][parameter] = value;
      const data = context.engineData[engineId];
      
      const now = Date.now();
      
      // Generate PGN 127488 - Engine Parameters, Rapid Update (4 Hz)
      if (parameter === 'revolutions' || parameter === 'boostPressure') {
        const lastUpdate = context.lastRapidUpdate[engineId] || 0;
        
        // Enforce minimum 250ms between rapid updates (4 Hz debouncing)
        if (now - lastUpdate >= 250) {
          const rapidMsg = buildRapidUpdate(instance, data);
          if (rapidMsg) {
            messages.push(rapidMsg);
            context.lastRapidUpdate[engineId] = now;
          }
        }
      }
      
      // Generate PGN 127489 - Engine Parameters, Dynamic (1 Hz)
      const lastDynamicUpdate = context.lastDynamicUpdate[engineId] || 0;
      
      // Enforce minimum 1000ms between dynamic updates
      if (now - lastDynamicUpdate >= 1000) {
        const dynamicMsg = buildDynamicUpdate(instance, data);
        if (dynamicMsg) {
          messages.push(dynamicMsg);
          context.lastDynamicUpdate[engineId] = now;
        }
      }
      
      return messages;
    }
  };
  
  // Helper Functions
  
  function getEngineInstance(engineId) {
    const instanceMap = {
      'main': 0,
      'port': 0,
      'starboard': 1,
      'center': 1,
      '0': 0,
      '1': 1,
      '2': 2,
      '3': 3
    };
    
    const numericInstance = parseInt(engineId);
    if (!isNaN(numericInstance)) {
      return numericInstance;
    }
    
    return instanceMap[engineId.toLowerCase()] || 0;
  }
  
  function roundRPMToNearest10(rpm) {
    if (rpm === null || rpm === undefined || isNaN(rpm)) {
      return null;
    }
    // Round to nearest 10 RPM for debouncing
    return Math.round(rpm / 10) * 10;
  }
  
  function toN2KValue(value, resolution, bits) {
    const nullValues = {
      8: 0xFF,
      16: 0xFFFF,
      32: 0xFFFFFFFF
    };
    
    if (value === null || value === undefined || isNaN(value)) {
      return nullValues[bits];
    }
    
    const converted = Math.round(value / resolution);
    const max = Math.pow(2, bits) - 1;
    
    return Math.max(0, Math.min(max, converted));
  }
  
  function buildRapidUpdate(instance, data) {
    // Must have at least engine speed to send
    if (data.revolutions === undefined || data.revolutions === null) {
      return null;
    }
    
    // Round RPM to nearest 10 for debouncing
    const roundedRPM = roundRPMToNearest10(data.revolutions);
    
    return {
      prio: 3,
      pgn: 127488,
      dst: 255,
      fields: {
        'Engine Instance': instance,
        // Convert rounded RPM to 0.25 RPM resolution units
        'Engine Speed': roundedRPM !== null ? Math.round(roundedRPM * 4) : 0xFFFF,
        'Engine Boost Pressure': toN2KValue(data.boostPressure, 100, 16),
        'Engine Tilt/Trim': toN2KValue(data.tiltTrim, 1, 8)
      }
    };
  }
  
  function buildDynamicUpdate(instance, data) {
    // Should have at least one dynamic parameter to send
    const hasDynamicData = 
      data.oilPressure !== undefined ||
      data.oilTemperature !== undefined ||
      data.temperature !== undefined ||
      data.alternatorVoltage !== undefined;
    
    if (!hasDynamicData) {
      return null;
    }
    
    // Convert fuel rate from m³/s to 0.1 L/h
    let fuelRateN2K = 0xFFFF;
    if (data.fuelRate !== undefined && data.fuelRate !== null) {
      // 1 m³/s = 3,600,000 L/h
      // Resolution is 0.1 L/h, so multiply by 36,000,000
      fuelRateN2K = Math.round(data.fuelRate * 36000000);
    }
    
    return {
      prio: 6,
      pgn: 127489,
      dst: 255,
      fields: {
        'Engine Instance': instance,
        'Oil Pressure': toN2KValue(data.oilPressure, 100, 16),
        'Oil Temperature': toN2KValue(data.oilTemperature, 0.1, 16),
        'Engine Coolant Temperature': toN2KValue(data.temperature, 0.1, 16),
        'Alternator Potential': toN2KValue(data.alternatorVoltage, 0.01, 16),
        'Fuel Rate': fuelRateN2K,
        'Total Engine hours': toN2KValue(data.runTime, 1, 32),
        'Engine Coolant Pressure': toN2KValue(data.coolantPressure, 100, 16),
        'Fuel Pressure': toN2KValue(data.fuelPressure, 1000, 16),
        'Discrete Status 1': buildDiscreteStatus1(data),
        'Discrete Status 2': buildDiscreteStatus2(data),
        'Percent Engine Load': toN2KValue(
          data.engineLoad !== undefined ? data.engineLoad * 100 : undefined,
          1,
          8
        ),
        'Percent Engine Torque': toN2KValue(
          data.engineTorque !== undefined ? data.engineTorque * 100 : undefined,
          1,
          8
        )
      }
    };
  }
  
  function buildDiscreteStatus1(data) {
    // Default all to "not available" (0b11)
    let status = 0xFFFF;
    
    // This would need to be populated from Signal K alarm/notification data
    // For now, return all "not available"
    // TODO: Map from notifications.propulsion.*.* paths
    
    return status;
  }
  
  function buildDiscreteStatus2(data) {
    // Default all to "not available"
    let status = 0xFFFF;
    
    // This would need to be populated from Signal K alarm/notification data
    // TODO: Map from notifications.propulsion.*.* paths
    
    return status;
  }
};
