// First-run walkthrough — a short, dismissible orientation shown once per browser
// (localStorage flag), and replayable anytime via the "Take the tour" link on the
// home screen. Reuses the existing modal-backdrop/.modal styling rather than
// inventing new UI, since this is meant to be the lowest-risk variant that still
// covers what the app does, the three project types, and where to find help.
const LS_SEEN_KEY = 'tc_seen_walkthrough';

const STEPS = [
  {
    title: 'Welcome to Traffic App',
    body: `<p>A keyboard-driven field counter for traffic studies. Configure your site once, then count by keystroke against time-lapse video. Everything lives in this browser tab and autosaves as you go — no account, no server.</p>`,
  },
  {
    title: 'Three ways to start a study',
    body: `<p><strong>Intersection count</strong> — vehicle, pedestrian, and turning movement counts at one intersection.</p>
      <p style="margin-top:8px"><strong>Trip generation count</strong> — per-location classification counts for a site, with peak-hour trips distributed to nearby intersections.</p>
      <p style="margin-top:8px"><strong>Area-wide study</strong> — bring multiple intersections together under one project to review and export as a set.</p>`,
  },
  {
    title: 'Help follows you',
    body: `<p>Every workspace screen has a <strong>Help</strong> link in the sidebar that opens directly to content for whatever you're looking at, and most screens have a short caption near the top explaining what they're for. Look for the <strong>?</strong> button in the setup and counter headers too.</p>`,
  },
  {
    title: 'Before you’re done',
    body: `<p>Every project type has a <strong>QA/QC</strong> screen for a second counter to re-count a peak hour and check it against the original. When you're ready to hand off data, use <strong>Export</strong> for CSV/Excel downloads, a shareable report page, or a full project package.</p>
      <p style="margin-top:8px">You can replay this tour anytime from the <strong>Take the tour</strong> link on the home screen.</p>`,
  },
];

let _wtStep = 0;

function renderStep() {
  const step = STEPS[_wtStep];
  const content = document.getElementById('wt-content');
  const label = document.getElementById('wt-step-label');
  const backBtn = document.getElementById('wt-back');
  const nextBtn = document.getElementById('wt-next');
  if (!content) return;
  content.innerHTML = `<h3 style="margin:0 0 10px;font-size:15px;font-weight:600">${step.title}</h3>${step.body}`;
  if (label) label.textContent = `${_wtStep + 1} of ${STEPS.length}`;
  if (backBtn) backBtn.style.visibility = _wtStep === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.textContent = _wtStep === STEPS.length - 1 ? 'Get started' : 'Next →';
}

export function openWalkthrough() {
  _wtStep = 0;
  renderStep();
  document.getElementById('walkthrough-modal')?.classList.add('open');
}

export function closeWalkthrough() {
  document.getElementById('walkthrough-modal')?.classList.remove('open');
  localStorage.setItem(LS_SEEN_KEY, '1');
}

function wtNext() {
  if (_wtStep >= STEPS.length - 1) { closeWalkthrough(); return; }
  _wtStep++;
  renderStep();
}

function wtBack() {
  if (_wtStep > 0) { _wtStep--; renderStep(); }
}

// Opens the walkthrough automatically the first time the home screen is shown in
// this browser, unless it's already been seen (or dismissed) before.
export function maybeShowWalkthroughOnce() {
  if (localStorage.getItem(LS_SEEN_KEY)) return;
  openWalkthrough();
}

export function wireWalkthrough() {
  document.getElementById('wt-next')?.addEventListener('click', wtNext);
  document.getElementById('wt-back')?.addEventListener('click', wtBack);
  document.getElementById('wt-close')?.addEventListener('click', closeWalkthrough);
  document.getElementById('walkthrough-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'walkthrough-modal') closeWalkthrough();
  });
  document.getElementById('home-btn-tour')?.addEventListener('click', openWalkthrough);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('walkthrough-modal')?.classList.contains('open')) {
      closeWalkthrough();
    }
  });
}
