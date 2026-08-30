# Samar Aditya 🛰️⚡

**Undergraduate Engineering Applicant | Computational Science · Systems · Electronics**  
*I design and build computational and physical systems to explore problems in physics and engineering.*

[![Portfolio](https://img.shields.io/badge/Live_Portfolio-thedarkxh.github.io-d97706?style=for-the-badge&logo=googlechrome&logoColor=white)](https://thedarkxh.github.io/)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-samar--maharia-0077b5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/samar-maharia/)
[![NRAI Shooter ID](https://img.shields.io/badge/NRAI_Rank-822_(10M_Pistol)-ef4444?style=for-the-badge&logo=target&logoColor=white)](https://thedarkxh.github.io/#athletics)

---

## 🔬 Featured Research & Engineering (Flagship Systems)

### 1. [Orbital Command 3D](https://thedarkxh.github.io/orbital-command/) — *Real-Time Ephemeris & 3D WebGL Engine*
* **Core Problem:** Propagating and rendering 10,000+ active orbital objects at 60 FPS in standard browser environments.
* **Physics & Math:** Evaluates analytical SGP4 perturbation models from NORAD Two-Line Elements (TLEs); solves Kepler's equation via Newton-Raphson; performs $\text{ECI} \to \text{ECEF} \to \text{Three.js}$ reference frame coordinate transformations.
* **Architecture:** Streams contiguous `Float32Array` transform matrices to an `InstancedMesh` vertex buffer in a single GPU draw call. Sub-millisecond bounding-sphere raycast telemetry queries.
* **Technical Whitepaper:** [`docs/ORBITAL_COMMAND_TECHNICAL_REPORT.md`](docs/ORBITAL_COMMAND_TECHNICAL_REPORT.md)
* **Stack:** WebGL, Three.js, React, SGP4 Analytical Propagator.

### 2. [Math Logic Engine](https://samar-math-logic.streamlit.app/) — *Symbolic Calculus & AST Transformation CAS*
* **Core Problem:** Generating step-by-step symbolic derivation transcripts for competitive engineering calculus (JEE Advanced & EJU) rather than black-box numeric answers.
* **Architecture:** Recursive descent lexer/parser generates an immutable Abstract Syntax Tree (AST); pattern-matching rewrite rules execute differentiation and integration by parts (LIATE heuristic) with algebraic simplification passes.
* **Edge Cases & Failure Analysis:** Explicitly handles non-elementary integrals (Liouville's theorem) with domain boundary warnings.
* **Technical Whitepaper:** [`docs/MATH_LOGIC_ENGINE_TECHNICAL_REPORT.md`](docs/MATH_LOGIC_ENGINE_TECHNICAL_REPORT.md)
* **Stack:** Python, Symbolic AST Grammar, LaTeX Rendering, Streamlit.

### 3. [Quantum Wave Simulation Suite](https://thedarkxh.github.io/) — *Wave-Particle Duality & Interference*
* **Core Problem:** Real-time numerical discretization of the 2D Schrödinger wave equation and phase-coherent wavepacket propagation.
* **Physics:** Computes spatial wave superposition ($\psi(\mathbf{r}, t) = A e^{i(\mathbf{k}\cdot\mathbf{r} - \omega t)}$) across Young's double-slit geometries, verifying asymptotic convergence onto theoretical Fresnel-Kirchhoff diffraction patterns.
* **Stack:** HTML5 Canvas, WebGL, JavaScript, Computational Wave Mechanics.

---

## ⚡ Directed AI Engineering & Academic Integrity

I use modern AI-assisted engineering workflows (Claude Code, Antigravity, Hermes) to accelerate implementation while retaining full responsibility for:
1. **Mathematical Theory & Physical Modeling:** Deriving equations, reference frames, and algorithms.
2. **System Architecture & Data Schemas:** Defining pipeline boundaries, memory budgets, and state stores.
3. **Formal Verification & Profiling:** Profiling runtime allocations, debugging numerical edge cases, and auditing against real datasets.
4. **Technical Defensibility:** Fully understanding and defending every engineering trade-off in an academic review.

*Read the full methodology:* [`docs/AI_ASSISTED_ENGINEERING_WORKFLOW.md`](docs/AI_ASSISTED_ENGINEERING_WORKFLOW.md)

---

## 🛠️ Technical Capabilities & Toolkit

* **Computational Physics & Math:** Orbital Mechanics (SGP4), Coordinate Reference Transforms, Symbolic AST Grammars, Classical Kinematics, Linear Algebra, Vector Calculus.
* **Languages & Low-Level:** Python, C, x86_64 / ARM Assembly fundamentals, JavaScript / TypeScript, Bash, LaTeX.
* **Systems & Graphics:** WebGL, Three.js, GPU Buffer Instancing (`Float32Array`), Docker, Linux / POSIX.
* **Hardware & Electronics:** Tesla Coil / High-voltage plasma apparatus, AM Radio circuitry, 10M Precision Air Pistol match biomechanics.

---

## 🏆 Athletic Distinctions & Extracurriculars

* **NRAI National Shooting Championship (10M Air Pistol):** National Rank **822** (Shooter ID: `PSHM2411200901`).
* **Government Interschool District Shooting Championship:** **Silver Medalist** (Qualified for State Championship).
* **Taekwondo (Heroes Cup):** **Silver and Bronze Medalist** in Poomsae.
* *Athletic discipline builds the intense focus, mental stamina, and precision required for engineering research.*

---

## 🎯 Target Undergraduate Programs (Japan 2027)

* **Tokyo Institute of Technology (Institute of Science Tokyo):** School of Science / Dept. of Physics & Systems Engineering.
* **Kyoto University:** Faculty of Science / Department of Physics (Astrophysics & Theoretical Modeling).
* **Tohoku University:** School of Engineering (Information Science & Mechanical Aerospace).

---

## 📫 Contact & Connect

* **Portfolio:** [https://thedarkxh.github.io/](https://thedarkxh.github.io/)
* **LinkedIn:** [https://www.linkedin.com/in/samar-maharia/](https://www.linkedin.com/in/samar-maharia/)
* **Email:** samar.aditya.jp@gmail.com
