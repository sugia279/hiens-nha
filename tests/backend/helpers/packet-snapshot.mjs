import { planCommentsImport } from '../../../scripts/migration/comments-model.mjs';
import { planPublicationsImport } from '../../../scripts/migration/publications-model.mjs';
import { planRequestsImport } from '../../../scripts/migration/requests-model.mjs';
export const attackText = "SQL stays text: '; drop table auth.users; -- \\ \n$hn_import$ and $hn_import_$ <script>raw</script>";
export function packetSnapshot() {
  const base = '/hiens-nha/', sourceCommit = 'a'.repeat(40), date = '2026-11-15T00:00:00Z';
  const comment = { version: 1, number: 100, body: '', contextPath: base + 'guestbook/', message: attackText, approved: true, deleted: false, createdAt: date, updatedAt: date, author: { login: 'same-as-owner' }, htmlUrl: 'https://example.test/issues/100', comments: [
    { id: 201, body: 'Trusted legacy reply', trusted: true, createdAt: date, author: { login: 'old-owner' } },
    { id: 202, body: 'Private legacy reply', trusted: false, createdAt: date, author: { login: 'stranger' } },
  ] };
  const post = { title: 'Local packet poem', body: attackText, kind: 'poem', category: 'Poetry', tags: ['tag'], series: 'Legacy series', order: 2 };
  const request = { title: 'Local packet help', description: attackText, expectedResult: 'A useful result', category: 'technology', priority: 'normal', tags: ['tag'] };
  return { sourceCommit,
    comments: planCommentsImport({ paths: [base + 'guestbook/', base + 'music/'], archives: [comment, { ...comment, number: 101, approved: false, comments: [] }, { ...comment, number: 102, deleted: true, message: '', comments: [] }], base, sourceCommit }),
    publications: [
      planPublicationsImport({ feature: 'posts', archives: [
        { key: 'manual.json', raw: { version: 1, number: 0, approved: true, deleted: false, knowledge: post } },
        { key: 'pending.json', raw: { version: 1, approved: false, deleted: false, knowledge: { ...post, series: '', order: 3 } } },
        { key: 'deleted.json', raw: { version: 1, deleted: true, knowledge: null } },
      ], base, sourceCommit, snapshotAt: date }),
      planPublicationsImport({ feature: 'media', archives: [{ key: 'video.json', raw: { version: 1, approved: true, deleted: false, media: { title: 'Local video', description: attackText, category: 'music', url: 'https://www.facebook.com/share/v/1J6iFA7d3k/' } } }], base, sourceCommit, snapshotAt: date }),
    ],
    requests: planRequestsImport({ archives: [
      { version: 1, number: 105, approved: true, deleted: false, request, status: 'completed', result: 'Completed safely', createdAt: date, updatedAt: date, timeline: [
        { status: 'accepted', message: attackText, result: '', createdAt: date, updatedAt: date },
        { status: 'completed', message: 'Done', result: 'Completed safely', createdAt: date, updatedAt: date },
      ] },
      { version: 1, number: 106, approved: false, deleted: false, request, status: 'new', result: '', createdAt: date, updatedAt: date, timeline: [] },
    ], base, sourceCommit }),
  };
}
