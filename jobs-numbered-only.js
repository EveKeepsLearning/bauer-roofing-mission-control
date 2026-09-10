'use strict';

// Bauer rule: a record is not a job until it has a real Bauer job number.
// Keep unnumbered MarketSharp/history records in the database for audit/history,
// but never show them on the Open Jobs production board.
(function () {
  const originalActiveJobs = window.activeJobs;
  window.activeJobs = function numberedActiveJobs() {
    const rows = typeof originalActiveJobs === 'function' ? originalActiveJobs() : [];
    return rows.filter(job => String(job.job_number || '').trim() !== '');
  };
})();
