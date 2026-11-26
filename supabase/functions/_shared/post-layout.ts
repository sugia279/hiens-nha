export const mediaLayouts = ['auto','single-square','single-landscape','single-event','single-link','single-story','two-square','two-portrait','two-landscape','three-square','three-left','three-top','four-grid','four-left','four-top'] as const;
export type MediaLayout = typeof mediaLayouts[number];
export function validMediaLayout(value:unknown,count:number):value is MediaLayout{return typeof value==='string'&&mediaLayouts.includes(value as MediaLayout)&&(value==='auto'||count>0&&value.startsWith(['','single-','two-','three-','four-'][count]??'!'));}
