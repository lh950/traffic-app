// Shared helpers for the configurable-keybinding-groups feature — group membership,
// key-pool defaults per preset/one-handed mode, and the group-switch shortcut codes.
// Centralized here (rather than duplicated in setup.js/counter.js/main.js) since all three
// need the same group-id logic and it must stay in sync across them.
import { vPairs, keybindCfg } from './state.js';

// Distinct `group` ids present in a pool of vPairs, ascending. Group ids are now arbitrary
// user-editable integers (not implicitly floor(index/4)), so callers page through this list
// by POSITION (vGroup is an index into it), not by the raw id.
export function distinctGroups(pool){
  return [...new Set(pool.map(p=>p.group ?? 0))].sort((a,b)=>a-b);
}
// Vehicle-mode grouping pool: every non-bike vPair (bikes have no keys/group significance —
// same carve-out the pre-existing multiGroup notice used).
export function vehicleGroupPool(){ return vPairs.filter(p=>!p.isBike); }
// TMC-mode grouping pool: only vPairs actually included in turning-movement counting.
export function tmcGroupPool(){ return vPairs.filter(p=>p.includeTmc); }

// Default key pools for auto-assigning NEW vPairs (add-type / preset apply), driven by the
// project's keybindCfg. groupSize = how many vPairs a freshly-added group should hold before
// spilling into the next group; oneKeyOnly = true means only inPool is used (single key per
// type, no in/out split — "all-in/all-out" one-handed layout).
export function getKeyPools(){
  const numpad = keybindCfg.preset === 'numpad';
  const IN  = numpad ? ['7','4','1','0'] : ['a','s','d','f'];
  const OUT = numpad ? ['9','6','3','.'] : ['j','k','l',';'];
  if(keybindCfg.oneHanded === 'allkeys') return { inPool:IN, outPool:null, groupSize:4, oneKeyOnly:true };
  if(keybindCfg.oneHanded === 'pairs')   return { inPool:IN.slice(0,2), outPool:OUT.slice(0,2), groupSize:2, oneKeyOnly:false };
  return { inPool:IN, outPool:OUT, groupSize:4, oneKeyOnly:false };
}

// Group-switch shortcut key codes (event.code, not event.key, so the numpad-preset shortcuts
// don't collide with the QWERTY preset's use of the same physical glyphs on the top row, and
// vice versa — see build brief item 5). Numpad mapping is exactly as specified by the user;
// QWERTY's Minus/Equal are new dedicated keys chosen because they're unused by any vPair pool,
// undo/redo (Z/Y), focus toggle (\\), focus-cycle ([/]), or arrow nav.
export const NUMPAD_GROUP_PREV_CODE = 'NumpadDivide';
export const NUMPAD_GROUP_NEXT_CODE = 'NumpadSubtract';
export const QWERTY_GROUP_PREV_CODE = 'Minus';
export const QWERTY_GROUP_NEXT_CODE = 'Equal';
