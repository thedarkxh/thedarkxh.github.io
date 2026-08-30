document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Double-Slit Simulation
  const doubleSlitSim = new DoubleSlitSimulation('double-slit-3d-container');
  
  // 2. DOM Elements Cache
  const clockEl = document.getElementById('cockpit-clock');
  const telemetryEl = document.getElementById('telemetry-log');
  
  // Controls
  const sWavelength = document.getElementById('slider-wavelength');
  const sSlitDist = document.getElementById('slider-slit-dist');
  const sSlitWidth = document.getElementById('slider-slit-width');
  const sParticleRate = document.getElementById('slider-particle-rate');
  const sWaveSpeed = document.getElementById('slider-wave-speed');
  
  // Labels
  const lWavelength = document.getElementById('lbl-wavelength');
  const lSlitDist = document.getElementById('lbl-slit-dist');
  const lSlitWidth = document.getElementById('lbl-slit-width');
  const lParticleRate = document.getElementById('lbl-particle-rate');
  const lWaveSpeed = document.getElementById('lbl-wave-speed');
  
  // Buttons
  const btnPlayPause = document.getElementById('btn-play-pause');
  const btnToggleObserver = document.getElementById('btn-toggle-observer');
  const btnClearDetector = document.getElementById('btn-clear-detector');
  
  // Badges / Metrics
  const slitModeIndicator = document.getElementById('slit-mode-indicator');
  const valFringePct = document.getElementById('val-fringe-pct');
  const valHitCount = document.getElementById('val-hit-count');
  const stateText = document.getElementById('state-text');
  
  // Telemetry logger
  function logTelemetry(msg, category = 'info') {
    const time = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = 'log-line';
    
    if (category === 'success') {
      line.classList.add('text-success');
      line.innerHTML = `[${time}] <span class="material-symbols-outlined" style="font-size:10px;vertical-align:middle;">check_circle</span> ${msg}`;
    } else if (category === 'warning') {
      line.classList.add('text-warning');
      line.innerHTML = `[${time}] <span class="material-symbols-outlined" style="font-size:10px;vertical-align:middle;">warning</span> ${msg}`;
    } else {
      line.classList.add('text-dim');
      line.innerHTML = `[${time}] ${msg}`;
    }
    
    telemetryEl.appendChild(line);
    telemetryEl.scrollTop = telemetryEl.scrollHeight;
  }
  
  // 3. Bind Sliders and Parameter Sync
  function syncParameters() {
    const wl = parseInt(sWavelength.value);
    const sd = parseInt(sSlitDist.value);
    const sw = parseInt(sSlitWidth.value);
    const pr = parseInt(sParticleRate.value);
    const ws = parseInt(sWaveSpeed.value);
    
    // Update labels
    lWavelength.innerText = `${wl} nm`;
    lSlitDist.innerText = `${sd} μm`;
    lSlitWidth.innerText = `${sw} μm`;
    lParticleRate.innerText = `${pr} p/s`;
    lWaveSpeed.innerText = `${(ws / 10).toFixed(2)} Hz`;
    
    // Update simulation core
    doubleSlitSim.updateParams(wl, sd, sw, pr, ws);
  }
  
  // Sliders input listeners
  sWavelength.addEventListener('input', () => {
    syncParameters();
    logTelemetry(`Wavelength adjusted to ${sWavelength.value} nm (Spectrum: ${getSpectrumName(sWavelength.value)})`);
  });
  sSlitDist.addEventListener('input', () => {
    syncParameters();
    logTelemetry(`Slit separation set to ${sSlitDist.value} μm`);
  });
  sSlitWidth.addEventListener('input', () => {
    syncParameters();
    logTelemetry(`Diffraction aperture slit width set to ${sSlitWidth.value} μm`);
  });
  sParticleRate.addEventListener('input', () => {
    syncParameters();
    logTelemetry(`Quantum emitter flux: ${sParticleRate.value} particles/sec`);
  });
  sWaveSpeed.addEventListener('input', () => {
    syncParameters();
    logTelemetry(`Wave phase velocity frequency set to ${(sWaveSpeed.value / 10).toFixed(2)} Hz`);
  });
  
  function getSpectrumName(nm) {
    if (nm < 440) return 'Violet';
    if (nm < 490) return 'Blue';
    if (nm < 510) return 'Cyan';
    if (nm < 580) return 'Green';
    if (nm < 600) return 'Yellow';
    if (nm < 630) return 'Orange';
    return 'Red';
  }
  
  // 4. Double Slit Callbacks and Actions
  doubleSlitSim.onHitCallback = (count, max) => {
    valHitCount.innerText = count.toLocaleString();
    const pct = Math.min(100, Math.floor((count / 1500) * 100)); // assume 1500 hits builds standard pattern
    valFringePct.innerText = `${pct}%`;
  };
  
  btnToggleObserver.addEventListener('click', () => {
    const isObserved = !doubleSlitSim.observerOn;
    doubleSlitSim.setObserver(isObserved);
    
    if (isObserved) {
      btnToggleObserver.classList.add('paused');
      btnToggleObserver.querySelector('.btn-lbl').innerText = 'OBSERVER: ACTIVE';
      btnToggleObserver.querySelector('span').innerText = 'visibility_off';
      
      slitModeIndicator.innerText = 'PARTICLE STATE';
      slitModeIndicator.className = 'mode-badge wave-badge'; // pink color
      stateText.innerText = 'Decoherence';
      stateText.className = 'val text-warning';
      
      logTelemetry('Quantum observer ACTIVE: Wavefunction collapsed at slits. Waves hidden.', 'warning');
    } else {
      btnToggleObserver.classList.remove('paused');
      btnToggleObserver.querySelector('.btn-lbl').innerText = 'OBSERVER: OFF';
      btnToggleObserver.querySelector('span').innerText = 'visibility';
      
      slitModeIndicator.innerText = 'WAVE COHERENCE';
      slitModeIndicator.className = 'mode-badge particle-badge'; // cyan color
      stateText.innerText = 'Superposition';
      stateText.className = 'val text-success';
      
      logTelemetry('Observer deactivated. GPU fluid superposition wave field active.', 'success');
    }
  });
  
  btnClearDetector.addEventListener('click', () => {
    doubleSlitSim.clearHits();
    logTelemetry('Detector screen data cleared. Accumulating new collapses...', 'success');
  });
  
  // 5. Playback control
  btnPlayPause.addEventListener('click', () => {
    const playing = !doubleSlitSim.isPlaying;
    doubleSlitSim.isPlaying = playing;
    
    const icon = document.getElementById('play-pause-icon');
    const lbl = document.getElementById('play-pause-lbl');
    
    if (playing) {
      btnPlayPause.classList.remove('paused');
      icon.innerText = 'pause';
      lbl.innerText = 'PAUSE SIMULATION';
      logTelemetry('Simulation core: RUNNING');
    } else {
      btnPlayPause.classList.add('paused');
      icon.innerText = 'play_arrow';
      lbl.innerText = 'RESUME SIMULATION';
      logTelemetry('Simulation core: STANDBY (PAUSED)', 'warning');
    }
  });
  
  // 6. Preset Laboratory Configurations
  function applyPreset(presetName, config) {
    document.querySelectorAll('.preset-btn').forEach(btn => btn.classList.remove('active'));
    
    sWavelength.value = config.wavelength;
    sSlitDist.value = config.slitDist;
    sSlitWidth.value = config.slitWidth;
    sParticleRate.value = config.particleRate;
    sWaveSpeed.value = config.waveSpeed;
    
    // Set observer
    if (doubleSlitSim.observerOn !== config.observer) {
      btnToggleObserver.click();
    }
    
    syncParameters();
    doubleSlitSim.clearHits();
    logTelemetry(`Loaded preset config: [${presetName}]`, 'success');
  }
  
  document.getElementById('preset-electron').addEventListener('click', (e) => {
    e.target.closest('.preset-btn').classList.add('active');
    applyPreset('Electron Beam', {
      wavelength: 420,
      slitDist: 25,
      slitWidth: 6,
      particleRate: 250,
      waveSpeed: 20,
      observer: false
    });
  });
  
  document.getElementById('preset-red-photon').addEventListener('click', (e) => {
    e.target.closest('.preset-btn').classList.add('active');
    applyPreset('Red Photons (632.8nm)', {
      wavelength: 632,
      slitDist: 50,
      slitWidth: 12,
      particleRate: 110,
      waveSpeed: 12,
      observer: false
    });
  });
  
  document.getElementById('preset-violet-photon').addEventListener('click', (e) => {
    e.target.closest('.preset-btn').classList.add('active');
    applyPreset('Violet Photons (405nm)', {
      wavelength: 405,
      slitDist: 40,
      slitWidth: 8,
      particleRate: 160,
      waveSpeed: 18,
      observer: false
    });
  });
  
  document.getElementById('preset-coherent-slit').addEventListener('click', (e) => {
    e.target.closest('.preset-btn').classList.add('active');
    applyPreset('Coherent Slits', {
      wavelength: 510,
      slitDist: 35,
      slitWidth: 10,
      particleRate: 120,
      waveSpeed: 15,
      observer: false
    });
  });
  
  // 7. Video Capture (Clean Presentation Grid) Mode
  const cockpitContainer = document.querySelector('.cockpit-container');
  const btnToggleCapture = document.getElementById('btn-toggle-capture');
  const btnRestoreUi = document.getElementById('btn-restore-ui');
  
  function setCaptureMode(active) {
    if (active) {
      cockpitContainer.classList.add('capture-mode');
    } else {
      cockpitContainer.classList.remove('capture-mode');
    }
    
    // Resize WebGL to fill viewport
    setTimeout(() => {
      doubleSlitSim.onWindowResize();
    }, 100);
  }
  
  if (btnToggleCapture) btnToggleCapture.addEventListener('click', () => setCaptureMode(true));
  if (btnRestoreUi) btnRestoreUi.addEventListener('click', () => setCaptureMode(false));
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setCaptureMode(false);
    }
  });
  
  // 8. Clock Widget
  setInterval(() => {
    const d = new Date();
    clockEl.innerText = d.toTimeString().split(' ')[0];
  }, 1000);
  
  // Initial parameters sync
  syncParameters();
  logTelemetry('Double-Slit Physical GPU simulation loaded successfully.', 'success');
});
