import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { localeUrl, localeFromPath } from '../../lib/i18n';
import { buildUrl } from '../../utils/url';
onPageMount(page => {
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-inline-sign-in]')) {
  if(import.meta.env.PUBLIC_BACKEND_ENABLED!=='true') {button.disabled=true;continue;}
  const runtime=getBackendRuntime();
  button.addEventListener('click',()=>void runtime.signIn(localeUrl(buildUrl('account/callback/'),localeFromPath(location.pathname))),{signal:page.signal});
  page.cleanup(runtime.subscribe(({busy,user})=>{button.disabled=busy||!!user;}));
 }
});
