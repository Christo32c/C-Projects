'use strict';
/* Rig Studio — 2D cut-out rig editor. Bones + slots + swappable attachments + skins.
   Coordinates are y-down and rotations are clockwise radians, the same as Godot 2D. */

const $ = s => document.querySelector(s);
const ROOT = 1;

// ---------- state ----------
let doc = newDoc();
const images = new Map();           // id -> {id, name, canvas, w, h, url, alpha}
let history = [], histIdx = -1, dirty = false;
const ui = { tool: 'select', mode: 'setup', sel: null, compensate: false, showBones: true, pose: {} };
const view = { x: 0, y: 0, zoom: 1 };
let drag = null, spaceDown = false;

function newDoc() {
  return { name: 'character', nextId: 2, skins: [], slots: [],
    bones: [{ id: ROOT, name: 'root', parent: null, x: 0, y: 0, rot: 0, length: 0 }] };
}
const newId = () => doc.nextId++;
const boneById = id => doc.bones.find(b => b.id === id);
const slotById = id => doc.slots.find(s => s.id === id);
const activeAtt = s => s.attachments.find(a => a.id === s.active) || null;
const selBone = () => ui.sel && ui.sel.type === 'bone' ? boneById(ui.sel.id) : null;
const selSlot = () => ui.sel && ui.sel.type === 'slot' ? slotById(ui.sel.id) : null;

// ---------- history ----------
function commit() {
  history.splice(histIdx + 1);
  history.push(JSON.stringify(doc));
  if (history.length > 200) history.shift();
  histIdx = history.length - 1;
  dirty = history.length > 1;
  refresh();
}
function resetHistory() { history = []; histIdx = -1; commit(); dirty = false; }
function undo(dir) {
  const i = histIdx + dir;
  if (i < 0 || i >= history.length) return;
  histIdx = i; doc = JSON.parse(history[i]);
  if (ui.sel && !(ui.sel.type === 'bone' ? boneById(ui.sel.id) : slotById(ui.sel.id))) ui.sel = null;
  refresh();
}

// ---------- transforms (rigid: position + rotation) ----------
function compose(p, l) {
  const c = Math.cos(p.rot), s = Math.sin(p.rot);
  return { x: p.x + l.x * c - l.y * s, y: p.y + l.x * s + l.y * c, rot: p.rot + l.rot };
}
function toLocal(p, w) {
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot), dx = w.x - p.x, dy = w.y - p.y;
  return { x: dx * c - dy * s, y: dx * s + dy * c, rot: w.rot - p.rot };
}
function boneLocal(b) {
  const p = ui.mode === 'pose' && ui.pose[b.id];
  return p ? { x: b.x + p.dx, y: b.y + p.dy, rot: b.rot + p.rot } : b;
}
function worlds() {
  const m = new Map();
  const get = b => {
    if (m.has(b.id)) return m.get(b.id);
    const l = boneLocal(b);
    const w = b.parent == null ? { x: l.x, y: l.y, rot: l.rot } : compose(get(boneById(b.parent)), l);
    m.set(b.id, w); return w;
  };
  doc.bones.forEach(get);
  return m;
}
const parentWorld = (b, W) => b.parent == null ? { x: 0, y: 0, rot: 0 } : W.get(b.parent);

/* Set a bone's world transform. keepChildren leaves child bones and bound art where they are. */
function setBoneWorld(b, nw, keepChildren) {
  const W = worlds();
  const kids = keepChildren ? doc.bones.filter(c => c.parent === b.id).map(c => [c, W.get(c.id)]) : [];
  const atts = [];
  if (keepChildren) for (const s of doc.slots) if (s.bone === b.id)
    for (const a of s.attachments) atts.push([a, compose(W.get(b.id), a)]);
  Object.assign(b, toLocal(parentWorld(b, W), nw));
  for (const [c, w] of kids) Object.assign(c, toLocal(nw, w));
  for (const [a, w] of atts) Object.assign(a, toLocal(nw, w));
}
function reparentBone(b, parentId) {
  for (let p = parentId; p != null; p = boneById(p).parent) if (p === b.id) return false; // no cycles
  const W = worlds(), w = W.get(b.id);
  b.parent = parentId;
  Object.assign(b, toLocal(W.get(parentId), w));
  return true;
}
function rebindSlot(s, boneId) {
  const W = worlds(), from = W.get(s.bone), to = W.get(boneId);
  for (const a of s.attachments) Object.assign(a, toLocal(to, compose(from, a)));
  s.bone = boneId;
}

// ---------- names ----------
const clean = n => (String(n).trim().replace(/[^A-Za-z0-9_\- ]/g, '_') || 'unnamed');
function unique(base, taken) {
  base = clean(base);
  if (!taken.includes(base)) return base;
  const stem = base.replace(/_?\d+$/, '');
  for (let i = 2; ; i++) if (!taken.includes(`${stem}_${i}`)) return `${stem}_${i}`;
}
const boneNames = except => doc.bones.filter(b => b !== except).map(b => b.name);
const slotNames = except => doc.slots.filter(s => s !== except).map(s => s.name);

// ---------- images ----------
function addImage(canvas, name) {
  const id = 'img' + (Math.max(0, ...[...images.keys()].map(k => +k.slice(3))) + 1);
  const img = { id, name: unique(name, [...images.values()].map(i => i.name)), canvas, w: canvas.width, h: canvas.height,
    url: canvas.toDataURL('image/png'), alpha: null };
  images.set(id, img);
  return img;
}
function alphaAt(img, x, y) {
  x = Math.floor(x); y = Math.floor(y);
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0;
  if (!img.alpha) {
    const d = img.canvas.getContext('2d').getImageData(0, 0, img.w, img.h).data;
    img.alpha = new Uint8Array(img.w * img.h);
    for (let i = 0; i < img.alpha.length; i++) img.alpha[i] = d[i * 4 + 3];
  }
  return img.alpha[y * img.w + x];
}
function loadImageSource(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      c.getContext('2d').drawImage(im, 0, 0); res(c);
    };
    im.onerror = () => rej(new Error('Could not read image'));
    im.src = src;
  });
}
const fileToDataURL = f => new Promise((res, rej) => {
  const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f);
});
const baseName = n => n.replace(/\.[^.]+$/, '');

/* Put an image on the canvas as a new slot (bound to root until the user binds it). */
function placeImage(img, wx, wy, name) {
  const s = { id: newId(), name: unique(name || img.name, slotNames()), bone: ROOT, attachments: [], active: null };
  const a = { id: newId(), name: clean(img.name), image: img.id, sx: 1, sy: 1,
    ...toLocal(worlds().get(ROOT), { x: wx, y: wy, rot: 0 }) };
  s.attachments.push(a); s.active = a.id;
  doc.slots.push(s);
  return s;
}
function addVariant(slot, img) {
  const cur = activeAtt(slot) || slot.attachments[0];
  const a = { id: newId(), name: unique(img.name, slot.attachments.map(x => x.name)), image: img.id,
    x: cur ? cur.x : 0, y: cur ? cur.y : 0, rot: cur ? cur.rot : 0, sx: 1, sy: 1 };
  slot.attachments.push(a); slot.active = a.id;
}

