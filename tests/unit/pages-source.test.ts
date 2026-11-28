import { expect, it, vi } from 'vitest';
import { deliveryDecision, destinationRepository, sourceIsApproved } from '../../scripts/pages/approved-source.mjs';
const sha='a'.repeat(40);
const passed={head_sha:sha,head_branch:'main',event:'push',path:'.github/workflows/backend-foundation.yml',status:'completed',conclusion:'success'};
it('requires exact main native checks, rejecting PR, pending, failed and unrelated runs',()=>{
  expect(sourceIsApproved([passed],sha)).toBe(true);
  for(const patch of [{head_sha:'b'.repeat(40)},{head_branch:'feature'},{event:'pull_request'},{path:'.github/workflows/ci.yml'},{status:'in_progress'},{conclusion:'failure'}]) expect(sourceIsApproved([{...passed,...patch}],sha)).toBe(false);
});
it('fails closed on a different destination or unavailable source verification',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('',{status:503}));
  await expect(deliveryDecision('other/repo',sha,fetcher)).rejects.toThrow('context');
  expect(fetcher).not.toHaveBeenCalled();
  await expect(deliveryDecision(destinationRepository,sha,fetcher)).rejects.toThrow('unavailable');
});
it('skips only an already deployed approved commit and builds a missing site',async()=>{
  for(const [previous,changed] of [[{repository:'sugia279/hiens-nha',commit:sha},false],[{repository:'sugia279/hiens-nha',commit:'b'.repeat(40)},true],[null,true]] as const){
    const fetcher=vi.fn().mockResolvedValueOnce(Response.json({workflow_runs:[passed]})).mockResolvedValueOnce(previous?Response.json(previous):new Response('',{status:404}));
    expect(await deliveryDecision(destinationRepository,sha,fetcher)).toBe(changed);
  }
});
it('authenticates only the fixed GitHub API read with the ephemeral job token',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce(Response.json({workflow_runs:[passed]})).mockResolvedValueOnce(new Response('',{status:404}));
  expect(await deliveryDecision(destinationRepository,sha,fetcher,'disposable-job-token')).toBe(true);
  expect(fetcher.mock.calls[0]).toEqual([`https://api.github.com/repos/sugia279/hiens-nha/actions/runs?head_sha=${sha}&event=push&per_page=20`,{headers:{Accept:'application/vnd.github+json',Authorization:'Bearer disposable-job-token'},redirect:'error'}]);
  expect(fetcher.mock.calls[1]).toEqual(['https://suduyhien.github.io/.well-known/hiens-source.json',{cache:'no-store'}]);
});
it('keeps authenticated API failures closed and reports only their status',async()=>{
  const fetcher=vi.fn().mockResolvedValue(new Response('sensitive upstream response',{status:403}));
  await expect(deliveryDecision(destinationRepository,sha,fetcher,'disposable-job-token')).rejects.toThrow(/^Source verification unavailable \(HTTP 403\)$/);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
