// SVG needle meter. Mirrors src/ui/NeedleMeter.tsx: ±100¢ arc with major/minor
// ticks, the ±IN_TUNE_CENTS zone highlight, a rotating needle with spring-like
// easing, and a centered hub. The arc span is 180°; the needle rotates ±90°.

import { IN_TUNE_CENTS, neighborNoteLabels } from './notes.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NEEDLE_SPAN_CENTS = 100;
const MAJOR_TICKS = [-100, -75, -50, -25, 0, 25, 50, 75, 100];
const MINOR_STEP = 5;

// Coordinate system is a 400x260 viewBox; the SVG scales via CSS to fit.
const W = 400;
const H = 260;
const CX = W / 2;
const RADIUS = 150;
const CY = RADIUS + 28; // top padding so the arc has visual breathing room

function el(name, attrs = {}, children = []) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null) continue;
    node.setAttribute(k, String(v));
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

function arcPath(startDeg, endDeg, r) {
  const toPt = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [CX + Math.sin(rad) * r, CY - Math.cos(rad) * r];
  };
  const [x0, y0] = toPt(startDeg);
  const [x1, y1] = toPt(endDeg);
  const largeArc = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
  // sweep=1 draws clockwise in SVG's (x right, y down) space with our mapping.
  return `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}`;
}

function ticksPath(step, length, excludeSet) {
  let d = '';
  for (let tick = -NEEDLE_SPAN_CENTS; tick <= NEEDLE_SPAN_CENTS; tick += step) {
    if (excludeSet?.has(tick)) continue;
    const rotDeg = (tick / NEEDLE_SPAN_CENTS) * 90;
    const rad = (rotDeg * Math.PI) / 180;
    const sinR = Math.sin(rad);
    const cosR = Math.cos(rad);
    const x0 = CX + sinR * (RADIUS - length);
    const y0 = CY - cosR * (RADIUS - length);
    const x1 = CX + sinR * RADIUS;
    const y1 = CY - cosR * RADIUS;
    d += `M ${x0} ${y0} L ${x1} ${y1} `;
  }
  return d.trim();
}

