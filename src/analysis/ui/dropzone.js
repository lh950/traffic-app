// File upload / drop zone UI. Vehicle/ped/tmc each accept MULTIPLE CSV files — one per
// surveyed day. Trip generation accepts MULTIPLE .xlsx files — one per physical location
// (driveway/parking lot/etc), each internally containing several day-sheets.
// `state[kind]` is an array of entries: { id, filename, dayLabel, loaded, error, mock }
// (tripgen entries use `locationLabel` instead of `dayLabel`, set by main.js).
// Calls back with onFile(kind, file, contents, error) for each newly-read file
// (contents is text for csv kinds, an ArrayBuffer for tripgen), and
// onClear(kind, id) / onRelabel(kind, id, label) for managing the per-entry list.

const KIND_META = {
  vehicle: { title: 'Vehicle counts', sub: '*_vehicle.csv — inbound / outbound', icon: '🚗', accept: '.csv,text/csv', unit: 'day' },
  ped: { title: 'Pedestrian counts', sub: '*_ped.csv — crosswalk crossings', icon: '🚶', accept: '.csv,text/csv', unit: 'day' },
  tmc: { title: 'Turning movements', sub: '*_tmc.csv — TMC by approach', icon: '↻', accept: '.csv,text/csv', unit: 'day' },
  tripgen: { title: 'Trip generation', sub: '.xlsx — one file per location', icon: '📊', accept: '.xlsx', unit: 'location' },
};

export function renderUploadGrid(container, { onFile, onClear, onRelabel, state }) {
  container.innerHTML = '';
  container.className = 'upload-grid';
  for (const kind of ['vehicle', 'ped', 'tmc', 'tripgen']) {
    container.appendChild(renderDropzone(kind, state[kind] || [], { onFile, onClear, onRelabel }));
  }
}

function renderDropzone(kind, entries, { onFile, onClear, onRelabel }) {
  const meta = KIND_META[kind];
  const wrap = document.createElement('div');

  const hasError = entries.some((e) => e.error);
  const el = document.createElement('div');
  el.className = 'dropzone';
  if (hasError) el.classList.add('error');
  else if (entries.length) el.classList.add('loaded');

  el.innerHTML = `
    <div class="dz-icon">${meta.icon}</div>
    <div class="dz-title">${meta.title}</div>
    <div class="dz-sub">${meta.sub}${entries.length ? ` — ${entries.length} ${meta.unit}${entries.length > 1 ? 's' : ''} loaded` : ''}</div>
    <input type="file" accept="${meta.accept}" multiple />
  `;

  const input = el.querySelector('input[type=file]');
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('change', (e) => {
    [...(e.target.files || [])].forEach((file) => readFile(kind, file, onFile));
    input.value = '';
  });

  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('dragover'); });
  el.addEventListener('dragleave', () => el.classList.remove('dragover'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('dragover');
    [...(e.dataTransfer?.files || [])].forEach((file) => readFile(kind, file, onFile));
  });

  wrap.appendChild(el);

  if (entries.length) {
    const list = document.createElement('div');
    list.className = 'day-file-list';
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'day-file-row';
      const label = kind === 'tripgen' ? entry.locationLabel : entry.dayLabel;
      if (entry.error) {
        row.innerHTML = `<span class="dz-error" style="margin:0">${escapeHtml(entry.filename)}: ${escapeHtml(entry.error)}</span>`;
      } else {
        row.innerHTML = `<input type="text" value="${escapeHtml(label)}" title="${kind === 'tripgen' ? 'Location label' : 'Day label'}" />`;
        // 'change' not 'input' — onRelabel triggers a full re-render, which would rebuild
        // this input out from under the cursor and drop focus after every keystroke.
        row.querySelector('input').addEventListener('change', (e) => onRelabel(kind, entry.id, e.target.value));
      }
      const removeBtn = document.createElement('button');
      removeBtn.className = 'day-file-remove';
      removeBtn.title = 'Remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', () => onClear(kind, entry.id));
      row.appendChild(removeBtn);
      list.appendChild(row);
    });
    wrap.appendChild(list);
  }

  return wrap;
}

function readFile(kind, file, onFile) {
  const reader = new FileReader();
  reader.onload = () => onFile(kind, file, reader.result);
  reader.onerror = () => onFile(kind, file, null, 'Could not read file');
  if (kind === 'tripgen') reader.readAsArrayBuffer(file);
  else reader.readAsText(file, 'utf-8');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
