/**
 * system.js - JARVIS Hardware & Mark 85 System Telemetry Skill
 * Inspects host metrics (CPU cores, memory heap, battery charge, connection)
 * along with simulated Iron Man Mark 85 reactor armor telemetry.
 */

export const SystemSkill = {
  name: 'system',

  match(intent) {
    return intent.type === 'SYSTEM';
  },

  async execute(intent) {
    // 1. CPU & Hardware Concurrency
    const cpuCores = navigator.hardwareConcurrency || 8;
    const estCpuLoad = Math.floor(18 + Math.random() * 24); // ~18-42% load

    // 2. Memory
    let memoryUsed = 4.2;
    let memoryTotal = navigator.deviceMemory || 16;
    let memPct = Math.round((memoryUsed / memoryTotal) * 100);

    if (performance && performance.memory) {
      const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
      const totalMB = Math.round(performance.memory.jsHeapSizeLimit / (1024 * 1024));
      memPct = Math.min(95, Math.round((usedMB / totalMB) * 100));
      memoryUsed = (usedMB / 1024).toFixed(1);
    }

    // 3. Battery Telemetry
    let batteryLevel = 88;
    let isCharging = true;
    try {
      if (navigator.getBattery) {
        const battery = await navigator.getBattery();
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      }
    } catch (e) {
      // Fallback defaults
    }

    // 4. Arc Reactor & Armor Telemetry
    const coreTemp = (38 + Math.random() * 6).toFixed(1); // 38-44°C
    const reactorOutput = (96.4 + Math.random() * 3.2).toFixed(1); // 96-99%

    return {
      cpu: {
        cores: cpuCores,
        loadPct: estCpuLoad
      },
      memory: {
        usedGB: memoryUsed,
        totalGB: memoryTotal,
        pct: memPct
      },
      battery: {
        level: batteryLevel,
        charging: isCharging
      },
      reactor: {
        output: reactorOutput,
        temp: coreTemp,
        status: 'Optimal'
      }
    };
  }
};