// ---------- canvas ----------
const cv = $('#view'), ctx = cv.getContext('2d');
function resize() {
  const r = cv.parentElement.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  cv.width = Math.max(1, r.width * d); cv.height = Math.max(1, r.height * d);
  draw();
}
const toWorld = (sx, sy) => ({ x: (sx - view.x) / view.zoom, y: (sy - view.y) / view.zoom });
function evPoint(e) { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; }
function frameView() {
  const r = cv.getBoundingClientRect(), W = worlds();
  let x0 = -80, y0 = -80, x1 = 80, y1 = 80;
  const grow = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const b of doc.bones) { const w = W.get(b.id); grow(w.x, w.y); }
  for (const s of doc.slots) { const a = activeAtt(s); if (!a) continue;
    const w = compose(W.get(s.bone), a), im = images.get(a.image), rad = Math.hypot(im.w * a.sx, im.h * a.sy) / 2;
    grow(w.x - rad, w.y - rad); grow(w.x + rad, w.y + rad); }
  view.zoom = Math.min(4, Math.max(0.05, Math.min(r.width / (x1 - x0 + 80), r.height / (y1 - y0 + 80))));
  view.x = r.width / 2 - (x0 + x1) / 2 * view.zoom; view.y = r.height / 2 - (y0 + y1) / 2 * view.zoom;
  draw();
}

function draw() {
  const d = window.devicePixelRatio || 1, W = worlds(), z = view.zoom;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1b1d23'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(d * z, 0, 0, d * z, d * view.x, d * view.y);
  ctx.imageSmoothingEnabled = z < 3;

  // ground line and origin
  ctx.lineWidth = 1 / z; ctx.strokeStyle = '#343946';
  ctx.beginPath(); ctx.moveTo(-1e5, 0); ctx.lineTo(1e5, 0); ctx.moveTo(0, -1e5); ctx.lineTo(0, 1e5); ctx.stroke();

  for (const s of doc.slots) {
    const a = activeAtt(s); if (!a) continue;
    const im = images.get(a.image), w = compose(W.get(s.bone), a);
    ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.rot); ctx.scale(a.sx, a.sy);
    ctx.drawImage(im.canvas, -im.w / 2, -im.h / 2);
    if (ui.sel && ui.sel.type === 'slot' && ui.sel.id === s.id) {
      ctx.strokeStyle = '#ffb454'; ctx.lineWidth = 1.5 / z / Math.max(Math.abs(a.sx), 0.01);
      ctx.strokeRect(-im.w / 2, -im.h / 2, im.w, im.h);
    }
    ctx.restore();
  }
  const ss = selSlot(), sa = ss && activeAtt(ss);
  if (sa) { // tether from the selected part to its bone
    const bw = W.get(ss.bone), w = compose(bw, sa);
    ctx.setLineDash([4 / z, 4 / z]); ctx.strokeStyle = '#ffb454'; ctx.lineWidth = 1 / z;
    ctx.beginPath(); ctx.moveTo(w.x, w.y); ctx.lineTo(bw.x, bw.y); ctx.stroke(); ctx.setLineDash([]);
  }

  if (ui.showBones) {
    for (const b of doc.bones) { // connectors to parents
      if (b.parent == null) continue;
      const w = W.get(b.id), p = W.get(b.parent);
      ctx.setLineDash([3 / z, 3 / z]); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1 / z;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(w.x, w.y); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const b of doc.bones) drawBone(W.get(b.id), b.length, ui.sel && ui.sel.type === 'bone' && ui.sel.id === b.id, b.id === ROOT);
  }
  if (drag && drag.kind === 'newbone') {
    const rot = Math.atan2(drag.cur.y - drag.start.y, drag.cur.x - drag.start.x);
    drawBone({ x: drag.start.x, y: drag.start.y, rot }, Math.hypot(drag.cur.x - drag.start.x, drag.cur.y - drag.start.y), true, false);
  }
}
function drawBone(w, len, selected, isRoot) {
  const z = view.zoom, r = 5 / z;
  ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(w.rot);
  ctx.lineWidth = 1.5 / z; ctx.strokeStyle = '#11131a';
  ctx.fillStyle = selected ? '#ffb454' : isRoot ? '#ff6b9d' : 'rgba(92,200,255,.85)';
  if (len > 0) {
    const k = Math.min(len * 0.2, 12 / z), h = Math.min(len * 0.12, 6 / z);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(k, -h); ctx.lineTo(len, 0); ctx.lineTo(k, h); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---------- picking ----------
function pickBone(p, W) {
  const tol = 7 / view.zoom; let best = null, bd = tol;
  for (const b of doc.bones) {
    const w = W.get(b.id), ex = w.x + Math.cos(w.rot) * b.length, ey = w.y + Math.sin(w.rot) * b.length;
    const vx = ex - w.x, vy = ey - w.y, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - w.x) * vx + (p.y - w.y) * vy) / l2)) : 0;
    const dd = Math.hypot(p.x - (w.x + vx * t), p.y - (w.y + vy * t));
    if (dd <= bd) { bd = dd; best = b; }
  }
  return best;
}
function pickSlot(p, W) {
  for (let i = doc.slots.length - 1; i >= 0; i--) {
    const s = doc.slots[i], a = activeAtt(s); if (!a) continue;
    const im = images.get(a.image), l = toLocal(compose(W.get(s.bone), a), { x: p.x, y: p.y, rot: 0 });
    if (alphaAt(im, l.x / a.sx + im.w / 2, l.y / a.sy + im.h / 2) > 10) return s;
  }
  return null;
}
function pick(p) {
  const W = worlds(), b = ui.showBones && pickBone(p, W);
  if (b) return { type: 'bone', id: b.id };
  const s = pickSlot(p, W);
  if (!s) return null;
  return ui.mode === 'pose' ? { type: 'bone', id: s.bone } : { type: 'slot', id: s.id };
}

