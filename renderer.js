/* 待办便签 · 渲染逻辑 */
const BLANKS = 3;

const listEl = document.getElementById('list');
const counterEl = document.getElementById('counter');
const progressBar = document.getElementById('progressBar');
const pinBtn = document.getElementById('pinBtn');
const closeBtn = document.getElementById('closeBtn');
const grip = document.getElementById('grip');
const cardEl = document.getElementById('card');
const opacityRange = document.getElementById('opacityRange');
const opValue = document.getElementById('opValue');
const stickerBox = document.getElementById('stickerBox');
const stickerImg = document.getElementById('stickerImg');
const stickerPanel = document.getElementById('stickerPanel');
const stickerBtn = document.getElementById('stickerBtn');
const stickerSizeRange = document.getElementById('stickerSizeRange');
const stickerSizeVal = document.getElementById('stickerSizeVal');
const stickerInkRange = document.getElementById('stickerInkRange');
const stickerInkVal = document.getElementById('stickerInkVal');
const spBlend = document.getElementById('spBlend');
const spMirror = document.getElementById('spMirror');
const stageEl = document.getElementById('stage');

const OP_MIN = 25;
const OP_MAX = 100;

const state = {
  tasks: [],
  topmost: true,
  opacity: 100,
  sticker: null,
  stickerSize: 110,
  stickerInk: 100,
  stickerStyle: 'plain', // plain | round | photo
  stickerBlend: false,
  stickerFlip: false,    // 左右镜像
  stickerX: 10,          // 距舞台右边的距离
  stickerY: 8,           // 距舞台下边的距离
  editing: null // { kind:'new', k:number } | { kind:'edit', id:string }
};

const CHECK_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5.2L20 6.6"></path></svg>';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------------- 持久化 ---------------- */
let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    window.api.save({
      tasks: state.tasks,
      topmost: state.topmost,
      opacity: state.opacity,
      stickerSize: state.stickerSize,
      stickerInk: state.stickerInk,
      stickerStyle: state.stickerStyle,
      stickerBlend: state.stickerBlend,
      stickerFlip: state.stickerFlip,
      stickerX: state.stickerX,
      stickerY: state.stickerY,
      panelOpen: stickerPanel.classList.contains('open')
    });
  }, 200);
}

/* ---------------- 背景透明度（文字不受影响） ---------------- */
function applyOpacity(value, fromUI) {
  const v = Math.max(OP_MIN, Math.min(OP_MAX, Math.round(Number(value) || OP_MAX)));
  state.opacity = v;
  const a = v / 100;
  cardEl.style.backgroundColor = `rgba(253, 249, 239, ${a})`;
  stickerPanel.style.backgroundColor = `rgba(253, 249, 239, ${a})`;
  opValue.textContent = v + '%';
  const pct = ((v - OP_MIN) / (OP_MAX - OP_MIN)) * 100;
  opacityRange.style.setProperty('--fill', pct.toFixed(2) + '%');
  if (fromUI && opacityRange.value !== String(v)) opacityRange.value = String(v);
}

opacityRange.addEventListener('input', (e) => {
  applyOpacity(e.target.value, false);
});

opacityRange.addEventListener('change', () => {
  persist();
});

/* 滚轮在滑条上也能微调 */
opacityRange.addEventListener('wheel', (e) => {
  e.preventDefault();
  applyOpacity(state.opacity + (e.deltaY < 0 ? 5 : -5), true);
  persist();
}, { passive: false });

/* ---------------- 列表渲染 ---------------- */
function makeRow(task) {
  const row = document.createElement('div');
  row.className = 'row' + (task.done ? ' done' : '');
  row.dataset.id = task.id;

  const cb = document.createElement('button');
  cb.className = 'cb';
  cb.type = 'button';
  cb.innerHTML = CHECK_SVG;
  cb.title = task.done ? '标记为未完成' : '标记为完成';
  cb.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(task.id);
  });

  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.textContent = task.text;
  txt.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    beginEdit({ kind: 'edit', id: task.id });
  });

  const del = document.createElement('button');
  del.className = 'del';
  del.type = 'button';
  del.textContent = '✕';
  del.title = '删除';
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    removeTask(task.id);
  });

  row.append(cb, txt, del);

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window.api.menu({ kind: 'task', id: task.id, text: task.text });
  });

  return row;
}

