import { validMediaLayout } from '../../supabase/functions/_shared/post-social';
/** Layout names are persisted; labels and CSS stay presentation-only. */
export const coverLayouts = [
 {id:'auto',count:0,vi:'Tự động theo số ảnh',en:'Automatic by photo count'},
 {id:'single-square',count:1,vi:'1 ảnh — Vuông (1:1)',en:'1 photo — Square (1:1)'},
 {id:'single-landscape',count:1,vi:'1 ảnh — Ngang (4:3)',en:'1 photo — Landscape (4:3)'},
 {id:'single-event',count:1,vi:'1 ảnh — Ngang rộng (1200:628)',en:'1 photo — Wide (1200:628)'},
 {id:'single-link',count:1,vi:'1 ảnh — Toàn cảnh (1200:518)',en:'1 photo — Panorama (1200:518)'},
 {id:'single-story',count:1,vi:'1 ảnh — Dọc (9:16)',en:'1 photo — Portrait (9:16)'},
 {id:'two-square',count:2,vi:'2 ảnh — Hai ô vuông cạnh nhau',en:'2 photos — Side-by-side squares'},
 {id:'two-portrait',count:2,vi:'2 ảnh — Hai cột dọc',en:'2 photos — Two portrait columns'},
 {id:'two-landscape',count:2,vi:'2 ảnh — Hai hàng ngang',en:'2 photos — Two landscape rows'},
 {id:'three-square',count:3,vi:'3 ảnh — Ba ô vuông cạnh nhau',en:'3 photos — Three squares in a row'},
 {id:'three-left',count:3,vi:'3 ảnh — Ảnh lớn bên trái',en:'3 photos — Large photo on the left'},
 {id:'three-top',count:3,vi:'3 ảnh — Ảnh lớn phía trên',en:'3 photos — Large photo on top'},
 {id:'four-grid',count:4,vi:'4 ảnh — Lưới 2 × 2',en:'4 photos — 2 × 2 grid'},
 {id:'four-left',count:4,vi:'4 ảnh — Ảnh lớn bên trái',en:'4 photos — Large photo on the left'},
 {id:'four-top',count:4,vi:'4 ảnh — Ảnh lớn phía trên',en:'4 photos — Large photo on top'},
] as const;
export type CoverLayout = typeof coverLayouts[number]['id'];
export function validCoverLayout(value: unknown, count: number): value is CoverLayout {
 return validMediaLayout(value,count);
}
