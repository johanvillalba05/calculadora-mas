/* ============================================================
   MOVIMIENTO ARMÓNICO SIMPLE — Calculadora Interactiva
   script.js
   Autores: Luna Carretero · Dominyk Savino · Ivan Gutierrez
   UniEspinal · ITFIP · Física de Ondas
   ============================================================ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1. ESTADO GLOBAL DE LA APLICACIÓN
───────────────────────────────────────────────────────────── */

/** Instancia activa de Chart.js (se destruye y recrea al graficar) */
let masChart = null;

/** ID del frame de animación del oscilador */
let animFrame = null;

/** Timestamp de inicio de la animación del oscilador */
let animTimestamp = null;

/** Parámetros actuales usados por la animación del oscilador */
let currentA = 1;   // Amplitud
let currentW = 2;   // Frecuencia angular
let currentP = 0;   // Fase inicial


/* ─────────────────────────────────────────────────────────────
   2. UTILIDADES DOM
───────────────────────────────────────────────────────────── */

/**
 * Atajo para document.getElementById
 * @param {string} id
 * @returns {HTMLElement}
 */
const g = id => document.getElementById(id);

/**
 * Obtiene el valor numérico de un input por su id
 * @param {string} id
 * @returns {number}
 */
const gv = id => parseFloat(g(id).value);

/**
 * Verifica si un valor no es un número finito válido
 * @param {number} v
 * @returns {boolean}
 */
const isInvalid = v => !isFinite(v) || isNaN(v);


/* ─────────────────────────────────────────────────────────────
   3. UTILIDADES DE FORMATO
───────────────────────────────────────────────────────────── */

/**
 * Formatea un número con precisión completa.
 * Usa notación científica para valores muy grandes o muy pequeños.
 * @param {number} n - Número a formatear
 * @param {number} [decimals=6] - Decimales máximos
 * @returns {string}
 */
function fmt(n, decimals = 6) {
  if (!isFinite(n)) return 'Indef.';
  if (n === 0)      return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9 || (abs < 1e-6 && abs > 0)) {
    return n.toExponential(4);
  }
  return parseFloat(n.toFixed(decimals)).toString();
}

/**
 * Formatea un número para mostrar en las tarjetas de resultado.
 * Menos decimales que fmt() para mejor legibilidad.
 * @param {number} n
 * @returns {string}
 */
function fmtCard(n) {
  if (!isFinite(n)) return 'Indef.';
  if (n === 0)      return '0';
  const abs = Math.abs(n);
  if (abs >= 1e7 || (abs < 1e-4 && abs > 0)) {
    return n.toExponential(3);
  }
  return parseFloat(n.toFixed(5)).toString();
}

/**
 * Formatea un número para los ticks de los ejes de la gráfica.
 * Compacto y legible.
 * @param {number} v
 * @returns {string}
 */
function fmtAxis(v) {
  const abs = Math.abs(v);
  if (abs === 0)                           return '0';
  if (abs >= 1e5 || (abs < 0.001 && abs > 0)) return v.toExponential(1);
  if (abs >= 100) return parseFloat(v.toFixed(1)).toString();
  if (abs >= 1)   return parseFloat(v.toFixed(2)).toString();
  return parseFloat(v.toFixed(3)).toString();
}


/* ─────────────────────────────────────────────────────────────
   4. GESTIÓN DE PESTAÑAS (TABS)
───────────────────────────────────────────────────────────── */

/**
 * Cambia la pestaña activa entre Graficadora y Calculadora.
 * Actualiza clases CSS y atributos ARIA.
 * @param {string} tabName - 'g' para Graficadora, 'c' para Calculadora
 */
function switchTab(tabName) {
  ['g', 'c'].forEach(name => {
    const isActive = name === tabName;
    const btn   = g('tab-'   + name);
    const panel = g('panel-' + name);

    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
    panel.classList.toggle('active', isActive);
  });
}


/* ─────────────────────────────────────────────────────────────
   5. ANIMACIÓN DE TARJETAS DE RESULTADO
───────────────────────────────────────────────────────────── */

/**
 * Dispara la animación "pop" en un elemento de resultado.
 * Reinicia la animación si ya estaba activa.
 * @param {string} elementId
 */