function makeBlank(k) {
  const row = document.createElement('div');
  row.className = 'row blank';
  row.dataset.key = 'blank:' + k;

  const cb = document.createElement('div');
  cb.className = 'cb';

  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.textContent = '双击输入 →';

  row.append(cb, txt);

  row.addEventListener('dblclick', (e) => {
    e.preventDefault();
    beginEdit({ kind: 'new', k });
  });

  return row;
}

function render() {
  const undone = state.tasks.filter((t) => !t.done);
  const done = state.tasks
    .filter((t) => t.done)
    .sort((a, b) => (a.doneAt || 0) - (b.doneAt || 0));

  const frag = document.createDocumentFragment();
  undone.forEach((t) => frag.appendChild(makeRow(t)));

  for (let k = 0; k < BLANKS; k++) frag.appendChild(makeBlank(k));

  if (done.length) {
    const sec = document.createElement('div');
    sec.className = 'section';
    sec.textContent = `已完成 ${done.length}`;
    sec.title = '右键清除已完成';
    sec.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      window.api.menu({ kind: 'done-section' });
    });
    frag.appendChild(sec);
    done.forEach((t) => frag.appendChild(makeRow(t)));
  }

  listEl.textContent = '';
  listEl.appendChild(frag);

  if (state.editing) mountEditor();
  updateHeader();
  syncRules();
}

function updateHeader() {
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.done).length;
  counterEl.textContent = total ? `${done}/${total}` : '';
  counterEl.style.color = total && done === total ? 'var(--accent)' : '';
  progressBar.style.width = total ? `${(done / total) * 100}%` : '0%';
}

/* ---------------- 行内编辑 ---------------- */
function beginEdit(editing) {
  state.editing = editing;
  render();
}

function mountEditor() {
  const ed = state.editing;
  let row = null;
  let initial = '';

  if (ed.kind === 'new') {
    row = listEl.querySelector(`.row[data-key="blank:${ed.k}"]`);
  } else {
    row = listEl.querySelector(`.row[data-id="${ed.id}"]`);
    const task = state.tasks.find((t) => t.id === ed.id);
    if (!task) { state.editing = null; return; }
    initial = task.text;
  }
  if (!row) { state.editing = null; return; }

  const holder = row.querySelector('.txt');
  holder.textContent = '';
  holder.style.opacity = '1';
  holder.style.color = 'var(--ink)';
  holder.style.fontSize = '13px';
  row.classList.add('editing');

  const input = document.createElement('input');
  input.className = 'editor';
  input.type = 'text';
  input.value = initial;
  input.spellcheck = false;
  holder.appendChild(input);

  let finished = false;

  const commit = () => {
    if (finished) return;
    finished = true;
    const text = input.value.trim();
    state.editing = null;
    if (ed.kind === 'new') {
      if (text) {
        addTask(text);
      } else {
        render();
      }
    } else {
      const task = state.tasks.find((t) => t.id === ed.id);
      if (task && text && task.text !== text) {
        task.text = text;
        persist();
        render();
      } else {
        render();
      }
    }
  };

  const cancel = () => {
    if (finished) return;
    finished = true;
    state.editing = null;
    render();
  };

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', commit);
  input.addEventListener('mousedown', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());

  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    row.scrollIntoView({ block: 'nearest' });
  });
}