// ---------- pointer interaction ----------
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  const { sx, sy } = evPoint(e), p = toWorld(sx, sy);
  if (e.button === 1 || e.button === 2 || spaceDown) { drag = { kind: 'pan', sx, sy, vx: view.x, vy: view.y }; return; }
  if (e.button !== 0) return;
  if (ui.tool === 'bone' && ui.mode === 'setup') { drag = { kind: 'newbone', start: p, cur: p }; return; }
  const hit = pick(p);
  if (hit && (ui.tool === 'select' || !ui.sel || hit.type !== ui.sel.type || hit.id !== ui.sel.id)) { ui.sel = hit; }
  else if (!hit && ui.tool === 'select') ui.sel = null;
  refresh();
  if (!ui.sel || (ui.tool === 'select' && !hit)) return;

  const W = worlds(), b = selBone(), s = selSlot(), a = s && activeAtt(s);
  if (s && !a) return;
  const cur = b ? W.get(b.id) : compose(W.get(s.bone), a);
  drag = { kind: ui.tool === 'rotate' ? 'rotate' : 'move', start: p, startW: { ...cur },
    startAngle: Math.atan2(p.y - cur.y, p.x - cur.x), moved: false,
    startPose: b && { dx: 0, dy: 0, rot: 0, ...ui.pose[b.id] } };
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const { sx, sy } = evPoint(e), p = toWorld(sx, sy);
  if (drag.kind === 'pan') { view.x = drag.vx + sx - drag.sx; view.y = drag.vy + sy - drag.sy; draw(); return; }
  if (drag.kind === 'newbone') { drag.cur = p; draw(); return; }
  const b = selBone(), s = selSlot(), a = s && activeAtt(s), W = worlds();
  drag.moved = true;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  let dRot = Math.atan2(p.y - drag.startW.y, p.x - drag.startW.x) - drag.startAngle;
  if (e.shiftKey) dRot = Math.round(dRot / (Math.PI / 12)) * (Math.PI / 12);
  if (b && ui.mode === 'pose') {
    const sp = drag.startPose, pw = parentWorld(b, W);
    if (drag.kind === 'rotate') ui.pose[b.id] = { ...sp, rot: sp.rot + dRot };
    else { const l = toLocal({ x: 0, y: 0, rot: pw.rot }, { x: dx, y: dy, rot: 0 }); ui.pose[b.id] = { ...sp, dx: sp.dx + l.x, dy: sp.dy + l.y }; }
  } else if (b) {
    const nw = drag.kind === 'rotate' ? { ...drag.startW, rot: drag.startW.rot + dRot }
      : { ...drag.startW, x: drag.startW.x + dx, y: drag.startW.y + dy };
    setBoneWorld(b, nw, ui.compensate);
  } else if (a) {
    const nw = drag.kind === 'rotate' ? { ...drag.startW, rot: drag.startW.rot + dRot }
      : { ...drag.startW, x: drag.startW.x + dx, y: drag.startW.y + dy };
    Object.assign(a, toLocal(W.get(s.bone), nw));
  }
  draw();
});
cv.addEventListener('pointerup', () => {
  const d = drag; drag = null;
  if (!d) return;
  if (d.kind === 'newbone') {
    const len = Math.hypot(d.cur.x - d.start.x, d.cur.y - d.start.y), W = worlds();
    if (len * view.zoom < 6) { // a click: pick the parent for the next bone
      const b = pickBone(d.start, W); if (b) ui.sel = { type: 'bone', id: b.id };
      refresh(); return;
    }
    const s = selSlot(), parent = selBone() ? ui.sel.id : s ? s.bone : ROOT;
    const b = { id: newId(), name: unique('bone', boneNames()), parent, length: Math.round(len),
      ...toLocal(W.get(parent), { x: d.start.x, y: d.start.y, rot: Math.atan2(d.cur.y - d.start.y, d.cur.x - d.start.x) }) };
    doc.bones.push(b); ui.sel = { type: 'bone', id: b.id };
    commit(); return;
  }
  if (d.kind !== 'pan' && d.moved) { if (ui.mode === 'setup') commit(); else refresh(); }
});
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const { sx, sy } = evPoint(e), p = toWorld(sx, sy);
  view.zoom = Math.min(16, Math.max(0.05, view.zoom * Math.exp(-e.deltaY * 0.0015)));
  view.x = sx - p.x * view.zoom; view.y = sy - p.y * view.zoom; draw();
}, { passive: false });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('dragover', e => e.preventDefault());
cv.addEventListener('drop', e => {
  e.preventDefault();
  const id = e.dataTransfer.getData('text/rig-image'), { sx, sy } = evPoint(e), p = toWorld(sx, sy);
  if (id && images.has(id)) { const s = placeImage(images.get(id), p.x, p.y); ui.sel = { type: 'slot', id: s.id }; commit(); }
  else if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
});

// ---------- edits ----------
function deleteSelection() {
  const b = selBone(), s = selSlot();
  if (b) {
    if (b.id === ROOT) return setStatus('The root bone cannot be deleted.');
    for (const c of doc.bones.filter(c => c.parent === b.id)) reparentBone(c, b.parent);
    for (const sl of doc.slots.filter(sl => sl.bone === b.id)) rebindSlot(sl, b.parent);
    doc.bones = doc.bones.filter(x => x !== b);
    ui.sel = { type: 'bone', id: b.parent };
  } else if (s) {
    doc.slots = doc.slots.filter(x => x !== s);
    for (const k of doc.skins) delete k.map[s.id];
    ui.sel = null;
  } else return;
  commit();
}
function moveOrder(dir) {
  const s = selSlot(); if (!s) return;
  const i = doc.slots.indexOf(s), j = i + dir;
  if (j < 0 || j >= doc.slots.length) return;
  doc.slots.splice(i, 1); doc.slots.splice(j, 0, s); commit();
}
function autoBind() {
  const W = worlds(); let n = 0;
  for (const s of doc.slots) {
    if (s.bone !== ROOT) continue;
    const a = activeAtt(s) || s.attachments[0]; if (!a) continue;
    const c = compose(W.get(ROOT), a); let best = null, bd = Infinity;
    for (const b of doc.bones) {
      if (b.id === ROOT) continue;
      const w = W.get(b.id), vx = Math.cos(w.rot) * b.length, vy = Math.sin(w.rot) * b.length, l2 = vx * vx + vy * vy;
      const t = l2 ? Math.max(0, Math.min(1, ((c.x - w.x) * vx + (c.y - w.y) * vy) / l2)) : 0;
      const dd = Math.hypot(c.x - (w.x + vx * t), c.y - (w.y + vy * t));
      if (dd < bd) { bd = dd; best = b; }
    }
    if (best) { rebindSlot(s, best.id); n++; }
  }
  if (n) commit();
  setStatus(n ? `Bound ${n} part(s) to their nearest bone. Check them in Pose test.` : 'Nothing to bind: draw some bones first, or every part is already bound.');
}
function setMode(m) {
  ui.mode = m; ui.pose = {};
  if (m === 'pose') { ui.tool = 'rotate'; if (selSlot()) ui.sel = { type: 'bone', id: selSlot().bone }; }
  else ui.tool = 'select';
  refresh();
}

// ---------- panels ----------
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const deg = r => +(r * 180 / Math.PI).toFixed(2), num = v => +(+v).toFixed(2);
const isSel = (t, id) => ui.sel && ui.sel.type === t && ui.sel.id === id ? ' sel' : '';

