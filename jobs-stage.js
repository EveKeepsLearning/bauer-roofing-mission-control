'use strict';

// Production stage corrections: Awarded means contract signed; Deposit is the next stage.
// Manual stage selections take precedence over older milestone dates.
(function(){
  if (typeof STAGES !== 'undefined' && Array.isArray(STAGES)) {
    const depositIndex = STAGES.findIndex(([key]) => key === 'contract');
    if (depositIndex >= 0) STAGES[depositIndex][1] = 'Deposit';
  }

  const explicitStageKey = raw => {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'awarded' || s === 'sold') return 'awarded';
    if (s === 'deposit' || s === 'contract / deposit' || s === 'contract/deposit') return 'contract';
    if (s === 'material ordered') return 'material';
    if (s === 'ready to schedule') return 'ready';
    if (s === 'scheduled') return 'scheduled';
    if (s === 'material delivered') return 'delivered';
    if (s === 'in production' || s === 'production') return 'production';
    if (s === 'work complete') return 'complete';
    if (s === 'final payment / closeout' || s === 'closeout') return 'closeout';
    return null;
  };

  stageKey = function(j){
    const raw = String(j?.stage || '');
    const explicit = explicitStageKey(raw);

    // A confirmed completion date is the one date that can advance the job automatically.
    if (j?.completion_date) return 'complete';

    // Otherwise, a stage the user explicitly saved always wins.
    if (explicit) return explicit;

    // Fall back to milestone dates only for legacy/blank stage values.
    if (j?.production_started_date) return 'production';
    if (j?.material_delivery_date) return 'delivered';
    if (j?.confirmed_start_date || j?.target_start_date) return 'scheduled';
    if (j?.material_ordered_date) return 'material';
    return 'awarded';
  };

  nextStep = function(j){
    if (j?.production_blocker) return j.production_blocker;
    if (j?.client_communication_needed) return j.client_communication_reason || 'Customer update needed';
    const s = stageKey(j);
    if (s === 'awarded') return 'Collect / confirm deposit';
    if (s === 'contract') return 'Order materials';
    if (s === 'material') return j.confirmed_start_date ? 'Prepare for start' : 'Schedule installation';
    if (s === 'ready') return 'Set install date';
    if (s === 'scheduled') return j.material_delivery_date ? 'Confirm delivery / crew' : 'Confirm materials and crew';
    if (s === 'delivered') return 'Start production';
    if (s === 'production') return 'Complete work / final inspection';
    if (s === 'complete') return 'Final invoice / closeout';
    return 'Close job';
  };

  const stageSelect = document.getElementById('editStage');
  if (stageSelect) {
    const old = [...stageSelect.options].find(o => o.value === 'Contract / Deposit');
    if (old) {
      old.value = 'Deposit';
      old.textContent = 'Deposit';
    }
  }

  // Re-render after the overrides are installed so the timeline/table immediately reflect saved stages.
  if (typeof renderAll === 'function') {
    queueMicrotask(() => {
      try { renderAll(); } catch (_) {}
    });
  }
})();
