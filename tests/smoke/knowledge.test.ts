import { sourceFor, assertApiSource } from './source-contract';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('renders Knowledge writing as escaped text with preserved lines, series and taxonomy in both languages', () => {
 for (const prefix of ['', 'en/']) {
  const page = readFileSync(`dist/${prefix}knowledge/index.html`, 'utf8');
  if (sourceFor('posts').source === 'api') { assertApiSource(page, 'posts'); continue; }
  for (const id of ['knowledge-form','knowledge-kind','knowledge-tags','knowledge-series','knowledge-order','knowledge-body','filter-tag','filter-series']) expect(page).toContain(`id="${id}"`);
  expect(page).toContain('Thơ ngẫu hứng');
  expect(page).toContain('Khi trăng lên, gió đông thổi nhẹ.\nDưới bầu trời sao, ngân nga tiếng đàn.');
  expect(page).toContain('data-kind="poem"');
 }
});
