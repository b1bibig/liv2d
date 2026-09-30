// Toolbar + parameter sliders. Dragging a slider pins that parameter to a
// manual value; double-click the row (or "자동") to hand it back to the animator.

const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
};

export function createPanel({ model, animator, options, lipSync }) {
  const toolbar = document.getElementById('toolbar');
  const panel = document.getElementById('params');

  // expressions
  const exprButtons = new Map();
  const exprGroup = el('div', { class: 'group', role: 'group', 'aria-label': '표정' });
  for (const [name, expr] of Object.entries(animator.expressions)) {
    const b = el('button', { type: 'button', onclick: () => {
      animator.setExpression(name);
      exprButtons.forEach((btn, n) => btn.setAttribute('aria-pressed', String(n === name)));
    } }, expr.label ?? name);
    b.setAttribute('aria-pressed', String(name === animator.expression));
    exprButtons.set(name, b);
    exprGroup.append(b);
  }

  const toggle = (label, get, set) => {
    const b = el('button', { type: 'button', class: 'toggle' }, label);
    const refresh = () => b.setAttribute('aria-pressed', String(get()));
    b.addEventListener('click', async () => {
      await set(!get());
      refresh();
    });
    refresh();
    return b;
  };

  const tools = el(
    'div',
    { class: 'group' },
    toggle('메쉬', () => options.wireframe, (v) => (options.wireframe = v)),
    toggle('마이크 립싱크', () => lipSync.active, async (v) => {
      try {
        if (v) await lipSync.start();
        else lipSync.stop();
      } catch (err) {
        alert(`마이크를 쓸 수 없어요: ${err.message}`);
      }
    }),
    toggle('파라미터', () => !panel.hidden, (v) => (panel.hidden = !v)),
  );
  toolbar.append(exprGroup, tools);

  // parameter sliders, grouped
  const rows = [];
  const groups = new Map();
  for (const d of model.params.defs) {
    if (!groups.has(d.group)) {
      const fs = el('fieldset', {}, el('legend', {}, d.group || '기타'));
      groups.set(d.group, fs);
      panel.append(fs);
    }
    const input = el('input', { type: 'range', min: d.min, max: d.max, step: (d.max - d.min) / 200, value: d.default, 'aria-label': d.name });
    const out = el('output', {}, '');
    const row = el('label', { class: 'row', title: `${d.id} (더블클릭: 자동으로 되돌리기)` }, el('span', { class: 'name' }, d.name), input, out);
    input.addEventListener('input', () => {
      animator.pin(d.id, Number(input.value));
      row.classList.add('pinned');
    });
    row.addEventListener('dblclick', () => {
      animator.unpin(d.id);
      row.classList.remove('pinned');
    });
    groups.get(d.group).append(row);
    rows.push({ id: d.id, input, out, row });
  }
  panel.append(
    el('button', { type: 'button', class: 'reset', onclick: () => {
      animator.unpinAll();
      rows.forEach((r) => r.row.classList.remove('pinned'));
    } }, '전부 자동으로'),
  );

  let tick = 0;
  return {
    sync() {
      if (panel.hidden || tick++ % 4) return;
      for (const r of rows) {
        const v = model.params.get(r.id);
        if (!animator.pinned.has(r.id)) r.input.value = v;
        r.out.textContent = v.toFixed(2);
      }
    },
  };
}