export function createNeedleMeter() {
  const svg = el('svg', {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'xMidYMid meet',
    role: 'img',
    'aria-label': 'Tuning meter',
    class: 'needle-meter',
  });

  const defs = el('defs');
  const grad = el('linearGradient', {
    id: 'meter-grad',
    x1: '0',
    y1: '0',
    x2: '1',
    y2: '0',
  });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': 'var(--flat)' }));
  grad.appendChild(el('stop', { offset: '50%', 'stop-color': 'var(--in-tune)' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': 'var(--sharp)' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Main arc outline.
  svg.appendChild(
    el('path', {
      d: arcPath(-90, 90, RADIUS),
      fill: 'none',
      stroke: 'url(#meter-grad)',
      'stroke-width': 2,
      opacity: 0.55,
    })
  );

  // In-tune zone (highlighted arc segment near 0°).
  const zoneHalfDeg = (IN_TUNE_CENTS / NEEDLE_SPAN_CENTS) * 90;
  svg.appendChild(
    el('path', {
      d: arcPath(-zoneHalfDeg, zoneHalfDeg, RADIUS - 3),
      fill: 'none',
      stroke: 'var(--in-tune)',
      'stroke-width': 5,
      'stroke-linecap': 'round',
      opacity: 0.22,
    })
  );

  // Minor ticks (every 5¢, excluding major positions).
  const majorSet = new Set(MAJOR_TICKS);
  svg.appendChild(
    el('path', {
      d: ticksPath(MINOR_STEP, 6, majorSet),
      stroke: 'url(#meter-grad)',
      'stroke-width': 1.5,
      'stroke-linecap': 'round',
      opacity: 0.6,
    })
  );

  // Major ticks (±100, ±75, ±50, ±25, 0).
  svg.appendChild(
    el('path', {
      d: ticksPath(25, 14),
      stroke: 'url(#meter-grad)',
      'stroke-width': 2.5,
      'stroke-linecap': 'round',
      opacity: 0.95,
    })
  );

  // Small top marker at 0° to make "dead center" obvious.
  svg.appendChild(
    el('line', {
      x1: CX,
      y1: CY - RADIUS - 4,
      x2: CX,
      y2: CY - RADIUS + 18,
      stroke: 'var(--in-tune)',
      'stroke-width': 3,
      'stroke-linecap': 'round',
      opacity: 0.9,
    })
  );

  // Neighbor note labels (flat side / sharp side), inside the SVG so they
  // scale with the meter and never drift.
  const leftLabel = el('text', {
    x: CX - RADIUS - 14,
    y: CY + 4,
    'text-anchor': 'end',
    fill: 'var(--flat)',
    'font-size': 18,
    'font-weight': 600,
    class: 'edge-label',
  });
  leftLabel.textContent = '♭';
  svg.appendChild(leftLabel);

  const rightLabel = el('text', {
    x: CX + RADIUS + 14,
    y: CY + 4,
    'text-anchor': 'start',
    fill: 'var(--sharp)',
    'font-size': 18,
    'font-weight': 600,
    class: 'edge-label',
  });
  rightLabel.textContent = '♯';
  svg.appendChild(rightLabel);

  // In-tune halo circle on top of the arc, visible only when in tune.
  const halo = el('circle', {
    cx: CX,
    cy: CY - RADIUS,
    r: 10,
    fill: 'var(--in-tune)',
    opacity: 0,
    class: 'lock-halo',
  });
  svg.appendChild(halo);

  // Needle group — pivot at hub (CX, CY). Use SVG `transform` (not CSS) so
  // rotation stays correct when the SVG scales; CSS `transform-origin` +
  // `transform-box: fill-box` on `<g>` uses the needle's tight bbox as origin,
  // which is mid-needle and makes the tip miss the arc.
  const needleGroup = el('g', { class: 'needle-group' });
  needleGroup.setAttribute('transform', `rotate(0 ${CX} ${CY})`);

  // Needle body.
  const needle = el('line', {
    x1: CX,
    y1: CY,
    x2: CX,
    y2: CY - (RADIUS - 10),
    stroke: 'var(--muted)',
    'stroke-width': 4,
    'stroke-linecap': 'round',
    class: 'needle-body',
  });
  needleGroup.appendChild(needle);
  svg.appendChild(needleGroup);

  // Central hub (drawn above the needle so the pivot looks clean).
  svg.appendChild(
    el('circle', {
      cx: CX,
      cy: CY,
      r: 10,
      fill: 'var(--surface)',
      stroke: 'var(--secondary)',
      'stroke-width': 2,
    })
  );
  svg.appendChild(
    el('circle', { cx: CX, cy: CY, r: 3, fill: 'var(--primary)' })
  );

  // Cents label anchored at the bottom of the viewBox.
  const centsLabel = el('text', {
    x: CX,
    y: H - 18,
    'text-anchor': 'middle',
    fill: 'var(--muted)',
    'font-size': 16,
    'font-weight': 600,
    'letter-spacing': '1.4',
    class: 'cents-label',
  });
  centsLabel.textContent = '—';
  svg.appendChild(centsLabel);

  return {
    el: svg,
    update(state) {
      const { cents, centerMidi, isLive, isHeld } = state;
      const active = isLive || isHeld;
      const clamped = Math.max(
        -NEEDLE_SPAN_CENTS,
        Math.min(NEEDLE_SPAN_CENTS, cents ?? 0)
      );
      const deg = (clamped / NEEDLE_SPAN_CENTS) * 90;
      needleGroup.setAttribute('transform', `rotate(${deg} ${CX} ${CY})`);

      const inTune = active && Math.abs(cents) <= IN_TUNE_CENTS;
      let needleColor = 'var(--muted)';
      if (active) {
        if (inTune) needleColor = 'var(--in-tune)';
        else if (cents < 0) needleColor = 'var(--flat)';
        else needleColor = 'var(--sharp)';
      }
      needle.setAttribute('stroke', needleColor);

      halo.style.transition = 'opacity 160ms linear';
      halo.setAttribute('opacity', inTune ? '1' : '0');

      if (!active) centsLabel.textContent = '—';
      else if (inTune) centsLabel.textContent = 'IN TUNE';
      else centsLabel.textContent = `${cents > 0 ? '+' : ''}${cents.toFixed(0)}¢`;
      centsLabel.setAttribute(
        'fill',
        active && inTune ? 'var(--in-tune)' : 'var(--muted)'
      );

      // Chromatic neighbors on the flat/sharp sides of the arc.
      if (centerMidi != null) {
        const n = neighborNoteLabels(centerMidi);
        leftLabel.textContent = n.flatSide;
        rightLabel.textContent = n.sharpSide;
      } else {
        leftLabel.textContent = '♭';
        rightLabel.textContent = '♯';
      }

      // Accessible description mirrors the RN version.
      const scaleA11y =
        centerMidi != null
          ? `Scale from ${leftLabel.textContent} on the left to ${rightLabel.textContent} on the right.`
          : '';
      svg.setAttribute(
        'aria-label',
        active
          ? inTune
            ? `In tune. ${scaleA11y}`
            : `${cents > 0 ? 'sharp' : 'flat'} by ${Math.abs(cents).toFixed(0)} cents. ${scaleA11y}`
          : `Listening. ${scaleA11y}`
      );
    },
  };
}
