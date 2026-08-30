# 🛰️ Orbital Command: Technical Specification & Engineering Report
**System:** High-Performance 3D Orbital Tracking & Ephemeris Visualization Engine  
**Author / Lead Architect:** Samar Aditya  
**Target:** Undergraduate Admissions & Research Technical Portfolio  
**Live Application:** [thedarkxh.github.io/orbital-command/](https://thedarkxh.github.io/orbital-command/)  

---

## 1. Executive Summary & Problem Statement

Modern Low Earth Orbit (LEO) and Geostationary (GEO) environments contain over 27,000 tracked anthropogenic objects. Web-based ephemeris viewers traditionally suffer from two crippling constraints:
1. **Computational Bottleneck:** Propagating SGP4 orbital equations in JavaScript for thousands of objects per frame creates severe CPU thread starvation ($O(N)$ execution overhead).
2. **Rendering Bottleneck:** Naive WebGL implementations incur an individual draw call per mesh, causing massive GPU pipeline stalls above ~500 objects.

**Orbital Command** resolves this by pairing an optimized orbital propagation pipeline with WebGL instanced geometry batching, achieving smooth real-time 60 FPS rendering and interactive querying of **10,000+ active satellites and orbital debris**.

```
+-----------------------------------------------------------------------------------+
|                            ORBITAL COMMAND ARCHITECTURE                           |
+-----------------------------------------------------------------------------------+
|  [ NORAD / CelesTrak TLE Stream ]                                                 |
|                   │                                                               |
|                   ▼                                                               |
|  [ SGP4 Analytical Propagator ] ────► Computes True Anomaly & Osculating Elements |
|                   │                                                               |
|                   ▼                                                               |
|  [ Coordinate Frame Transform ] ────► ECI (J2000) ──► ECEF (ITRF) ──► Three.js   |
|                   │                                                               |
|                   ▼                                                               |
|  [ Instanced Buffer Pipeline  ] ────► Single GPU Draw Call (10,000+ Matrices)    |
|                   │                                                               |
|                   ▼                                                               |
|  [ Raycast / BVH Spatial Index] ────► Sub-millisecond Satellite Telemetry Lookup  |
+-----------------------------------------------------------------------------------+
```

---

## 2. Physics & Mathematical Formulation

### 2.1 Orbital Representation via Two-Line Elements (TLE)
The state of an orbiting body is defined by classical Keplerian orbital elements with secular/periodic rate perturbations:
* **Semi-Major Axis ($a$)** & **Eccentricity ($e$):** Defining the geometry of the orbital ellipse.
* **Inclination ($i$):** Tilt of the orbital plane relative to the equatorial plane.
* **Right Ascension of the Ascending Node ($\Omega$ / RAAN):** Orientation of the orbital plane in inertial space.
* **Argument of Perigee ($\omega$):** Angle from the ascending node to periapsis.
* **Mean Anomaly ($M$):** Fraction of the orbital period elapsed since perigee passage.

### 2.2 Kepler's Equation & Numerical Solution
To determine eccentric anomaly $E$ from mean anomaly $M$, the engine solves Kepler's transcendental equation:
$$M = E - e \sin E$$

Newton-Raphson iterative refinement is evaluated until convergence within tolerance $\epsilon < 10^{-7}$:
$$E_{k+1} = E_k - \frac{E_k - e \sin E_k - M}{1 - e \cos E_k}$$

### 2.3 Coordinate Transformations
1. **Perifocal to Earth-Centered Inertial (ECI - J2000):**
   $$\mathbf{r}_{\text{ECI}} = \mathbf{R}_z(-\Omega) \mathbf{R}_x(-i) \mathbf{R}_z(-\omega) \mathbf{r}_{\text{perifocal}}$$
2. **ECI to Earth-Centered Earth-Fixed (ECEF):**
   Accounting for Greenwich Mean Sidereal Time ($\theta_{\text{GMST}}$) and Earth rotation rate $\omega_\oplus$:
   $$\begin{bmatrix} x_{\text{ECEF}} \\ y_{\text{ECEF}} \\ z_{\text{ECEF}} \end{bmatrix} = \begin{bmatrix} \cos \theta_{\text{GMST}} & \sin \theta_{\text{GMST}} & 0 \\ -\sin \theta_{\text{GMST}} & \cos \theta_{\text{GMST}} & 0 \\ 0 & 0 & 1 \end{bmatrix} \begin{bmatrix} x_{\text{ECI}} \\ y_{\text{ECI}} \\ z_{\text{ECI}} \end{bmatrix}$$
3. **ECEF to Three.js Cartesian System:** Scale normalization with Earth radius $R_\oplus = 6378.137\text{ km} \mapsto 1.0\text{ unit}$.

---

## 3. Systems & Rendering Architecture

### 3.1 Instanced Mesh Rendering (`InstancedMesh` & `Float32Array`)
* Instead of creating 10,000 distinct `THREE.Mesh` objects (which triggers 10,000 OpenGL draw calls), positions and transformation matrices are flattened into a single contiguous `Float32Array` attribute buffer ($16 \times N$ floats).
* A single instanced draw call (`glDrawElementsInstanced`) uploads positions to vertex shaders, shifting transformation computations entirely to the GPU pipeline.

### 3.2 Dynamic Telemetry Intercept & Spatial Raycasting
* Fast spatial partitioning indexes satellite coordinates into bounding spheres to enable sub-millisecond mouse-hover raycasting without blocking the UI thread.
* Displays apogee, perigee, inclination, velocity magnitude ($v = \sqrt{\mu(2/r - 1/a)}$), and real-time latitude/longitude footprints.

---

## 4. Engineering Attribution & Methodology

| Component | Samar Aditya (Lead Direction) | AI Tooling (Claude Code / Antigravity) |
| :--- | :--- | :--- |
| **System Architecture** | Defined core pipeline, data structures, and frame budget constraints (60 FPS @ 10k objects). | Generated initial Three.js boilerplate & shader structure. |
| **Orbital Mechanics** | Specified SGP4 propagation logic, coordinate transforms, and Keplerian formulas. | Assisted in translating mathematical matrices to WebGL uniform bindings. |
| **Performance Tuning** | Profiled Chrome DevTools memory allocation, replaced object allocations with typed arrays. | Refactored loop structures and eliminated redundant matrix cloning. |
| **Validation & Testing** | Audited ISS/Hubble pass predictions against official NORAD telemetry datasets. | Wrote synthetic dataset generators for stress testing. |

---

## 5. Experimental Results & Benchmarks

* **Object Capacity:** 10,240 satellites rendered concurrently.
* **Frame Rate:** Stable 58–60 FPS on standard Chromium / WebGL2 desktop environments.
* **Memory Footprint:** Contiguous typed array heap allocation $< 45\text{ MB}$.
* **Pass Prediction Accuracy:** Verified against live NORAD ephemeris within $\pm 0.82\text{ km}$ spatial error on LEO objects under standard 24-hour TLE validity windows.

---

## 6. Known Limitations & Theoretical Edge Cases

1. **Stale TLE Ephemeris Degradation:** Analytical SGP4 accuracy drops significantly after 48–72 hours without fresh TLE updates due to unmodeled upper-atmospheric solar flare density fluctuations.
2. **J2 Secular Drift vs High-Order Geopotential ($J_3, J_4$):** SGP4 accounts for Earth's oblateness ($J_2$) and primary drag ($B^*$), but does not integrate high-fidelity non-spherical harmonics or third-body solar/lunar gravitational perturbations needed for centimeter-level orbit determination.
3. **Collision / Conjunction Analysis:** Current implementation provides kinematic proximity warnings rather than full covariance-matrix probability of collision ($P_c$).

---

## 7. Conclusion & Research Roadmap

Orbital Command proves that high-density physical simulations can run performantly in client-side web environments through careful mathematical framing and modern GPU instancing. Future iterations will integrate WebGPU compute shaders for parallel numerical Runge-Kutta (RK4) orbital integrations.
