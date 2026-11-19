import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { mountSocialComposer } from './social-composer';
onPageMount(page=>{const root=document.querySelector<HTMLElement>('[data-social-composer]');if(root)page.cleanup(mountSocialComposer(root,getBackendRuntime()));});