/* ---------------- 动画 ---------------- */
function withFlip(mutate) {
  const before = new Map();
  listEl.querySelectorAll('.row[data-id]').forEach((el) => {
    before.set(el.dataset.id, el.getBoundingClientRect().top);
  });

  mutate();
  render();

  listEl.querySelectorAll('.row[data-id]').forEach((el) => {
    if (typeof el.animate !== 'function') return;
    const prev = before.get(el.dataset.id);
    const now = el.getBoundingClientRect().top;
    if (prev === undefined) {
      el.animate(
        [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 220, easing: 'ease-out' }
      );
      return;
    }
    const dy = prev - now;
    if (Math.abs(dy) > 1) {
      el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }],
        { duration: 300, easing: 'cubic-bezier(.22,.85,.25,1)' }
      );
    }
  });
}

/* ---------------- 增删改 ---------------- */
function addTask(text) {
  withFlip(() => {
    state.tasks.push({
      id: uid(),
      text,
      done: false,
      createdAt: Date.now(),
      doneAt: null
    });
  });
  persist();
}

function toggle(id) {
  withFlip(() => {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return;
    task.done = !task.done;
    task.doneAt = task.done ? Date.now() : null;
  });
  persist();
}

function removeTask(id) {
  withFlip(() => {
    state.tasks = state.tasks.filter((t) => t.id !== id);
  });
  persist();
}

/* ---------------- 顶栏交互 ---------------- */
pinBtn.addEventListener('click', async () => {
  state.topmost = !state.topmost;
  await window.api.setTopmost(state.topmost);
  syncPin();
  persist();
});

function syncPin() {
  pinBtn.classList.toggle('active', state.topmost);
  pinBtn.title = state.topmost ? '已固定在顶层（点击取消）' : '固定在顶层';
}

closeBtn.addEventListener('click', () => window.api.close());

/* ---------------- 右下角缩放 ---------------- */
let resizing = null;
let sizeRaf = 0;
let pendingSize = null;

grip.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  grip.setPointerCapture(e.pointerId);
  resizing = {
    x: e.screenX,
    y: e.screenY,
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight
  };
});

grip.addEventListener('pointermove', (e) => {
  if (!resizing) return;
  pendingSize = {
    width: Math.max(260, resizing.w + (e.screenX - resizing.x)),
    height: Math.max(240, resizing.h + (e.screenY - resizing.y))
  };
  if (!sizeRaf) {
    sizeRaf = requestAnimationFrame(() => {
      sizeRaf = 0;
      if (pendingSize) window.api.setSize(pendingSize);
    });
  }
});

const endResize = () => {
  if (!resizing) return;
  resizing = null;
  pendingSize = null;
};

grip.addEventListener('pointerup', endResize);
grip.addEventListener('pointercancel', endResize);
window.addEventListener('pointerup', endResize);

/* ---------------- 右键菜单回调 ---------------- */
window.api.onMenuAction(({ action, id }) => {
  if (action === 'edit') {
    const task = state.tasks.find((t) => t.id === id);
    if (task) beginEdit({ kind: 'edit', id });
  } else if (action === 'delete') {
    removeTask(id);
  } else if (action === 'clear-done') {
    withFlip(() => {
      state.tasks = state.tasks.filter((t) => !t.done);
    });
    persist();
  } else if (action === 'sticker-change' || action === 'sticker-insert') {
    pickSticker();
  } else if (action === 'sticker-clear') {
    window.api.stickerClear().then(() => {
      state.sticker = null;
      updateSticker();
    });
  }
});

/* ---------------- 右下角贴纸（背景花纹 · 右下角按钮调整） ---------------- */

/* 滑块已填充比例 */
function fillRange(el) {
  const min = Number(el.min) || 0;
  const max = Number(el.max) || 100;
  const p = ((Number(el.value) - min) / (max - min || 1)) * 100;
  el.style.setProperty('--fill', Math.max(0, Math.min(100, p)).toFixed(2) + '%');
}

