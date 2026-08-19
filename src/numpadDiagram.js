// Visual reference for the "Numpad one-handed" keybinding preset (build brief item 6) — a
// small labeled grid showing the numpad's physical key layout with each key's assigned class
// + in/out at a glance. Deliberately a plain HTML grid, not SVG — the physical numpad layout
// is already grid-shaped, so a CSS grid reproduces it directly with far less code than hand-
// laid-out SVG rects would, and it stays trivially responsive/theme-aware for free.
//
// `labels` — optional array of up to 4 vehicle-type / classification labels (in the group's
// display order) to show under each class's two keys instead of generic "Class N". Falls back
// to "Class N" for any slot without a label (e.g. before any types are configured yet).
export function buildNumpadDiagramHTML(labels){
  const L = labels || [];
  const rows = [
    { key0:'7', key1:'9', cls:0 },
    { key0:'4', key1:'6', cls:1 },
    { key0:'1', key1:'3', cls:2 },
    { key0:'0', key1:'.', cls:3 },
  ];
  const cellsHtml = rows.map(r=>{
    const name = L[r.cls] || `Class ${r.cls+1}`;
    return `
      <div class="numpad-diag-row">
        <span class="numpad-diag-key numpad-diag-in">${r.key0}</span>
        <span class="numpad-diag-label" title="${name}">${name}</span>
        <span class="numpad-diag-key numpad-diag-out">${r.key1}</span>
      </div>`;
  }).join('');
  return `
    <div class="numpad-diag">
      <div class="numpad-diag-hd">
        <span class="numpad-diag-hd-in">in</span>
        <span class="numpad-diag-hd-title">numpad one-handed</span>
        <span class="numpad-diag-hd-out">out</span>
      </div>
      ${cellsHtml}
      <div class="numpad-diag-hint">left key = in · right key = out · one key-cluster per class</div>
    </div>`;
}