function refresh() {
  $('#docName').value = doc.name;
  document.querySelectorAll('[data-tool]').forEach(b => {
    b.classList.toggle('on', b.dataset.tool === ui.tool);
    b.disabled = b.dataset.tool === 'bone' && ui.mode === 'pose';
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === ui.mode));
  $('#modeBadge').style.display = ui.mode === 'pose' ? 'block' : 'none';
  $('#btnUndo').disabled = histIdx <= 0; $('#btnRedo').disabled = histIdx >= history.length - 1;
  renderLibrary(); renderTree(); renderOrder(); renderProps(); renderSkins(); draw();
  if (!statusPinned) setStatus(hint());
}
function hint() {
  if (ui.mode === 'pose') return 'Pose test: drag a part or bone to rotate its joint. Nothing here is saved — switch back to Setup to keep editing.';
  if (!images.size) return 'Start with “Import parts…” (separate images), “Slice image…” (one image with all the pieces), or “Sample”.';
  if (ui.tool === 'bone') return 'Bone: drag from a joint toward the end of the limb. The new bone is a child of the selected bone; click a bone to choose another parent.';
  if (ui.tool === 'rotate') return 'Rotate: drag to turn the selection around its pivot (Shift snaps to 15°).';
  return 'Move: click to select, drag to move. Middle-drag or Space-drag pans, wheel zooms, F frames the character.';
}
let statusPinned = false, statusTimer = 0;
function setStatus(t) {
  $('#status').textContent = t;
  if (t !== hint()) { statusPinned = true; clearTimeout(statusTimer); statusTimer = setTimeout(() => { statusPinned = false; $('#status').textContent = hint(); }, 6000); }
}

