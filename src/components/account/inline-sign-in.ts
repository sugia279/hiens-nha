import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { localeUrl, localeFromPath } from '../../lib/i18n';
import { buildUrl } from '../../utils/url';
onPageMount(page => {
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-inline-sign-in]')) {
  if(import.meta.env.PUBLIC_BACKEND_ENABLED!=='true') {button.disabled=true;continue;}
  const runtime=getBackendRuntime();
  const status=document.createElement('span');status.setAttribute('role','status');status.setAttribute('aria-live','polite');button.after(status);
  const vi=localeFromPath(location.pathname)==='vi';
  button.addEventListener('click',()=>void runtime.signIn(localeUrl(buildUrl('account/callback/'),localeFromPath(location.pathname))),{signal:page.signal});
  page.cleanup(runtime.subscribe(({busy,user,error})=>{button.disabled=busy||!!user&&!user.guest;status.textContent=busy?(vi?' Đang xác minh…':' Verifying…'):error==='POPUP_BLOCKED'?(vi?' Cho phép cửa sổ đăng nhập rồi thử lại.':' Allow the sign-in popup and retry.'):error?(vi?' Chưa đăng nhập được. Vui lòng thử lại.':' Sign-in failed. Please retry.'):'';}));
  page.cleanup(()=>status.remove());
 }
});