/* 横线自动避让：与贴纸竖向相交的行，横线在贴纸左侧收住 */
let ruleRaf = 0;
function syncRules() {
  cancelAnimationFrame(ruleRaf);
  ruleRaf = requestAnimationFrame(() => {
    const rows = listEl.querySelectorAll('.row');
    if (!state.sticker) {
      rows.forEach((r) => r.style.removeProperty('--avoid'));
      return;
    }
    const st = stickerBox.getBoundingClientRect();
    if (!st.width) return; // 图片还没加载完
    const top = st.top - 5;
    const bottom = st.bottom + 5;
    rows.forEach((row) => {
      const r = row.getBoundingClientRect();
      if (r.bottom <= top || r.top >= bottom) {
        row.style.removeProperty('--avoid');
        return;
      }
      const avoid = Math.round(r.right - st.left) + 7;
      if (avoid <= 0) {
        row.style.removeProperty('--avoid');
        return;
      }
      const max = Math.max(0, Math.round(r.width - 34));
      row.style.setProperty('--avoid', Math.min(avoid, max) + 'px');
    });
  });
}

function applyStickerSize(px) {
  const size = Math.max(48, Math.min(260, Math.round(Number(px) || 110)));
  state.stickerSize = size;
  stickerBox.style.setProperty('--sticker-size', size + 'px');
  stickerSizeVal.textContent = String(size);
  if (stickerSizeRange.value !== String(size)) stickerSizeRange.value = String(size);
  fillRange(stickerSizeRange);
  syncRules();
}

function applyStickerInk(v) {
  const ink = Math.max(15, Math.min(100, Math.round(Number(v) || 100)));
  state.stickerInk = ink;
  stickerBox.style.setProperty('--sticker-ink', (ink / 100).toFixed(2));
  stickerInkVal.textContent = ink + '%';
  if (stickerInkRange.value !== String(ink)) stickerInkRange.value = String(ink);
  fillRange(stickerInkRange);
}

function applyStickerStyle() {
  stickerBox.classList.toggle('style-round', state.stickerStyle === 'round');
  stickerBox.classList.toggle('style-photo', state.stickerStyle === 'photo');
  stickerBox.classList.toggle('blend', !!state.stickerBlend);
  stickerBox.classList.toggle('flip', !!state.stickerFlip);
  document.querySelectorAll('.sp-chip[data-style]').forEach((b) => {
    b.classList.toggle('on', b.dataset.style === state.stickerStyle);
  });
  spBlend.classList.toggle('on', !!state.stickerBlend);
  spMirror.classList.toggle('on', !!state.stickerFlip);
  syncRules();
}

/* ---------------- 贴纸位置（可在面板展开时拖动） ---------------- */
function applyStickerPos() {
  const stage = stageEl.getBoundingClientRect();
  const box = stickerBox.getBoundingClientRect();
  const maxX = Math.max(0, Math.round(stage.width - box.width));
  const maxY = Math.max(0, Math.round(stage.height - box.height));
  const x = Math.max(0, Math.min(maxX, Math.round(state.stickerX)));
  const y = Math.max(0, Math.min(maxY, Math.round(state.stickerY)));
  state.stickerX = x;
  state.stickerY = y;
  stickerBox.style.setProperty('--sx', x + 'px');
  stickerBox.style.setProperty('--sy', y + 'px');
  syncRules();
}

function updateSticker() {
  if (state.sticker) {
    stickerImg.src = state.sticker;
    stickerBox.classList.add('has');
    applyStickerSize(state.stickerSize);
    applyStickerInk(state.stickerInk);
    applyStickerStyle();
    requestAnimationFrame(applyStickerPos);
  } else {
    stickerImg.removeAttribute('src');
    stickerBox.classList.remove('has');
    closeStickerPanel();
  }
  syncStickerBtn();
  syncRules();
}