function renderLibrary() {
  const el = $('#library'), slot = selSlot();
  if (!images.size) { el.innerHTML = '<div class="empty">No parts yet.</div>'; return; }
  el.innerHTML = [...images.values()].map(im => `
    <div class="card" data-img="${im.id}">
      <img src="${im.url}" draggable="true" title="${im.w}×${im.h} — drag onto the canvas">
      <div><input type="text" value="${esc(im.name)}" data-imgname="${im.id}">
        <div class="btns"><button class="mini" data-place="${im.id}" title="Add to the canvas as a new slot">Place</button>
        <button class="mini" data-variant="${im.id}" ${slot && ui.mode === 'setup' ? '' : 'disabled'} title="Add as an alternative image for the selected slot">Variant</button>
        <button class="mini" data-imgdel="${im.id}" title="Remove from library">✕</button></div></div>
    </div>`).join('');
}
function renderTree() {
  const out = [];
  const walk = (b, depth) => {
    out.push(`<div class="item${isSel('bone', b.id)}" data-sel="bone:${b.id}" style="padding-left:${6 + depth * 12}px">
      <span class="bone-ico">◆</span><span class="grow">${esc(b.name)}</span></div>`);
    for (const s of doc.slots) if (s.bone === b.id)
      out.push(`<div class="item${isSel('slot', s.id)}" data-sel="slot:${s.id}" style="padding-left:${18 + depth * 12}px">
        <span class="slot-ico">▣</span><span class="grow">${esc(s.name)}</span><span class="tag">${s.attachments.length > 1 ? s.attachments.length + ' variants' : ''}</span></div>`);
    for (const c of doc.bones) if (c.parent === b.id) walk(c, depth + 1);
  };
  walk(boneById(ROOT), 0);
  $('#tree').innerHTML = out.join('');
}
function renderOrder() {
  $('#order').innerHTML = doc.slots.length ? [...doc.slots].reverse().map((s, i) => {
    const a = activeAtt(s);
    return `<div class="item${isSel('slot', s.id)}" data-sel="slot:${s.id}"><span class="tag">${i === 0 ? 'front' : i === doc.slots.length - 1 ? 'back' : '·'}</span>
      <span class="grow">${esc(s.name)}</span><span class="tag">${a ? esc(a.name) : '(hidden)'}</span></div>`;
  }).join('') : '<div class="empty">Place parts to create slots.</div>';
}
const row = (label, html) => `<div class="row"><label>${label}</label>${html}</div>`;
const numIn = (key, v, step = 1) => `<input type="number" step="${step}" data-p="${key}" value="${v}">`;
function renderProps() {
  const el = $('#props'), b = selBone(), s = selSlot(), ro = ui.mode === 'pose';
  if (b) {
    const opts = doc.bones.filter(o => o !== b).map(o => `<option value="${o.id}" ${o.id === b.parent ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    el.innerHTML = row('Bone', `<input type="text" data-p="b.name" value="${esc(b.name)}">`)
      + (b.id === ROOT ? '' : row('Parent', `<select data-p="b.parent">${opts}</select>`))
      + row('Position', numIn('b.x', num(b.x)) + numIn('b.y', num(b.y)))
      + row('Rotation°', numIn('b.rot', deg(b.rot))) + row('Length', numIn('b.length', num(b.length)))
      + (b.id === ROOT ? '' : `<div class="row"><button data-act="delete">Delete bone</button></div>`);
  } else if (s) {
    const a = activeAtt(s);
    const bones = doc.bones.map(o => `<option value="${o.id}" ${o.id === s.bone ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    const atts = s.attachments.map(x => `<div class="item${x.id === s.active ? ' sel' : ''}" data-att="${x.id}">
      <span>${x.id === s.active ? '●' : '○'}</span><input type="text" value="${esc(x.name)}" data-attname="${x.id}">
      <button class="mini" data-attdel="${x.id}" title="Remove this variant">✕</button></div>`).join('')
      + `<div class="item${s.active == null ? ' sel' : ''}" data-att="none"><span>${s.active == null ? '●' : '○'}</span><span class="grow tag">nothing (slot hidden)</span></div>`;
    el.innerHTML = row('Slot', `<input type="text" data-p="s.name" value="${esc(s.name)}">`)
      + row('Bone', `<select data-p="s.bone">${bones}</select>`)
      + `<div class="row"><label>Variants</label><span class="tag">click to show · use “Variant” in the library to add</span></div><div class="list">${atts}</div>`
      + (a ? row('Position', numIn('a.x', num(a.x)) + numIn('a.y', num(a.y))) + row('Rotation°', numIn('a.rot', deg(a.rot)))
        + row('Scale', numIn('a.sx', num(a.sx), 0.05) + numIn('a.sy', num(a.sy), 0.05)) : '')
      + `<div class="row"><button data-act="delete">Delete slot</button></div>`;
  } else el.innerHTML = '<div class="empty">Select a bone or a part.</div>';
  if (ro) el.querySelectorAll('input,select,button').forEach(i => i.disabled = true);
}
function renderSkins() {
  $('#skins').innerHTML = doc.skins.length ? doc.skins.map((k, i) => `<div class="item" data-skin="${i}">
    <input type="text" class="grow" value="${esc(k.name)}" data-skinname="${i}" title="Skin name">
    <button class="mini" data-skinapply="${i}" title="Show this skin">Show</button>
    <button class="mini" data-skinupd="${i}" title="Overwrite with the current look">Update</button>
    <button class="mini" data-skindel="${i}">✕</button></div>`).join('')
    : '<div class="empty">A skin is a saved outfit: which variant each slot shows.</div>';
}
const currentLook = () => Object.fromEntries(doc.slots.map(s => [s.id, s.active]));

// ---------- panel events ----------
function selectFrom(el) {
  const t = el.closest('[data-sel]'); if (!t) return false;
  const [type, id] = t.dataset.sel.split(':');
  ui.sel = ui.mode === 'pose' && type === 'slot' ? { type: 'bone', id: slotById(+id).bone } : { type, id: +id };
  refresh(); return true;
}
$('#tree').addEventListener('click', e => selectFrom(e.target));
$('#order').addEventListener('click', e => selectFrom(e.target));
$('#props').addEventListener('change', e => {
  const t = e.target, b = selBone(), s = selSlot(), a = s && activeAtt(s);
  if (t.dataset.attname) {
    const x = s.attachments.find(x => x.id === +t.dataset.attname);
    x.name = unique(t.value, s.attachments.filter(o => o !== x).map(o => o.name)); return commit();
  }
  const key = t.dataset.p; if (!key) return;
  const v = t.type === 'number' ? (Number.isFinite(+t.value) ? +t.value : 0) : t.value;
  if (key === 'b.name') b.name = unique(v, boneNames(b));
  else if (key === 'b.parent') { if (!reparentBone(b, +v)) setStatus('A bone cannot be parented to one of its own children.'); }
  else if (key === 'b.x' || key === 'b.y' || key === 'b.rot') {
    const W = worlds(), l = { x: b.x, y: b.y, rot: b.rot };
    l[key.slice(2)] = key === 'b.rot' ? v * Math.PI / 180 : v;
    setBoneWorld(b, compose(parentWorld(b, W), l), ui.compensate);
  }
  else if (key === 'b.length') b.length = Math.max(0, v);
  else if (key === 's.name') s.name = unique(v, slotNames(s));
  else if (key === 's.bone') rebindSlot(s, +v);
  else if (key === 'a.rot') a.rot = v * Math.PI / 180;
  else if (key === 'a.sx' || key === 'a.sy') a[key.slice(2)] = v || 1;
  else if (key.startsWith('a.')) a[key.slice(2)] = v;
  commit();
});
$('#props').addEventListener('click', e => {
  const t = e.target, s = selSlot();
  if (t.dataset.act === 'delete') return deleteSelection();
  if (t.dataset.attdel) {
    s.attachments = s.attachments.filter(x => x.id !== +t.dataset.attdel);
    if (s.active === +t.dataset.attdel) s.active = s.attachments[0] ? s.attachments[0].id : null;
    for (const k of doc.skins) if (k.map[s.id] === +t.dataset.attdel) k.map[s.id] = null;
    return commit();
  }
  if (t.tagName === 'INPUT') return;
  const row = t.closest('[data-att]');
  if (row && s && ui.mode === 'setup') { s.active = row.dataset.att === 'none' ? null : +row.dataset.att; commit(); }
});
$('#skins').addEventListener('click', e => {
  const t = e.target, d = t.dataset;
  if (d.skinupd) { doc.skins[+d.skinupd].map = currentLook(); commit(); return setStatus(`Skin “${doc.skins[+d.skinupd].name}” updated.`); }
  if (d.skindel) { doc.skins.splice(+d.skindel, 1); return commit(); }
  if (d.skinapply) { const k = doc.skins[+d.skinapply];
    for (const s of doc.slots) if (s.id in k.map) s.active = s.attachments.some(a => a.id === k.map[s.id]) ? k.map[s.id] : null;
    commit(); setStatus(`Showing skin “${k.name}”.`); }
});
$('#btnSkinAdd').onclick = () => {
  doc.skins.push({ name: unique('skin', doc.skins.map(k => k.name)), map: currentLook() }); commit();
  const inputs = document.querySelectorAll('#skins [data-skinname]'), last = inputs[inputs.length - 1];
  if (last) { last.focus(); last.select(); }
  setStatus('Skin saved. Type a name for it.');
};
$('#skins').addEventListener('change', e => {
  const i = e.target.dataset.skinname; if (i == null) return;
  const k = doc.skins[+i]; k.name = unique(e.target.value, doc.skins.filter(o => o !== k).map(o => o.name)); commit();
});
$('#library').addEventListener('click', e => {
  const d = e.target.dataset;
  if (d.place) {
    const r = cv.getBoundingClientRect(), p = toWorld(r.width / 2, r.height / 2);
    const s = placeImage(images.get(d.place), p.x, p.y);
    if (ui.mode === 'pose') setMode('setup');
    ui.sel = { type: 'slot', id: s.id }; commit();
  } else if (d.variant) { addVariant(selSlot(), images.get(d.variant)); commit(); }
  else if (d.imgdel) {
    if (doc.slots.some(s => s.attachments.some(a => a.image === d.imgdel))) return setStatus('That image is still used by a slot. Remove the variant first.');
    images.delete(d.imgdel); resetHistory(); // old undo steps may reference the image
  }
});
$('#library').addEventListener('change', e => {
  const id = e.target.dataset.imgname; if (!id) return;
  const im = images.get(id); im.name = unique(e.target.value, [...images.values()].filter(o => o !== im).map(o => o.name)); refresh();
});
$('#library').addEventListener('dragstart', e => {
  const c = e.target.closest('[data-img]'); if (c) e.dataTransfer.setData('text/rig-image', c.dataset.img);
});

document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { ui.tool = b.dataset.tool; refresh(); });
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$('#chkCompensate').onchange = e => ui.compensate = e.target.checked;
$('#chkBones').onchange = e => { ui.showBones = e.target.checked; draw(); };
$('#btnAutoBind').onclick = autoBind;
$('#btnFront').onclick = () => moveOrder(1);
$('#btnBack').onclick = () => moveOrder(-1);
$('#btnUndo').onclick = () => undo(-1);
$('#btnRedo').onclick = () => undo(1);
$('#docName').onchange = e => { doc.name = clean(e.target.value); commit(); };

window.addEventListener('keydown', e => {
  if (e.target.matches('input, select, textarea') || document.querySelector('dialog[open]')) return;
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { undo(e.shiftKey ? 1 : -1); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { undo(1); e.preventDefault(); }
  else if ((e.ctrlKey || e.metaKey) && k === 's') { saveProject(); e.preventDefault(); }
  else if (e.ctrlKey || e.metaKey) return;
  else if (k === 'v') { ui.tool = 'select'; refresh(); }
  else if (k === 'r') { ui.tool = 'rotate'; refresh(); }
  else if (k === 'b' && ui.mode === 'setup') { ui.tool = 'bone'; refresh(); }
  else if (k === 'p') setMode(ui.mode === 'pose' ? 'setup' : 'pose');
  else if (k === 'f') frameView();
  else if (k === ']') moveOrder(1);
  else if (k === '[') moveOrder(-1);
  else if ((k === 'delete' || k === 'backspace') && ui.mode === 'setup') deleteSelection();
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

// ---------- import ----------
async function importFiles(files) {
  let n = 0;
  for (const f of files) {
    if (!f.type.startsWith('image/')) continue;
    try { addImage(await loadImageSource(await fileToDataURL(f)), baseName(f.name)); n++; }
    catch (err) { setStatus(`${f.name}: ${err.message}`); }
  }
  refresh();
  if (n) setStatus(`Added ${n} image(s) to the library. Drag them onto the canvas, or press Place.`);
}
$('#btnImport').onclick = () => $('#fileImages').click();
$('#fileImages').onchange = e => { importFiles(e.target.files); e.target.value = ''; };

// ---------- slicer ----------
const slice = { canvas: null, name: '', labels: null, regions: [], sel: new Set(), drag: null };
const sc = $('#sliceCanvas'), sctx = sc.getContext('2d');

function detectRegions() {
  const w = slice.canvas.width, h = slice.canvas.height, gap = +$('#sliceGap').value || 0, min = +$('#sliceMin').value || 1;
  const data = slice.canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const labels = new Int32Array(w * h), boxes = [], stack = [];
  for (let i = 0; i < w * h; i++) {
    if (labels[i] || data[i * 4 + 3] <= 8) continue;
    const id = boxes.length + 1, bx = { x0: w, y0: h, x1: 0, y1: 0, labels: [id] };
    labels[i] = id; stack.push(i);
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      if (x < bx.x0) bx.x0 = x; if (x > bx.x1) bx.x1 = x; if (y < bx.y0) bx.y0 = y; if (y > bx.y1) bx.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!labels[q] && data[q * 4 + 3] > 8) { labels[q] = id; stack.push(q); }
      }
    }
    boxes.push(bx);
    if (boxes.length > 4000) { $('#sliceInfo').textContent = 'Too many separate pieces to auto-detect (is the image noisy?). Add rectangles by hand.'; return; }
  }
  for (let changed = true; changed;) { // merge pieces that touch or sit within the gap
    changed = false;
    for (let i = 0; i < boxes.length; i++) for (let j = boxes.length - 1; j > i; j--) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
        a.x0 = Math.min(a.x0, b.x0); a.y0 = Math.min(a.y0, b.y0); a.x1 = Math.max(a.x1, b.x1); a.y1 = Math.max(a.y1, b.y1);
        a.labels.push(...b.labels); boxes.splice(j, 1); changed = true;
      }
    }
  }
  slice.labels = labels;
  slice.regions = boxes.filter(b => b.x1 - b.x0 + 1 >= min && b.y1 - b.y0 + 1 >= min)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
    .map(b => ({ x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1, labels: new Set(b.labels) }));
  slice.sel.clear(); drawSlicer();
}
function drawSlicer() {
  const c = slice.canvas, k = Math.max(1, c.width / sc.getBoundingClientRect().width || 1);
  sctx.clearRect(0, 0, sc.width, sc.height); sctx.drawImage(c, 0, 0);
  sctx.font = `${12 * k}px system-ui`; sctx.textBaseline = 'top';
  slice.regions.forEach((r, i) => {
    const on = slice.sel.has(r);
    sctx.lineWidth = (on ? 2.5 : 1.5) * k; sctx.strokeStyle = on ? '#ffb454' : '#5cc8ff';
    sctx.strokeRect(r.x + .5, r.y + .5, r.w - 1, r.h - 1);
    sctx.fillStyle = on ? '#ffb454' : '#5cc8ff'; sctx.fillText(String(i + 1), r.x + 3 * k, r.y + 2 * k);
  });
  if (slice.drag && slice.drag.rect) { const r = slice.drag.rect; sctx.lineWidth = 1.5 * k; sctx.strokeStyle = '#fff'; sctx.setLineDash([4 * k, 4 * k]); sctx.strokeRect(r.x, r.y, r.w, r.h); sctx.setLineDash([]); }
  $('#sliceInfo').textContent = `${slice.regions.length} part(s)` + (slice.sel.size ? `, ${slice.sel.size} selected` : '');
}
function slicePoint(e) {
  const r = sc.getBoundingClientRect();
  return { x: (e.clientX - r.left) * sc.width / r.width, y: (e.clientY - r.top) * sc.height / r.height };
}
sc.addEventListener('pointerdown', e => { sc.setPointerCapture(e.pointerId); slice.drag = { start: slicePoint(e), shift: e.shiftKey, rect: null }; });
sc.addEventListener('pointermove', e => {
  if (!slice.drag) return;
  const p = slicePoint(e), s = slice.drag.start;
  if (Math.abs(p.x - s.x) + Math.abs(p.y - s.y) > 4 * sc.width / sc.getBoundingClientRect().width)
    slice.drag.rect = { x: Math.min(p.x, s.x), y: Math.min(p.y, s.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
  drawSlicer();
});
sc.addEventListener('pointerup', () => {
  const d = slice.drag; slice.drag = null; if (!d) return;
  if (d.rect) {
    const W = slice.canvas.width, H = slice.canvas.height;
    let x0 = Math.max(0, Math.floor(d.rect.x)), y0 = Math.max(0, Math.floor(d.rect.y));
    let x1 = Math.min(W, Math.ceil(d.rect.x + d.rect.w)), y1 = Math.min(H, Math.ceil(d.rect.y + d.rect.h));
    if (x1 > x0 && y1 > y0) { // shrink the hand-drawn rectangle to the pixels inside it
      const data = slice.canvas.getContext('2d').getImageData(x0, y0, x1 - x0, y1 - y0).data, w = x1 - x0;
      let a = w, b = y1 - y0, c = -1, e2 = -1;
      for (let i = 0; i < data.length / 4; i++) if (data[i * 4 + 3] > 8) { const x = i % w, y = (i - x) / w; a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); e2 = Math.max(e2, y); }
      if (c >= 0) slice.regions.push({ x: x0 + a, y: y0 + b, w: c - a + 1, h: e2 - b + 1, labels: null });
    }
  } else {
    const hit = [...slice.regions].reverse().find(r => d.start.x >= r.x && d.start.x < r.x + r.w && d.start.y >= r.y && d.start.y < r.y + r.h);
    if (!d.shift) slice.sel.clear();
    if (hit) slice.sel.has(hit) ? slice.sel.delete(hit) : slice.sel.add(hit);
  }
  drawSlicer();
});
$('#sliceDetect').onclick = detectRegions;
$('#sliceDelete').onclick = () => { slice.regions = slice.regions.filter(r => !slice.sel.has(r)); slice.sel.clear(); drawSlicer(); };
$('#sliceMerge').onclick = () => {
  const rs = [...slice.sel]; if (rs.length < 2) return;
  const x0 = Math.min(...rs.map(r => r.x)), y0 = Math.min(...rs.map(r => r.y));
  const x1 = Math.max(...rs.map(r => r.x + r.w)), y1 = Math.max(...rs.map(r => r.y + r.h));
  const m = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, labels: rs.every(r => r.labels) ? new Set(rs.flatMap(r => [...r.labels])) : null };
  slice.regions[slice.regions.indexOf(rs[0])] = m;
  slice.regions = slice.regions.filter(r => !slice.sel.has(r)); slice.sel = new Set([m]); drawSlicer();
};
$('#sliceCancel').onclick = () => $('#slicer').close();
$('#sliceOk').onclick = () => {
  const src = slice.canvas, W = src.width, H = src.height, place = $('#slicePlace').checked;
  const sdata = src.getContext('2d').getImageData(0, 0, W, H);
  slice.regions.forEach((r, i) => {
    const c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
    const x = c.getContext('2d');
    if (r.labels) { // copy only this piece's own pixels, so neighbours inside the box stay out
      const out = x.createImageData(r.w, r.h);
      for (let yy = 0; yy < r.h; yy++) for (let xx = 0; xx < r.w; xx++) {
        const si = (r.y + yy) * W + r.x + xx;
        if (r.labels.has(slice.labels[si])) out.data.set(sdata.data.subarray(si * 4, si * 4 + 4), (yy * r.w + xx) * 4);
      }
      x.putImageData(out, 0, 0);
    } else x.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    const img = addImage(c, `${slice.name}_${i + 1}`);
    if (place) placeImage(img, r.x + r.w / 2 - W / 2, r.y + r.h / 2 - H); // image's bottom-centre sits on the origin
  });
  $('#slicer').close();
  if (ui.mode === 'pose') setMode('setup');
  commit(); frameView();
  setStatus(`Created ${slice.regions.length} part(s). Rename them in the library, then draw bones with the Bone tool.`);
};
async function openSlicer(file) {
  try { slice.canvas = await loadImageSource(await fileToDataURL(file)); }
  catch (err) { return setStatus(err.message); }
  slice.name = clean(baseName(file.name)); slice.regions = []; slice.sel.clear();
  sc.width = slice.canvas.width; sc.height = slice.canvas.height;
  $('#slicer').showModal(); detectRegions();
}
$('#btnSlice').onclick = () => $('#fileSheet').click();
$('#fileSheet').onchange = e => { if (e.target.files[0]) openSlicer(e.target.files[0]); e.target.value = ''; };

