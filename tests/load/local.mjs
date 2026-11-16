import { localEnvironment } from '../../scripts/backend/local-environment.mjs';
import { runLoadWorkload } from '../../scripts/backend/load-workload.mjs';
const report = await runLoadWorkload(await localEnvironment(), { profile: process.env.BACKEND_LOAD_PROFILE ?? 'ci' });
if (!report.passed) process.exitCode = 1;
