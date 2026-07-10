const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'node.js' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  try {
    const runs = await fetchJson('https://api.github.com/repos/chohantechnologies092-a11y/embroidery-perosonalizer/actions/runs?per_page=5');
    const failedRuns = runs.workflow_runs.filter(r => r.conclusion === 'failure');
    for (const run of failedRuns) {
      console.log(`\nRun: ${run.name} (ID: ${run.id})`);
      const jobs = await fetchJson(run.jobs_url);
      const failedJobs = jobs.jobs.filter(j => j.conclusion === 'failure');
      for (const job of failedJobs) {
        console.log(`  Job: ${job.name}`);
        const failedSteps = job.steps.filter(s => s.conclusion === 'failure');
        for (const step of failedSteps) {
          console.log(`    Failed Step: ${step.name}`);
        }
      }
    }
  } catch (err) {
    console.error(err);
  }
}

run();