function syncStickerBtn() {
  const has = !!state.sticker;
  const open = stickerPanel.classList.contains('open');
  stickerBtn.classList.toggle('active', open);
  stickerBtn.title = has ? '贴纸设置（点一下收起）' : '插入贴纸图片（也可以把图片拖进便签）';
  document.getElementById('spRemove').style.display = has ? '' : 'none';
  stickerSizeRange.disabled = !has;
  stickerInkRange.disabled = !has;
  document.querySelectorAll('.sp-chip').forEach((b) => { b.disabled = !has; });
}

/* ---------- 面板空间管理：展开时窗口向下伸长一块 ---------- */
let panelSpace = 0;
function syncPanelSpace() {
  const h = stickerPanel.classList.contains('open')
    ? stickerPanel.offsetHeight + 6   /* 6 = body 的 flex gap */
    : 0;
  const delta = h - panelSpace;
  if (!delta) return;
  panelSpace = h;
  window.api.reservePanel(delta);
}

function openStickerPanel() {
  if (!state.sticker) return;
  stickerPanel.classList.add('open');
  stickerBox.classList.add('editing');
  syncStickerBtn();
  /* 面板在便签下方延伸：窗口长高，贴纸位置重算 */
  syncPanelSpace();
  requestAnimationFrame(() => { applyStickerPos(); syncRules(); });
}

function closeStickerPanel() {
  if (!stickerPanel.classList.contains('open')) { syncStickerBtn(); return; }
  stickerPanel.classList.remove('open');
  stickerBox.classList.remove('editing');
  syncStickerBtn();
  syncPanelSpace();
  requestAnimationFrame(() => { applyStickerPos(); syncRules(); });
}

/* 拖动贴纸 */
let stickerDrag = null;
stickerBox.addEventListener('pointerdown', (e) => {
  if (!stickerBox.classList.contains('editing')) return;
  e.preventDefault();
  e.stopPropagation();
  try { stickerBox.setPointerCapture(e.pointerId); } catch (_) {}
  const stage = stageEl.getBoundingClientRect();
  const b = stickerBox.getBoundingClientRect();
  stickerDrag = {
    px: e.screenX,
    py: e.screenY,
    right: stage.right - b.right,
    bottom: stage.bottom - b.bottom
  };
});

stickerBox.addEventListener('pointermove', (e) => {
  if (!stickerDrag) return;
  state.stickerX = stickerDrag.right - (e.screenX - stickerDrag.px);
  state.stickerY = stickerDrag.bottom - (e.screenY - stickerDrag.py);
  applyStickerPos();
});

const endStickerDrag = (e) => {
  if (!stickerDrag) return;
  stickerDrag = null;
  try { stickerBox.releasePointerCapture(e.pointerId); } catch (_) {}
  persist();
};
stickerBox.addEventListener('pointerup', endStickerDrag);
stickerBox.addEventListener('pointercancel', endStickerDrag);

/* 换图后按图片本身是否带透明通道，自动挑一个合适的默认样式：
   有背景（jpg 等）→ 相纸；透明抠图 → 原图。之后都可以手动改 */
function autoStyle(hasAlpha) {
  if (hasAlpha === true) state.stickerStyle = 'plain';
  else if (hasAlpha === false) state.stickerStyle = 'photo';
}

async function pickSticker() {
  const res = await window.api.stickerPick();
  if (res && res.ok) {
    state.sticker = res.url;
    autoStyle(res.hasAlpha);
    updateSticker();
    openStickerPanel();
  }
}

/* 右下角按钮：有贴纸 → 展开/收起调整面板；没贴纸 → 直接选图 */
stickerBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!state.sticker) { pickSticker(); return; }
  if (stickerPanel.classList.contains('open')) closeStickerPanel();
  else openStickerPanel();
});

stickerSizeRange.addEventListener('input', (e) => {
  applyStickerSize(e.target.value);
  requestAnimationFrame(applyStickerPos);
});
stickerSizeRange.addEventListener('change', () => persist());

stickerInkRange.addEventListener('input', (e) => applyStickerInk(e.target.value));
stickerInkRange.addEventListener('change', () => persist());

