/* ==========================================================================
   DELTA — INTERACTIVE 2D/3D SIMULATION & SCIENTIFIC VISUALIZATION ENGINES
   1. Slide 1: Hybrid Factory Proximity Hazard Simulation
   2. Slide 2: Hybrid -> Connected -> Dark Factory Scene Morph
   3. Slide 4: LiDAR/SLAM Blind Spots vs. UWB Shared Positioning (DS-TWR)
   4. Slide 5: Live Booth Demo Twin (Stationary AGV on S01 + Conveyor + Belt)
   5. Slide 6: ECharts Scientific Calibration & Spatial Accuracy Dashboard
   6. Q&A Cat 1: Three.js Interactive 3D CAD & Exploded Assembly Viewer
   ========================================================================== */

window.DELTA_CANVASES = (function () {
  let animFrameId = null;
  let previousFrame = performance.now();

  const boothStopCm = 100;
  const boothResumeCm = 120;
  const boothClearSamples = 3;
  const boothFrameSeconds = 1.7;
  const boothRadioEnd = 0.62;
  const boothGateEnd = 0.73;
  const boothUartEnd = 0.85;
  const boothAckEnd = 0.96;
  const boothPackets = ["GRANT", "POLL", "ACK", "FINAL", "REPORT"];
  const boothDistances = [168, 169, 170, 140, 116, 107, 94, 94, 110, 126, 137, 148];
  const boothFrames = [];
  let boothRunning = false;
  let boothClearCount = 0;
  let boothHasRun = false;

  // Replay the agvuart ProximityGate rules with illustrative distances.
  for (const cm of boothDistances) {
    const wasRunning = boothRunning;
    const hadRun = boothHasRun;
    if (cm < boothStopCm) {
      boothRunning = false;
      boothClearCount = 0;
    } else if (cm > boothResumeCm) {
      boothClearCount = Math.min(boothClearSamples, boothClearCount + 1);
      if (boothClearCount >= boothClearSamples) boothRunning = true;
    } else {
      boothClearCount = 0;
    }
    boothHasRun ||= boothRunning;
    boothFrames.push({cm, running: boothRunning, wasRunning, hadRun, clear: boothClearCount});
  }

  const boothDuration = boothFrames.length * boothFrameSeconds;
  const boothCaptions = {
    STARTUP: ["warn", "เริ่มต้นที่ STOP · รอระยะที่ใช้ได้"],
    RUN: ["safe", "Mega สั่งให้มอเตอร์วิ่ง"],
    "HOLD RUN": ["warn", "ระยะอยู่ในช่วงคงสถานะ · มอเตอร์ยังวิ่ง"],
    STOP: ["danger", "Mega สั่งหยุดมอเตอร์"],
    RECOVERY: ["recovery", "ระยะพ้นเกณฑ์ครบ 3 ตัวอย่าง · กลับมา RUN"]
  };
  let demoElapsed = 0;
  let demoAudio = null;
  let demoTone = null;
  let demoSnapshot;

  // Slide 6 ECharts instance
  let s6Chart = null;
  let s6ViewMode = "anchors"; // anchors | heatmap | bias

  // Three.js Q&A Viewer state
  let threeScene = null;
  let threeCamera = null;
  let threeRenderer = null;
  let threeGroup = null;
  let threeWireframe = false;
  let threeExplode = 0;
  let threeAutoRotate = true;
  let currentCadId = "agv_r20";

  function sampleBooth(elapsed) {
    const index = Math.min(boothFrames.length - 1, Math.floor(elapsed / boothFrameSeconds));
    const progress = Math.min(1, elapsed / boothFrameSeconds - index);
    const current = boothFrames[index], previous = boothFrames[index - 1];
    const stage = progress < boothRadioEnd ? "radio" : progress < boothGateEnd ? "gate" :
      progress < boothUartEnd ? "uart" : "motor";
    const decision = progress >= boothRadioEnd ? current : previous;
    const distance = decision?.cm ?? null;
    const sent = progress >= boothGateEnd ? current : previous;
    const applied = progress >= boothUartEnd ? current : previous;
    const running = applied?.running ?? false;
    const alarm = !running && !!applied?.hadRun;
    const ack = progress >= boothAckEnd ? current : previous;
    const packetClock = progress / boothRadioEnd * boothPackets.length;
    const packetIndex = Math.floor(packetClock);
    const radio = stage === "radio" ? {
      name: boothPackets[packetIndex],
      outbound: packetIndex !== 2 && packetIndex !== 4,
      progress: packetClock - packetIndex
    } : null;
    const uart = stage === "uart" ? {
      outbound: true, progress: (progress - boothGateEnd) / (boothUartEnd - boothGateEnd)
    } : progress >= boothUartEnd && progress < boothAckEnd ? {
      outbound: false, progress: (progress - boothUartEnd) / (boothAckEnd - boothUartEnd)
    } : null;
    const previousCm = previous?.cm ?? current.cm;
    const physicalCm = previousCm + (current.cm - previousCm) * Math.min(1, progress / boothRadioEnd);
    const travel = Math.max(0, Math.min(1, (physicalCm - 90) / 80));
    const withdrawing = current.hadRun && !current.wasRunning && current.cm > previousCm;
    const inBand = distance !== null && distance >= boothStopCm && distance <= boothResumeCm;
    const state = running ? (inBand ? "HOLD RUN" : applied.hadRun && !applied.wasRunning ? "RECOVERY" : "RUN") :
      (alarm ? "STOP" : "STARTUP");
    const command = sent ? sent.running ? "R" : "S" : "U";
    const gate = !decision ? "รอ REPORT" : inBand ? (decision.running ? "คง RUN" : "คง STOP") :
      distance < boothStopCm ? "ต่ำกว่า 1.00 m" : "ระยะพ้นเกณฑ์ " + decision.clear + "/3";

    return {distance, travel, withdrawing, state, running, alarm, stage, radio, uart, command, ack, gate};
  }

  function updateDemoTelemetry() {
    const d = demoSnapshot;
    const text = (id, value) => {
      const node = document.getElementById(id);
      if (node && node.textContent !== value) node.textContent = value;
    };
    const [style, caption] = boothCaptions[d.state];
    const status = document.querySelector("[data-demo-status]");
    const trace = document.querySelector("[data-demo-trace]");
    if (status && status.dataset.state !== style) status.dataset.state = style;
    if (trace && trace.dataset.step !== d.stage) trace.dataset.step = d.stage;
    text("tel-state-badge", d.state);
    text("tel-demo-caption", d.state === "STOP" && d.withdrawing ? "ดึง TAG Belt ถอยออก · Mega ยังสั่ง STOP" : caption);
    text("tel-distance", d.distance === null ? "— m" : (d.distance / 100).toFixed(2) + " m");
    text("tel-gate", "· " + d.gate);
    text("tel-packet", d.radio ? d.radio.name + (d.radio.outbound ? " · T1 → T2" : " · T2 → T1") : "REPORT · รับระยะแล้ว");
    text("tel-command", "AGV1 · C:" + d.command + (d.command === "R" ? " (RUN)" : d.command === "S" ? " (STOP)" : " (UNKNOWN)"));
    const output = d.running ? "RUN" : "STOP";
    const acknowledgement = d.uart ? (d.uart.outbound ? "กำลังส่ง C" : "กำลังตอบ ACK") :
      d.ack ? "ACK A:" + (d.ack.running ? "R" : "S") : "รอ ACK";
    text("tel-motor", output + " · " + acknowledgement);
    text("tel-conveyor", d.running ? "CONVEYOR RUN" : "CONVEYOR STOP");
    text("tel-buzzer", d.alarm ? "BUZZER ON" : "BUZZER OFF");
  }

  function setBoothTime(elapsed) {
    demoElapsed = Math.min(elapsed, boothDuration);
    demoSnapshot = sampleBooth(demoElapsed);
    updateDemoTelemetry();
  }

  function restartBoothDemo() {
    armDemoAudio();
    updateDemoBuzzer(false);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    setBoothTime(reduced ? boothDuration : 0);
  }


  function armDemoAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      demoAudio ||= new AudioContext();
      if (demoAudio.state === "suspended") demoAudio.resume().catch(() => {});
    } catch {
      // The visual alarm remains available when Web Audio is unavailable.
    }
  }

  function updateDemoBuzzer(active) {
    if (!active) {
      if (demoTone) {
        demoTone.osc.stop();
        demoTone.osc.disconnect();
        demoTone.gain.disconnect();
        demoTone = null;
      }
      return;
    }
    if (!demoAudio || demoAudio.state !== "running") return;
    const now = demoAudio.currentTime;
    if (!demoTone) {
      const osc = demoAudio.createOscillator(), gain = demoAudio.createGain();
      osc.type = "triangle";
      osc.frequency.value = 1040;
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(demoAudio.destination);
      osc.start();
      demoTone = {osc, gain, nextBeep: now};
    }
    if (now >= demoTone.nextBeep) {
      const volume = demoTone.gain.gain;
      volume.setValueAtTime(0, now);
      volume.linearRampToValueAtTime(0.095, now + 0.02);
      volume.setValueAtTime(0.095, now + 0.15);
      volume.linearRampToValueAtTime(0, now + 0.19);
      demoTone.nextBeep = now + 0.42;
    }
  }

  function initOrUpdateSlide6Chart(mode) {
    if (mode) s6ViewMode = mode;
    const container = document.getElementById("chart-slide6-main");
    if (!container || typeof echarts === "undefined") return;
    const chartStatus = document.querySelector("[data-calibration-status]");
    if (chartStatus) chartStatus.textContent = s6ViewMode === "heatmap"
      ? "Archived XY · ค่าคลาดเคลื่อนตำแหน่ง" : "Range RMSE · ก่อนและหลัง Calibration";

    if (!s6Chart) {
      s6Chart = echarts.init(container, null, { renderer: "canvas" });
    }

    const exp = window.DELTA_DATA.uwbExperiment;

    if (s6ViewMode === "anchors") {
      const categories = [...exp.anchors.map(anchor => anchor.id), "P9", "P9 + P1 return"];
      const rawData = [...exp.anchors.map(anchor => anchor.heldoutPooledRawCm), exp.centerP9.rawRmseCm, exp.overallPooled.rawRmseCm].map(v => +v.toFixed(2));
      const calData = [...exp.anchors.map(anchor => anchor.heldoutPooledCalCm), exp.centerP9.calRmseCm, exp.overallPooled.calRmseCm].map(v => +v.toFixed(2));

      s6Chart.setOption({
        backgroundColor: "transparent",
        color: ["#657b91", "#08a8ce"],
        animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(6, 10, 18, 0.94)",
          borderColor: "#00E5FF",
          textStyle: { color: "#F8FAFC", fontFamily: "Consolas", fontSize: 14 }
        },
        legend: {
          data: ["Raw Range RMSE (cm)", "Calibrated Range RMSE (cm)"],
          itemWidth: 16,
          itemHeight: 8,
          textStyle: { color: "#CBD5E1", fontFamily: "Segoe UI", fontSize: 14 },
          top: 4
        },
        grid: { left: 48, right: 24, top: 42, bottom: 44 },
        xAxis: {
          type: "category",
          data: categories,
          axisLabel: { color: "#CBD5E1", fontFamily: "Consolas", fontSize: 12, interval: 0 },
          axisLine: { lineStyle: { color: "rgba(148,163,184,0.3)" } }
        },
        yAxis: {
          type: "value",
          name: "RMSE (cm)",
          minInterval: 5,
          nameTextStyle: { color: "#94A3B8", fontFamily: "Consolas" },
          axisLabel: { color: "#94A3B8", fontFamily: "Consolas" },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.12)" } }
        },
        series: [
          {
            name: "Raw Range RMSE (cm)",
            type: "bar",
            data: rawData,
            barGap: "18%",
            itemStyle: { color: "#64748B", borderRadius: [4, 4, 0, 0] },
            label: { show: true, position: "top", color: "#94A3B8", fontFamily: "Consolas", fontSize: 10, formatter: "{c}" }
          },
          {
            name: "Calibrated Range RMSE (cm)",
            type: "bar",
            data: calData.map((value, i) => i === 3 ? {value, itemStyle: {color: "#10B981"}} : value),
            itemStyle: { color: "#00E5FF", borderRadius: [4, 4, 0, 0] },
            label: { show: true, position: "top", color: "#00E5FF", fontWeight: "bold", fontFamily: "Consolas", fontSize: 10.5, formatter: "{c}" }
          }
        ]
      }, true);
    } else if (s6ViewMode === "heatmap") {
      const points = exp.spatialGridPoints;
      const x = [...new Set(points.map(point => point.x))].sort((a,b) => a-b);
      const y = [...new Set(points.map(point => point.y))].sort((a,b) => a-b);
      const xLabels = x.map(value => value.toFixed(2) + " m");
      const yLabels = y.map(value => value.toFixed(2) + " m");
      const heatData = points.map(point => [
        x.indexOf(point.x), y.indexOf(point.y), point.radialRmseCm, point.id, point.n
      ]);

      s6Chart.setOption({
        backgroundColor: "transparent",
        animation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
        tooltip: {
          formatter: function (p) {
            return `<b>${p.data[3]}</b><br/>Archived radial RMSE: <b>${p.data[2]} cm</b><br/>Snapshots: ${p.data[4]}`;
          },
          backgroundColor: "rgba(6, 10, 18, 0.94)",
          borderColor: "#00E5FF",
          textStyle: { color: "#F8FAFC", fontFamily: "Consolas" }
        },
        grid: { left: 130, right: 70, top: 24, bottom: 40 },
        xAxis: {
          type: "category",
          data: xLabels,
          axisLabel: { color: "#CBD5E1", fontFamily: "Consolas", fontSize: 14 }
        },
        yAxis: {
          type: "category",
          data: yLabels,
          axisLabel: { color: "#CBD5E1", fontFamily: "Consolas", fontSize: 14 }
        },
        visualMap: {
          dimension: 2,
          min: 0,
          max: Math.ceil(Math.max(...points.map(point => point.radialRmseCm)) / 10) * 10,
          calculable: true,
          orient: "vertical",
          right: 8,
          top: "center",
          inRange: { color: ["#10B981", "#00E5FF", "#F59E0B", "#EF4444"] },
          textStyle: { color: "#CBD5E1", fontFamily: "Consolas" }
        },
        series: [
          {
            name: "Archived XY radial RMSE (cm)",
            type: "heatmap",
            encode: { x: 0, y: 1, value: 2 },
            data: heatData,
            label: {
              show: true,
              formatter: function (p) {
                return p.data[3] + " · " + p.data[2].toFixed(2) + " cm";
              },
              color: "#060A12",
              fontWeight: "bold",
              fontFamily: "Consolas",
              fontSize: 14
            }
          }
        ]
      }, true);
    }

    s6Chart.resize();
  }

  /* ------------------------------------------------------------------------
     Q&A CATEGORY 1: THREE.JS 3D CAD & EXPLODED ASSEMBLY VIEWER
     ------------------------------------------------------------------------ */
  function initThreeCadViewer() {
    const container = document.getElementById("qa-three-stage");
    if (!container || typeof THREE === "undefined") return;

    if (!threeRenderer) {
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width, 320);
      const h = Math.max(rect.height, 260);

      threeScene = new THREE.Scene();
      threeCamera = new THREE.PerspectiveCamera(42, w / h, 1, 2000);
      threeCamera.position.set(190, 145, 210);
      threeCamera.lookAt(0, 15, 0);

      threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      threeRenderer.setSize(w, h);
      threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      container.innerHTML = "";
      container.appendChild(threeRenderer.domElement);

      const ambLight = new THREE.AmbientLight(0xffffff, 0.75);
      threeScene.add(ambLight);

      const dirLight1 = new THREE.DirectionalLight(0x00e5ff, 0.9);
      dirLight1.position.set(150, 250, 180);
      threeScene.add(dirLight1);

      const dirLight2 = new THREE.DirectionalLight(0x3b82f6, 0.6);
      dirLight2.position.set(-150, -100, -140);
      threeScene.add(dirLight2);

      const grid = new THREE.GridHelper(260, 14, 0x00e5ff, 0x1e293b);
      grid.position.y = -35;
      threeScene.add(grid);

      threeGroup = new THREE.Group();
      threeScene.add(threeGroup);

      // Mouse drag rotation
      let isDragging = false;
      let prevX = 0;
      let prevY = 0;
      threeRenderer.domElement.addEventListener("mousedown", (e) => {
        isDragging = true;
        threeAutoRotate = false;
        prevX = e.clientX;
        prevY = e.clientY;
      });
      window.addEventListener("mouseup", () => { isDragging = false; });
      window.addEventListener("mousemove", (e) => {
        if (!isDragging || !threeGroup) return;
        const dx = e.clientX - prevX;
        const dy = e.clientY - prevY;
        threeGroup.rotation.y += dx * 0.01;
        threeGroup.rotation.x = Math.max(-1.1, Math.min(1.1, threeGroup.rotation.x + dy * 0.01));
        prevX = e.clientX;
        prevY = e.clientY;
      });
    }

    buildProceduralCadAssembly(currentCadId);
  }

  function buildProceduralCadAssembly(modelId) {
    currentCadId = modelId;
    if (!threeGroup) return;
    while (threeGroup.children.length > 0) {
      threeGroup.remove(threeGroup.children[0]);
    }

    const matCyan = new THREE.MeshStandardMaterial({ color: 0x00e5ff, metalness: 0.35, roughness: 0.35, wireframe: threeWireframe });
    const matBlue = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.45, roughness: 0.3, wireframe: threeWireframe });
    const matDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5, roughness: 0.4, wireframe: threeWireframe });
    const matGreen = new THREE.MeshStandardMaterial({ color: 0x10b981, metalness: 0.3, roughness: 0.4, wireframe: threeWireframe });
    const matAmber = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.3, roughness: 0.4, wireframe: threeWireframe });

    const addPart = (geo, mat, basePos, explodeVec) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.basePos = basePos;
      mesh.userData.explodeVec = explodeVec;
      mesh.position.set(
        basePos[0] + explodeVec[0] * threeExplode,
        basePos[1] + explodeVec[1] * threeExplode,
        basePos[2] + explodeVec[2] * threeExplode
      );
      threeGroup.add(mesh);
    };

    if (modelId === "agv_r20" || modelId === "stand_s01") {
      // S01 Free-Wheel Display Stand (160 x 78 x 190 scaled)
      addPart(new THREE.BoxGeometry(96, 18, 110), matDark, [0, -24, 0], [0, -35, 0]);
      // N01 Chassis Base (120 x 5 x 160)
      addPart(new THREE.BoxGeometry(105, 6, 135), matBlue, [0, -6, 0], [0, 0, 0]);
      // Left & Right Dual-Shaft TT Motors + Wheels (elevated on S01)
      const wheelGeo = new THREE.CylinderGeometry(24, 24, 12, 28);
      wheelGeo.rotateZ(Math.PI / 2);
      addPart(wheelGeo, matAmber, [-60, -8, -22], [-45, 0, 0]);
      addPart(wheelGeo, matAmber, [60, -8, -22], [45, 0, 0]);
      // P01A Lower Enclosure Base
      addPart(new THREE.BoxGeometry(78, 30, 78), matCyan, [0, 14, -10], [0, 26, 0]);
      // P01B Upper UWB Radio Tower + OLED
      addPart(new THREE.BoxGeometry(64, 34, 52), matGreen, [0, 46, -10], [0, 62, 0]);
    } else if (modelId === "belt_r18a") {
      // P06 Closed Loop Belt Backplate
      addPart(new THREE.BoxGeometry(92, 58, 10), matDark, [0, 0, -26], [0, 0, -45]);
      // P01 Housing (82 x 74 x 38.4)
      addPart(new THREE.BoxGeometry(82, 74, 32), matBlue, [0, 0, 0], [0, 0, 0]);
      // P03 Insulating Tray + LiPo + INA226 + UWB Board
      addPart(new THREE.BoxGeometry(70, 62, 12), matGreen, [0, 0, 12], [0, 25, 22]);
      // P02 Front Cover + SSD1315 OLED Retainer
      addPart(new THREE.BoxGeometry(82, 74, 8), matCyan, [0, 0, 24], [0, 0, 52]);
    } else if (modelId === "anchor_r05") {
      // P01 Base (94 x 68 x 16)
      addPart(new THREE.BoxGeometry(94, 18, 68), matBlue, [0, -8, 0], [0, -30, 0]);
      // ESP32 UWB DW1000 PCB
      addPart(new THREE.BoxGeometry(82, 4, 54), matGreen, [0, 4, 0], [0, 0, 0]);
      // Dual Aluminum Heatsinks (ESP32 + UWB)
      addPart(new THREE.BoxGeometry(22, 12, 22), matAmber, [-18, 14, 0], [-15, 25, 0]);
      addPart(new THREE.BoxGeometry(20, 12, 20), matAmber, [18, 14, 0], [15, 25, 0]);
      // P02 Clean Vented Lid
      addPart(new THREE.BoxGeometry(94, 8, 68), matCyan, [0, 22, 0], [0, 48, 0]);
    } else {
      // Conveyor 450mm + Relay R01
      addPart(new THREE.BoxGeometry(165, 22, 46), matBlue, [-20, 0, 0], [-20, 0, 0]);
      addPart(new THREE.BoxGeometry(18, 28, 52), matAmber, [-92, 6, 0], [-45, 25, 0]);
      addPart(new THREE.BoxGeometry(18, 28, 52), matAmber, [52, 6, 0], [25, 25, 0]);
      addPart(new THREE.BoxGeometry(55, 32, 45), matCyan, [85, 4, 0], [50, 30, 0]);
    }

    // Attempt to load actual binary STL in background if browser allows fetch
    const modelMeta = window.DELTA_DATA.hardwareModels.find((m) => m.id === modelId);
    if (modelMeta && modelMeta.stlFiles && modelMeta.stlFiles.length > 0 && typeof THREE.STLLoader !== "undefined") {
      const loader = new THREE.STLLoader();
      modelMeta.stlFiles.forEach((stlDef, idx) => {
        loader.load(
          stlDef.path,
          (geometry) => {
            if (currentCadId !== modelId) return;
            if (idx === 0) {
              while (threeGroup.children.length > 0) threeGroup.remove(threeGroup.children[0]);
            }
            geometry.computeVertexNormals();
            geometry.center();
            const mat = new THREE.MeshStandardMaterial({
              color: stlDef.color || 0x00e5ff,
              metalness: 0.35,
              roughness: 0.35,
              wireframe: threeWireframe
            });
            const mesh = new THREE.Mesh(geometry, mat);
            mesh.rotation.x = -Math.PI / 2;
            const base = stlDef.offset || [0, 0, 0];
            const expVec = [base[0] * 0.6, (idx - 0.5) * 38, base[2] * 0.4];
            mesh.userData.basePos = [base[0], base[2], base[1]];
            mesh.userData.explodeVec = expVec;
            mesh.position.set(
              mesh.userData.basePos[0] + expVec[0] * threeExplode,
              mesh.userData.basePos[1] + expVec[1] * threeExplode,
              mesh.userData.basePos[2] + expVec[2] * threeExplode
            );
            threeGroup.add(mesh);
          },
          undefined,
          () => {
            // Keep procedural CAD assembly when opened via local file:// protocol
          }
        );
      });
    }
  }

  function updateThreeExplode(val) {
    threeExplode = parseFloat(val) || 0;
    if (!threeGroup) return;
    threeGroup.children.forEach((mesh) => {
      const b = mesh.userData.basePos || [0, 0, 0];
      const e = mesh.userData.explodeVec || [0, 0, 0];
      mesh.position.set(
        b[0] + e[0] * threeExplode,
        b[1] + e[1] * threeExplode,
        b[2] + e[2] * threeExplode
      );
    });
  }

  function toggleThreeWireframe() {
    threeWireframe = !threeWireframe;
    if (!threeGroup) return;
    threeGroup.children.forEach((mesh) => {
      if (mesh.material) mesh.material.wireframe = threeWireframe;
    });
  }

  /* ------------------------------------------------------------------------
     MAIN ANIMATION LOOP (60 FPS TARGET)
     ------------------------------------------------------------------------ */
  function tick(now) {
    const dt = Math.min(0.05, (now - previousFrame) / 1000);
    previousFrame = now;
    const demoVisible = !document.hidden && document.querySelector('.slide.active[data-slide="6"]') &&
        !document.querySelector("#qa-overlay.open");
    if (demoVisible && demoElapsed < boothDuration) setBoothTime(demoElapsed + dt);
    updateDemoBuzzer(demoVisible && demoSnapshot.alarm);

    // Render Q&A Three.js if Q&A overlay is open
    const qaModal = document.getElementById("qa-overlay");
    if (qaModal && qaModal.classList.contains("open") && threeRenderer && threeScene && threeCamera) {
      if (threeAutoRotate && threeGroup) {
        threeGroup.rotation.y += 0.008;
      }
      threeRenderer.render(threeScene, threeCamera);
    }

    animFrameId = requestAnimationFrame(tick);
  }

  function start() {
    if (!animFrameId) {
      setBoothTime(0);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) updateDemoBuzzer(false);
      });
      animFrameId = requestAnimationFrame(tick);
    }
  }

  return {
    start,
    getDemoSnapshot: () => demoSnapshot,
    restartBoothDemo,
    finishBoothDemo: () => setBoothTime(boothDuration),
    initOrUpdateSlide6Chart,
    initThreeCadViewer,
    selectCadModel: function (id) { buildProceduralCadAssembly(id); },
    updateThreeExplode,
    toggleThreeWireframe,
    toggleThreeAutoRotate: function () { threeAutoRotate = !threeAutoRotate; }
  };
})();
