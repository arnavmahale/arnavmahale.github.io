// Hero arm: a three-link planar arm that solves inverse kinematics (FABRIK)
// for the pointer position and reports its joint angles.
(function () {
  const canvas = document.getElementById('arm');
  const hero = document.getElementById('hero');
  const readout = document.getElementById('armReadout');
  if (!canvas || !hero) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const INK = '#101b33';
  const AMBER = '#f0a202';
  const PAPER = '#f1f3f2';

  let width = 0, height = 0, dpr = 1;
  let base = { x: 0, y: 0 };
  let lengths = [0, 0, 0];
  let joints = [];
  let target = { x: 0, y: 0 };
  let eased = { x: 0, y: 0 };
  let pointerActive = false;
  let grip = 0;
  let gripTarget = 0;

  function layout() {
    const rect = hero.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const narrow = width < 760;
    base = narrow
      ? { x: width * 0.5, y: height - 84 }
      : { x: width * 0.72, y: height - 110 };
    const reach = narrow
      ? Math.min(width * 0.62, 250)
      : Math.min(width * 0.36, height * 0.74, 560);
    lengths = [reach * 0.4, reach * 0.34, reach * 0.26];

    joints = [{ ...base }];
    let angle = -Math.PI / 2 - 0.5;
    for (let i = 0; i < 3; i++) {
      angle += 0.55;
      const prev = joints[i];
      joints.push({ x: prev.x + Math.cos(angle) * lengths[i], y: prev.y + Math.sin(angle) * lengths[i] });
    }
    eased = { ...joints[3] };
    target = { ...joints[3] };
  }

  function solve(goal) {
    const total = lengths[0] + lengths[1] + lengths[2];
    let gx = goal.x, gy = Math.min(goal.y, base.y - 6);
    const dx = gx - base.x, dy = gy - base.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > total * 0.985) {
      gx = base.x + (dx / dist) * total * 0.985;
      gy = base.y + (dy / dist) * total * 0.985;
    } else if (dist < total * 0.4) {
      // Too close to the base: the links would fold through each other.
      gx = base.x + (dx / dist) * total * 0.4;
      gy = Math.min(base.y + (dy / dist) * total * 0.4, base.y - 6);
    }
    for (let iter = 0; iter < 8; iter++) {
      joints[3].x = gx; joints[3].y = gy;
      for (let i = 2; i >= 0; i--) pull(joints[i], joints[i + 1], lengths[i]);
      joints[0].x = base.x; joints[0].y = base.y;
      for (let i = 1; i <= 3; i++) pull(joints[i], joints[i - 1], lengths[i - 1]);
    }
    // Keep the elbow off the floor line.
    for (let i = 1; i < 3; i++) joints[i].y = Math.min(joints[i].y, base.y - 4);
  }

  function pull(point, anchor, length) {
    const dx = point.x - anchor.x, dy = point.y - anchor.y;
    const d = Math.hypot(dx, dy) || 1;
    point.x = anchor.x + (dx / d) * length;
    point.y = anchor.y + (dy / d) * length;
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Mount
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.roundRect(base.x - 46, base.y + 4, 92, 14, 4);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(base.x - 22, base.y - 6, 44, 14, 4);
    ctx.fill();

    // Links
    const widths = [22, 17, 12];
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = widths[i];
      ctx.beginPath();
      ctx.moveTo(joints[i].x, joints[i].y);
      ctx.lineTo(joints[i + 1].x, joints[i + 1].y);
      ctx.stroke();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(joints[i].x, joints[i].y);
      ctx.lineTo(joints[i + 1].x, joints[i + 1].y);
      ctx.stroke();
    }

    // Gripper
    const a = Math.atan2(joints[3].y - joints[2].y, joints[3].x - joints[2].x);
    const open = 0.5 - grip * 0.36;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 6;
    for (const side of [-1, 1]) {
      const fa = a + side * open;
      const mx = joints[3].x + Math.cos(fa) * 16;
      const my = joints[3].y + Math.sin(fa) * 16;
      ctx.beginPath();
      ctx.moveTo(joints[3].x, joints[3].y);
      ctx.lineTo(mx, my);
      ctx.lineTo(mx + Math.cos(a - side * 0.25) * 14, my + Math.sin(a - side * 0.25) * 14);
      ctx.stroke();
    }

    // Joints
    const radii = [13, 10, 8];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = AMBER;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(joints[i].x, joints[i].y, radii[i], 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    if (readout) {
      const abs = [];
      for (let i = 0; i < 3; i++) {
        abs.push(Math.atan2(-(joints[i + 1].y - joints[i].y), joints[i + 1].x - joints[i].x));
      }
      const rel = [abs[0], abs[1] - abs[0], abs[2] - abs[1]].map((r) => {
        let deg = (r * 180) / Math.PI;
        while (deg > 180) deg -= 360;
        while (deg < -180) deg += 360;
        return Math.round(deg);
      });
      const fmt = (n) => (n < 0 ? '−' : '+') + String(Math.abs(n)).padStart(3, ' ') + '°';
      readout.textContent = `θ₁ ${fmt(rel[0])}   θ₂ ${fmt(rel[1])}   θ₃ ${fmt(rel[2])}`;
    }
  }

  function idleTarget(t) {
    const reach = lengths[0] + lengths[1] + lengths[2];
    if (width < 760) {
      return {
        x: base.x + Math.sin(t * 0.0006) * reach * 0.5,
        y: base.y - reach * 0.66 + Math.sin(t * 0.0012) * reach * 0.14,
      };
    }
    return {
      x: base.x - reach * 0.38 + Math.sin(t * 0.0006) * reach * 0.34,
      y: base.y - reach * 0.52 + Math.sin(t * 0.0012) * reach * 0.2,
    };
  }

  function frame(t) {
    if (!pointerActive) target = idleTarget(t);
    eased.x += (target.x - eased.x) * 0.14;
    eased.y += (target.y - eased.y) * 0.14;
    grip += (gripTarget - grip) * 0.25;
    solve(eased);
    draw();
    requestAnimationFrame(frame);
  }

  function setPointer(event) {
    const rect = hero.getBoundingClientRect();
    target = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    pointerActive = true;
  }

  hero.addEventListener('pointermove', setPointer);
  hero.addEventListener('pointerdown', (event) => { setPointer(event); gripTarget = 1; });
  window.addEventListener('pointerup', () => { gripTarget = 0; });
  hero.addEventListener('pointerleave', () => { pointerActive = false; });
  window.addEventListener('resize', () => { layout(); solve(eased); draw(); });

  layout();
  if (reduceMotion) {
    const still = idleTarget(900);
    eased = still;
    solve(still);
    draw();
    hero.addEventListener('pointermove', (event) => {
      setPointer(event);
      eased = { ...target };
      solve(eased);
      draw();
    });
  } else {
    requestAnimationFrame(frame);
  }
})();
