class DoubleSlitSimulation {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.observerOn = false;
    this.isPlaying = true;
    
    // Physical Parameters (initial)
    this.wavelength = 532;    // nm
    this.slitDist = 45;       // μm (Z spacing: 15 to 90 maps to 1.5 to 9.0 units)
    this.slitWidth = 10;      // μm (Z scale: 5 to 25 maps to 0.5 to 2.5 units)
    this.particleRate = 120;  // particles per second
    this.waveSpeedVal = 15.0; // speed frequency multiplier
    
    // WebGL setup
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    
    // 3D Objects
    this.emitter = null;
    this.nozzleLight = null;
    this.barrierLeft = null;
    this.barrierMiddle = null;
    this.barrierRight = null;
    
    // Glowing Slit portals (for high split visibility)
    this.slitGlowL = null;
    this.slitGlowR = null;
    
    this.detectorScreen = null;
    this.detectorCanvas = null;
    this.detectorTexture = null;
    
    // Fluid Wave Floor Plane (Deforming 3D Grid)
    this.fluidFloor = null;
    this.fluidWire = null;
    this.fluidMaterial = null;
    this.fluidMaterialWire = null;
    this.time = 0;
    
    // Wave intensity curve lines (visualizing probability density)
    this.intensityCurveLine = null;
    
    // Simulation state
    this.particles = [];
    this.waveFronts = [];
    this.lastWaveFrontSpawnTime = 0;
    this.hitCount = 0;
    this.hitsData = []; // stores {y, z} hits on screen
    this.maxHits = 12000;
    this.lastSpawnTime = 0;
    
