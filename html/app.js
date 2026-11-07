/*
    Speedometer cluster — NUI
    API mengikuti jgvrp-speedometer-template:
        setEngine, setSpeed, setRPM, setFuel, setHealth, setGear,
        setHeadlights, setLeftIndicator, setRightIndicator, setSeatbelts,
        setSpeedMode, setOdometer
*/
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DIM_TICK = '#242424';

  const UNIT_FACTORS = [3.6, 2.2369363, 1.9438445];      // m/s -> km/h, mph, knot
  const UNIT_LABELS = ['km/h', 'mph', 'kn'];

  const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
  const isNum = (value) => typeof value === 'number' && isFinite(value);

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    if (attrs) {
      for (const key in attrs) node.setAttribute(key, attrs[key]);
    }
    if (parent) parent.appendChild(node);
    return node;
  }

  function poly(list) {
    return list.map((point) => point.join(',')).join(' ');
  }

  /* ── state ───────────────────────────────────────────────────────── */
  const state = {
    engine: false,
    speed: 0,
    rpm: 0,
    fuel: 0,
    health: 1,
    gear: 'N',
    headlights: 0,
    left: false,
    right: false,
    seatbelt: false,
    odo: 0,
    trip: 0,
    unit: 0,
  };

  const cluster = document.getElementById('cluster');
  const wrap = document.getElementById('wrap');

  let messageCount = 0;
  let demoStarted = false;

  /* ══════════════════════════════════════════════════════════════════
     TACHOMETER
     ══════════════════════════════════════════════════════════════════ */
  // redline bisa diatur dari Lua (Config.Redline) atau API.setRedline(start, finish)
  const ARC = { cx: 520, cy: 170, rx: 400, ry: 150, px: 520, py: 300, count: 100, redline: 0.8, redlineEnd: 1 };
  const MAX_TACH = 10;                                   // x1000 r/min di ujung skala

  const ticks = [];
  let litTicks = -1;

  function arcPoint(deg) {
    const rad = (deg * Math.PI) / 180;
    return [ARC.cx + ARC.rx * Math.cos(rad), ARC.cy - ARC.ry * Math.sin(rad)];
  }

  // geometri + warna satu tick (dihitung ulang saat zona redline berubah)
  function tickSpec(i) {
    const t = i / ARC.count;
    const point = arcPoint(162 - 144 * t);
    const dx = ARC.px - point[0];
    const dy = ARC.py - point[1];
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist;
    const uy = dy / dist;

    const red = t >= ARC.redline - 1e-9 && t <= ARC.redlineEnd + 1e-9;
    let length;
    let width;
    let color;
    let cap = 'butt';

    if (i === 0) {
      length = 70;
      width = 5;
      color = '#ffffff';
      cap = 'round';
    } else if (red) {
      const u = (t - ARC.redline) / Math.max(0.001, ARC.redlineEnd - ARC.redline);
      length = 30 + 50 * Math.pow(u, 1.25);
      width = 3.4 + 1.4 * u;
      color = '#ff2b1f';
    } else {
      length = 20 + 16 * t;
      width = 1 + 2.8 * t;
      const shade = Math.round(120 + 135 * Math.min(1, t * 1.7));
      color = 'rgb(' + shade + ',' + shade + ',' + shade + ')';
    }

    return { point: point, ux: ux, uy: uy, length: length, width: width, color: color, red: red, cap: cap };
  }

  function buildTicks() {
    const group = document.getElementById('ticks');

    for (let i = 0; i <= ARC.count; i++) {
      const spec = tickSpec(i);

      const node = el('line', {
        x1: spec.point[0].toFixed(1),
        y1: spec.point[1].toFixed(1),
        x2: (spec.point[0] + spec.ux * spec.length).toFixed(1),
        y2: (spec.point[1] + spec.uy * spec.length).toFixed(1),
        stroke: DIM_TICK,
        'stroke-width': spec.width.toFixed(2),
        'stroke-linecap': spec.cap,
      }, group);

      ticks.push({ node: node, color: spec.color, red: spec.red });
    }

    const mini = document.getElementById('mini');
    for (let k = 1; k <= 21; k++) {
      const t = k / 22;
      if (t > 0.74) continue;

      const point = arcPoint(162 - 144 * t);
      const dx = ARC.px - point[0];
      const dy = ARC.py - point[1];
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const offset = 46 + 10 * t;
      const length = k % 2 ? 6 : 9;

      el('line', {
        x1: (point[0] + ux * offset).toFixed(1),
        y1: (point[1] + uy * offset).toFixed(1),
        x2: (point[0] + ux * (offset + length)).toFixed(1),
        y2: (point[1] + uy * (offset + length)).toFixed(1),
      }, mini);
    }
  }

  function paintTick(index, on) {
    const tick = ticks[index];
    if (!tick) return;
    // Zona redline selalu merah (seperti referensi), tick lain menyala progresif.
    if (tick.red) {
      tick.node.setAttribute('stroke', tick.color);
      tick.node.setAttribute('filter', 'url(#glow)');
      tick.node.setAttribute('opacity', on ? '1' : '0.62');
      return;
    }
    tick.node.setAttribute('stroke', on ? tick.color : DIM_TICK);
    tick.node.removeAttribute('filter');
  }

  /* Atur ulang zona redline. start & finish dalam persen (0–1) skala penuh. */
  function applyRedline(start, finish) {
    if (isNum(start)) ARC.redline = clamp(start, 0, 0.98);
    if (isNum(finish)) ARC.redlineEnd = clamp(finish, 0.02, 1);
    else ARC.redlineEnd = 1;
    if (ARC.redlineEnd <= ARC.redline) {
      ARC.redlineEnd = Math.min(1, ARC.redline + 0.02);
    }

    ticks.forEach(function (tick, i) {
      const spec = tickSpec(i);
      tick.color = spec.color;
      tick.red = spec.red;
      tick.node.setAttribute('stroke-width', spec.width.toFixed(2));
      tick.node.setAttribute('stroke-linecap', spec.cap);
    });

    litTicks = -1;
    paintTach();
  }

  const NUMBERS = [
    { value: 0, x: 218, y: 158 },
    { value: 1, x: 256, y: 137 },
    { value: 2, x: 310, y: 115 },
    { value: 3, x: 367, y: 96 },
    { value: 4, x: 428, y: 83 },
    { value: 5, x: 487, y: 76 },
    { value: 6, x: 547, y: 76 },
    { value: 7, x: 607, y: 84 },
    { value: 8, x: 678, y: 98 },
    { value: 8, x: 750, y: 124, red: true, text: '8' },
    { value: 9, x: 806, y: 151, red: true },
  ];

  const numberNodes = [];

  function buildNumbers() {
    const group = document.getElementById('numbers');

    NUMBERS.forEach(function (spec) {
      const node = el('text', { x: spec.x, y: spec.y, class: 'num' }, group);
      node.textContent = spec.text || String(spec.value);
      numberNodes.push({ node: node, spec: spec });
    });
  }

  function paintNumbers(tachValue) {
    numberNodes.forEach(function (item) {
      const spec = item.spec;
      const on = spec.value === 0 || tachValue >= spec.value - 0.001;
      item.node.classList.toggle('on', on || !!spec.red);
      item.node.classList.toggle('red', !!spec.red);
    });
  }

  function paintTach() {
    const ratio = clamp(isNum(state.rpm) ? state.rpm : 0, 0, 1);
    const target = Math.round(ratio * ARC.count);

    if (target !== litTicks) {
      if (litTicks < 0) {
        for (let i = 0; i < ticks.length; i++) paintTick(i, i <= target);
      } else if (target > litTicks) {
        for (let i = litTicks + 1; i <= target; i++) paintTick(i, true);
      } else {
        for (let i = target + 1; i <= litTicks; i++) paintTick(i, false);
      }
      litTicks = target;
    }

    paintNumbers(ratio * MAX_TACH);
  }

  /* ══════════════════════════════════════════════════════════════════
     SEVEN SEGMENT
     ══════════════════════════════════════════════════════════════════ */
  function H(x1, x2, y) {
    const s = 4;
    return [[x1, y], [x1 + s, y - s], [x2 - s, y - s], [x2, y], [x2 - s, y + s], [x1 + s, y + s]];
  }

  function V(x, y1, y2) {
    const s = 4;
    return [[x, y1], [x + s, y1 + s], [x + s, y2 - s], [x, y2], [x - s, y2 - s], [x - s, y1 + s]];
  }

  const SEG = {
    a: H(8, 32, 4),
    g: H(8, 32, 32),
    d: H(8, 32, 60),
    f: V(4, 8, 29),
    b: V(36, 8, 29),
    e: V(4, 35, 56),
    c: V(36, 35, 56),
  };

  const DIGITS = {
    0: 'abcdef',
    1: 'bc',
    2: 'abged',
    3: 'abgcd',
    4: 'fgbc',
    5: 'afgcd',
    6: 'afgecd',
    7: 'abc',
    8: 'abcdefg',
    9: 'abfgcd',
  };

  function makeDigit(parent, x, y, scale) {
    const group = el('g', { transform: 'translate(' + x + ' ' + y + ') scale(' + scale + ') skewX(-8)' }, parent);
    const segments = {};

    for (const key in SEG) {
      segments[key] = el('polygon', { points: poly(SEG[key]), class: 'seg' }, group);
    }

    return segments;
  }

  function paintDigit(segments, char) {
    const on = DIGITS[String(char)] || '';
    for (const key in segments) {
      segments[key].classList.toggle('on', on.indexOf(key) > -1);
    }
  }

  /* ── kecepatan ──────────────────────────────────────────────────── */
  let speedSlots = [];
  let speedText = '';

  function buildSpeed() {
    const group = document.getElementById('speed');
    const slots = [];

    for (let i = 0; i < 3; i++) {
      const transform = 'translate(' + (468 + i * 47) + ' 108) scale(.97) skewX(-8)';

      const ghost = el('g', { transform: transform }, group);
      for (const key in SEG) el('polygon', { points: poly(SEG[key]), class: 'seg' }, ghost);

      const live = el('g', { transform: transform }, group);
      const segments = {};
      for (const key in SEG) segments[key] = el('polygon', { points: poly(SEG[key]), class: 'seg' }, live);

      slots.push(segments);
    }

    return slots;
  }

  function paintSpeed(force) {
    const factor = UNIT_FACTORS[state.unit] || UNIT_FACTORS[0];
    const value = Math.max(0, Math.min(999, Math.round((state.speed || 0) * factor)));
    const text = String(value).padStart(3, ' ');

    if (!force && text === speedText) return;
    speedText = text;

    for (let i = 0; i < 3; i++) paintDigit(speedSlots[i], text[i]);
  }

  function paintUnits() {
    const primary = document.getElementById('unit-primary');
    const secondary = document.getElementById('unit-secondary');

    primary.textContent = UNIT_LABELS[state.unit];
    secondary.textContent = state.unit === 0 ? UNIT_LABELS[1] : UNIT_LABELS[0];
  }

  /* ── odometer & trip ────────────────────────────────────────────── */
  let odoSlots = [];
  let odoText = '';

  function buildOdometer() {
    const group = document.getElementById('odo');
    const slots = [];

    for (let i = 0; i < 6; i++) slots.push(makeDigit(group, 420 + i * 17, 207, 0.3));
    for (let i = 0; i < 4; i++) slots.push(makeDigit(group, 541 + i * 17 + (i === 3 ? 4 : 0), 207, 0.3));

    el('circle', { cx: 591, cy: 213, r: 1.4, fill: '#8a8a8a' }, group);

    return slots;
  }

  function paintOdometer() {
    const odo = String(Math.floor(clamp(state.odo || 0, 0, 999999))).padStart(6, '0');
    const trip = String(Math.floor(clamp((state.trip || 0) * 10, 0, 9999))).padStart(4, '0');
    const text = odo + trip;

    if (text === odoText) return;
    odoText = text;

    for (let i = 0; i < 10; i++) paintDigit(odoSlots[i], text[i]);
  }

  /* ── bar temperatur & bensin ────────────────────────────────────── */
  const tempSegments = [];
  const fuelSegments = [];
  let fuelReserve = null;
  let litTemp = -1;
  let litFuel = -1;
  let reserveOn = null;

  function buildBars() {
    const temp = document.getElementById('temp');
    for (let i = 0; i < 8; i++) {
      tempSegments.push(el('rect', { x: 106 + i * 18.3, y: 182, width: 16.5, height: 12, class: 'bar bar-dim' }, temp));
    }

    const fuel = document.getElementById('fuel');
    fuelReserve = el('rect', { x: 800, y: 181, width: 4, height: 15, class: 'bar bar-dim-red' }, fuel);
    for (let i = 0; i < 10; i++) {
      fuelSegments.push(el('rect', { x: 808 + i * 13.2, y: 183, width: 10.6, height: 11, class: 'bar bar-dim' }, fuel));
    }
  }

  function paintTemperature() {
    const health = clamp(isNum(state.health) ? state.health : 1, 0, 1);
    const lit = state.engine ? clamp(2 + Math.round((1 - health) * 6), 0, 8) : 0;

    if (lit === litTemp) return;
    litTemp = lit;

    for (let i = 0; i < 8; i++) {
      const on = i < lit;
      const tone = on ? (i >= 6 ? 'bar-hot' : 'bar-lit') : 'bar-dim';
      tempSegments[i].setAttribute('class', 'bar ' + tone);
    }
  }

  function paintFuel() {
    const fuel = clamp(isNum(state.fuel) ? state.fuel : 0, 0, 1);
    const lit = clamp(Math.round(fuel * 10), 0, 10);

    if (lit !== litFuel) {
      litFuel = lit;
      for (let i = 0; i < 10; i++) {
        fuelSegments[i].setAttribute('class', 'bar ' + (i < lit ? 'bar-lit' : 'bar-dim'));
      }
    }

    const reserve = fuel <= 0.12;
    if (reserve !== reserveOn) {
      reserveOn = reserve;
      fuelReserve.setAttribute('class', 'bar ' + (reserve ? 'bar-hot' : 'bar-dim-red'));
    }
  }

  /* ── baris status ───────────────────────────────────────────────── */
  const turnLeft = document.getElementById('turn-left');
  const turnRight = document.getElementById('turn-right');
  const belt = document.getElementById('belt');
  const headlight = document.getElementById('headlight');
  const gearNode = document.getElementById('gear');
  const gearArrow = document.getElementById('gear-arrow');

  let previousGear = null;
  let arrowTimer = 0;

  // Panah shift seperti template terbaru: ▲ hijau saat naik, ▼ merah saat turun.
  function showGearArrow(direction) {
    gearArrow.textContent = direction === 'up' ? '▲' : '▼';
    if (!gearArrow.classList.contains(direction)) {
      gearArrow.classList.remove('up', 'down');
      gearArrow.classList.add(direction);
    }
    clearTimeout(arrowTimer);
    arrowTimer = setTimeout(function () {
      gearArrow.classList.remove('up', 'down');
    }, 700);
  }

  function paintStatus() {
    turnLeft.classList.toggle('on', !!state.left);
    turnRight.classList.toggle('on', !!state.right);

    belt.classList.toggle('on', !!state.seatbelt);
    belt.classList.toggle('off', !state.seatbelt);

    headlight.classList.toggle('on', state.headlights >= 1);
    headlight.classList.toggle('high', state.headlights >= 2);

    gearNode.textContent = state.gear || 'N';
  }

  /* ══════════════════════════════════════════════════════════════════
     API (kompatibel template)
     ══════════════════════════════════════════════════════════════════ */
  const API = {
    setEngine: function (value) {
      state.engine = !!value;
      cluster.classList.toggle('off', !state.engine);
      paintTemperature();
    },

    setSpeed: function (value) {
      if (!isNum(value)) return;
      state.speed = Math.max(0, value);
      paintSpeed();
    },

    setRPM: function (value) {
      if (!isNum(value)) return;
      let rpm = value;
      if (rpm > 1) rpm = rpm / 10000;                     // terima juga RPM mentah (mis. 2500)
      state.rpm = clamp(rpm, 0, 1);
      paintTach();
    },

    setFuel: function (value) {
      if (!isNum(value)) return;
      state.fuel = clamp(value > 1 ? value / 100 : value, 0, 1);
      paintFuel();
    },

    setHealth: function (value) {
      if (!isNum(value)) return;
      state.health = clamp(value > 1 ? value / 1000 : value, 0, 1);
      paintTemperature();
    },

    setGear: function (value) {
      const gear = value === undefined || value === null ? 'N' : String(value);
      const numeric = parseInt(gear, 10);

      if (!isFinite(numeric)) {
        previousGear = null;
      } else if (gear !== state.gear) {
        if (previousGear !== null && numeric !== previousGear) {
          showGearArrow(numeric > previousGear ? 'up' : 'down');
        }
        previousGear = numeric;
      }

      state.gear = gear;
      paintStatus();
    },

    setHeadlights: function (value) {
      state.headlights = isNum(value) ? value : (value ? 1 : 0);
      paintStatus();
    },

    setLeftIndicator: function (value) {
      state.left = !!value;
      paintStatus();
    },

    setRightIndicator: function (value) {
      state.right = !!value;
      paintStatus();
    },

    setSeatbelts: function (value) {
      state.seatbelt = !!value;
      paintStatus();
    },

    setSpeedMode: function (mode) {
      let unit = 0;
      if (isNum(mode)) unit = mode;
      else if (typeof mode === 'string') {
        const key = mode.toLowerCase();
        if (key === 'mph' || key === 'miles') unit = 1;
        else if (key === 'kn' || key === 'knot' || key === 'knots') unit = 2;
      }

      state.unit = clamp(Math.floor(unit), 0, 2);
      paintUnits();
      paintSpeed(true);
    },

    setOdometer: function (distance) {
      if (!isNum(distance)) return;
      state.odo = Math.max(0, distance);
      paintOdometer();
    },

    setTrip: function (distance) {
      if (!isNum(distance)) return;
      state.trip = Math.max(0, distance);
      paintOdometer();
    },

    setRedline: function (start, finish) {
      if (start && typeof start === 'object') {
        const end = finish !== undefined ? finish : (start.finish !== undefined ? start.finish : start.end);
        applyRedline(start.start !== undefined ? start.start : start.begin, end);
        return;
      }
      applyRedline(start, finish === undefined ? 1 : finish);
    },
  };

  const SNAPSHOT_KEYS = {
    engine: 'setEngine',
    speed: 'setSpeed',
    rpm: 'setRPM',
    fuel: 'setFuel',
    health: 'setHealth',
    gear: 'setGear',
    headlights: 'setHeadlights',
    left: 'setLeftIndicator',
    right: 'setRightIndicator',
    seatbelt: 'setSeatbelts',
    odo: 'setOdometer',
    trip: 'setTrip',
    redline: 'setRedline',
  };

  function applySnapshot(data) {
    if (!data) return;
    for (const key in SNAPSHOT_KEYS) {
      if (data[key] !== undefined) API[SNAPSHOT_KEYS[key]](data[key]);
    }
  }

  function setVisible(visible) {
    wrap.classList.toggle('visible', !!visible);
  }

  function applyConfig(config) {
    if (!config) return;

    if (config.position === 'top' || config.position === 'bottom') {
      wrap.dataset.position = config.position;
    }
    if (isNum(config.scale)) wrap.style.setProperty('--hud-scale', String(clamp(config.scale, 0.5, 2)));
    if (isNum(config.offsetX)) wrap.style.setProperty('--hud-x', config.offsetX + 'px');
    if (isNum(config.offsetY)) wrap.style.setProperty('--hud-y', config.offsetY + 'px');
    if (isNum(config.unit)) API.setSpeedMode(config.unit);

    if (config.redline && typeof config.redline === 'object') {
      const end = config.redline.finish !== undefined ? config.redline.finish : config.redline.end;
      API.setRedline(config.redline.start, end);
    } else if (isNum(config.redline)) {
      API.setRedline(config.redline, 1);
    }

    cluster.classList.toggle('no-status', config.showStatusRow === false);
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOT
     ══════════════════════════════════════════════════════════════════ */
  buildTicks();
  buildNumbers();
  speedSlots = buildSpeed();
  odoSlots = buildOdometer();
  buildBars();

  paintTach();
  paintUnits();
  paintSpeed(true);
  paintOdometer();
  paintTemperature();
  paintFuel();
  paintStatus();

  // fungsi global seperti pada template asli
  for (const name in API) window[name] = API[name];

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!message || typeof message !== 'object') return;

    messageCount++;

    if (message.action === 'update') {
      applySnapshot(message.data);
      return;
    }

    if (message.action === 'setVisible') {
      setVisible(message.data);
      return;
    }

    if (message.action === 'setConfig') {
      applyConfig(message.data);
      return;
    }

    const handler = API[message.action];
    if (typeof handler !== 'function') return;

    let value = message.data;
    if (value === undefined) value = message.value;
    if (value === undefined) value = message.state;

    handler(value);
  });

  /* ── mode demo ────────────────────────────────────────────────────
     Dipakai saat html/index.html dibuka langsung di browser (di luar FiveM)
     untuk mengembangkan tampilan. Di dalam game client mengirim pesan
     lebih dulu, jadi demo tidak pernah aktif. */
  function startDemo() {
    if (demoStarted) return;
    demoStarted = true;

    // Latar gelap hanya untuk mode demo/browser. Di FiveM body tetap transparan
    // supaya cluster menyatu dengan gambar game.
    document.body.classList.add('demo');

    applyConfig({ position: 'bottom', scale: 1, offsetX: 0, offsetY: 0, showStatusRow: true, unit: 0 });
    setVisible(true);
    API.setEngine(true);
    API.setSpeedMode(0);
    API.setGear('3');
    API.setHeadlights(1);
    API.setSeatbelts(true);

    let t = 0;
    setInterval(function () {
      t += 0.06;

      const speed = 27 + 21 * Math.sin(t * 0.55);
      API.setSpeed(Math.max(0, speed));
      API.setRPM(0.22 + 0.45 * Math.abs(Math.sin(t * 0.9)));
      API.setFuel(0.62 + 0.1 * Math.sin(t * 0.18));
      API.setHealth(0.9 - 0.18 * Math.abs(Math.sin(t * 0.12)));
      API.setGear(String(1 + Math.floor(Math.abs(Math.sin(t * 0.35)) * 5)));
      API.setOdometer(48213.4 + t * 0.42);
      API.setTrip(34.2 + t * 0.08);
      API.setLeftIndicator(t % 14 > 11 && Math.sin(t * 8) > 0);
      API.setRightIndicator(false);
    }, 60);
  }

  setTimeout(function () {
    if (messageCount === 0) startDemo();
  }, 1200);
})();