function triggerPop(elementId) {
  const el = g(elementId);
  el.classList.remove('pop');
  /* Forzar reflow para reiniciar la animación CSS */
  void el.offsetWidth;
  el.classList.add('pop');
}


/* ─────────────────────────────────────────────────────────────
   6. MOSTRAR RESULTADO DEL SOLVER
───────────────────────────────────────────────────────────── */

/**
 * Muestra el resultado de un cálculo en el panel de respuesta.
 * @param {string} id       - ID sin prefijo (ej: 'A', 'w1', 'T1')
 * @param {string} valStr   - Valor formateado para mostrar
 * @param {string} [formula] - Paso a paso del cálculo
 */
function showSolverResult(id, valStr, formula) {
  const panel = g('sr-' + id);
  panel.classList.add('show');

  const valueEl   = g('srV-' + id);
  const formulaEl = g('srF-' + id);

  if (valueEl)   valueEl.textContent   = valStr;
  if (formulaEl) formulaEl.textContent = formula || '';
}


/* ─────────────────────────────────────────────────────────────
   7. CONSTRUCCIÓN DE PUNTOS PARA LA GRÁFICA
───────────────────────────────────────────────────────────── */

/**
 * Genera arrays de puntos {x, y} para Chart.js scatter mode.
 *
 * Se usa scatter en lugar de line porque el eje X es numérico
 * real — el modo line trata los labels como categorías y distorsiona
 * el espaciado de la gráfica.
 *
 * @param {number} A      - Amplitud
 * @param {number} w      - Frecuencia angular (rad/s)
 * @param {number} p      - Fase inicial (rad)
 * @param {number} tEnd   - Tiempo final del eje X
 * @param {number} numPts - Número de puntos a generar
 * @returns {{ pos: Array, vel: Array, acc: Array }}
 */
function buildChartPoints(A, w, p, tEnd, numPts) {
  const pos = [];
  const vel = [];
  const acc = [];

  const step = tEnd / numPts;

  for (let i = 0; i <= numPts; i++) {
    const ti    = step * i;
    /* Calcular fase sin redondeos intermedios para máxima precisión */
    const phase = w * ti + p;
    const xv    =  A * Math.cos(phase);
    const vv    = -A * w * Math.sin(phase);
    const av    = -A * w * w * Math.cos(phase);

    pos.push({ x: ti, y: xv });
    vel.push({ x: ti, y: vv });
    acc.push({ x: ti, y: av });
  }

  return { pos, vel, acc };
}


/* ─────────────────────────────────────────────────────────────
   8. CALCULADOR Y GRAFICADOR PRINCIPAL
───────────────────────────────────────────────────────────── */

/**
 * Lee los parámetros del formulario, calcula las magnitudes del MAS
 * en el tiempo t especificado, actualiza las tarjetas de resultado
 * y renderiza la gráfica con Chart.js.
 */