// ---------- project files ----------
/* Saves a file. Inside a Claude artifact, page-started downloads are blocked, so use its save prompt there. */
async function download(blob, name) {
  let saver = null;
  try { saver = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { saver = null; }
  if (saver) {
    try { await saver.save({ filename: name, data: blob }); return true; }
    catch (e) { setStatus(e && e.code === 'declined' ? 'Save cancelled.' : 'Could not save the file here: ' + ((e && (e.message || e.code)) || 'unknown error')); return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return true;
}
async function saveProject() {
  const data = { format: 'rigstudio-project', version: 1, doc,
    images: [...images.values()].map(i => ({ id: i.id, name: i.name, data: i.url })) };
  if (await download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${doc.name}.rigproj.json`)) dirty = false;
}
async function loadProject(text) {
  const data = JSON.parse(text);
  if (data.format !== 'rigstudio-project') throw new Error('Not a Rig Studio project file.');
  images.clear();
  for (const i of data.images) {
    const canvas = await loadImageSource(i.data);
    images.set(i.id, { id: i.id, name: i.name, canvas, w: canvas.width, h: canvas.height, url: i.data, alpha: null });
  }
  doc = data.doc; ui.sel = null; ui.pose = {}; ui.mode = 'setup'; ui.tool = 'select';
  resetHistory(); frameView();
}
function confirmDiscard() { // in-page dialog: browser confirm() is not available everywhere this runs
  if (!dirty) return Promise.resolve(true);
  const dlg = $('#confirm');
  return new Promise(res => { dlg.onclose = () => res(dlg.returnValue === 'yes'); dlg.returnValue = ''; dlg.showModal(); });
}
$('#btnSave').onclick = saveProject;
$('#btnOpen').onclick = async () => { if (await confirmDiscard()) $('#fileProject').click(); };
$('#fileProject').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { await loadProject(await f.text()); setStatus(`Opened ${f.name}.`); } catch (err) { setStatus('Could not open project: ' + err.message); }
};
$('#btnNew').onclick = async () => {
  if (!await confirmDiscard()) return;
  doc = newDoc(); images.clear(); ui.sel = null; ui.pose = {}; ui.mode = 'setup'; ui.tool = 'select'; resetHistory(); frameView();
};

// ---------- export for Godot ----------
function buildRig(fileOf) {
  const order = []; // parents before children
  const walk = b => { order.push(b); doc.bones.filter(c => c.parent === b.id).forEach(walk); };
  walk(boneById(ROOT));
  const attName = (s, id) => { const a = s.attachments.find(a => a.id === id); return a ? a.name : ''; };
  return {
    format: 'rigstudio', version: 1, name: doc.name,
    bones: order.map(b => ({ name: b.name, parent: b.parent == null ? null : boneById(b.parent).name,
      x: num(b.x), y: num(b.y), rotation: +b.rot.toFixed(5), length: num(b.length) })),
    slots: doc.slots.map(s => ({ name: s.name, bone: boneById(s.bone).name, attachment: attName(s, s.active),
      attachments: Object.fromEntries(s.attachments.map(a => [a.name, { type: 'region', image: fileOf(a.image),
        x: num(a.x), y: num(a.y), rotation: +a.rot.toFixed(5), scaleX: a.sx, scaleY: a.sy,
        width: images.get(a.image).w, height: images.get(a.image).h }])) })),
    skins: Object.fromEntries(doc.skins.map(k => [k.name,
      Object.fromEntries(doc.slots.filter(s => s.id in k.map).map(s => [s.name, attName(s, k.map[s.id])]))])),
  };
}
async function exportGodot() {
  if (!doc.slots.length) return setStatus('Nothing to export yet: place some parts first.');
  const base = clean(doc.name).replace(/ /g, '_'), dir = `${base}_parts`, files = [], names = new Map(), taken = [];
  for (const s of doc.slots) for (const a of s.attachments) if (!names.has(a.image)) {
    const n = unique(images.get(a.image).name.replace(/ /g, '_'), taken); taken.push(n); names.set(a.image, `${dir}/${n}.png`);
  }
  const enc = new TextEncoder();
  files.push({ name: `${base}.rig`, data: enc.encode(JSON.stringify(buildRig(id => names.get(id)), null, 1)) });
  for (const [id, path] of names) {
    const blob = await new Promise(r => images.get(id).canvas.toBlob(r, 'image/png'));
    files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
  }
  if (await download(zip(files), `${base}_godot.zip`)) setStatus(`Exported ${base}_godot.zip — unzip it into your Godot project (with the Rig Studio addon enabled).`);
}
$('#btnExport').onclick = exportGodot;

/* Minimal ZIP writer (stored, no compression — PNGs are already compressed). */
const crcTable = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data);
    const head = (sig, extra) => { const b = new DataView(new ArrayBuffer(extra ? 46 : 30)); let o = 0;
      b.setUint32(o, sig, true); o += 4; if (extra) { b.setUint16(o, 20, true); o += 2; }
      b.setUint16(o, 20, true); b.setUint16(o + 2, 0x0800, true); b.setUint16(o + 4, 0, true);
      b.setUint16(o + 6, time, true); b.setUint16(o + 8, date, true); b.setUint32(o + 10, crc, true);
      b.setUint32(o + 14, f.data.length, true); b.setUint32(o + 18, f.data.length, true);
      b.setUint16(o + 22, name.length, true); // extra length, comment, disk, attrs stay 0
      if (extra) b.setUint32(42, offset, true);
      return new Uint8Array(b.buffer); };
    const local = head(0x04034b50, false);
    central.push(head(0x02014b50, true), name);
    parts.push(local, name, f.data); offset += local.length + name.length + f.data.length;
  }
  const csize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, csize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

// ---------- sample character ----------
function loadSample() {
  const part = (name, w, h, paint) => { const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d'); x.lineWidth = 3; x.strokeStyle = '#2b2118'; x.lineJoin = 'round'; paint(x, w, h); return addImage(c, name); };
  const box = (x, w, h, fill, r = 8) => { x.fillStyle = fill; x.beginPath(); x.roundRect(2, 2, w - 4, h - 4, r); x.fill(); x.stroke(); };
  doc = newDoc(); doc.name = 'puppet'; images.clear();
  const im = {
    torso: part('torso', 60, 84, (x, w, h) => { box(x, w, h, '#c0563f', 14); x.fillStyle = '#e8c36a'; x.fillRect(8, h - 24, w - 16, 7); }),
    head: part('head', 66, 66, (x, w, h) => { x.fillStyle = '#f0c8a0'; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 3, 0, 7); x.fill(); x.stroke();
      x.fillStyle = '#2b2118'; x.beginPath(); x.arc(22, 30, 4, 0, 7); x.arc(44, 30, 4, 0, 7); x.fill();
      x.beginPath(); x.arc(33, 40, 10, 0.2, Math.PI - 0.2); x.stroke(); }),
    arm_upper: part('arm_upper', 22, 50, (x, w, h) => box(x, w, h, '#c0563f')),
    arm_lower: part('arm_lower', 20, 48, (x, w, h) => { box(x, w, h, '#f0c8a0'); }),
    leg: part('leg', 26, 76, (x, w, h) => { box(x, w, h, '#4a5a7a'); x.fillStyle = '#2b2118'; x.fillRect(3, h - 14, w - 6, 11); }),
    top_hat: part('top_hat', 76, 48, (x, w, h) => { x.fillStyle = '#33363f'; x.beginPath(); x.rect(16, 3, w - 32, h - 14); x.fill(); x.stroke();
      x.beginPath(); x.roundRect(3, h - 13, w - 6, 10, 4); x.fill(); x.stroke(); x.fillStyle = '#c0563f'; x.fillRect(18, h - 22, w - 36, 7); }),
    straw_hat: part('straw_hat', 96, 34, (x, w, h) => { x.fillStyle = '#e8c36a'; x.beginPath(); x.ellipse(w / 2, h - 9, w / 2 - 3, 7, 0, 0, 7); x.fill(); x.stroke();
      x.beginPath(); x.ellipse(w / 2, h - 10, 24, 20, 0, Math.PI, 0); x.closePath(); x.fill(); x.stroke(); }),
    sword: part('sword', 26, 104, (x, w, h) => { x.fillStyle = '#cfd6e0'; x.beginPath(); x.moveTo(w / 2, 3); x.lineTo(w / 2 + 6, 16); x.lineTo(w / 2 + 6, h - 30); x.lineTo(w / 2 - 6, h - 30); x.lineTo(w / 2 - 6, 16); x.closePath(); x.fill(); x.stroke();
      x.fillStyle = '#e8c36a'; x.beginPath(); x.rect(3, h - 30, w - 6, 7); x.fill(); x.stroke(); x.fillStyle = '#6b4a2b'; x.beginPath(); x.rect(w / 2 - 4, h - 23, 8, 20); x.fill(); x.stroke(); }),
    axe: part('axe', 50, 104, (x, w, h) => { x.fillStyle = '#6b4a2b'; x.beginPath(); x.rect(w / 2 - 4, 6, 8, h - 9); x.fill(); x.stroke();
      x.fillStyle = '#cfd6e0'; x.beginPath(); x.moveTo(w / 2 + 4, 10); x.quadraticCurveTo(w - 2, 4, w - 4, 26); x.quadraticCurveTo(w - 2, 48, w / 2 + 4, 42); x.closePath(); x.fill(); x.stroke(); }),
  };
  const D = Math.PI / 2, W = () => worlds(), ids = {};
  const bone = (name, parent, x, y, rot, length) => { const b = { id: newId(), name, parent: ids[parent] || ROOT, length, x: 0, y: 0, rot: 0 };
    Object.assign(b, toLocal(W().get(b.parent), { x, y, rot })); doc.bones.push(b); ids[name] = b.id; };
  bone('hip', null, 0, -72, -D, 78); bone('head', 'hip', 0, -150, -D, 62);
  for (const [s, x] of [['l', -38], ['r', 38]]) {
    bone(`arm_upper_${s}`, 'hip', x, -144, D, 42); bone(`arm_lower_${s}`, `arm_upper_${s}`, x, -102, D, 42);
    bone(`leg_${s}`, 'hip', x < 0 ? -15 : 15, -72, D, 70);
  }
  bone('hand_r', 'arm_lower_r', 38, -62, D, 10);
  const slot = (name, boneName, variants) => { const s = placeImage(variants[0][0], variants[0][1], variants[0][2], name);
    s.attachments[0].rot = variants[0][3] || 0;
    for (const [img, x, y, rot = 0] of variants.slice(1)) { addVariant(s, img); Object.assign(activeAtt(s), toLocal(W().get(ROOT), { x, y, rot })); }
    s.active = s.attachments[0].id; rebindSlot(s, ids[boneName]); return s; };
  slot('arm_upper_l', 'arm_upper_l', [[im.arm_upper, -38, -123]]); slot('arm_lower_l', 'arm_lower_l', [[im.arm_lower, -38, -82]]);
  slot('leg_l', 'leg_l', [[im.leg, -15, -37]]); slot('leg_r', 'leg_r', [[im.leg, 15, -37]]);
  slot('torso', 'hip', [[im.torso, 0, -110]]); slot('head', 'head', [[im.head, 0, -180]]);
  const hat = slot('hat', 'head', [[im.top_hat, 0, -222], [im.straw_hat, 0, -212]]);
  const weapon = slot('weapon', 'hand_r', [[im.sword, 76, -62, D], [im.axe, 76, -62, D]]);
  slot('arm_upper_r', 'arm_upper_r', [[im.arm_upper, 38, -123]]); slot('arm_lower_r', 'arm_lower_r', [[im.arm_lower, 38, -82]]);
  const look = (h, w) => ({ ...currentLook(), [hat.id]: h, [weapon.id]: w });
  doc.skins = [{ name: 'swordsman', map: look(hat.attachments[0].id, weapon.attachments[0].id) },
    { name: 'woodcutter', map: look(hat.attachments[1].id, weapon.attachments[1].id) },
    { name: 'unarmed', map: look(null, null) }];
  ui.sel = null; ui.pose = {}; ui.mode = 'setup'; ui.tool = 'select';
  resetHistory(); frameView();
  setStatus('Sample loaded. Try Pose test, click the skins on the right, then Export for Godot.');
}
$('#btnSample').onclick = async () => { if (await confirmDiscard()) loadSample(); };

// ---------- start ----------
window.rig = { get doc() { return doc; }, images, ui, view, worlds, buildRig }; // handy for debugging in the console
resetHistory(); resize();
{ const r = cv.getBoundingClientRect(); view.x = r.width / 2; view.y = r.height * 0.75; draw(); }