    // Bind resize
    this.init();
  }
  
  init() {
    const width = this.container.clientWidth || 800;
    const height = this.container.clientHeight || 500;
    
    // 1. Create Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020308);
    this.scene.fog = new THREE.FogExp2(0x020308, 0.015);
    
    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.camera.position.set(-18, 14, 26); // cinematic starting angle
    
    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    
    // 4. Orbit Controls (Cinematic AutoRotate enabled)
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // stay above floor
    this.controls.minDistance = 10;
    this.controls.maxDistance = 100;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5; // cinematic rotate speed
    
    // 5. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(ambientLight);
    
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
    keyLight.position.set(-15, 20, 10);
    this.scene.add(keyLight);
    
    // 6. Build lab objects
    this.buildEmitter();
    this.buildDetectorScreen();
    this.buildFluidFloor();
    this.buildSlitsBarrier();
    
    this.updateSlitGradients();
    this.drawProbabilityCurve();
    
    // Resize Listener
    window.addEventListener('resize', () => this.onWindowResize());
    
    // Run animation loop
    this.animate();
  }
  
  wavelengthToHex(wl) {
    if (wl < 440) return 0x7f00ff; // Violet
    if (wl < 490) return 0x007fff; // Cyan-Blue
    if (wl < 510) return 0x00ff7f; // Green-Cyan
    if (wl < 580) return 0x00ff00; // Green
    if (wl < 600) return 0xffd700; // Yellow
    if (wl < 630) return 0xff7f00; // Orange
    return 0xff0033; // Red
  }
  
  wavelengthToRgbaStr(wl, alpha = 1.0) {
    if (wl < 440) return `rgba(127, 0, 255, ${alpha})`;
    if (wl < 490) return `rgba(0, 127, 255, ${alpha})`;
    if (wl < 510) return `rgba(0, 255, 127, ${alpha})`;
    if (wl < 580) return `rgba(0, 255, 0, ${alpha})`;
    if (wl < 600) return `rgba(255, 215, 0, ${alpha})`;
    if (wl < 630) return `rgba(255, 127, 0, ${alpha})`;
    return `rgba(255, 0, 51, ${alpha})`;
  }
  
  buildEmitter() {
    // Emitter cylinder shell
    const geometry = new THREE.CylinderGeometry(1.4, 2.0, 7, 24);
    geometry.rotateZ(Math.PI / 2); // align horizontal along X axis
    
    const material = new THREE.MeshStandardMaterial({
      color: 0x0d1222,
      roughness: 0.3,
      metalness: 0.95
    });
    
    this.emitter = new THREE.Mesh(geometry, material);
    this.emitter.position.set(-22, 0, 0);
    this.scene.add(this.emitter);
    
    // Glowing nozzle ring
    const ringGeom = new THREE.TorusGeometry(1.3, 0.15, 8, 32);
    ringGeom.rotateY(Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.nozzleRing = new THREE.Mesh(ringGeom, ringMat);
    this.nozzleRing.position.set(3.5, 0, 0);
    this.emitter.add(this.nozzleRing);
    
    // Point light inside emitter nozzle
    this.nozzleLight = new THREE.PointLight(0x38bdf8, 1.5, 15);
    this.nozzleLight.position.set(-18, 0, 0);
    this.scene.add(this.nozzleLight);
  }
  
  buildDetectorScreen() {
    const screenGeom = new THREE.PlaneGeometry(30, 16);
    screenGeom.rotateY(-Math.PI / 2); // face emitter nozzle (X negative)
    
    this.detectorCanvas = document.createElement('canvas');
    this.detectorCanvas.width = 1024;
    this.detectorCanvas.height = 512;
    this.clearDetectorCanvas();
    
    this.detectorTexture = new THREE.CanvasTexture(this.detectorCanvas);
    const material = new THREE.MeshStandardMaterial({
      map: this.detectorTexture,
      roughness: 0.5,
      metalness: 0.1,
      emissive: 0x010206
    });
    
    this.detectorScreen = new THREE.Mesh(screenGeom, material);
    this.detectorScreen.position.set(20, 0, 0);
    this.scene.add(this.detectorScreen);
  }
  
  clearDetectorCanvas() {
    const ctx = this.detectorCanvas.getContext('2d');
    ctx.fillStyle = '#010206';
    ctx.fillRect(0, 0, this.detectorCanvas.width, this.detectorCanvas.height);
    
    // Draw technical grid lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
    ctx.lineWidth = 1;
    const gridStep = 32;
    for (let x = 0; x < this.detectorCanvas.width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.detectorCanvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.detectorCanvas.height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.detectorCanvas.width, y);
      ctx.stroke();
    }
  }
  
  buildFluidFloor() {
    // Large horizontal plane representing wave propagation medium
    const sizeX = 44.0;
    const sizeZ = 32.0;
    
    // Subdivide geometry heavily to allow real 3D vertex deformation
    const geom = new THREE.PlaneGeometry(sizeX, sizeZ, 160, 120);
    
    // CUSTOM GPU SHADER MATERIAL (Pixel-perfect fluid wave height displacement solver)
    this.fluidMaterial = new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0.0 },
        u_wavelength: { value: 532.0 },
        u_slitDist: { value: 4.5 },
        u_slitWidth: { value: 1.0 },
        u_observerOn: { value: 0.0 },
        u_waveSpeed: { value: 15.0 },
        u_emitterPos: { value: new THREE.Vector2(-22.0, 0.0) },
        u_slit1Pos: { value: new THREE.Vector2(0.0, -2.25) },
        u_slit2Pos: { value: new THREE.Vector2(0.0, 2.25) },
        u_waveColor: { value: new THREE.Color(0x38bdf8) }
      },
      vertexShader: `
        uniform float u_time;
        uniform float u_wavelength;
        uniform float u_slitDist;
        uniform float u_slitWidth;
        uniform float u_observerOn;
        uniform float u_waveSpeed;
        uniform vec2 u_emitterPos;
        uniform vec2 u_slit1Pos;
        uniform vec2 u_slit2Pos;
        
        varying vec3 vWorldPosition;
        varying float vAmplitude;
        
        void main() {
          // Local plane coordinates: position.x and position.y
          vec2 p = position.xy;
          
          float amp = 0.0;
          float lambda = u_wavelength / 40.0; // scale physical nm to 3D grid wavelength
          float k = 2.0 * 3.14159265 / lambda;
          float t = u_time * u_waveSpeed;
          
          if (p.x < 0.0) {
            // 1. Left of slits: spherical wave from emitter nozzle
            float r_emit = distance(p, u_emitterPos);
            amp = 1.0 * sin(k * r_emit - t) / sqrt(r_emit + 1.0);
            
            // Attenuate near barrier edge
            if (p.x > -1.0) {
              bool inLeftSlit = abs(p.y - u_slit1Pos.y) < (u_slitWidth * 0.05 + 0.15);
              bool inRightSlit = abs(p.y - u_slit2Pos.y) < (u_slitWidth * 0.05 + 0.15);
              if (!inLeftSlit && !inRightSlit) {
                amp *= mix(1.0, 0.0, smoothstep(-1.0, 0.0, p.x));
              }
            }
          } else {
            // 2. Right of slits: diffraction
            if (u_observerOn > 0.5) {
              // Collapsed state: direct sum of intensities (no phase interference)
              float r1 = distance(p, u_slit1Pos);
              float r2 = distance(p, u_slit2Pos);
              
              float w1 = 0.75 * sin(k * r1 - t) / sqrt(r1 + 1.0);
              float w2 = 0.75 * sin(k * r2 - t) / sqrt(r2 + 1.0);
              
              amp = sqrt(w1*w1 + w2*w2) * sign(w1 + w2);
            } else {
              // Coherent state: constructive/destructive superposition
              float r1 = distance(p, u_slit1Pos);
              float r2 = distance(p, u_slit2Pos);
              
              float w1 = 0.65 * sin(k * r1 - t) / sqrt(r1 + 0.8);
              float w2 = 0.65 * sin(k * r2 - t) / sqrt(r2 + 0.8);
              
              amp = w1 + w2;
            }
            
            // Attenuate near the detector screen at x = 20
            if (p.x > 20.0) {
              amp *= exp(-2.0 * (p.x - 20.0));
            }
          }
          
          // Edge damping near boundaries
          float edgeFade = smoothstep(16.0, 12.5, abs(p.y));
          amp *= edgeFade;
          
          vAmplitude = amp;
          
          // Displace local Z coordinate (which points out of plane)
          vec3 displacedPosition = position;
          displacedPosition.z += amp * 1.5; // height scale displacement
          
          vec4 worldPos = modelMatrix * vec4(displacedPosition, 1.0);
          vWorldPosition = worldPos.xyz;
          
          gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 u_waveColor;
        uniform float u_observerOn;
        
        varying vec3 vWorldPosition;
        varying float vAmplitude;
        
        void main() {
          vec3 bg_color = vec3(0.008, 0.012, 0.024);
          vec3 peak_color = u_waveColor;
          vec3 trough_color = vec3(0.85, 0.08, 0.48); // neon pink
          
          float maxAmp = (u_observerOn > 0.5) ? 1.0 : 1.35;
          float norm = clamp(vAmplitude / maxAmp, -1.0, 1.0);
          
          vec3 color = bg_color;
          if (norm > 0.0) {
            color = mix(bg_color, peak_color, norm);
          } else {
            color = mix(bg_color, trough_color, -norm);
          }
          
          gl_FragColor = vec4(color, 0.9);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
    
    // Material 2: Wireframe Overlay (to show deforming tech-grid ripples!)
    this.fluidMaterialWire = new THREE.ShaderMaterial({
      uniforms: this.fluidMaterial.uniforms,
      vertexShader: this.fluidMaterial.vertexShader,
      fragmentShader: `
        varying float vAmplitude;
        void main() {
          // Thin glowing blue lines
          gl_FragColor = vec4(0.04, 0.35, 0.75, 0.15);
        }
      `,
      wireframe: true,
      transparent: true
    });
    
    // Create Solid Mesh
    this.fluidFloor = new THREE.Mesh(geom, this.fluidMaterial);
    this.fluidFloor.rotation.x = -Math.PI / 2; // lay flat horizontally
    this.fluidFloor.position.y = -2.0; // position under center
    this.scene.add(this.fluidFloor);
    
    // Create Wireframe Mesh
    this.fluidWire = new THREE.Mesh(geom, this.fluidMaterialWire);
    this.fluidWire.rotation.x = -Math.PI / 2;
    this.fluidWire.position.y = -1.98; // slightly offset to prevent z-fighting
    this.scene.add(this.fluidWire);
    
    // Outline border
    const outlineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-22, -2.0, -16),
      new THREE.Vector3(20, -2.0, -16),
      new THREE.Vector3(20, -2.0, 16),
      new THREE.Vector3(-22, -2.0, 16),
      new THREE.Vector3(-22, -2.0, -16)
    ]);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0x18223c, linewidth: 2 });
    this.scene.add(new THREE.Line(outlineGeom, outlineMat));
  }
  
  buildSlitsBarrier() {
    // Solid Slate Metallic Wall Barrier at X = 0
    // Height: 10, Thickness: 0.8. We subdivide it into 3 boxes to dynamically cut 2 slits.
    const height = 10;
    const thickness = 0.8;
    const material = new THREE.MeshStandardMaterial({
      color: 0x1c2135,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x060810
    });
    
    this.barrierLeft = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, 1), material);
    this.barrierMiddle = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, 1), material);
    this.barrierRight = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, 1), material);
    
    this.scene.add(this.barrierLeft);
    this.scene.add(this.barrierMiddle);
    this.scene.add(this.barrierRight);
    
    // Glowing Slit cylinders inside gaps to make splits clear
    // Open-ended vertical cylinders
    const slitPortGeom = new THREE.CylinderGeometry(0.3, 0.3, height - 0.05, 16, 1, true);
    
    const glowMatL = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide
    });
    const glowMatR = glowMatL.clone();
    
    this.slitGlowL = new THREE.Mesh(slitPortGeom, glowMatL);
    this.slitGlowR = new THREE.Mesh(slitPortGeom, glowMatR);
    
    this.scene.add(this.slitGlowL);
    this.scene.add(this.slitGlowR);
    
    this.updateSlitBarrierGeometry();
  }
  
  updateSlitBarrierGeometry() {
    // Map separation slider (15 - 90 um) to units (1.5 - 9.0 units)
    const d = this.slitDist * 0.1;
    // Map slit width slider (5 - 25 um) to units (0.5 - 2.5 units)
    const w = this.slitWidth * 0.1;
    
    const totalHalfWidth = 16.0; // border bounds
    
    const slit1CenterZ = -d / 2;
    const slit2CenterZ = d / 2;
    
    const slit1OuterZ = slit1CenterZ - w / 2;
    const slit1InnerZ = slit1CenterZ + w / 2;
    const slit2InnerZ = slit2CenterZ - w / 2;
    const slit2OuterZ = slit2CenterZ + w / 2;
    
    // 1. Left Barrier Box (extends from -16 to slit1OuterZ)
    const leftWidth = totalHalfWidth + slit1OuterZ;
    if (leftWidth > 0.05) {
      this.barrierLeft.visible = true;
      this.barrierLeft.scale.set(1, 1, leftWidth);
      this.barrierLeft.position.set(0, 0, -totalHalfWidth + leftWidth / 2);
    } else {
      this.barrierLeft.visible = false;
    }
    
    // 2. Right Barrier Box (extends from slit2OuterZ to 16)
    const rightWidth = totalHalfWidth - slit2OuterZ;
    if (rightWidth > 0.05) {
      this.barrierRight.scale.set(1, 1, rightWidth);
      this.barrierRight.position.set(0, 0, totalHalfWidth - rightWidth / 2);
    } else {
      this.barrierRight.visible = false;
    }
    
    // 3. Middle Barrier Box (extends between slits)
    const midWidth = slit2InnerZ - slit1InnerZ;
    if (midWidth > 0.05) {
      this.barrierMiddle.visible = true;
      this.barrierMiddle.scale.set(1, 1, midWidth);
      this.barrierMiddle.position.set(0, 0, 0);
    } else {
      this.barrierMiddle.visible = false;
    }
    
    // 4. Update vertical glowing slit columns
    this.slitGlowL.position.set(0, 0, slit1CenterZ);
    this.slitGlowL.scale.set(w * 1.5, 1.0, w * 1.5); // scale radius to fit slit width
    
    this.slitGlowR.position.set(0, 0, slit2CenterZ);
    this.slitGlowR.scale.set(w * 1.5, 1.0, w * 1.5);
    
    // Update Shader uniforms positions
    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_slit1Pos.value.set(0.0, slit1CenterZ);
      this.fluidMaterial.uniforms.u_slit2Pos.value.set(0.0, slit2CenterZ);
      this.fluidMaterial.uniforms.u_slitDist.value = d;
      this.fluidMaterial.uniforms.u_slitWidth.value = w;
    }
  }
  
  updateSlitGradients() {
    const colHex = this.wavelengthToHex(this.wavelength);
    const color = new THREE.Color(colHex);
    
    // Sync light colors
    this.nozzleLight.color.copy(color);
    this.nozzleRing.material.color.copy(color);
    
    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_waveColor.value.copy(color);
      this.fluidMaterial.uniforms.u_wavelength.value = this.wavelength;
    }
    
    // Slit glow cylinders color
    // Cyan if wave coherence, Pink if observed
    const slitColorHex = this.observerOn ? 0xec4899 : colHex;
    this.slitGlowL.material.color.setHex(slitColorHex);
    this.slitGlowR.material.color.setHex(slitColorHex);
  }
  
  // Rejection sampling for target Z coordinates on the detector screen
  sampleIntensityPattern() {
    const d = this.slitDist * 0.1;
    const w = this.slitWidth * 0.1;
    const lambda = this.wavelength;
    
    const scaleFactor = 1.35;
    const screenHalfWidth = 14.5;
    const L = 20.0;
    
    let attempts = 0;
    while (attempts < 1000) {
      attempts++;
      const zCandidate = (Math.random() - 0.5) * screenHalfWidth * 2;
      const theta = Math.atan2(zCandidate, L);
      
      const beta = (Math.PI * w * Math.sin(theta) * 1000) / (lambda * scaleFactor);
      const envelope = beta === 0.0 ? 1.0 : (Math.sin(beta) / beta) ** 2;
      
      let probability = 0.0;
      
      if (this.observerOn) {
        // Collapsed (decoherent) double slits
        const zLeftCenter = -d / 2;
        const zRightCenter = d / 2;
        
        const thetaL = Math.atan2(zCandidate - zLeftCenter, L);
        const betaL = (Math.PI * w * Math.sin(thetaL) * 1000) / (lambda * scaleFactor);
        const envL = betaL === 0.0 ? 1.0 : (Math.sin(betaL) / betaL) ** 2;
        
        const thetaR = Math.atan2(zCandidate - zRightCenter, L);
        const betaR = (Math.PI * w * Math.sin(thetaR) * 1000) / (lambda * scaleFactor);
        const envR = betaR === 0.0 ? 1.0 : (Math.sin(betaR) / betaR) ** 2;
        
        probability = 0.5 * (envL + envR);
      } else {
        // Coherent wave interference
        const alpha = (Math.PI * d * Math.sin(theta) * 1000) / (lambda * scaleFactor);
        const interference = Math.cos(alpha) ** 2;
        probability = envelope * interference;
      }
      
      if (Math.random() < probability) {
        return zCandidate;
      }
    }
    return 0.0;
  }
  
  // Real-time plotting of intensity distribution on the detector panel
  drawProbabilityCurve() {
    if (this.intensityCurveLine) {
      this.scene.remove(this.intensityCurveLine);
    }
    
    const points = [];
    const d = this.slitDist * 0.1;
    const w = this.slitWidth * 0.1;
    const lambda = this.wavelength;
    const scaleFactor = 1.35;
    const L = 20.0;
    
    for (let z = -14.5; z <= 14.5; z += 0.1) {
      const theta = Math.atan2(z, L);
      const beta = (Math.PI * w * Math.sin(theta) * 1000) / (lambda * scaleFactor);
      const envelope = beta === 0.0 ? 1.0 : (Math.sin(beta) / beta) ** 2;
      
      let yIntensity = 0.0;
      if (this.observerOn) {
        const zLeftCenter = -d / 2;
        const zRightCenter = d / 2;
        
        const thetaL = Math.atan2(z - zLeftCenter, L);
        const betaL = (Math.PI * w * Math.sin(thetaL) * 1000) / (lambda * scaleFactor);
        const envL = betaL === 0.0 ? 1.0 : (Math.sin(betaL) / betaL) ** 2;
        
        const thetaR = Math.atan2(z - zRightCenter, L);
        const betaR = (Math.PI * w * Math.sin(thetaR) * 1000) / (lambda * scaleFactor);
        const envR = betaR === 0.0 ? 1.0 : (Math.sin(betaR) / betaR) ** 2;
        
        yIntensity = 0.5 * (envL + envR);
      } else {
        const alpha = (Math.PI * d * Math.sin(theta) * 1000) / (lambda * scaleFactor);
        yIntensity = envelope * (Math.cos(alpha) ** 2);
      }
      
      points.push(new THREE.Vector3(19.8, -4.8 + yIntensity * 4.5, z));
    }
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: this.wavelengthToHex(this.wavelength),
      linewidth: 3,
      transparent: true,
      opacity: 0.8
    });
    
    this.intensityCurveLine = new THREE.Line(geometry, material);
    this.scene.add(this.intensityCurveLine);
  }
  
  fireParticle() {
    const targetZ = this.sampleIntensityPattern();
    const targetY = (Math.random() - 0.5) * 10.0; 
    
    const d = this.slitDist * 0.1;
    const slitZ = Math.random() > 0.5 ? d / 2 : -d / 2;
    
    // Choose particle color corresponding to current wavelength
    const pColor = this.wavelengthToHex(this.wavelength);
    
    // Localized particle Group
    const mesh = new THREE.Group();
    
    // Glowing head sphere
    const headGeom = new THREE.SphereGeometry(0.24, 8, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: pColor });
    const head = new THREE.Mesh(headGeom, headMat);
    mesh.add(head);
    
    // 4 fading trail spheres
    for (let j = 0; j < 4; j++) {
      const scale = 0.8 - j * 0.15;
      const trailGeom = new THREE.SphereGeometry(0.24 * scale, 6, 6);
      const trailMat = new THREE.MeshBasicMaterial({
        color: pColor,
        transparent: true,
        opacity: 0.45 - j * 0.1
      });
      const trail = new THREE.Mesh(trailGeom, trailMat);
      mesh.add(trail);
    }
    
    this.scene.add(mesh);
    
    this.particles.push({
      mesh: mesh,
      x: -22,
      y: targetY, // target Y
      z: 0,
      slitZ: slitZ,
      targetZ: targetZ,
      targetY: targetY,
      speed: 0.38, // particle travel speed
      progress: 0.0,
      history: []
    });
  }
  
  updateParticles() {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.progress += p.speed;
      
      let currentPos = new THREE.Vector3();
      
      if (p.progress < 0.5) {
        // Phase 1: Gun nozzle to slit wall (X = -22 to X = 0)
        const t = p.progress / 0.5;
        p.x = -22.0 * (1.0 - t);
        p.z = p.slitZ * t;
        // Float particles flat riding the wave floor level (Y = -2.0 + 0.5)
        p.y_current = -1.5;
        
        p.mesh.position.set(p.x, p.y_current, p.z);
        currentPos.set(p.x, p.y_current, p.z);
      } else {
        // Phase 2: Slit wall to screen (X = 0 to X = 20)
        const t = (p.progress - 0.5) / 0.5;
        p.x = 20.0 * t;
        p.z = p.slitZ * (1.0 - t) + p.targetZ * t;
        // Superpose vertical spread towards their screen collapse targets
        p.y_current = -1.5 * (1.0 - t) + p.targetY * t;
        
        p.mesh.position.set(p.x, p.y_current, p.z);
        currentPos.set(p.x, p.y_current, p.z);
      }
      
      // Update trail history vectors
      p.history.push(currentPos.clone());
      if (p.history.length > 5) {
        p.history.shift();
      }
      
      const len = p.history.length;
      const group = p.mesh;
      for (let j = 1; j < group.children.length; j++) {
        const histIdx = len - 1 - j;
        if (histIdx >= 0) {
          const localPos = p.history[histIdx].clone().sub(group.position);
          group.children[j].position.copy(localPos);
          group.children[j].visible = true;
        } else {
          group.children[j].visible = false;
        }
      }
      
      // Hit collapse detection
      if (p.progress >= 1.0) {
        this.scene.remove(p.mesh);
        this.registerHit(p.targetZ, p.targetY);
        this.particles.splice(i, 1);
      }
    }
  }
  
  registerHit(z, y) {
    this.hitCount++;
    this.hitsData.push({ z, y });
    if (this.hitsData.length > this.maxHits) {
      this.hitsData.shift();
    }
    
    // Draw neon dot on detector screen texture
    const ctx = this.detectorCanvas.getContext('2d');
    
    // Map 3D dimensions to pixels: 
    // Z range [-15, 15] maps to X [50, 974]
    // Y range [-8, 8] maps to Y [462, 50]
    const canX = ((z + 15) / 30) * (this.detectorCanvas.width - 100) + 50;
    const canY = ((-y + 8) / 16) * (this.detectorCanvas.height - 100) + 50;
    
    const pRgba = this.wavelengthToRgbaStr(this.wavelength, 1.0);
    const grad = ctx.createRadialGradient(canX, canY, 0, canX, canY, 5);
    grad.addColorStop(0, pRgba);
    grad.addColorStop(0.3, this.wavelengthToRgbaStr(this.wavelength, 0.7));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(canX, canY, 5, 0, Math.PI * 2);
    ctx.fill();
    
    this.detectorTexture.needsUpdate = true;
    
    if (this.onHitCallback) {
      this.onHitCallback(this.hitCount, this.maxHits);
    }
  }
  
  setObserver(state) {
    this.observerOn = state;
    
    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_observerOn.value = this.observerOn ? 1.0 : 0.0;
    }
    
    this.updateSlitGradients();
    this.drawProbabilityCurve();
    this.clearHits();
  }
  
  clearHits() {
    this.hitCount = 0;
    this.hitsData = [];
    this.clearDetectorCanvas();
    this.detectorTexture.needsUpdate = true;
    
    if (this.onHitCallback) {
      this.onHitCallback(0, this.maxHits);
    }
  }
  
  updateParams(wavelength, slitDist, slitWidth, particleRate, waveSpeed) {
    this.wavelength = wavelength;
    this.slitDist = slitDist;
    this.slitWidth = slitWidth;
    this.particleRate = particleRate;
    this.waveSpeedVal = waveSpeed;
    
    this.updateSlitBarrierGeometry();
    this.updateSlitGradients();
    this.drawProbabilityCurve();
  }
  
  onWindowResize() {
    if (!this.container) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
  
  animate() {
    requestAnimationFrame(() => this.animate());
    
    if (!this.isPlaying) return;
    
    // Tick shader time uniform
    this.time += 0.005; // base rate
    if (this.fluidMaterial) {
      this.fluidMaterial.uniforms.u_time.value = this.time;
      this.fluidMaterial.uniforms.u_waveSpeed.value = this.waveSpeedVal;
    }
    
    // Spawning particles
    const now = Date.now();
    const interval = 1000 / this.particleRate;
    if (now - this.lastSpawnTime > interval) {
      this.fireParticle();
      this.lastSpawnTime = now;
    }
    
    // Update physics
    this.updateParticles();
    
    // Render Frame
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
window.DoubleSlitSimulation = DoubleSlitSimulation;