function calcular() {
  /* ── Leer y validar entradas ── */
  const A  = gv('amp');
  const w  = gv('omega');
  const p  = gv('phi');
  const t  = gv('tval');
  const np = parseInt(g('nper').value);

  if ([A, w, p, t].some(isInvalid)) {
    alert('Por favor completa todos los campos correctamente.');
    return;
  }
  if (w === 0) {
    alert('La frecuencia angular ω no puede ser 0.');
    return;
  }
  if (A <= 0) {
    alert('La amplitud A debe ser mayor que 0.');
    return;
  }

  /* Guardar parámetros actuales para la animación del oscilador */
  currentA = A;
  currentW = w;
  currentP = p;

  /* ── Cálculos de física ── */
  const T    = (2 * Math.PI) / Math.abs(w);   // Período
  const f    = 1 / T;                           // Frecuencia
  const vmax = A * Math.abs(w);                 // Velocidad máxima
  const amax = A * w * w;                       // Aceleración máxima

  /* Magnitudes exactas en el tiempo t especificado */
  const phase = w * t + p;
  const xv    =  A * Math.cos(phase);
  const vv    = -A * w  * Math.sin(phase);
  const av    = -A * w * w * Math.cos(phase);

  /* ── Actualizar tarjetas de resultado ── */
  g('tDisp').textContent = fmtCard(t);
  g('rv-x').textContent  = fmtCard(xv)   + ' m';
  g('rv-v').textContent  = fmtCard(vv)   + ' m/s';
  g('rv-a').textContent  = fmtCard(av)   + ' m/s²';
  g('dv-T').textContent  = fmtCard(T)    + ' s';
  g('dv-f').textContent  = fmtCard(f)    + ' Hz';
  g('dv-vm').textContent = fmtCard(vmax) + ' m/s';
  g('dv-am').textContent = fmtCard(amax) + ' m/s²';

  /* Animación de actualización */
  ['ri-x', 'ri-v', 'ri-a'].forEach(triggerPop);

  /* ── Actualizar ecuaciones mostradas ── */
  const phaseStr = (p !== 0) ? ` + ${fmt(p, 4)}` : '';
  g('eq-x').textContent = `${fmt(A, 4)} · cos(${fmt(Math.abs(w), 4)}t${phaseStr}) m`;

  const showVel = g('sV').checked;
  const showAcc = g('sA').checked;

  g('eq-vr').style.display = showVel ? '' : 'none';
  g('eq-ar').style.display = showAcc ? '' : 'none';
  g('eq-v').textContent = `−${fmt(vmax, 4)} · sin(${fmt(Math.abs(w), 4)}t${phaseStr}) m/s`;
  g('eq-a').textContent = `−${fmt(amax, 4)} · cos(${fmt(Math.abs(w), 4)}t${phaseStr}) m/s²`;

  /* ── Calcular rango temporal de la gráfica ──
     tEnd debe cubrir SIEMPRE el tiempo t solicitado.
     Se elige el máximo entre los períodos pedidos y t + T,
     así el marcador nunca queda fuera del eje X. */
  const tNatural = np * T;
  const tEnd     = Math.max(tNatural, t + T);

  /* ── Densidad de puntos ──
     150 puntos por período visible, con límites para rendimiento móvil. */
  const visiblePeriods = tEnd / T;
  const rawPts  = Math.round(visiblePeriods * 150);
  const numPts  = Math.min(Math.max(rawPts, 400), 2400);

  /* ── Generar datos de la gráfica ── */
  const { pos, vel, acc } = buildChartPoints(A, w, p, tEnd, numPts);

  /* Índice del marcador: punto más cercano al tiempo t solicitado */
  const step       = tEnd / numPts;
  const markerIdx  = Math.min(Math.round(t / step), numPts);
  const markerPt   = pos[markerIdx]; // {x, y} exacto del marcador

  /* ── Rango del eje Y ──
     Se calcula según las curvas activas y se añade un 8% de margen. */
  const showPos = g('sP').checked;
  let yMax = 0;
  if (showPos)  yMax = Math.max(yMax, A);
  if (showVel)  yMax = Math.max(yMax, vmax);
  if (showAcc)  yMax = Math.max(yMax, amax);
  if (yMax === 0) yMax = A; // fallback
  const yPadding = yMax * 0.08;

  /* ── Construir datasets de Chart.js ── */
  const datasets = [];

  if (showPos) {
    datasets.push({
      label: 'Posición x(t) [m]',
      data: pos,
      borderColor: '#2dd4bf',
      backgroundColor: 'rgba(45, 212, 191, 0.07)',
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      tension: 0.4,
      showLine: true
    });
  }

  if (showVel) {
    datasets.push({
      label: 'Velocidad v(t) [m/s]',
      data: vel,
      borderColor: '#fbbf24',
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.4,
      borderDash: [5, 4],
      showLine: true
    });
  }

  if (showAcc) {
    datasets.push({
      label: 'Aceleración a(t) [m/s²]',
      data: acc,
      borderColor: '#f87171',
      backgroundColor: 'transparent',
      borderWidth: 1.8,
      pointRadius: 0,
      fill: false,
      tension: 0.4,
      borderDash: [3, 3],
      showLine: true
    });
  }

  /* Marcador en el tiempo t₀ */
  if (showPos && markerPt) {
    datasets.push({
      label: `▸ t₀ = ${fmtCard(t)} s`,
      data: [markerPt],
      borderColor: '#ffffff',
      backgroundColor: '#ffffff',
      pointRadius: 7,
      pointHoverRadius: 9,
      pointStyle: 'circle',
      showLine: false,
      borderWidth: 2
    });
  }

  /* ── Mostrar área de la gráfica ── */
  g('chartEmpty').style.display = 'none';
  g('chartArea').style.display  = 'block';

  /* ── Crear o recrear instancia de Chart.js ── */
  const canvas = g('masChart');
  const ctx    = canvas.getContext('2d');

  if (masChart) {
    masChart.destroy();
    masChart = null;
  }

  masChart = new Chart(ctx, {
    /*
      Se usa tipo 'scatter' con datos {x, y}.
      Esto garantiza que el eje X sea numérico real (lineal),
      evitando el problema de recorte que ocurre con 'line'
      cuando los labels se tratan como categorías.
    */
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: {
        mode: 'nearest',
        intersect: false,
        axis: 'x'
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#64748b',
            font: { family: 'Space Mono', size: 9 },
            boxWidth: 14,
            padding: 8,
            /* Ocultar el marcador de la leyenda */
            filter: item => !item.text.startsWith('▸')
          }
        },
        tooltip: {
          backgroundColor: '#0d1320',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          titleFont: { family: 'Space Mono', size: 9 },
          bodyFont:  { family: 'Space Mono', size: 10 },
          padding: 10,
          callbacks: {
            title: items => {
              const xVal = items[0]?.raw?.x;
              return xVal !== undefined
                ? `t = ${fmt(xVal, 5)} s`
                : '';
            },
            label: item => {
              const yVal = item.raw?.y;
              if (yVal === undefined || yVal === null) return null;
              const name = item.dataset.label.split('[')[0].trim();
              return `${name}: ${fmt(yVal, 6)}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          /*
            min y max explícitos: Chart.js nunca recorta la curva.
            Sin esto, el auto-escalado puede cortar datos en los extremos.
          */
          min: 0,
          max: tEnd,
          ticks: {
            color: '#64748b',
            font: { family: 'Space Mono', size: 8 },
            maxTicksLimit: 8,
            callback: fmtAxis
          },
          grid: { color: 'rgba(255, 255, 255, 0.04)' },
          title: {
            display: true,
            text: 'Tiempo t (s)',
            color: '#64748b',
            font: { family: 'Outfit', size: 10, weight: '600' }
          }
        },
        y: {
          type: 'linear',
          /*
            Rango Y explícito: evita que Chart.js recorte los picos
            de la onda sinusoidal cuando la amplitud es muy grande.
          */
          min: -(yMax + yPadding),
          max:  (yMax + yPadding),
          ticks: {
            color: '#64748b',
            font: { family: 'Space Mono', size: 8 },
            maxTicksLimit: 8,
            callback: fmtAxis
          },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          title: {
            display: true,
            text: 'Magnitud',
            color: '#64748b',
            font: { family: 'Outfit', size: 10, weight: '600' }
          }
        }
      }
    }
  });

  /* Iniciar/reiniciar animación del oscilador */
  startOscillator();
}


/* ─────────────────────────────────────────────────────────────
   9. ANIMACIÓN DEL OSCILADOR (Canvas API)
───────────────────────────────────────────────────────────── */

/**
 * Inicia la animación del oscilador masa-resorte en el canvas.
 * Usa requestAnimationFrame para un renderizado suave.
 * La animación muestra el movimiento en tiempo real con trail de posición.
 */
function startOscillator() {
  /* Cancelar animación previa si existe */
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }
  animTimestamp = null;

  const canvas = g('oscCanvas');
  const ctx    = canvas.getContext('2d');

  /* Capturar parámetros actuales en closure para la animación */
  const A = currentA;
  const w = currentW;
  const p = currentP;
  const T_osc = (2 * Math.PI) / Math.abs(w);

  /**
   * Frame de animación — se llama recursivamente con rAF.
   * @param {DOMHighResTimeStamp} timestamp
   */
  function drawFrame(timestamp) {
    /* Inicializar timestamp de referencia en el primer frame */
    if (!animTimestamp) animTimestamp = timestamp;
    const elapsed = (timestamp - animTimestamp) / 1000; // segundos

    /* Adaptar dimensiones del canvas al tamaño real en pantalla */
    const W = canvas.clientWidth || 300;
    const H = 90;
    if (canvas.width  !== W) canvas.width  = W;
    if (canvas.height !== H) canvas.height = H;

    /* ── Fondo ── */
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#111b2e';
    ctx.fillRect(0, 0, W, H);

    /* ── Línea de equilibrio ── */
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    /* ── Trail (rastro de la trayectoria) ── */
    const TRAIL_POINTS = 140;
    const trailSpan    = 2 * T_osc; // span de tiempo del trail
    const halfH        = H / 2 - 10;

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const tTrail = elapsed - (i / TRAIL_POINTS) * trailSpan;
      if (tTrail < 0) continue;

      const xp = W * 0.82 - (i / TRAIL_POINTS) * W * 0.70;
      const yp = H / 2 - Math.cos(w * tTrail + p) * halfH;
      const alpha = Math.pow(1 - i / TRAIL_POINTS, 1.7);

      ctx.beginPath();
      ctx.arc(xp, yp, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(45, 212, 191, ${alpha * 0.45})`;
      ctx.fill();
    }

    /* ── Resorte ── */
    const ballX   = W * 0.82;
    const ballY   = H / 2 - Math.cos(w * elapsed + p) * halfH;
    const springY = 6;
    const coils   = 6;

    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth   = 1.3;
    ctx.beginPath();

    for (let i = 0; i <= coils * 14; i++) {
      const py = springY + (ballY - springY) * (i / (coils * 14));
      const px = ballX + Math.sin(i / 14 * Math.PI * 2) * 7;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    /* ── Esfera (con resplandor) ── */
    const glowGradient = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, 12);
    glowGradient.addColorStop(0, 'rgba(45, 212, 191, 0.6)');
    glowGradient.addColorStop(1, 'rgba(45, 212, 191, 0)');

    ctx.beginPath();
    ctx.arc(ballX, ballY, 12, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(ballX, ballY, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#2dd4bf';
    ctx.fill();

    /* ── Etiqueta de posición en tiempo real ── */
    const xLive = A * Math.cos(w * elapsed + p);
    ctx.font      = '9px Space Mono, monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`x = ${fmtCard(xLive)} m`, 7, 14);

    /* Solicitar siguiente frame */
    animFrame = requestAnimationFrame(drawFrame);
  }

  animFrame = requestAnimationFrame(drawFrame);
}


/* ─────────────────────────────────────────────────────────────
   10. RESTABLECER FORMULARIO
───────────────────────────────────────────────────────────── */

/**
 * Restaura todos los campos al estado inicial,
 * destruye la gráfica y detiene la animación.
 */
function resetear() {
  /* Valores por defecto */
  const defaults = { amp: 1, omega: 2, phi: 0, tval: 1, nper: 3 };
  Object.entries(defaults).forEach(([id, val]) => {
    g(id).value = val;
  });

  /* Checkboxes por defecto */
  g('sP').checked = true;
  g('sV').checked = false;
  g('sA').checked = false;

  /* Destruir gráfica */
  if (masChart) {
    masChart.destroy();
    masChart = null;
  }

  /* Detener animación */
  if (animFrame) {
    cancelAnimationFrame(animFrame);
    animFrame = null;
  }

  /* Restablecer UI */
  g('chartEmpty').style.display = '';
  g('chartArea').style.display  = 'none';
  g('tDisp').textContent        = '—';

  const resultIds = ['rv-x', 'rv-v', 'rv-a', 'dv-T', 'dv-f', 'dv-vm', 'dv-am'];
  resultIds.forEach(id => { g(id).textContent = '—'; });

  /* Limpiar canvas del oscilador */
  const osc = g('oscCanvas');
  osc.getContext('2d').clearRect(0, 0, osc.width, osc.height);
}


/* ─────────────────────────────────────────────────────────────
   11. SOLVERS — CALCULADORA DE ECUACIONES
───────────────────────────────────────────────────────────── */

/**
 * Despeja la Amplitud A dado x, ω, φ, t.
 * Fórmula: A = x / cos(ωt + φ)
 */
function solveA() {
  const x = gv('ca-x');
  const w = gv('ca-w');
  const p = gv('ca-p');
  const t = gv('ca-t');

  if ([x, w, p, t].some(isInvalid)) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const denominator = Math.cos(w * t + p);
  if (Math.abs(denominator) < 1e-12) {
    alert('cos(ωt + φ) ≈ 0. No es posible dividir. Prueba con otro valor de t.');
    return;
  }

  const result = x / denominator;
  showSolverResult(
    'A',
    fmt(result) + ' m',
    `A = x / cos(ωt + φ)\nA = ${fmt(x)} / cos(${fmt(w)}·${fmt(t)} + ${fmt(p)})\nA = ${fmt(result)} m`
  );
}

/**
 * Calcula la frecuencia angular ω dado el período T.
 * Fórmula: ω = 2π / T
 */
function solveWfromT() {
  const T = gv('cw-T');

  if (isInvalid(T) || T <= 0) {
    alert('El período T debe ser un número positivo.');
    return;
  }

  const result = (2 * Math.PI) / T;
  showSolverResult(
    'w1',
    fmt(result) + ' rad/s',
    `ω = 2π / T\nω = 2π / ${fmt(T)}\nω = ${fmt(result)} rad/s`
  );
}

/**
 * Calcula la frecuencia angular ω dadas la constante k y la masa m.
 * Fórmula: ω = √(k / m)
 */
function solveWfromKM() {
  const k = gv('cw-k');
  const m = gv('cw-m');

  if (isInvalid(k) || isInvalid(m) || k <= 0 || m <= 0) {
    alert('La constante k y la masa m deben ser valores positivos.');
    return;
  }

  const result = Math.sqrt(k / m);
  showSolverResult(
    'w2',
    fmt(result) + ' rad/s',
    `ω = √(k / m)\nω = √(${fmt(k)} / ${fmt(m)})\nω = ${fmt(result)} rad/s`
  );
}

/**
 * Calcula el período T dada la frecuencia angular ω.
 * Fórmula: T = 2π / ω
 */
function solveTfromW() {
  const w = gv('ct-w');

  if (isInvalid(w) || w <= 0) {
    alert('La frecuencia angular ω debe ser un número positivo.');
    return;
  }

  const result = (2 * Math.PI) / w;
  showSolverResult(
    'T1',
    fmt(result) + ' s',
    `T = 2π / ω\nT = 2π / ${fmt(w)}\nT = ${fmt(result)} s`
  );
}

/**
 * Calcula el período T dadas la constante k y la masa m.
 * Fórmula: T = 2π√(m / k)
 */
function solveTfromKM() {
  const k = gv('ct-k');
  const m = gv('ct-m');

  if (isInvalid(k) || isInvalid(m) || k <= 0 || m <= 0) {
    alert('La constante k y la masa m deben ser valores positivos.');
    return;
  }

  const result = 2 * Math.PI * Math.sqrt(m / k);
  showSolverResult(
    'T2',
    fmt(result) + ' s',
    `T = 2π√(m / k)\nT = 2π · √(${fmt(m)} / ${fmt(k)})\nT = ${fmt(result)} s`
  );
}

/**
 * Calcula el estado completo del sistema en el tiempo t.
 * Calcula posición x(t), velocidad v(t) y aceleración a(t).
 */
function solveState() {
  const A = gv('cs-A');
  const w = gv('cs-w');
  const p = gv('cs-p');
  const t = gv('cs-t');

  if ([A, w, p, t].some(isInvalid)) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const phase = w * t + p;
  const x     =  A * Math.cos(phase);
  const v     = -A * w     * Math.sin(phase);
  const a     = -A * w * w * Math.cos(phase);

  const panel = g('sr-st');
  panel.classList.add('show');

  g('srV-sx').textContent = fmt(x) + ' m';
  g('srV-sv').textContent = fmt(v) + ' m/s';
  g('srV-sa').textContent = fmt(a) + ' m/s²';
  g('srF-st').textContent =
    `x = A·cos(ωt + φ) = ${fmt(x)} m\nv = −Aω·sin(ωt + φ) = ${fmt(v)} m/s\na = −Aω²·cos(ωt + φ) = ${fmt(a)} m/s²`;
}


/* ─────────────────────────────────────────────────────────────
   12. INICIALIZACIÓN
───────────────────────────────────────────────────────────── */

/**
 * Al cargar la página, ejecutar el cálculo con los valores por defecto
 * para que la gráfica aparezca de inmediato.
 */
window.addEventListener('load', calcular);