document.querySelectorAll('.sp-chip[data-style]').forEach((btn) => {
  btn.addEventListener('click', () => {
    state.stickerStyle = btn.dataset.style;
    applyStickerStyle();
    persist();
  });
});

spBlend.addEventListener('click', () => {
  state.stickerBlend = !state.stickerBlend;
  applyStickerStyle();
  persist();
});

spMirror.addEventListener('click', () => {
  state.stickerFlip = !state.stickerFlip;
  applyStickerStyle();
  persist();
});

document.getElementById('spChange').addEventListener('click', () => pickSticker());

document.getElementById('spRemove').addEventListener('click', async () => {
  await window.api.stickerClear();
  state.sticker = null;
  updateSticker();
});

/* 图片加载完再算一次避让和位置（尺寸此时才知道） */
stickerImg.addEventListener('load', () => {
  applyStickerPos();
  syncRules();
});

/* 滚动 / 改变窗口大小都要重算横线避让与贴纸位置 */
listEl.addEventListener('scroll', syncRules, { passive: true });
window.addEventListener('resize', () => { applyStickerPos(); syncRules(); });

/* 点空白处关掉面板 */
document.addEventListener('mousedown', (e) => {
  if (!stickerPanel.classList.contains('open')) return;
  if (stickerPanel.contains(e.target)) return;
  if (stickerBtn.contains(e.target)) return;
  closeStickerPanel();
});

/* 卡片空白处右键：插入/更换/移除贴纸 */
cardEl.addEventListener('contextmenu', (e) => {
  if (e.target.closest('.row') || e.target.closest('.section')) return;
  e.preventDefault();
  window.api.menu({ kind: 'card', hasSticker: !!state.sticker });
});

/* 拖图片进窗口 = 设为贴纸 */
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f && f.path && /^image\//.test(f.type)) {
    window.api.stickerSet(f.path).then((res) => {
      if (res && res.ok) {
        state.sticker = res.url;
        autoStyle(res.hasAlpha);
        updateSticker();
      }
    });
  }
});

/* ---------------- 启动 ---------------- */
function demo() {
  const now = Date.now();
  return [
    { id: uid(), text: '双击下面的横线，直接输入待办事项', done: false, createdAt: now, doneAt: null },
    { id: uid(), text: '点一下左边的小方框，这行会划掉并沉到底部', done: false, createdAt: now + 1, doneAt: null },
    { id: uid(), text: '右键任务可以编辑或删除', done: true, createdAt: now + 2, doneAt: now + 3 }
  ];
}

(async function boot() {
  const data = await window.api.load();
  state.tasks = Array.isArray(data.tasks) ? data.tasks : [];
  state.topmost = data.topmost !== false;
  if (data.fresh) {
    state.tasks = demo();
    persist();
  }
  syncPin();
  applyOpacity(typeof data.opacity === 'number' ? data.opacity : 100, true);
  state.sticker = data.sticker || null;
  state.stickerSize = typeof data.stickerSize === 'number' ? data.stickerSize : 110;
  state.stickerInk = typeof data.stickerInk === 'number' ? data.stickerInk : 100;
  state.stickerStyle = ['plain', 'round', 'photo'].includes(data.stickerStyle) ? data.stickerStyle : 'plain';
  state.stickerBlend = !!data.stickerBlend;
  state.stickerFlip = !!data.stickerFlip;
  state.stickerX = typeof data.stickerX === 'number' ? data.stickerX : 10;
  state.stickerY = typeof data.stickerY === 'number' ? data.stickerY : 8;
  applyStickerStyle();
  updateSticker();
  render();
  if (data.panelOpen && state.sticker) openStickerPanel();
})();

/* 全局：Esc 取消编辑 / 关面板 */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (stickerPanel.classList.contains('open')) {
    closeStickerPanel();
    return;
  }
  if (state.editing) {
    state.editing = null;
    render();
  }
});
