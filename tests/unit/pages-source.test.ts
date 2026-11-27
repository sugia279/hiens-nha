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
